import { useEffect, useMemo, useState } from 'react'
import { fetchStats, type Stats } from '@/api/client'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 我的页内的学习统计块（原 /stats 页合并而来）。
 *
 * 独立成页的价值不高——实际使用中不会频繁查看，但完全删掉又丢了回看进度的入口。
 * 折中：保留三项核心指标与近 14 天柱状图，放在「我的」里跟随页面滚动。
 *
 * 原「学习档案」面板已去掉：总经验/等级在页面顶部的头像卡里已有，最近学习日期
 * 与连续天数重复，留着只是重复信息。
 */
export function MeStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  // 柱状图入场：数据到位后再生长到实际高度
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    let alive = true
    fetchStats()
      .then((s) => alive && setStats(s))
      .catch(() => {
        /* 断网时保留占位，不阻塞「我的」页其它功能 */
      })
    const t = setTimeout(() => alive && setGrown(true), 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [])

  // 最近 14 天对齐到「天」的柱状数据（缺失的天补 0）
  const bars = useMemo(() => {
    const map = new Map((stats?.days ?? []).map((d) => [d.day, d]))
    const out: { label: string; words: number; today: boolean; low: boolean }[] = []
    const now = new Date(Date.now() + 8 * 3600 * 1000) // 东八区
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - i)
      const key = d.toISOString().slice(0, 10)
      const w = map.get(key)
      out.push({
        label: WEEK_LABELS[d.getUTCDay()],
        words: w?.words ?? 0,
        today: i === 0,
        low: (w?.words ?? 0) < 20,
      })
    }
    return out
  }, [stats])

  const maxWords = Math.max(1, ...bars.map((b) => b.words))

  const accuracy = useMemo(() => {
    const ds = stats?.days ?? []
    const c = ds.reduce((a, d) => a + d.correct, 0)
    const w = ds.reduce((a, d) => a + d.words, 0)
    return w ? `${Math.round((c / w) * 100)}%` : '—'
  }, [stats])

  if (!stats)
    return (
      <div className="panel stg" style={{ ['--d' as string]: 1 }}>
        <h3>
          学习统计<span>STATS</span>
        </h3>
        <div className="empty-tip">加载中…</div>
      </div>
    )

  return (
    <>
      <div className="big3 stg" style={{ ['--d' as string]: 1 }}>
        <div className="b3 g">
          <div className="v">{stats.learned}</div>
          <div className="k">已学词数</div>
        </div>
        <div className="b3 o">
          <div className="v">{stats.streak_days}</div>
          <div className="k">连续天数</div>
        </div>
        <div className="b3 b">
          <div className="v">{accuracy}</div>
          <div className="k">正确率</div>
        </div>
      </div>

      <div className="panel stg" style={{ ['--d' as string]: 2 }}>
        <h3>
          近 14 天<span>WORDS / DAY</span>
        </h3>
        <div className="week">
          {bars.map((b, i) => (
            <div key={i} className={`wcol ${b.low ? 'low' : ''} ${b.today ? 'today' : ''}`}>
              <div
                className="wbar"
                style={{ height: grown ? `${(b.words / maxWords) * 92}px` : '0px', transitionDelay: `${i * 60}ms` }}
                title={`${b.words} 词`}
              />
              <div className="wd">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
