/**
 * Ucenter 认证客户端（app = wordrush）。
 *
 * 约定与 Imgbed-web 完全一致：
 *  - Ucenter 不是 OIDC：邮箱 + 密码 + app 直接换令牌对
 *  - 只认 Authorization 头，令牌存 localStorage
 *  - refresh_token 一次性，刷新必须单飞，防止并发刷新触发整链吊销
 */

const UC_BASE = (import.meta.env.VITE_UCENTER_BASE || 'https://ucenter.june-t.top').replace(/\/+$/, '')

/** Ucenter 根地址（Me 页展示用） */
export const UCENTER_BASE = UC_BASE

/** 本端在用户中心登记的应用标识，决定 JWT 的 aud（已加入 Worker 的 APPS 白名单） */
export const APP = 'wordrush'

const KEYS = {
  access: 'wordrush.access_token',
  refresh: 'wordrush.refresh_token',
  device: 'wordrush.device_id',
  email: 'wordrush.email',
} as const

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}
function lsSet(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* 隐私模式下降级 */
  }
}

export function getToken(): string {
  return lsGet(KEYS.access)
}
function getRefreshToken(): string {
  return lsGet(KEYS.refresh)
}
function setTokens(pair: { access_token?: string; refresh_token?: string }): void {
  lsSet(KEYS.access, pair.access_token || '')
  lsSet(KEYS.refresh, pair.refresh_token || '')
}
export function hasSession(): boolean {
  return getToken() !== ''
}
export function savedEmail(): string {
  return lsGet(KEYS.email)
}
export function clearSession(): void {
  lsSet(KEYS.access, '')
  lsSet(KEYS.refresh, '')
}

function uuid(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 设备号必须持久化：Ucenter 靠它把令牌归到同一台设备下管理 */
export function deviceId(): string {
  let id = lsGet(KEYS.device)
  if (!id) {
    id = uuid()
    lsSet(KEYS.device, id)
  }
  return id
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as (T & ApiErrBody) | null
  if (!res.ok) {
    const err: ApiErrBody = data ?? {}
    throw new ApiError(res.status, err.code || err.error || 'request_failed', err.message || err.error || `请求失败 ${res.status}`)
  }
  // 200 但响应体不是 JSON（如网关误回 SPA 的 HTML）：抛错走降级路径，
  // 绝不能把 null 当数据返回——曾导致全局 profile 被写成 null 而白屏崩溃
  if (data === null) throw new ApiError(502, 'bad_response_body', '响应体不是合法 JSON')
  return data as T
}

interface ApiErrBody {
  code?: string
  error?: string
  message?: string
}

/* ==================== 单飞刷新 ==================== */

let refreshing: Promise<void> | null = null

export function refreshTokens(): Promise<void> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function doRefresh(): Promise<void> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new ApiError(401, 'no_refresh_token', '未登录')

  const res = await fetch(`${UC_BASE}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, app: APP }),
  })
  setTokens(await parse<{ access_token: string; refresh_token: string }>(res))
}

/* ==================== 登录态失效回调 ==================== */

let onUnauthorized: () => void = () => {}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

function notifyUnauthorized(): void {
  clearSession()
  onUnauthorized()
}

/* ==================== 请求出口 ==================== */

interface RequestOptions {
  method?: string
  body?: unknown
  /** FormData 上传：不设 Content-Type（浏览器自动带 boundary），body 原样透传 */
  form?: FormData
  /** 二进制响应：直接返回 Blob 而非解析 JSON */
  blob?: boolean
  /** 401 时是否尝试刷新令牌后重试。登录/注册/刷新自身必须关掉 */
  retryOn401?: boolean
}

/** 带认证的请求核心：注入 Bearer；401 时单飞刷新后重试一次 */
export async function authFetch<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, blob, retryOn401 = true } = options

  const send = (): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (form === undefined && body !== undefined) headers['Content-Type'] = 'application/json'
    const token = getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(url, {
      method,
      headers,
      body: form !== undefined ? form : body === undefined ? undefined : JSON.stringify(body),
    })
  }

  let res = await send()

  if (res.status === 401 && retryOn401) {
    try {
      await refreshTokens()
      res = await send()
    } catch {
      notifyUnauthorized()
      throw new ApiError(401, 'session_expired', '登录已过期，请重新登录')
    }
  }

  if (blob) {
    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as ApiErrBody | null
      throw new ApiError(res.status, errBody?.code || 'request_failed', errBody?.message || `请求失败 ${res.status}`)
    }
    return (await res.blob()) as T
  }
  return parse<T>(res)
}

/** Ucenter 接口专用出口（相对路径自动拼 UC_BASE） */
function ucFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return authFetch<T>(UC_BASE + path, options)
}

/* ==================== 接口封装 ==================== */

export interface UcenterUser {
  id: string
  email: string
  role?: string
  nickname?: string
}

interface LoginResponse extends UcenterUser {
  access_token: string
  refresh_token: string
  device_id?: string
}

function deviceFields() {
  return {
    app: APP,
    device_id: deviceId(),
    device_name: 'wordrush-web',
    platform: 'web',
  }
}

/** 注册（需要邀请码），成功即完成登录 */
export async function register(email: string, password: string, inviteCode: string): Promise<UcenterUser> {
  const data = await ucFetch<LoginResponse>('/v1/auth/register', {
    method: 'POST',
    retryOn401: false,
    body: { email, password, invite_code: inviteCode, ...deviceFields() },
  })
  setTokens(data)
  if (data.device_id) lsSet(KEYS.device, data.device_id)
  lsSet(KEYS.email, email)
  return data
}

/** 登录。retryOn401 关掉：登录 401 就是凭据错误，刷新没有意义 */
export async function login(email: string, password: string): Promise<UcenterUser> {
  const data = await ucFetch<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    retryOn401: false,
    body: { email, password, ...deviceFields() },
  })
  setTokens(data)
  if (data.device_id) lsSet(KEYS.device, data.device_id)
  lsSet(KEYS.email, email)
  return data
}

/** 登出：尽力通知服务端吊销刷新令牌，无论成败都清掉本地登录态 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  clearSession()
  if (!refreshToken) return
  try {
    await fetch(`${UC_BASE}/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    /* 旁路请求，失败不影响本地登出 */
  }
}
