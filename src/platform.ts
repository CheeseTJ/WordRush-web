/**
 * 运行环境判定：区分「浏览器里的 PWA/网页」与「Capacitor 原生壳」。
 *
 * Capacitor 在 WebView 里会注入 window.Capacitor。用它而不是 UA 判断，是因为：
 * 有些安卓机型的 UA 里不含能可靠识别的字样，而 Capacitor 注入一定是准确的。
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function cap(): CapacitorGlobal | undefined {
  return (globalThis as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** 是否运行在 Capacitor 原生壳内（Android/iOS App） */
export function isNativeApp(): boolean {
  const c = cap()
  if (!c) return false
  try {
    return c.isNativePlatform ? c.isNativePlatform() : false
  } catch {
    return false
  }
}

/** 原生平台名（'android' / 'ios' / 'web'） */
export function platformName(): string {
  try {
    return cap()?.getPlatform?.() ?? 'web'
  } catch {
    return 'web'
  }
}

/**
 * 业务 API 绝对地址。
 *
 * 网页版缺省同源（dev 走 Vite 代理，Pages 部署走 functions 反代）；
 * 原生壳内 origin 是 https://localhost，没有后端，必须直连隧道域名。
 * 因此壳里要求构建时注入 VITE_API_BASE，缺失时兜底到生产域名。
 */
const FALLBACK_API = 'https://eng.june-t.top'

export function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  return isNativeApp() ? FALLBACK_API : ''
}
