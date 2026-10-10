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

async function postQuiz(q: QuizSubmit): Promise<Profile> {
  return authFetch<Profile>('/api/v1/quiz/finish', { method: 'POST', body: q })
}

/** 提交关卡：失败（断网/服务不可达）时入队，返回本地预估档案 */
export async function submitQuiz(q: QuizSubmit): Promise<{ profile: Profile | null; queued: boolean }> {
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
