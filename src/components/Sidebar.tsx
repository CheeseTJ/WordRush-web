import { useEffect, useState } from 'react'
import { Diamond, Flame, Heart, Snowflake } from '@phosphor-icons/react'
import { BOOKS, currentBookId, bookMeta } from '@/data/vocab'
import { fetchStats, type Stats } from '@/api/client'
import { useApp } from '@/state/store'
import { gamifyEnabled } from '@/data/exp'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 平板/桌面右侧信息栏（≥600cqw 显示，手机隐藏）。
 * 内容：今日目标环 + 连胜卡 + 本周图 + 徽章行。
 * 数据复用全局流（progress/profile）+ 独立拉取 stats。
 */
export function Sidebar() {
  const { profile, progress } = useApp()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let alive = true
    fetchStats()
      .then((s) => alive && setStats(s))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const meta = bookMeta(currentBookId())
  const totalUnits = meta.units
  const totalStars = [...progress.values()].reduce((a, p) => a + p.stars, 0)
  const percent = totalUnits ? Math.round((totalStars / (totalUnits * 3)) * 100) : 0

  // 最近 7 天柱状数据（缺失天补 0）
  const bars = (() => {
    const map = new Map((stats?.days ?? []).map((d) => [d.day, d]))
    const out: { label: string; words: number }[] = []
    const now = new Date(Date.now() + 8 * 3600 * 1000)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - i)
      out.push({
        label: WEEK_LABELS[d.getUTCDay()],
        words: map.get(d.toISOString().slice(0, 10))?.words ?? 0,
      })
    }
    return out
  })()
  const maxWords = Math.max(1, ...bars.map((b) => b.words))
  const book = BOOKS.find((b) => b.id === currentBookId())

  return (
    <aside className="sidebar stg" style={{ ['--d' as string]: 1 }}>
      {/* 目标环 */}
      <div className="panel side-goal">
        <div className="ring">
          <Ring percent={percent} />
          <span className="cc">{percent}%</span>
        </div>
        <div className="side-tx">
          <b>
            收集星星 {totalStars} / {totalUnits * 3}
          </b>
          <span>{book?.name}</span>
        </div>
      </div>

      {/* 经济面板（迭代三）：红心 / 宝石 / 连胜冻结——游戏化开关关闭时隐藏 */}
      {gamifyEnabled() && (
        <div className="panel side-goal">
          <div className="econ-row">
            <span className="econ-chip" title="红心：每 30 分钟恢复 1 颗">
              <Heart weight="fill" size={14} style={{ color: 'var(--coral)' }} /> <b>{profile.hearts ?? 5}</b>/5
            </span>
            <span className="econ-chip" title="宝石：通关、任务与连击奖励">
              <Diamond weight="fill" size={14} style={{ color: 'var(--blue)' }} /> <b>{profile.gems ?? 0}</b>
            </span>
            <span className="econ-chip" title="连胜冻结：断签日自动消耗，保住连胜">
              <Snowflake weight="fill" size={14} style={{ color: 'var(--blue-d)' }} /> <b>{profile.streak_freeze ?? 0}</b>
            </span>
          </div>
        </div>
      )}

      {/* 连胜 */}
      <div className="panel side-goal">
        <Flame weight="fill" size={32} color="#FF9600" />
        <div className="side-tx">
          <b style={{ color: '#FF9600', fontSize: 24 }}>{profile.streak_days} 天</b>
          <span>连续学习</span>
        </div>
      </div>

      {/* 本周图 */}
      <div className="panel">
        <h3>
          本周学习<span>WORDS</span>
        </h3>
        <div className="week" style={{ height: 76 }}>
          {bars.map((b, i) => (
            <div key={i} className={`wcol ${b.words < 20 ? 'low' : ''}`}>
              <div
                className="wbar"
                style={{ height: `${(b.words / maxWords) * 56}px`, transitionDelay: `${i * 60}ms` }}
                title={`${b.words} 词`}
              />
              <div className="wd">{b.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 徽章 */}
      <div className="panel">
        <h3>
          成就徽章<span>BADGES</span>
        </h3>
        <div className="badges">
          <Badge em="🔥" name="七日连胜" locked={(profile.streak_days ?? 0) < 7} />
          <Badge em="🎯" name="闯关先锋" locked={(profile.xp ?? 0) < 100} />
          <Badge em="🏆" name="关卡全通" locked />
          <Badge em="🚀" name="千词飞人" locked={(profile.xp ?? 0) < 3000} />
        </div>
      </div>
    </aside>
  )
}

function Ring({ percent }: { percent: number }) {
  const CIRC = 132
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="26" cy="26" r="21" fill="none" stroke="#F0E4D2" strokeWidth="5" />
      <circle
        cx="26"
        cy="26"
        r="21"
        fill="none"
        stroke="#58CC02"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - Math.min(1, percent / 100))}
        style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,1.1,.35,1)' }}
      />
    </svg>
  )
}

function Badge({ em, name, locked }: { em: string; name: string; locked?: boolean }) {
  return (
    <div className={`bd ${locked ? 'lock' : ''}`} role="button">
      <span className="em">{em}</span>
      <div className="nm2">{name}</div>
    </div>
  )
}
