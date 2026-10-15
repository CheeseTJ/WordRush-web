/** 全局 UI 工具：彩纸、toast、粘土吉祥物 */
import { useRef, type ComponentType } from 'react'
import {
  AirplaneTakeoff,
  Bag,
  Bed,
  Briefcase,
  Coffee,
  ForkKnife,
  HouseLine,
  Stethoscope,
  type IconProps,
} from '@phosphor-icons/react'

/** 全屏彩纸：在 body 上撒 n 颗色块 */
export function confetti(n: number, colors: string[]): void {
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i')
    s.className = 'spark'
    const a = Math.random() * Math.PI * 2
    const d = 70 + Math.random() * 200
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`)
    s.style.setProperty('--dy', `${Math.sin(a) * d}px`)
    s.style.left = `${Math.random() * 80 + 10}%`
    s.style.top = '55%'
    const c = colors[i % colors.length]
    s.style.background = c
    s.style.boxShadow = `0 0 10px ${c}`
    const sz = 6 + Math.random() * 8
    s.style.width = `${sz}px`
    s.style.height = `${sz}px`
    s.style.animationDelay = `${Math.random() * 0.2}s`
    document.body.appendChild(s)
    setTimeout(() => s.remove(), 1300)
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

/** 底部 toast：依赖 App 壳里挂载的 #toast 元素 */
export function toast(msg: string): void {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600)
}

export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* 不支持震动则忽略 */
  }
}

/* ---------- 答题音效（Web Audio 现场合成，无外部资源） ---------- */

let sfxCtx: AudioContext | undefined

function sfxCtxGet(): AudioContext {
  if (!sfxCtx) sfxCtx = new AudioContext()
  if (sfxCtx.state === 'suspended') void sfxCtx.resume()
  return sfxCtx
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol: number): void {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  const t0 = ctx.currentTime + start
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  o.connect(g)
  g.connect(ctx.destination)
  o.start(t0)
  o.stop(t0 + dur)
}

/** 答对：上行双音「叮-叮」 */
export function sfxCorrect(): void {
  try {
    const c = sfxCtxGet()
    tone(c, 660, 0, 0.1, 'sine', 0.16)
    tone(c, 880, 0.08, 0.18, 'sine', 0.16)
  } catch {
    /* 音频不可用则静默 */
  }
}

/** 答错：下行低鸣「噗-噗」 */
export function sfxWrong(): void {
  try {
    const c = sfxCtxGet()
    tone(c, 233, 0, 0.15, 'square', 0.07)
    tone(c, 165, 0.11, 0.22, 'square', 0.07)
  } catch {
    /* 音频不可用则静默 */
  }
}

export function Mascot({
  mood,
  onClick,
  onLongPress,
  width = 100,
}: {
  mood?: 'happy' | 'sad'
  onClick?: () => void
  /** 长按（600ms）触发：用于次要入口（如邀请聊天），不干扰单击 */
  onLongPress?: () => void
  width?: number
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const start = () => {
    if (!onLongPress) return
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, 600)
  }
  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  return (
    <button
      type="button"
      className={`mascot ${mood ?? ''}`}
      onClick={() => {
        if (firedRef.current) return // 长按已触发，抑制随后的 click
        onClick?.()
      }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        if (onLongPress) e.preventDefault() // 移动端长按菜单
      }}
      aria-label="吉祥物"
      style={{ width }}
    >
      <svg viewBox="0 0 120 120">
        <ellipse cx="60" cy="74" rx="42" ry="40" fill="#7BDD2E" />
        <ellipse cx="60" cy="70" rx="42" ry="34" fill="#8FE844" />
        <g className="eyes">
          <circle className="eye" cx="44" cy="64" r="7.5" fill="#3E2F1C" />
          <circle className="eye" cx="76" cy="64" r="7.5" fill="#3E2F1C" />
          <circle cx="46.5" cy="61" r="2.6" fill="#fff" />
          <circle cx="78.5" cy="61" r="2.6" fill="#fff" />
        </g>
        <path className="mouth-o" d="M50 82 q10 8 20 0" stroke="#3E2F1C" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path className="mouth-h" d="M46 80 q14 14 28 0" stroke="#3E2F1C" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path className="mouth-s" d="M50 88 q10 -9 20 0" stroke="#3E2F1C" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="28" cy="78" r="5.5" fill="#FFB8B8" opacity=".75" />
        <circle cx="92" cy="78" r="5.5" fill="#FFB8B8" opacity=".75" />
      </svg>
    </button>
  )
}

/** 星星（通关弹层用） */
export function StarSVG(): React.ReactNode {
  return (
    <svg viewBox="0 0 48 48" fill="#FFC800">
      <path d="M24 4l6.2 12.9L44 19l-10 9.6L36.6 43 24 36.4 11.4 43 14 28.6 4 19l13.8-2.1z" />
    </svg>
  )
}

/* ---------- 场景图标（Phosphor · fill） ---------- */

/** 场景 icon 名（scenarios.ts 的 Scenario.icon）→ Phosphor 组件 */
export const SCN_ICONS: Record<string, ComponentType<IconProps>> = {
  coffee: Coffee,
  'airplane-takeoff': AirplaneTakeoff,
  bed: Bed,
  'fork-knife': ForkKnife,
  bag: Bag,
  stethoscope: Stethoscope,
  briefcase: Briefcase,
  'house-line': HouseLine,
}
