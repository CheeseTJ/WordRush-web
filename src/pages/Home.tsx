import { type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Barbell, ChatCircleText, House, User } from '@phosphor-icons/react'
import { Sidebar } from '@/components/Sidebar'

/** 应用壳：主内容区 + 右侧信息栏（平板/桌面）+ 悬浮 dock
 *  答题/情景对话页全屏沉浸：隐藏 dock
 *
 *  顶部 HUD 已移除：连续天数/XP 在「我的」页与侧栏本就有完整展示，
 *  顶部常驻一栏既挤占空间，又让下方滚动区在它下沿被硬切（HUD 透明，
 *  卡片滚过时只剩半截）。去掉后页面从屏幕顶部开始，滚动区更完整。
 *  红心与连续天数收进「我的」页的游戏化元素行。 */
export default function Home() {
  const loc = useLocation()
  const immersive = loc.pathname.startsWith('/quiz/') || loc.pathname.startsWith('/story/')
  // 我的页自带近 14 天图表，侧栏的 7 天周图在该页会与之重复，用类名在该页隐藏
  const onMe = loc.pathname === '/me'

  return (
    <div className={`app${immersive ? ' immersive' : ''}${onMe ? ' on-me' : ''}`}>
      <div className="main-area">
        <Outlet />
      </div>

      {!immersive && <Sidebar />}

      {!immersive && (
        <nav className="dock stg" style={{ ['--d' as string]: 3 }}>
          <DockLink to="/map" icon={<House weight="fill" />} label="学习" />
          <DockLink to="/scenarios" icon={<ChatCircleText weight="fill" />} label="情景" />
          <DockLink to="/review" icon={<Barbell weight="fill" />} label="复习" />
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
