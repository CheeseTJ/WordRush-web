import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { findUnitSync, findWordAsync, loadBook } from '@/data/vocab'
import type { Word } from '@/data/vocab'
import { useApp } from '@/state/store'
import type { WordResult } from '@/api/client'
import { confetti, toast, buzz } from '@/ui'

interface QItem {
  word: Word
  type: 'en2zh' | 'zh2en'
  opts: { t: string; ok: boolean }[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 出题：两种题型交替（英译中 / 中译英）。
 * 干扰项运行时从同章词里随机抽（长期学习更耐玩，词库文件更小）。
 */
function buildQuiz(unitWords: Word[], chapterWords: Word[]): QItem[] {
  const pool = shuffle(unitWords)
  return pool.map((w, i) => {
    const type: QItem['type'] = i % 2 === 0 ? 'en2zh' : 'zh2en'
    let opts: { t: string; ok: boolean }[]
    if (type === 'en2zh') {
      // 手编书自带精心设计的干扰项；转换书从同章动态抽
      const fakes = [...(w.fakes ?? [])]
      for (const x of shuffle(chapterWords)) {
        if (fakes.length >= 3) break
        if (x.id !== w.id && !fakes.includes(x.zh) && x.zh !== w.zh) fakes.push(x.zh)
      }
      while (fakes.length < 3) fakes.push(['似是而非', '无从知晓', '扑朔迷离'][fakes.length])
      opts = shuffle([w.zh, ...fakes]).map((t) => ({ t, ok: t === w.zh }))
    } else {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w.id && x.en !== w.en))
        .slice(0, 3)
        .map((x) => x.en)
      while (fakes.length < 3) fakes.push(['imagine', 'previous', 'gather'][fakes.length])
      opts = shuffle([w.en, ...fakes]).map((t) => ({ t, ok: t === w.en }))
    }
    return { word: w, type, opts }
  })
}

function starsOf(correct: number, total: number): number {
  if (total === 0) return 0
  const r = correct / total
  if (r >= 0.9) return 3
  if (r >= 0.7) return 2
  if (r > 0) return 1
  return 0
}

/** 答题页：完成后提交服务端（断网自动进离线队列，联网由全局监听重放） */
export default function Quiz() {
  const { unitId } = useParams()
  const nav = useNavigate()
  const { finishQuiz, profile } = useApp()
  const [words, setWords] = useState<Word[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [nextUnitId, setNextUnitId] = useState<string | null>(null)

  // unitId 变化（含通关后跳下一关）：重置答题状态并加载关卡
  useEffect(() => {
    if (!unitId) return
    setWords(null)
    setMissing(false)
    setQi(0)
    setPicked(null)
    setCombo(0)
    setCorrect(0)
    setResults([])
    setDone(null)
    busyRef.current = false

    const sync = findUnitSync(unitId)
    if (sync) {
      setWords(sync.words)
    } else {
      const bookId = unitId.split('-')[0]
      loadBook(bookId)
        .then(() => {
          const u = findUnitSync(unitId)
          if (u) setWords(u.words)
          else setMissing(true)
        })
        .catch(() => setMissing(true))
    }

    // 下一关：书中当前关的后续（通关弹层「直接下一关」用）
    loadBook(unitId.split('-')[0])
      .then((b) => {
        const idx = b.units.findIndex((x) => x.unit.id === unitId)
        setNextUnitId(idx >= 0 && idx + 1 < b.units.length ? b.units[idx + 1].unit.id : null)
      })
      .catch(() => setNextUnitId(null))
  }, [unitId])

  const questions = useMemo(() => {
    if (!words) return []
    // 同章词池：从同 unit 所在章取（单元 id 形如 <book>-ch<k>-u<n>）
    const chId = unitId?.split('-u')[0] ?? ''
    const chapterWords = words.length ? words : []
    void chId
    return buildQuiz(words, chapterWords)
  }, [words, unitId])

  const [qi, setQi] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [combo, setCombo] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [results, setResults] = useState<WordResult[]>([])
  const [done, setDone] = useState<null | { stars: number; xp: number; queued: boolean }>(null)
  const busyRef = useRef(false)

  if (missing) {
    return (
      <div className="view">
        <div className="empty-tip">关卡不存在</div>
      </div>
    )
  }
  if (!words) {
    return (
      <div className="view">
        <div className="empty-tip">加载题目…</div>
      </div>
    )
  }

  const q = questions[qi]
  const total = questions.length

  function pick(i: number) {
    if (busyRef.current || picked !== null) return
    busyRef.current = true
    setPicked(i)
    const ok = q.opts[i].ok
    setResults((r) => [...r, { id: q.word.id, ok }])
    if (ok) {
      setCorrect((c) => c + 1)
      setCombo((c) => c + 1)
      confetti(16, ['#58CC02', '#FFC800', '#1CB0F6'])
      buzz(12)
    } else {
      setCombo(0)
      buzz([26, 44, 26])
      document.querySelector('.app')?.classList.add('shakeit')
      setTimeout(() => document.querySelector('.app')?.classList.remove('shakeit'), 440)
    }
    setTimeout(next, ok ? 650 : 1150)
  }

  function next() {
    busyRef.current = false
    if (qi + 1 >= total) {
      void finish()
    } else {
      setQi((x) => x + 1)
      setPicked(null)
    }
  }

  async function finish() {
    const finalCorrect = results.filter((r) => r.ok).length
    const stars = starsOf(finalCorrect, total)
    const xp = finalCorrect * 15
    const r = await finishQuiz({
      unit_id: unitId ?? '',
      correct: finalCorrect,
      total,
      best_combo: combo,
      stars,
      words: results,
    })
    setDone({ stars, xp, queued: r.queued })
    confetti(stars >= 2 ? 80 : 40, ['#58CC02', '#FFC800', '#1CB0F6', '#FF6B6B'])
  }

  function restart() {
    setQi(0)
    setPicked(null)
    setCombo(0)
    setCorrect(0)
    setResults([])
    setDone(null)
    busyRef.current = false
  }

  return (
    <div className="view">
      <div className="quiz">
        <div className="qbar">
          <button type="button" className="back" onClick={() => nav('/map')} aria-label="返回">
            ←
          </button>
          <div className="qprog">
            <i style={{ width: `${total ? (qi / total) * 100 : 0}%` }} />
          </div>
          {combo >= 2 && <span className="combo">🔥 连击 ×{combo}</span>}
        </div>

        {q && (
          <>
            <div className="qcard">
              <div className="qtag">{q.type === 'en2zh' ? '选择正确释义' : '选出对应的单词'}</div>
              <div className="qword" key={qi}>
                {q.type === 'en2zh' ? q.word.en : q.word.zh}
              </div>
              <button
                type="button"
                className="speak"
                onClick={() => {
                  buzz(8)
                  speak(q.word.en)
                }}
              >
                🔊 发音
              </button>
            </div>

            <div className="opts">
              {q.opts.map((o, i) => {
                let cls = 'opt'
                if (picked !== null) {
                  if (o.ok) cls += ' ok'
                  else if (i === picked) cls += ' no'
                  else cls += ' dim'
                }
                return (
                  <button
                    key={`${qi}-${i}`}
                    type="button"
                    className={cls}
                    onClick={() => pick(i)}
                    disabled={picked !== null}
                  >
                    <span className="num">{String.fromCharCode(65 + i)}</span>
                    <span>{o.t}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {done && (
        <div className="fill">
          <div className="box">
            <h2>{done.stars > 0 ? '关卡完成！' : '再试一次？'}</h2>
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
              正确 {correct}/{total}
              <br />
              获得 +{done.xp} XP（总 XP {profile.xp}）
              {done.queued && (
                <>
                  <br />
                  📴 当前离线：成绩已存本地，联网后自动同步
                </>
              )}
            </p>
            {done.stars > 0 && nextUnitId && (
              <button type="button" className="btn" onClick={() => nav(`/quiz/${nextUnitId}`)}>
                下一关 →
              </button>
            )}
            {done.stars > 0 && !nextUnitId && (
              <button type="button" className="btn" onClick={() => nav('/map')}>
                🏁 本书已通关，返回地图
              </button>
            )}
            <button type="button" className="btn alt" onClick={restart}>
              再来一轮
            </button>
            <button type="button" className="btn alt" onClick={() => nav('/map')}>
              返回地图
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function speak(text: string): void {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.9
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch {
    toast('当前浏览器不支持发音')
  }
}

// 保留引用：复习页映射用
void findWordAsync
