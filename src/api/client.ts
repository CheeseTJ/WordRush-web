/**
 * wordrush 业务 API：进度 / 关卡提交 / 复习队列 / 统计。
 *
 * 离线优先策略：
 *  - GET 结果缓存到 localStorage，断网时读上次缓存
 *  - 关卡提交断网时进入本地队列，恢复在线后自动重放
 */

import { authFetch } from './ucenter'

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
  id: 'new' | 'review' | 'star' | string
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
  errors?: { word: string; expected: string; actual: string; confidence: number }[]
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

// 会话级音频缓存：text → blobURL（后端另有磁盘缓存兜底）
const speakCache = new Map<string, string>()

/** 拉取并播放单词发音；失败抛错由调用方提示 */
export async function speakWord(text: string): Promise<void> {
  let url = speakCache.get(text)
  if (!url || url === 'pending') {
    const blob = await authFetch<Blob>(`/api/v1/speak/tts?text=${encodeURIComponent(text)}`, { blob: true })
    url = URL.createObjectURL(blob)
    speakCache.set(text, url)
  }
  await new Audio(url).play()
}

/** 进关预取：后台拉取一批发音，点按时即点即播 */
export function prefetchSpeak(texts: string[]): void {
  for (const t of texts) {
    if (!t || speakCache.has(t)) continue
    speakCache.set(t, 'pending')
    authFetch<Blob>(`/api/v1/speak/tts?text=${encodeURIComponent(t)}`, { blob: true })
      .then((b) => speakCache.set(t, URL.createObjectURL(b)))
      .catch(() => speakCache.delete(t)) // 预取失败静默，真正播放时会重试并暴露错误
  }
}
