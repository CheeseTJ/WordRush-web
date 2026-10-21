import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadBook, currentBookId, bookMeta, type LoadedBook } from '@/data/vocab'
import { availableStories } from '@/data/stories'
import { useApp } from '@/state/store'
import { fetchTasks, claimTask, type Task } from '@/api/client'
import { gamifyEnabled } from '@/data/exp'
import { confetti, confettiAnchor, toast, Mascot } from '@/ui'

const PHRASES = [
  '今天也要加油鸭！',
  '错了没关系，我陪你再来',
  '连续打卡的感觉很棒吧？',
  '复习一下错题吧～',
  '休息一下？我在这等你',
]

/** 每关横向摆动位置（%），复刻 demo 的单列蜿蜒路径 */
const X_SERIES = [50, 69, 31, 50, 73, 27, 50, 69]
const ROW_GAP = 118

/** 宽屏媒体查询（平板/桌面：底部悬浮卡隐藏，安全区大幅缩小） */
function useWideMedia(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 600px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 600px)')
    const on = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

/** 学习地图：全量关卡平铺成一条无尽长路（长期学习形态），进度来自服务端 */
export default function Map() {
  const nav = useNavigate()
  const { progress, profile, refresh } = useApp()
  const [bubble, setBubble] = useState('')
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mood, setMood] = useState<'happy' | 'sad' | undefined>()
  const [book, setBook] = useState<LoadedBook | null>(null)
  const [error, setError] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [storySet, setStorySet] = useState<Set<string>>(new Set())
  const bookId = currentBookId()

  // 情景对话（迭代四）：已上线的章节 id 集合
  useEffect(() => {
    let alive = true
    availableStories().then((s) => alive && setStorySet(s))
    return () => {
      alive = false
    }
  }, [])

  // 每日任务（迭代三）：进地图拉取，领奖后刷新
  const loadTasks = useCallback(() => {
    fetchTasks().then(setTasks).catch(() => {})
  }, [])
  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  async function onClaim(id: string) {
    try {
      const gems = await claimTask(id)
      toast(`领取成功 +${gems} 宝石 💎`)
      confetti(18, ['#FFC800', '#58CC02', '#1CB0F6'], confettiAnchor())
      loadTasks()
      void refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : '领取失败')
    }
  }

  useEffect(() => {
    let alive = true
    setBook(null)
    setError('')
    loadBook(bookId)
      .then((b) => alive && setBook(b))
      .catch(() => alive && setError('词库加载失败，请检查网络后重试'))
    return () => {
      alive = false
    }
  }, [bookId])

  const units = book?.units ?? []
  const meta = bookMeta(bookId)

  // 解锁链：第一关永远开放，其余需前一关拿星
  const unlockedSet = useMemo(() => {
    const set = new Set<string>()
    units.forEach((x, i) => {
      if (i === 0 || (progress.get(units[i - 1].unit.id)?.stars ?? 0) > 0) set.add(x.unit.id)
    })
    return set
  }, [units, progress])

  // 布局（攀登形态）：第 1 关在底部，越往上关卡越高级。
  // 每章入口（章首关）下方预留独立空间放章标题，避免与上一章的节点/标签重叠。
  const wide = useWideMedia()
  const hasTasks = tasks.length > 0
  const { positions, mapHeight } = useMemo(() => {
    const TOP_PAD = hasTasks ? 128 : 60 // 顶部有任务横幅时预留空间
    // 底部安全区：手机要给「笑脸+目标卡」悬浮行留位；宽屏该行隐藏，只留少量呼吸
    const BOTTOM_PAD = wide ? 48 : 280
    const rel: { x: number; dy: number }[] = []
    let dy = 0
    units.forEach((x, i) => {
      const chapterFirst = i === 0 || units[i - 1].chapter.id !== x.chapter.id
      if (i > 0 && chapterFirst) dy += 84 // 章间额外间距（放章标题）
      rel.push({ x: X_SERIES[i % X_SERIES.length], dy })
      dy += ROW_GAP
    })
    const height = dy + TOP_PAD + BOTTOM_PAD
    // 第 1 关贴底：y = 底部起点 - 累积位移（关卡序号越大越靠上）
    const pos = rel.map((o) => ({ x: o.x, y: height - BOTTOM_PAD - o.dy }))
    return { positions: pos, mapHeight: height }
  }, [units, wide, hasTasks])

  const doneIdx = useMemo(() => {
    let n = 0
    for (const { unit } of units) if ((progress.get(unit.id)?.stars ?? 0) > 0) n++
    return n
  }, [units, progress])

  const firstUncleared = useMemo(() => {
    const x = units.find((u) => (progress.get(u.unit.id)?.stars ?? 0) === 0)
    return x?.unit.id ?? units[units.length - 1]?.unit.id
  }, [units, progress])

  const totalStars = useMemo(
    () => [...progress.values()].reduce((a, p) => a + p.stars, 0),
    [progress],
  )

  // 章节全部通关 → 解锁该章情景对话（且线上有剧本）
  // 注意：本文件组件名 Map 遮蔽了全局 Map 构造器，这里只能用 Record/Set
  const storyReady = useMemo(() => {
    const done: Record<string, boolean> = {}
    for (const { unit, chapter } of units) {
      const ok = (progress.get(unit.id)?.stars ?? 0) > 0
      done[chapter.id] = (done[chapter.id] ?? true) && ok
    }
    const out = new Set<string>()
    Object.entries(done).forEach(([c, ok]) => {
      if (ok && storySet.has(c)) out.add(c)
    })
    return out
  }, [units, progress, storySet])

  // 进入地图时自动定位到当前关卡（攀登形态：从下往上看）
  useEffect(() => {
    if (!book || !firstUncleared) return
    const t = setTimeout(() => {
      document.getElementById(`node-${firstUncleared}`)?.scrollIntoView({ block: 'center' })
    }, 150)
    return () => clearTimeout(t)
  }, [book, firstUncleared])

  /** 点一下小人：说句话 + 跳一下，不撒粒子（粒子留给领奖这类正反馈） */
  function poke() {
    setBubble(PHRASES[Math.floor(Math.random() * PHRASES.length)])
    setMood('happy')
    setTimeout(() => setMood(undefined), 900)
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(''), 2200)
  }

  /** 邀请聊天：气泡里带「聊两句」按钮，点按进入口语对话（方案A：戳一戳直达） */
  function inviteChat() {
    if (bubbleTimer.current) {
      clearTimeout(bubbleTimer.current) // 别让上一次 poke 的自动消失关掉邀请
      bubbleTimer.current = null
    }
    setBubble('__chat__')
    setMood('happy')
    setTimeout(() => setMood(undefined), 900)
  }

  return (
    <div className="view">
      {/* 不叠独立背景层：整页统一用 body 的奶油底 + 光斑，避免 HUD 下方出现色差分界线 */}
      <div className="map-scroll">
        {error && <div className="empty-tip">{error}</div>}
        {!error && !book && <div className="empty-tip">正在打开《{meta.name}》…</div>}
        {book && (
          <div className="map-inner" style={{ height: mapHeight }}>
            <div className="chap" style={{ top: hasTasks ? 108 : 18 }}>
              <div className="t">{meta.name}</div>
              <div className="s">
                {meta.desc} · {meta.words} 词 {meta.units} 关
              </div>
            </div>
            <svg className="trail" viewBox={`0 0 480 ${mapHeight}`} preserveAspectRatio="none" aria-hidden>
              <path className="base" d={trailPath(positions)} />
              <path className="live" d={trailPath(positions.slice(0, Math.max(2, doneIdx + 1)))} />
            </svg>

            {units.map(({ unit, chapter }, i) => {
              const p = progress.get(unit.id)
              const stars = p?.stars ?? 0
              const unlocked = unlockedSet.has(unit.id)
              const isNow = unlocked && stars === 0 && unit.id === firstUncleared
              const cls = stars > 0 ? 'node done' : isNow ? 'node now' : 'node'
              const label = stars > 0 ? '★'.repeat(stars) : isNow ? String(i + 1) : unlocked ? String(i + 1) : '🔒'
              const pos = positions[i]
              const chapterFirst = i === 0 || units[i - 1].chapter.id !== chapter.id
              return (
                <div key={unit.id}>
                  {chapterFirst && (
                  <div className="chap" style={{ top: pos.y + 78 }}>
                    <div className="t">{chapter.title}</div>
                    {chapter.en && <div className="s">{chapter.en}</div>}
                    {storySet.has(chapter.id) && (
                      <button
                        type="button"
                        className={`story-chip ${storyReady.has(chapter.id) ? 'on' : 'lock'}`}
                        onClick={() => {
                          if (!storyReady.has(chapter.id)) return toast('先通关本章全部关卡，解锁情景对话 🎭')
                          nav(`/story/${chapter.id}`)
                        }}
                      >
                        🎭 情景对话{storyReady.has(chapter.id) ? '' : ' 🔒'}
                      </button>
                    )}
                  </div>
                )}
                  <button
                    type="button"
                    id={`node-${unit.id}`}
                    className={cls}
                    style={{ left: `${pos.x}%`, top: pos.y }}
                    onClick={() => {
                      if (!unlocked) return toast('先通过上一关来解锁吧')
                      if (gamifyEnabled() && (profile.hearts ?? 5) <= 0) return toast('红心用完了，等待恢复或用宝石补满 ❤️')
                      nav(`/quiz/${unit.id}`)
                    }}
                  >
                    {isNow && <span className="flag">继续</span>}
                    <span className="blob">{label}</span>
                    <span className="cap">{unlocked ? unit.title : '锁定'}</span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 每日任务横幅（迭代三）——游戏化开关关闭时隐藏 */}
      {gamifyEnabled() && hasTasks && (
        <div className="tasks-banner stg" style={{ ['--d' as string]: 1 }}>
          <div className="tb-title">🎯 每日任务</div>
          <div className="tb-list">
            {tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tb-item ${t.claimed ? 'got' : t.done ? 'ready' : ''}`}
                onClick={() => {
                  if (t.claimed) return toast('今天的奖励已经领过啦')
                  if (!t.done) return toast('任务还没完成哦，加油！')
                  void onClaim(t.id)
                }}
              >
                <span className="tb-label">{t.label}</span>
                <span className="tb-meta">
                  {t.claimed ? '✓ 已领取' : t.done ? `领 ${t.reward} 💎` : `${t.current}/${t.target}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="map-foot">
        <div className="foot-row stg" style={{ ['--d' as string]: 2 }}>
          <Mascot mood={mood} onClick={poke} onLongPress={inviteChat} />
          <div className="goal">
            <div className="ring">
              <GoalRing percent={units.length ? (totalStars / (units.length * 3)) * 100 : 0} />
            </div>
            <div className="tx">
              <b>
                收集星星 {totalStars} / {units.length * 3}
              </b>
              <span>通过关卡获得星星，点亮整条学习之路</span>
            </div>
          </div>
        </div>
        {bubble &&
          (bubble === '__chat__' ? (
            <div className="bubble show chat-invite">
              <p>Hey! 想用英语聊两句吗？</p>
              <span className="sub">我陪你练，说错也没关系～</span>
              <button type="button" className="chat-cta" onClick={() => nav('/scenarios')}>
                聊两句 🎧
              </button>
            </div>
          ) : (
            <div className="bubble show">{bubble}</div>
          ))}
      </div>
    </div>
  )
}

/** 生成蛇形曲线（依次连接各节点，x 为百分比换算到 480 宽） */
function trailPath(pos: { x: number; y: number }[]): string {
  if (pos.length < 2) return ''
  const pts = pos.map((p) => ({ x: (p.x / 100) * 480, y: p.y }))
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const cur = pts[i]
    const midY = (prev.y + cur.y) / 2
    d += ` C ${prev.x} ${midY}, ${cur.x} ${midY}, ${cur.x} ${cur.y}`
  }
  return d
}

function GoalRing({ percent }: { percent: number }) {
  const CIRC = 119.4
  // mount 后再充能：初始满偏移 → 过渡到目标值（demo 同款入场动效）
  const [armed, setArmed] = useState(false)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), 350)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!armed) return
    const t0 = performance.now()
    const dur = 1100
    let raf = 0
    const f = (t: number) => {
      const p = Math.min((t - t0) / dur, 1)
      setShown(Math.round(percent * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [armed, percent])
  return (
    <>
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r="19" fill="none" stroke="#F0E4D2" strokeWidth="5" />
        <circle
          cx="23"
          cy="23"
          r="19"
          fill="none"
          stroke="#58CC02"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={armed ? CIRC * (1 - Math.min(1, percent / 100)) : CIRC}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.2,1.1,.35,1)' }}
        />
      </svg>
      <span className="cc" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: 'var(--green)' }}>
        {shown}%
      </span>
    </>
  )
}
