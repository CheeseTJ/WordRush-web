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

import { isNativeApp } from '@/platform'
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
  // 版本检查是公开接口，不依赖登录态；但复用 authFetch 走同一出口
  return authFetch<AppVersion>(`/api/app/version${qs}`, { retryOn401: false })
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
 * 必须落在 cache 目录：res/xml/file_paths.xml 里只声明了 cache-path 与
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

  // Capacitor 的 downloadFile 不回调进度，这里用 fetch + 分块读流自己算。
  // APK 一般 6~10MB，分块写入并不会更慢，但能给出下载进度。
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败 ${res.status}`)
  const total = Number(res.headers.get('content-length') || 0)

  const reader = res.body?.getReader()
  if (!reader) {
    // 极端情况没有流：整包读进来再写
    const buf = await res.arrayBuffer()
    const b64 = arrayBufferToBase64(buf)
    await Filesystem.writeFile({ path: fileName, data: b64, directory: Directory.Cache, recursive: true })
    onProgress?.(1)
    await openApk(fileName)
    return
  }

  // 分块累积，每累积约 512KB 落盘一次（避免内存里堆整个 APK 的 base64）
  let received = 0
  let pending: Uint8Array[] = []
  let pendingBytes = 0
  const FLUSH_AT = 512 * 1024
  let first = true

  const flush = async () => {
    if (!pendingBytes) return
    const merged = new Uint8Array(pendingBytes)
    let off = 0
    for (const c of pending) {
      merged.set(c, off)
      off += c.byteLength
    }
    pending = []
    pendingBytes = 0

    const b64 = arrayBufferToBase64(merged.buffer)
    if (first) {
      await Filesystem.writeFile({ path: fileName, data: b64, directory: Directory.Cache, recursive: true })
      first = false
    } else {
      await Filesystem.appendFile({ path: fileName, data: b64, directory: Directory.Cache })
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      pending.push(value)
      pendingBytes += value.byteLength
      received += value.byteLength
      if (pendingBytes >= FLUSH_AT) await flush()
      if (total > 0) onProgress?.(Math.min(1, received / total))
    }
  }
  await flush()
  onProgress?.(1)

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

/** 分片 base64 编码：一次性展开大数组容易触发调用栈溢出 */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
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
