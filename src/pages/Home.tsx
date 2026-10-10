import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useApp } from '@/state/store'
import { Sidebar } from '@/components/Sidebar'

/** XP/连胜数字滚动：目标值变化时缓动追赶（demo 同款） */
function useTick(target: number): number {
  const [shown, setShown] = useState(target)
  const prevRef = useRef(target)
  useEffect(() => {
    const from = prevRef.current
    if (from === target) return
    prevRef.current = target
    const t0 = performance.now()
    const dur = 900
    let raf = 0
    const f = (t: number) => {
      const p = Math.min((t - t0) / dur, 1)
      setShown(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return shown
}

/** 应用壳：HUD + 主内容区 + 右侧信息栏（平板/桌面）+ dock（手机底部/桌面侧栏） */
export default function Home() {
  const { profile, pending } = useApp()
  const nav = useNavigate()
  const shownXp = useTick(profile.xp)
  const shownStreak = useTick(profile.streak_days)

  return (
    <div className="app">
      <header className="hud stg" style={{ ['--d' as string]: 0 }}>
        <button
          type="button"
          className="pill streak"
          title="连续学习天数"
          onClick={() => nav('/stats')}
        >
          <span>🔥</span>
          <span className="num">{shownStreak}</span> 天
        </button>
        {pending > 0 && (
          <span className="pill" title="有离线成绩待同步" style={{ color: 'var(--coral-d)' }}>
            <span className="pending-dot" /> {pending}
          </span>
        )}
        <span className="pill xp">
          <span>⚡</span>
          <span className="num">{shownXp}</span> XP
        </span>
      </header>

      <div className="main-area">
        <Outlet />
      </div>

      <Sidebar />

      <nav className="dock stg" style={{ ['--d' as string]: 3 }}>
        <DockLink to="/map" icon="🏠" label="学习" />
        <DockLink to="/review" icon="💪" label="复习" />
        <DockLink to="/stats" icon="📊" label="统计" />
        <DockLink to="/me" icon="👤" label="我的" />
      </nav>
      <div className="toast" id="toast" />
    </div>
  )
}

function DockLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'on' : '')}>
      <b>{icon}</b>
      {label}
    </NavLink>
  )
}
