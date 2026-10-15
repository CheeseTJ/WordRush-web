import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Barbell, ChartBar, ChatCircleText, Flame, Heart, House, Lightning, User } from '@phosphor-icons/react'
import { useApp } from '@/state/store'
import { Sidebar } from '@/components/Sidebar'
import { gamifyEnabled } from '@/data/exp'

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

/** 应用壳：HUD + 主内容区 + 右侧信息栏（平板/桌面）+ dock（手机底部/桌面侧栏）
 *  答题/情景对话页全屏沉浸：隐藏 HUD 与 dock */
export default function Home() {
  const { profile, pending } = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const immersive = loc.pathname.startsWith('/quiz/') || loc.pathname.startsWith('/story/')
  const shownXp = useTick(profile.xp)
  const shownStreak = useTick(profile.streak_days)
  const hearts = profile.hearts ?? 5

  return (
    <div className={immersive ? 'app immersive' : 'app'}>
      {!immersive && (
        <header className="hud stg" style={{ ['--d' as string]: 0 }}>
          {gamifyEnabled() && (
            <button
              type="button"
              className="pill hearts"
              title={hearts >= 5 ? '红心已满' : '每 30 分钟恢复 1 颗红心'}
              onClick={() => nav('/map')}
            >
              <Heart weight="fill" size={16} style={{ color: hearts > 0 ? 'var(--coral)' : '#cbc4b6' }} />
              <span className="num">{hearts}</span>/5
            </button>
          )}
          <button
            type="button"
            className="pill streak"
            title="连续学习天数"
            onClick={() => nav('/stats')}
          >
            <Flame weight="fill" size={16} style={{ color: '#FF9600' }} />
            <span className="num">{shownStreak}</span> 天
          </button>
          {pending > 0 && (
            <span className="pill" title="有离线成绩待同步" style={{ color: 'var(--coral-d)' }}>
              <span className="pending-dot" /> {pending}
            </span>
          )}
          <span className="pill xp">
            <Lightning weight="fill" size={16} style={{ color: 'var(--yellow-d)' }} />
            <span className="num">{shownXp}</span> XP
          </span>
        </header>
      )}

      <div className="main-area">
        <Outlet />
      </div>

      {!immersive && <Sidebar />}

      {!immersive && (
        <nav className="dock stg" style={{ ['--d' as string]: 3 }}>
          <DockLink to="/map" icon={<House weight="fill" />} label="学习" />
          <DockLink to="/review" icon={<Barbell weight="fill" />} label="复习" />
          <DockLink to="/scenarios" icon={<ChatCircleText weight="fill" />} label="情景" />
          <DockLink to="/stats" icon={<ChartBar weight="fill" />} label="统计" />
          <DockLink to="/me" icon={<User weight="fill" />} label="我的" />
        </nav>
      )}
      <div className="toast" id="toast" />
    </div>
  )
}

function DockLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'on' : '')}>
      <b>{icon}</b>
      {label}
    </NavLink>
  )
}
