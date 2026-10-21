/**
 * 启动时的强制更新闸门。
 *
 * 为什么单独做一个组件：强制更新必须在「用户能操作任何东西之前」生效。
 * 挂在 App 最外层，盖住整个界面，比在各页面里分散判断可靠。
 *
 * 只在原生 App 内生效，网页版直接放行。
 * 检查失败也放行：网络异常不该把用户锁在门外。
 */

import { useEffect, useRef, useState } from 'react'
import { downloadAndInstall, fetchAppVersion, localVersion, type AppVersion } from '@/api/appVersion'
import { isNativeApp } from '@/platform'
import { buzz } from '@/ui'
import { UpdateDialog, type UpdatePhase } from './UpdateRow'

export function ForceUpdateGate() {
  const [info, setInfo] = useState<AppVersion | null>(null)
  const [installed, setInstalled] = useState('')
  const [phase, setPhase] = useState<UpdatePhase>('idle')
  const [progress, setProgress] = useState(0)
  const [errMsg, setErrMsg] = useState('')
  const checked = useRef(false)

  useEffect(() => {
    if (!isNativeApp() || checked.current) return
    checked.current = true
    void (async () => {
      const v = await localVersion()
      if (!v) return
      setInstalled(v.version)
      try {
        const res = await fetchAppVersion(v.build)
        // 只有服务端明确要求强制更新才拦屏；普通更新交给「我的」页
        if (res.available && res.force) setInfo(res)
      } catch {
        /* 检查失败放行 */
      }
    })()
  }, [])

  async function onInstall() {
    const url = info?.download_url
    if (!url) return
    setPhase('downloading')
    setProgress(0)
    setErrMsg('')
    try {
      await downloadAndInstall(url, setProgress)
      setPhase('done')
      buzz(14)
    } catch (e) {
      setPhase('idle')
      setErrMsg(e instanceof Error ? e.message : '下载失败')
    }
  }

  if (!info) return null

  return (
    <UpdateDialog
      info={info}
      installed={installed}
      forced
      phase={phase}
      progress={progress}
      errMsg={errMsg}
      onClose={() => {
        /* 强制更新不可关闭 */
      }}
      onInstall={() => void onInstall()}
    />
  )
}
