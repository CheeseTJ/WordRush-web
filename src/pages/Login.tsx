import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login, register, ApiError, savedEmail } from '@/api/ucenter'
import { useApp } from '@/state/store'
import { Mascot } from '@/ui'

/** 登录 / 注册页：账户完全由 Ucenter 托管（邮箱 + 密码 + 邀请码） */
export default function Login() {
  const nav = useNavigate()
  const loc = useLocation()
  const { signIn } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState(savedEmail())
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      if (mode === 'register') await register(email.trim(), password, invite.trim())
      else await login(email.trim(), password)
      signIn() // 令牌已落盘，通知路由守卫放行（并触发首屏数据加载）
      const from = (loc.state as { from?: string } | null)?.from
      nav(from && from !== '/login' ? from : '/map', { replace: true })
    } catch (ex) {
      setErr(ex instanceof ApiError ? ex.message : '网络异常，请稍后再试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="logo">
        <LogoSVG />
        <h1>WordRush</h1>
        <p>SOFT CLAY · 单词闯关</p>
      </div>
      <form className="lcard" onSubmit={onSubmit}>
        <div className="lfield">
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="lfield">
          <label htmlFor="pwd">密码</label>
          <input
            id="pwd"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
        </div>
        {mode === 'register' && (
          <div className="lfield">
            <label htmlFor="invite">邀请码</label>
            <input
              id="invite"
              required
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="向管理员索取"
            />
          </div>
        )}
        <div className="lerr">{err}</div>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? '处理中…' : mode === 'login' ? '进入闯关' : '登记并进入'}
        </button>
      </form>
      <div className="lswap">
        {mode === 'login' ? (
          <>
            还没有账号？<button type="button" onClick={() => { setMode('register'); setErr('') }}>申请登记</button>
          </>
        ) : (
          <>
            已有账号？<button type="button" onClick={() => { setMode('login'); setErr('') }}>直接登录</button>
          </>
        )}
      </div>
      <div className="uc-note">账户由 Ucenter 统一托管 · 与其他应用共用一套身份</div>
      <div style={{ position: 'fixed', left: 20, bottom: 12 }}>
        <Mascot onClick={() => setErr(mode === 'login' ? '点我干嘛，快去闯关！' : '填好就能进啦～')} />
      </div>
    </div>
  )
}

function LogoSVG() {
  return (
    <svg viewBox="0 0 96 96">
      <rect x="2" y="2" width="92" height="92" rx="26" fill="#58CC02" />
      <rect x="6" y="6" width="84" height="84" rx="22" fill="#8FE844" />
      <circle cx="34" cy="44" r="7" fill="#3E2F1C" />
      <circle cx="62" cy="44" r="7" fill="#3E2F1C" />
      <circle cx="36.5" cy="41" r="2.5" fill="#fff" />
      <circle cx="64.5" cy="41" r="2.5" fill="#fff" />
      <path d="M36 60 q12 10 24 0" stroke="#3E2F1C" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="56" r="4.5" fill="#FFB8B8" opacity=".8" />
      <circle cx="76" cy="56" r="4.5" fill="#FFB8B8" opacity=".8" />
    </svg>
  )
}
