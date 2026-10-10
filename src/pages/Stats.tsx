import { useEffect, useMemo, useState } from 'react'
import { fetchStats } from '@/api/client'
import type { Stats } from '@/api/client'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** 统计页：总览 + 近 14 天柱状图 + 学习档案（数据来自 HeatWave） */
export default function Stats() {
  const [stats, setStats] = useState<Stats | null>(null)
  // 柱状图入场：mount 后再生长到实际高度（demo 同款）
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    let alive = true
    fetchStats()
      .then((s) => alive && setStats(s))
      .catch(() => {})
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
      <div className="view">
        <div className="empty-tip">加载统计…</div>
      </div>
    )

  return (
    <div className="view">
      <div className="statp">
        <div className="big3 stg" style={{ ['--d' as string]: 0 }}>
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

        <div className="panel stg" style={{ ['--d' as string]: 1 }}>
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

        <div className="panel stg" style={{ ['--d' as string]: 2 }}>
          <h3>
            学习档案<span>PROFILE</span>
          </h3>
          <div className="rows">
            <div className="rw">
              <div className="l">
                <span className="ic" style={{ background: 'var(--green-l)' }}>
                  ⚡
                </span>
                总经验
              </div>
              <span className="arr">{stats.xp} XP · Lv.{stats.level}</span>
            </div>
            <div className="rw">
              <div className="l">
                <span className="ic" style={{ background: 'var(--blue-l)' }}>
                  🔥
                </span>
                最近学习
              </div>
              <span className="arr">{stats.days[0]?.day || '还没有记录'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
