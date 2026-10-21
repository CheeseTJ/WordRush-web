/**
 * App 版本与更新检查（仅原生壳内可用）。
 *
 * 链路：
 *   1. 从 Capacitor App 插件读当前 versionName / versionCode；
 *   2. 问后端 /api/app/version（后端再去蒲公英取最新版）；
 *   3. 有新版则前端自行下载 APK 并交给系统安装器。
 *
 * 为什么不直接在客户端调蒲公英：API Key 打进前端包等于公开，
 * 谁都能拿去刷额度。密钥留在服务端，客户端只认后端结论。
 */

import { apiBase, isNativeApp } from '@/platform'
import { authFetch } from './ucenter'

/** 后端返回的版本信息（与 internal/api/appversion.go 保持一致） */
export interface AppVersion {
  /** 后端是否配好了发版渠道。false 时只能给下载页 */
  available: boolean
  platform: string
  version?: string
  version_code?: number
  has_update?: boolean
  force?: boolean
  download_url?: string
  page_url?: string
  description?: string
  file_size?: number
  /** 兜底下载页（无论 available 与否都可能给） */
  download_page?: string
}

/** 本地安装的版本信息 */
export interface LocalVersion {
  version: string
  build: number
}

/** 读本机安装的版本号；非原生环境或读取失败时返回 null */
export async function localVersion(): Promise<LocalVersion | null> {
  if (!isNativeApp()) return null
  try {
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()
    // Capacitor 的 build 字段是字符串，安卓上就是 versionCode
    const build = Number.parseInt(info.build || '0', 10)
    return { version: info.version || '', build: Number.isFinite(build) ? build : 0 }
  } catch {
    return null
  }
}

/** 向后端查询最新版本 */
export function fetchAppVersion(build: number): Promise<AppVersion> {
  const qs = `?version_code=${build}&platform=android`
  // 必须走 apiBase()：原生壳内 origin 是 https://localhost，WebView 本地
  // 资源服务器没有 /api 路由，相对路径会命中 SPA 回退返回 index.html，
  // 随后 JSON 解析失败——表现就是「检查更新失败」。
  // apiBase() 在浏览器里返回 ''（同源），在壳里返回隧道域名。
  return authFetch<AppVersion>(`${apiBase()}/api/app/version${qs}`, { retryOn401: false })
}

/** 把字节数转成人类可读体积 */
export function fileSizeText(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

/**
 * 下载 APK 到缓存目录并交给系统安装器。
 *
 * 为什么必须用 Filesystem.downloadFile 而不是 fetch：
 * 蒲公英的 downloadURL 是 `www.pgyer.com/app/installUpdate/...`，它返回 302
 * 跳转到对象存储，且**不返回任何 CORS 头**。WebView 里 fetch 跨域会直接被拦，
 * 表现就是 "Failed to fetch"（连 302 都拿不到）。
 * downloadFile 走原生 HTTP 栈（OkHttp），不受同源策略限制，还能带进度回调。
 *
 * 必须落在 cache 目录：res/xml/file_paths.xml 只声明了 cache-path 与
 * external-path，FileProvider 只能用这些目录里的文件，否则安装器会
 * 报「解析软件包时出现问题」。
 */
export async function downloadAndInstall(
  url: string,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  const fileName = 'wordrush-update.apk'
  // 上一次的残留先删掉，避免把旧包当新包装上
  try {
    await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache })
  } catch {
    /* 不存在就算了 */
  }

  // 进度事件在 Android 上按 100ms 节流，可以放心直接 setState
  let handle: { remove: () => Promise<void> } | undefined
  if (onProgress) {
    handle = await Filesystem.addListener('progress', (p) => {
      // progress 是已下载字节数，total 可能为 -1（服务端没给 Content-Length）
      if (p.contentLength > 0) {
        onProgress(Math.min(1, p.bytes / p.contentLength))
      }
    })
  }

  try {
    // 蒲公英的下载地址会 302 跳到对象存储，OkHttp 默认跟随重定向
    await Filesystem.downloadFile({
      url,
      path: fileName,
      directory: Directory.Cache,
    })
    onProgress?.(1)
  } finally {
    await handle?.remove().catch(() => {})
  }

  await openApk(fileName)
}

/** 交给系统安装器打开缓存里的 APK */
async function openApk(fileName: string): Promise<void> {
  const { FileOpener } = await import('@capawesome-team/capacitor-file-opener')
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  // getUri 在 Android 上返回 file:// 路径，FileOpener 内部会转成 content:// 交给系统，
  // 走的是 manifest 里声明的 FileProvider（cache-path）。
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })
  await FileOpener.openFile({
    path: uri,
    mimeType: 'application/vnd.android.package-archive',
  })
}

/** 用系统浏览器（或应用内浏览器）打开蒲公英安装页，作为下载失败时的兜底 */
export async function openInBrowser(url: string): Promise<void> {
  if (!url) return
  if (isNativeApp()) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
      return
    } catch {
      /* 插件异常时退回 window.open */
    }
  }
  window.open(url, '_blank', 'noopener')
}
