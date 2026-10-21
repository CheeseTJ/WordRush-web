/**
 * 「我的」页的版本行 + 检查更新弹层。
 *
 * 只在原生 App 里出现——网页版没有安装包概念，浏览器刷新本身就是最新。
 *
 * 交互参考 Music 的 Version 行：
 *  - 静默检查一次，有新版直接在行尾显示徽标，不打断用户；
 *  - 点行才展开弹层，避免一进「我的」页就弹窗；
 *  - 强制更新（服务端配置的最低版本高于本机）时不可关闭。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  downloadAndInstall,
  fetchAppVersion,
  fileSizeText,
  localVersion,
  openInBrowser,
  type AppVersion,
} from '@/api/appVersion'
import { isNativeApp } from '@/platform'
import { toast, buzz } from '@/ui'
import { ArrowClockwise, DownloadSimple, X } from '@phosphor-icons/react'

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'done'

export function UpdateRow() {
  const [installed, setInstalled] = useState<string>('')
  const [build, setBuild] = useState(0)
  const [info, setInfo] = useState<AppVersion | null>(null)
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [progress, setProgress] = useState(0)
  const [open, setOpen] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  // StrictMode 下 effect 会跑两遍，用 ref 保证只初始化一次
  const inited = useRef(false)

  const hasUpdate = info?.has_update === true
  const forced = info?.force === true

  /** 检查更新。silent=true 时失败不弹提示（进页面时的静默检查） */
  const check = useCallback(
    async (opts?: { silent?: boolean; buildOverride?: number }) => {
      const b = opts?.buildOverride ?? build
      if (phase === 'checking' || phase === 'downloading') return null
      setPhase('checking')
      setErrMsg('')
      try {
        const res = await fetchAppVersion(b)
        setInfo(res)
        return res
      } catch (e) {
        const msg = e instanceof Error ? e.message : '检查失败'
        setErrMsg(msg)
        if (!opts?.silent) {
          // 区分「网络不通」和「服务端返回了看不懂的东西」：
          // 后者最常见的原因是请求打到了 WebView 本地服务器（拿到 SPA 的 HTML），
          // 用户看到具体原因才能判断是网络问题还是版本问题
          const friendly =
            msg.includes('合法 JSON') || msg.includes('bad_response_body')
              ? '服务器返回异常，请稍后重试'
              : msg.includes('Failed to fetch') || msg.includes('NetworkError')
                ? '网络连接失败，请检查网络后重试'
                : `检查更新失败：${msg}`
          toast(friendly)
        }
        return null
      } finally {
        setPhase('idle')
      }
    },
    [build, phase],
  )

  useEffect(() => {
    if (!isNativeApp() || inited.current) return
    inited.current = true
    void (async () => {
      const v = await localVersion()
      if (!v) return
      setInstalled(v.version)
      setBuild(v.build)
      // 静默检查：有新版就在行尾亮徽标
      await check({ silent: true, buildOverride: v.build })
    })()
  }, [check])

  /** 点整行：有新版就地展开，否则重新检查一次并给结果提示 */
  async function onRowClick() {
    if (phase === 'checking' || phase === 'downloading') return
    buzz(8)
    if (hasUpdate) {
      setOpen((v) => !v)
      return
    }
    const res = await check()
    if (!res) return
    if (!res.available) {
      // 服务端没配发版渠道：给下载页兜底
      if (res.download_page) {
        void openInBrowser(res.download_page)
      } else {
        toast('暂未开通自动更新')
      }
      return
    }
    if (res.has_update) {
      setOpen(true)
    } else {
      // 「已是最新版本」只是信息性反馈，不撒彩纸：
      // 粒子特效留给答题答对这类「获得成就」的时刻，否则会显得廉价的到处庆祝
      toast(`已是最新版本 v${installed || res.version || ''}`)
    }
  }

  async function onInstall() {
    const url = info?.download_url
    if (!url) {
      // 没有直装地址（如蒲公英限制了 API 下载）→ 打开安装页
      const page = info?.page_url || info?.download_page || ''
      if (page) {
        void openInBrowser(page)
      } else {
        toast('没有可用的下载地址')
      }
      return
    }
    setPhase('downloading')
    setProgress(0)
    setErrMsg('')
    try {
      await downloadAndInstall(url, setProgress)
      setPhase('done')
      buzz(14)
    } catch (e) {
      setPhase('idle')
      // 不把原生/网络层的英文原文（Failed to fetch、FileNotFoundException…）
      // 直接甩给用户：换成可操作的指引，并把发布页作为退路
      const raw = e instanceof Error ? e.message : String(e)
      console.warn('[update] 下载失败:', raw)
      setErrMsg('自动下载失败，请点击下方「打开发布页」手动下载安装')
    }
  }

  if (!isNativeApp()) return null

  return (
    <>
      <button
        type="button"
        className="rw"
        onClick={() => void onRowClick()}
        disabled={phase === 'checking' || phase === 'downloading'}
      >
        <div className="l">
          <span className="ic" style={{ background: 'var(--green-l)' }}>
            <ArrowClockwise size={16} weight="bold" className={phase === 'checking' ? 'spin' : ''} />
          </span>
          检查更新
        </div>
        <span className="arr">
          {phase === 'checking' ? (
            '检查中…'
          ) : phase === 'downloading' ? (
            `${Math.round(progress * 100)}%`
          ) : hasUpdate ? (
            <span className="tag">新版本 v{info?.version}</span>
          ) : (
            `v${installed} ›`
          )}
        </span>
      </button>

      {open && info && (
        <UpdateDialog
          info={info}
          installed={installed}
          forced={forced}
          phase={phase}
          progress={progress}
          errMsg={errMsg}
          onClose={() => setOpen(false)}
          onInstall={() => void onInstall()}
        />
      )}
    </>
  )
}

/**
 * 更新弹层：UpdateRow 与 ForceUpdateGate 共用。
 * 抽出来是为了让「强制更新」复用同一套下载/进度/兜底逻辑，
 * 而不是再写一份容易走样的副本。
 */
export function UpdateDialog({
  info,
  installed,
  forced,
  phase,
  progress,
  errMsg,
  onClose,
  onInstall,
}: {
  info: AppVersion
  installed: string
  forced: boolean
  phase: UpdatePhase
  progress: number
  errMsg: string
  onClose: () => void
  onInstall: () => void
}) {
  const page = info.page_url || info.download_page || ''
  return (
    <div className="fill" onClick={(e) => e.target === e.currentTarget && !forced && onClose()}>
      <div className="box" style={{ textAlign: 'left' }}>
        {!forced && (
          <button type="button" className="update-close" aria-label="关闭" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        )}
        <h2 style={{ textAlign: 'center' }}>{forced ? '需要更新' : '发现新版本'}</h2>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink-soft)', marginTop: -6 }}>
          v{installed || '—'} → v{info.version}
          {info.file_size ? ` · ${fileSizeText(info.file_size)}` : ''}
        </p>

        {info.description && (
          <div className="update-notes">
            {info.description
              .split('\n')
              .filter((l) => l.trim())
              .map((line, i) => (
                <p key={i}>{line}</p>
              ))}
          </div>
        )}

        {errMsg && (
          <div className="update-err">
            <span>{errMsg}</span>
          </div>
        )}

        {phase === 'downloading' ? (
          <div className="update-progress">
            <div className="bar">
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span>{Math.round(progress * 100)}% · 正在下载安装包</span>
          </div>
        ) : (
          <button type="button" className="btn" onClick={onInstall}>
            <DownloadSimple size={18} weight="bold" />
            {errMsg ? '重试下载' : '立即更新'}
          </button>
        )}

        {page && phase !== 'downloading' && (
          <button type="button" className="btn alt" onClick={() => void openInBrowser(page)}>
            打开发布页
          </button>
        )}

        {forced && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>
            更新后即可继续使用，学习数据不会丢失
          </p>
        )}
      </div>
    </div>
  )
}
