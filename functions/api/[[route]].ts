/**
 * Pages Function：/api/* 同域反代到 wordrush-api（cloudflared 隧道域名）。
 *
 * 背景：Pages 的 _redirects 不能代理外部域名（官方限制），同域代理只能用
 * Function 实现。请求方法 / 头（含 Authorization）/ 请求体 / 响应体（含 TTS
 * 音频等二进制）全部原样透传，浏览器视角仍是同源请求，无需 CORS。
 *
 * 部署：functions/ 必须位于 Pages 项目根目录（dist 之外），
 * 用 `npx wrangler pages deploy dist` 直传时生效；dashboard 拖拽直传
 * 不支持 Functions，此时靠前端 VITE_API_BASE 直连隧道域名兜底。
 * 目标域名可用 Pages 环境变量 API_ORIGIN 覆盖。
 */

const DEFAULT_ORIGIN = 'https://eng.june-t.top'

interface FunctionContext {
  request: Request
  env: Record<string, string | undefined>
}

export async function onRequest(ctx: FunctionContext): Promise<Response> {
  const origin = (ctx.env.API_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '')
  const url = new URL(ctx.request.url)
  const upstream = new Request(origin + url.pathname + url.search, ctx.request)
  return fetch(upstream)
}
