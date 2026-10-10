import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadBook, type Word } from '@/data/vocab'
import { loadStory, type StoryScript } from '@/data/stories'
import { useApp } from '@/state/store'
import { confetti, toast, buzz } from '@/ui'

/** 与 Quiz 页同源的星级公式 */
function starsOf(correct: number, total: number): number {
  if (total === 0) return 0
  const r = correct / total
  if (r >= 0.9) return 3
  if (r >= 0.7) return 2
  if (r > 0) return 1
  return 0
}

function speak(text: string): void {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.92
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch {
    /* 不支持发音则静默 */
  }
}

interface Resolved {
  script: StoryScript
  /** 目标词 en → 词库 word（含 id），结算时映射正误 */
  wordIndex: Map<string, Word>
}

/**
 * 情景对话页（迭代四）：逐句推进的聊天流。
 * 台词行点击推进（NPC 行自动朗读），挖空行先答题再推进；
 * 结束按 quiz 正误提交 FinishQuiz（unit_id = <chapterId>-story，参与 XP/宝石/连胜）。
 */
export default function Story() {
  const { chapterId } = useParams()
  const nav = useNavigate()
  const { finishQuiz } = useApp()
  const [data, setData] = useState<Resolved | null>(null)
  const [missing, setMissing] = useState(false)
  const [step, setStep] = useState(0) // 已展示到的行下标（含进行中的 quiz 行）
  const [picked, setPicked] = useState<number | null>(null)
  const [correct, setCorrect] = useState(0)
  const [results, setResults] = useState<{ id: string; ok: boolean }[]>([])
  const [done, setDone] = useState<null | { stars: number; xp: number }>(null)
  const busyRef = useRef(false)
  const chatRef = useRef<HTMLDivElement>(null)

  const total = useMemo(
    () => (data ? data.script.lines.filter((l) => l.quiz).length : 0),
    [data],
  )

  useEffect(() => {
    if (!chapterId) return
    let alive = true
    setData(null)
    setMissing(false)
    setStep(0)
    setPicked(null)
    setCorrect(0)
    setResults([])
    setDone(null)

    Promise.all([loadStory(chapterId), loadBook(chapterId.split('-')[0])])
      .then(([script, book]) => {
        if (!alive) return
        if (!script) {
          setMissing(true)
          return
        }
        const chapter = book.chapters.find((c) => c.id === chapterId)
        const wordIndex = new Map<string, Word>()
        chapter?.units.forEach((u) => u.words.forEach((w) => wordIndex.set(w.en.toLowerCase(), w)))
        setData({ script, wordIndex })
      })
      .catch(() => alive && setMissing(true))
    return () => {
      alive = false
    }
  }, [chapterId])

  // NPC 台词自动朗读 + 聊天流滚到底
  useEffect(() => {
    const line = data?.script.lines[step - 1]
    if (line && step > 0) speak(line.en)
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [step, data])

  // 走完最后一行：结算（effect 中触发，避免渲染期副作用被 StrictMode 双跑）
  // 注意：必须放在提前 return 之前，保证 Hooks 顺序稳定
  useEffect(() => {
    if (!data) return
    if (step < data.script.lines.length || done) return
    const stars = starsOf(correct, total)
    const xp = correct * 15
    void (async () => {
      try {
        const r = await finishQuiz({
          unit_id: `${chapterId}-story`,
          correct,
          total,
          best_combo: 0,
          stars,
          words: results,
        })
        if (!r.queued && r.profile && (r.profile.hearts ?? 5) <= 0) {
          toast('红心用完了，回地图用宝石补满吧 💔')
        }
      } catch {
        /* 断网时 client 层已入离线队列 */
      }
      setDone({ stars, xp })
      if (stars > 0) confetti(60, ['#58CC02', '#FFC800', '#1CB0F6'])
    })()
  }, [data, step, done, correct, total, results, chapterId, finishQuiz])

  if (missing) {
    return (
      <div className="view">
        <StoryTop title="情景对话" />
        <div className="empty-tip">这一章还没有情景剧本，去闯关吧！</div>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="view">
        <StoryTop title="情景对话" />
        <div className="empty-tip">加载剧本…</div>
      </div>
    )
  }

  const { script } = data
  const shown = script.lines.slice(0, step)
  const cur = step < script.lines.length ? script.lines[step] : null
  const isQuizLine = !!cur?.quiz

  // quiz 行需要先作答：把 en 里的 ___ 高亮出来；未作答前不显示完整台词
  function answerQuiz(i: number) {
    if (busyRef.current || !cur?.quiz) return
    busyRef.current = true
    setPicked(i)
    const ok = cur.quiz.opts[i] === cur.quiz.answer
    if (ok) {
      setCorrect((c) => c + 1)
      confetti(14, ['#58CC02', '#FFC800'])
      buzz(12)
    } else {
      buzz([26, 44, 26])
    }
    const w = cur.word ? data!.wordIndex.get(cur.word.toLowerCase()) : undefined
    if (w) setResults((r) => [...r, { id: w.id, ok }])
    setTimeout(() => {
      busyRef.current = false
      setPicked(null)
      setStep((s) => s + 1)
    }, ok ? 750 : 1400)
  }

  function advance() {
    if (busyRef.current) return
    if (isQuizLine) return // quiz 行必须作答
    buzz(8)
    setStep((s) => s + 1)
  }

  return (
    <div className="view">
      <StoryTop title={`${script.emoji} ${script.title}`} />
      <div className="story-stage">
        <div className="story-scene">{script.scene} · 挖空 {total} 处</div>
        <div className="story-chat" ref={chatRef}>
          {shown.map((l, i) => {
            const me = l.name === '你'
            return (
              <div key={i} className={`bubble-row ${me ? 'me' : ''} stg`} style={{ ['--d' as string]: 0 }}>
                <span className="bub-ava">{l.emoji}</span>
                <div className="bub">
                  <div className="bub-name">{l.name}</div>
                  <div className="bub-en">
                    {l.quiz && picked !== null ? l.en.replace('___', l.quiz.answer) : l.en}
                  </div>
                  <div className="bub-zh">{l.zh}</div>
                </div>
              </div>
            )
          })}

          {cur && (
            <div className={`bubble-row ${cur.name === '你' ? 'me' : ''}`}>
              <span className="bub-ava">{cur.emoji}</span>
              <div className={`bub ${isQuizLine ? 'quiz' : 'live'}`} onClick={advance} role={isQuizLine ? undefined : 'button'}>
                <div className="bub-name">{cur.name}</div>
                {isQuizLine ? (
                  <>
                    <div className="bub-en">{cur.en}</div>
                    <div className="bub-zh">{cur.zh}</div>
                    <div className="story-opts">
                      {cur.quiz!.opts.map((o, i) => {
                        let cls = 'opt'
                        if (picked !== null) {
                          if (o === cur.quiz!.answer) cls += ' ok'
                          else if (i === picked) cls += ' no'
                          else cls += ' dim'
                        }
                        return (
                          <button
                            key={i}
                            type="button"
                            className={cls}
                            disabled={picked !== null}
                            onClick={() => answerQuiz(i)}
                          >
                            <span className="num">{String.fromCharCode(65 + i)}</span>
                            <span>{o}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bub-en">{cur.en}</div>
                    <div className="bub-zh">{cur.zh}</div>
                    <div className="bub-tap">{step === 0 ? '点按开始 ▸' : '点按继续 ▸'}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {done && (
        <div className="fill">
          <div className="box">
            <h2>情景完成！</h2>
            <div className="stars">
              {[0, 1, 2].map((i) => (
                <svg
                  key={i}
                  viewBox="0 0 48 48"
                  fill={i < done.stars ? '#FFC800' : '#F0E4D2'}
                  style={{ animation: `popStar .5s var(--spr) ${i * 0.15}s forwards`, opacity: 0 }}
                >
                  <path d="M24 4l6.2 12.9L44 19l-10 9.6L36.6 43 24 36.4 11.4 43 14 28.6 4 19l13.8-2.1z" />
                </svg>
              ))}
            </div>
            <p>
              挖空答对 {correct}/{total}
              <br />
              获得 +{done.xp} XP
            </p>
            <button type="button" className="btn" onClick={() => nav('/map')}>
              返回地图
            </button>
            <button type="button" className="btn alt" onClick={() => { setStep(0); setPicked(null); setCorrect(0); setResults([]); setDone(null) }}>
              再演一遍
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StoryTop({ title }: { title: string }) {
  const nav = useNavigate()
  return (
    <div className="qbar">
      <button type="button" className="back" onClick={() => nav('/map')} aria-label="返回">
        ←
      </button>
      <div className="story-title">{title}</div>
    </div>
  )
}
