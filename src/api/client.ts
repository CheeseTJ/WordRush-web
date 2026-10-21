/**
 * wordrush 业务 API：进度 / 关卡提交 / 复习队列 / 统计。
 *
 * 离线优先策略：
 *  - GET 结果缓存到 localStorage，断网时读上次缓存
 *  - 关卡提交断网时进入本地队列，恢复在线后自动重放
 */

import { authFetch as rawAuthFetch } from './ucenter'
import { currentVoice } from '@/data/exp'
import { apiBase } from '@/platform'

/**
 * 业务 API 根地址：缺省同源（本地 dev 走 Vite 代理；wrangler 部署时由
 * functions/api/[[route]].ts 同域反代）。也可在构建时用 VITE_API_BASE
 * 指向隧道域名直连——dashboard 拖拽直传不支持 Functions 时靠它兜底，
 * 后端 CORS 白名单已放行站点域名。
 *
 * Capacitor 原生壳内 origin 是 https://localhost，没有同源后端，
 * 由 apiBase() 自动切到隧道域名。
 */
const API_BASE = apiBase()

function authFetch<T>(url: string, options?: Parameters<typeof rawAuthFetch>[1]): Promise<T> {
  return rawAuthFetch<T>(API_BASE + url, options)
}

export interface Profile {
  xp: number
  streak_days: number
  last_day?: string
  level?: number
  hearts?: number
  gems?: number
  streak_freeze?: number
}

export interface UnitProgress {
  unit_id: string
  stars: number
  best_combo: number
  correct: number
  total: number
  updated_at: number
}

export interface WordResult {
  id: string
  ok: boolean
}

export interface QuizSubmit {
  unit_id: string
  correct: number
  total: number
  best_combo: number
  stars: number
  words: WordResult[]
}

/** 关卡提交响应：档案 + 经济结算（红心/宝石/失败标记） */
export interface QuizFinish extends Profile {
  xp_gained?: number
  gems_gained?: number
  hearts_lost?: number
  failed?: boolean
}

export interface DailyStat {
  day: string
  words: number
  correct: number
  wrong: number
  xp: number
}

export interface Stats {
  xp: number
  streak_days: number
  level: number
  learned: number
  days: DailyStat[]
}

const CACHE_PROGRESS = 'wordrush.cache.progress'
const CACHE_STATS = 'wordrush.cache.stats'
const PENDING = 'wordrush.pending'

function lsJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function lsSetJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 配额满等场景静默降级 */
  }
}

/* ---------- 档案 ---------- */

export async function fetchProfile(): Promise<Profile> {
  return authFetch<Profile>('/api/v1/profile')
}

/* ---------- 进度 ---------- */

export async function fetchProgress(): Promise<UnitProgress[]> {
  try {
    const data = await authFetch<{ units: UnitProgress[] }>('/api/v1/progress')
    lsSetJSON(CACHE_PROGRESS, data.units)
    return data.units
  } catch (e) {
    // 断网时读缓存：进度可看，闯关结果进队列
    if (e instanceof Error && 'status' in e && (e as { status: number }).status === 401) throw e
    return lsJSON<UnitProgress[]>(CACHE_PROGRESS, [])
  }
}

/* ---------- 关卡提交 ---------- */

async function postQuiz(q: QuizSubmit): Promise<QuizFinish> {
  return authFetch<QuizFinish>('/api/v1/quiz/finish', { method: 'POST', body: q })
}

/** 提交关卡：失败（断网/服务不可达）时入队，返回本地预估档案 */
export async function submitQuiz(q: QuizSubmit): Promise<{ profile: QuizFinish | null; queued: boolean }> {
  try {
    const profile = await postQuiz(q)
    return { profile, queued: false }
  } catch (e) {
    if (e instanceof Error && 'status' in e && (e as { status: number }).status === 401) throw e
    const pend = lsJSON<QuizSubmit[]>(PENDING, [])
    pend.push(q)
    lsSetJSON(PENDING, pend)
    return { profile: null, queued: true }
  }
}

/** 重放离线队列；全部成功返回 true */
export async function flushPending(): Promise<boolean> {
  const pend = lsJSON<QuizSubmit[]>(PENDING, [])
  if (!pend.length) return true
  const rest: QuizSubmit[] = []
  for (const q of pend) {
    try {
      await postQuiz(q)
    } catch {
      rest.push(q)
    }
  }
  lsSetJSON(PENDING, rest)
  return rest.length === 0
}

export function pendingCount(): number {
  return lsJSON<QuizSubmit[]>(PENDING, []).length
}

/* ---------- 复习 ---------- */

export async function fetchReviewQueue(limit = 20): Promise<string[]> {
  const data = await authFetch<{ word_ids: string[]; total: number }>(`/api/v1/review?limit=${limit}`)
  return data.word_ids
}

export async function postReviewResults(results: WordResult[]): Promise<void> {
  await authFetch<{ status: string }>('/api/v1/review/result', { method: 'POST', body: { results } })
}

/* ---------- 统计 ---------- */

export async function fetchStats(): Promise<Stats> {
  try {
    const data = await authFetch<Stats>('/api/v1/stats?days=14')
    lsSetJSON(CACHE_STATS, data)
    return data
  } catch (e) {
    if (e instanceof Error && 'status' in e && (e as { status: number }).status === 401) throw e
    return lsJSON<Stats>(CACHE_STATS, { xp: 0, streak_days: 0, level: 1, learned: 0, days: [] })
  }
}

/* ---------- 迭代三：经济系统（每日任务 / 红心 / 冻结） ---------- */

export interface Task {
  id: 'new' | 'review' | 'star' | 'chat' | string
  label: string
  target: number
  current: number
  reward: number
  done: boolean
  claimed: boolean
}

export async function fetchTasks(): Promise<Task[]> {
  const data = await authFetch<{ tasks: Task[] }>('/api/v1/tasks')
  return data.tasks
}

export async function claimTask(id: string): Promise<number> {
  const data = await authFetch<{ gems: number }>('/api/v1/tasks/claim', { method: 'POST', body: { id } })
  return data.gems
}

/** 25 宝石补满红心，返回 {hearts, gems} */
export async function refillHearts(): Promise<{ hearts: number; gems: number }> {
  return authFetch<{ hearts: number; gems: number }>('/api/v1/hearts/refill', { method: 'POST', body: {} })
}

/** 200 宝石购买 1 个连胜冻结，返回 {streak_freeze, gems} */
export async function buyFreeze(): Promise<{ streak_freeze: number; gems: number }> {
  return authFetch<{ streak_freeze: number; gems: number }>('/api/v1/freeze/buy', { method: 'POST', body: {} })
}

/* ---------- 迭代四：口语跟读后端评测 ---------- */

export interface SpeakAssess {
  score: number
  transcript: string
  ok: boolean
  errors?: {
    word: string
    expected: string
    actual: string
    confidence: number
    /** 逐音素对照：heard 与 expected 不同即读错，heard 为空是漏读 */
    phones?: { expected: string; heard: string }[]
  }[]
  /** 目标词完整音素序列（IPA，用于把读错音素定位到字母） */
  expected_phones?: string[]
  /** 实际听到的音素序列（近音小误差时 errors 为空，用它逐位比对） */
  heard_phones?: string[]
}

/**
 * 上传跟读音频给后端评测（OpenPronounce）。
 * 服务不可用会抛出 status=503 的错误，调用方降级浏览器识别。
 */
export async function assessSpeak(word: string, blob: Blob): Promise<SpeakAssess> {
  const fd = new FormData()
  fd.append('word', word)
  fd.append('audio', blob, 'recording.webm')
  return authFetch<SpeakAssess>('/api/v1/speak/assess', { method: 'POST', form: fd })
}

/* ---------- 发音 TTS（后端 piper 合成，磁盘缓存） ---------- */

// 会话级音频缓存：key = voice|text → blobURL（后端另有磁盘缓存兜底）
const speakCache = new Map<string, string>()

/** 清空发音缓存（切换音色后调用，避免播到旧音色） */
export function resetSpeakCache(): void {
  for (const url of speakCache.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  speakCache.clear()
}

function speakKey(text: string): string {
  return `${currentVoice()}|${text}`
}

/** 拉取某文本的发音 blobURL（缓存优先，不播放；voice 缺省用当前音色） */
async function fetchSpeakUrl(text: string, voice = currentVoice()): Promise<string> {
  const k = `${voice}|${text}`
  const cached = speakCache.get(k)
  if (cached && cached !== 'pending') return cached
  const qs = voice ? `&voice=${encodeURIComponent(voice)}` : ''
  const blob = await authFetch<Blob>(`/api/v1/speak/tts?text=${encodeURIComponent(text)}${qs}`, { blob: true })
  const url = URL.createObjectURL(blob)
  speakCache.set(k, url)
  return url
}

/** 拉取并播放单词发音（按当前音色）；失败抛错由调用方提示。
 * 全局单例播放器：新发音先停旧的，避免快速连点叠加多个音频源。 */
let speakAudio: HTMLAudioElement | null = null

export async function speakWord(text: string): Promise<void> {
  const url = await fetchSpeakUrl(text)
  if (speakAudio && !speakAudio.paused) {
    speakAudio.pause()
  }
  if (!speakAudio || speakAudio.src !== url) {
    speakAudio = new Audio(url)
  } else {
    speakAudio.currentTime = 0
  }
  try {
    await speakAudio.play()
  } catch (e) {
    // 良性中断（Chrome AbortError）：上一条 play 还在落地中就被新播放 pause 顶掉，
    // 属单例顶替的预期行为，静默忽略；自动朗读被浏览器策略拦截同理（有大按钮可手动重播）。
    if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return
    throw e
  }
  // Promise 挂到自然播放结束：调用方（如听音题的均衡器动效）据此停止
  await new Promise<void>((resolve) => {
    speakAudio!.onended = () => resolve()
  })
}

/** 试听指定音色（音色弹层用）：播放打包进前端的预合成样例，秒播，播完才 resolve */
export function previewVoice(voice: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const a = new Audio(`/voices/${voice}.wav`)
    a.onended = () => resolve()
    a.onerror = () => reject(new Error('试听音频加载失败'))
    a.play().catch(reject)
  })
}

/** 进关预取：后台拉取一批发音（不播放），点按时即点即播 */
export function prefetchSpeak(texts: string[]): void {
  for (const t of texts) {
    if (!t || speakCache.get(speakKey(t))) continue
    const k = speakKey(t)
    speakCache.set(k, 'pending')
    fetchSpeakUrl(t)
      .catch(() => speakCache.delete(k)) // 预取失败静默，真正播放时会重试并暴露错误
  }
}

/* ---------- 口语对话（语音 → AI → 语音） ---------- */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 上传整段录音，交给后端做整句转写（口语对话输入）。服务不可用抛 status=503。 */
export async function chatStt(blob: Blob): Promise<string> {
  const fd = new FormData()
  fd.append('audio', blob, 'recording.webm')
  const data = await authFetch<{ transcript: string }>('/api/v1/chat/stt', { method: 'POST', form: fd })
  return data.transcript
}

/** 发送对话消息，返回助手回复文本。thinking 控制思考模式；服务未开启抛 status=503。 */
export async function chatSend(messages: ChatMessage[], thinking = false): Promise<string> {
  const data = await authFetch<{ reply: string }>('/api/v1/chat', {
    method: 'POST',
    body: { messages, thinking },
  })
  return data.reply
}

/* ---------- 迭代五：情景对话（场景 + 目标 + 有限回合 + 结算） ---------- */

export interface ScenarioChatResult {
  reply: string
  /** 本回合后各目标完成情况；模型漏标记时为 null（调用方保持原状） */
  goals: boolean[] | null
  /** 全部目标达成，场景可以自然收尾 */
  done: boolean
}

/**
 * 情景对话发言：scenario_id 定位剧本（人设在服务端），turn 是本次回合序号（1 起）。
 * 超过回合上限后端直接拒绝（code=turns_exhausted）。
 */
export async function scenarioChat(
  scenarioId: string,
  turn: number,
  messages: ChatMessage[],
  thinking = false,
): Promise<ScenarioChatResult> {
  return authFetch<ScenarioChatResult>('/api/v1/chat', {
    method: 'POST',
    body: { messages, thinking, scenario_id: scenarioId, turn },
  })
}

/** 情景对话结算：星级 + XP/宝石（服务端按达成率推算并发放） */
export interface ChatSummary {
  stars: number
  xp_gained: number
  gems_gained: number
  comment: string
  phrases: { en: string; zh: string }[]
  fixes: { bad: string; good: string; why: string }[]
}

/** 提交整场对话做批改结算（同一请求完成发奖与每日任务计数）。 */
export async function chatSummary(
  scenarioId: string,
  messages: ChatMessage[],
  goalsHit: number,
  goalsTotal: number,
  turnsUsed: number,
  thinking = false,
): Promise<ChatSummary> {
  return authFetch<ChatSummary>('/api/v1/chat/summary', {
    method: 'POST',
    body: {
      scenario_id: scenarioId,
      messages,
      goals_hit: goalsHit,
      goals_total: goalsTotal,
      turns_used: turnsUsed,
      thinking,
    },
  })
}

/** 朗读一段文本：Piper 单次上限 240 字，按句切分后顺序播放（复用当前音色）。 */
export async function speakText(text: string): Promise<void> {
  for (const part of splitForTts(text, 240)) {
    await speakWord(part)
  }
}

/** 把长文本按句切成不超过 max 字的片段（超长单句硬切）。 */
function splitForTts(text: string, max: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean]
  const parts: string[] = []
  let buf = ''
  for (const raw of sentences) {
    const seg = raw.trim()
    if (!seg) continue
    if (seg.length > max) {
      if (buf) {
        parts.push(buf)
        buf = ''
      }
      for (let i = 0; i < seg.length; i += max) parts.push(seg.slice(i, i + max))
      continue
    }
    if (buf && buf.length + seg.length + 1 > max) {
      parts.push(buf)
      buf = ''
    }
    buf = buf ? `${buf} ${seg}` : seg
  }
  if (buf) parts.push(buf)
  return parts
}
