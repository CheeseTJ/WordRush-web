import { useEffect, useState } from 'react'
import { findWordAsync } from '@/data/vocab'
import type { Word } from '@/data/vocab'
import { fetchReviewQueue, postReviewResults, markReviewDone, clearReviewCache } from '@/api/client'
import { useApp } from '@/state/store'
import { confetti, confettiAnchor, toast, buzz } from '@/ui'

const QUEUE_LIMIT = 10

/** 复习页：错题闪卡。队列来自服务端 word_stats，异步映射回词库内容
 *  队列按天缓存（见 api/client.ts 的 fetchReviewQueue）：当天集合固定，
 *  复习过的词由 markReviewDone 从本地缓存剔除，不重新回源。 */
export default function Review() {
  const { refresh } = useApp()
  const [queue, setQueue] = useState<Word[]>([])
  const [state, setState] = useState<'loading' | 'offline' | 'ready' | 'empty'>('loading')
  const [ri, setRi] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [fly, setFly] = useState<'known' | 'unknown' | null>(null)
  const [known, setKnown] = useState(0)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const ids = await fetchReviewQueue(QUEUE_LIMIT)
        if (!alive) return
        const words = (await Promise.all(ids.map((id) => findWordAsync(id)))).filter(
          (w): w is Word => !!w,
        )
        if (!alive) return
        setQueue(words)
        setState(words.length ? 'ready' : 'empty')
      } catch {
        if (alive) setState('offline')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function mark(ok: boolean) {
    if (!flipped || fly) return
    const word = queue[ri]
    setFly(ok ? 'known' : 'unknown')
    if (ok) {
      setKnown((k) => k + 1)
      confetti(12, ['#58CC02', '#FFC800'], confettiAnchor())
      buzz(12)
    } else {
      buzz(24)
      toast('已放回复习队列')
    }
    try {
      await postReviewResults([{ id: word.id, ok }])
    } catch {
      /* 复习结果同步失败不打断流程 */
    }
    // 本地缓存同步标记已完成：无论上一步成功与否，用户确实复习过这张卡，
    // 当天再进复习页不应该又看到它
    markReviewDone([word.id])
    setTimeout(() => {
      setFly(null)
      setFlipped(false)
      if (ri + 1 >= queue.length) setFinished(true)
      else setRi((x) => x + 1)
    }, 430)
  }

  /** 清掉当日缓存并按服务端最新到期情况重新拉取（「刷新队列」用） */
  function reloadQueue() {
    clearReviewCache()
    setRi(0)
    setKnown(0)
    setFinished(false)
    setFlipped(false)
    setState('loading')
    void (async () => {
      try {
        const ids = await fetchReviewQueue(QUEUE_LIMIT)
        const words = (await Promise.all(ids.map((id) => findWordAsync(id)))).filter(
          (w): w is Word => !!w,
        )
        setQueue(words)
        setState(words.length ? 'ready' : 'empty')
        void refresh()
      } catch {
        setState('offline')
      }
    })()
  }

  if (state === 'loading')
    return (
      <div className="view">
        <div className="empty-tip">拉取今日到期复习…</div>
      </div>
    )

  if (state === 'offline')
    return (
      <div className="view">
        <div className="empty-tip">
          📴 到期复习需要联网获取
          <br />
          闯关可以先去地图继续～
        </div>
      </div>
    )

  if (state === 'empty')
    return (
      <div className="view">
        <div className="empty-tip">
          🎉 今日复习已完成
          <br />
          到期的词会按遗忘曲线出现在这里
        </div>
      </div>
    )

  if (finished)
    return (
      <div className="view">
        <div className="revp">
          <div className="revhead">
            <b>复习完成！</b>
          </div>
          <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
            <div className="revdone on" style={{ position: 'static' }}>
              <div className="bx">
                <b>{known === queue.length ? '全对！太强了' : '记住了大部分'}</b>
                <span>
                  记住了 {known} / {queue.length} 张
                </span>
                <button type="button" className="btn" onClick={reloadQueue}>
                  刷新队列
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )

  const word = queue[ri]

  return (
    <div className="view">
      <div className="revp">
        <div className="revhead stg" style={{ ['--d' as string]: 0 }}>
          <b>今日到期复习</b>
          <span>还剩 {queue.length - ri} 词 · 点卡片翻面</span>
        </div>
        <div className="stack stg" style={{ ['--d' as string]: 1 }}>
          {ri + 2 < queue.length && <StaticCard word={queue[ri + 2]} cls="pos-third" />}
          {ri + 1 < queue.length && <StaticCard word={queue[ri + 1]} cls="pos-next" />}
          <div
            className={`tcard pos-front ${flipped ? 'flipped' : ''} ${fly ?? ''}`}
            onClick={() => !fly && setFlipped((f) => !f)}
          >
            <div className="face">
              <div className="word-big">{word.en}</div>
              {word.pos && <div className="pos-tag">{word.pos}</div>}
              <div className="hint">点击卡片翻面</div>
            </div>
            <div className="face back-f">
              <div className="meaning">
                {word.zh}
                {(word as Word & { ex?: string }).ex && (
                  <span className="ex">
                    {(word as Word & { ex?: string }).ex}
                    {(word as Word & { exZh?: string }).exZh
                      ? `　${(word as Word & { exZh?: string }).exZh}`
                      : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="btns stg" style={{ ['--d' as string]: 2 }}>
          <button type="button" className="rbtn u" disabled={!flipped} onClick={() => void mark(false)}>
            再记记 😵
          </button>
          <button type="button" className="rbtn k" disabled={!flipped} onClick={() => void mark(true)}>
            记住了 ✌️
          </button>
        </div>
      </div>
    </div>
  )
}

function StaticCard({ word, cls }: { word: Word; cls: string }) {
  return (
    <div className={`tcard ${cls}`} style={{ pointerEvents: 'none' }}>
      <div className="face">
        <div className="word-big">{word.en}</div>
        {word.pos && <div className="pos-tag">{word.pos}</div>}
      </div>
      <div className="face back-f" />
    </div>
  )
}
