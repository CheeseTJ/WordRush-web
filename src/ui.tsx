/** 全局 UI 工具：彩纸、toast、粘土吉祥物 */

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

export function Mascot({
  mood,
  onClick,
  width = 100,
}: {
  mood?: 'happy' | 'sad'
  onClick?: () => void
  width?: number
}) {
  return (
    <button type="button" className={`mascot ${mood ?? ''}`} onClick={onClick} aria-label="吉祥物" style={{ width }}>
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
