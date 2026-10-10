import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { hasSession, logout as ucLogout, setUnauthorizedHandler } from '@/api/ucenter'
import { fetchProgress, fetchProfile, flushPending, pendingCount, submitQuiz, type Profile, type QuizSubmit, type UnitProgress } from '@/api/client'

interface AppState {
  authed: boolean
  profile: Profile
  progress: Map<string, UnitProgress>
  pending: number
  loading: boolean
  refresh: () => Promise<void>
  /** 登录/注册成功后调用：置登录态并触发首屏数据加载 */
  signIn: () => void
  doLogout: () => Promise<void>
  finishQuiz: (q: QuizSubmit) => Promise<{ queued: boolean; profile: Profile | null }>
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp 必须在 AppProvider 内使用')
  return v
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(hasSession())
  const [profile, setProfile] = useState<Profile>({ xp: 0, streak_days: 0, level: 1 })
  const [progress, setProgress] = useState<Map<string, UnitProgress>>(new Map())
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(authed)

  const refresh = useCallback(async () => {
    if (!hasSession()) return
    setLoading(true)
    try {
      // 有离线队列先重放，再拉最新数据
      await flushPending()
      const [prof, units] = await Promise.all([fetchProfile(), fetchProgress()])
      setProfile(prof)
      setProgress(new Map(units.map((u) => [u.unit_id, u])))
      setPending(pendingCount())
      setAuthed(true)
    } catch {
      /* 401 已由 ucenter 层处理；断网时 client 层已回退缓存 */
    } finally {
      setLoading(false)
    }
  }, [])

  const doLogout = useCallback(async () => {
    await ucLogout()
    setAuthed(false)
    setProfile({ xp: 0, streak_days: 0, level: 1 })
    setProgress(new Map())
  }, [])

  const signIn = useCallback(() => setAuthed(true), [])

  const finishQuiz = useCallback(async (q: QuizSubmit) => {
    const r = await submitQuiz(q)
    setPending(pendingCount())
    if (r.profile) setProfile(r.profile)
    // 乐观更新本地进度（星数/连击取更优，计数累加）
    setProgress((prev) => {
      const next = new Map(prev)
      const old = next.get(q.unit_id)
      next.set(q.unit_id, {
        unit_id: q.unit_id,
        stars: Math.max(old?.stars ?? 0, q.stars),
        best_combo: Math.max(old?.best_combo ?? 0, q.best_combo),
        correct: (old?.correct ?? 0) + q.correct,
        total: (old?.total ?? 0) + q.total,
        updated_at: Math.floor(Date.now() / 1000),
      })
      return next
    })
    return r
  }, [])

  // 401 统一处理：清登录态（跳转由路由层 Gate 完成）
  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false))
  }, [])

  // 恢复在线时重放离线队列
  useEffect(() => {
    const onOnline = () => {
      void flushPending().then(() => setPending(pendingCount()))
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  // 登录后首次拉数据
  useEffect(() => {
    if (authed) void refresh()
  }, [authed, refresh])

  const value = useMemo<AppState>(
    () => ({ authed, profile, progress, pending, loading, refresh, signIn, doLogout, finishQuiz }),
    [authed, profile, progress, pending, loading, refresh, signIn, doLogout, finishQuiz],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
