import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { findUnitSync, loadBook } from '@/data/vocab'
import type { Word } from '@/data/vocab'
import { useApp } from '@/state/store'
import type { WordResult } from '@/api/client'
import { confetti, toast, buzz } from '@/ui'

/* ==================== 题型定义 ==================== */

export type QType = 'en2zh' | 'zh2en' | 'listen' | 'spell' | 'match' | 'cloze'

const TYPE_META: Record<QType, { icon: string; label: string }> = {
  en2zh: { icon: '📖', label: '选择释义' },
  zh2en: { icon: '🔍', label: '选出单词' },
  listen: { icon: '🔊', label: '听音辨词' },
  spell: { icon: '⌨️', label: '拼写单词' },
  match: { icon: '🔗', label: '连连看' },
  cloze: { icon: '📝', label: '例句填空' },
}

interface QItem {
  type: QType
  /** 涉及词（match 为 5 个，其余 1 个） */
  words: Word[]
  /** 选择类选项（en2zh/zh2en/listen/cloze） */
  opts?: { t: string; ok: boolean }[]
  /** cloze：挖空例句（____ 为空位） */
  prompt?: string
  /** spell：乱序字母块（含干扰字母） */
  letters?: string[]
  /** 计分题（match 不计分，纯强化屏） */
  scored: boolean
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function starsOf(correct: number, total: number): number {
  if (total === 0) return 0
  const r = correct / total
  if (r >= 0.9) return 3
  if (r >= 0.7) return 2
  if (r > 0) return 1
  return 0
}

/** 例句是否包含该词（供 cloze 挖空） */
function exHasWord(w: Word): string | null {
  const ex = (w as Word & { ex?: string }).ex
  if (!ex) return null
  const re = new RegExp(`\\b${w.en.replace(/[^a-z]/g, '')}`, 'i')
  return re.test(ex) ? ex : null
}

function clozeSentence(ex: string, en: string): string {
  const re = new RegExp(`\\b${en}\\b`, 'i')
  return re.test(ex) ? ex.replace(re, '____') : ''
}

/** 四选一选项（正确项 + 3 干扰项） */
function choiceOpts(correct: string, fakes: string[]): { t: string; ok: boolean }[] {
  const uniq = [...new Set(fakes.filter((f) => f && f !== correct))].slice(0, 3)
  while (uniq.length < 3) uniq.push(['似是而非', '无从知晓', '扑朔迷离', '雾里看花'][uniq.length])
  return shuffle([correct, ...uniq]).map((t) => ({ t, ok: t === correct }))
}

/* ==================== 出题工厂 ==================== */

/**
 * 每关节奏（规划迭代一）：
 *   计分 9 题 = en2zh*2 + listen*2 + spell*2 + zh2en*2 + cloze*1（无例句降级 en2zh）
 *   强化 1 屏 = match 5 对（不计分，词记入 words[] 全部 ok）
 */
function buildQuiz(words: Word[], chapterWords: Word[]): QItem[] {
  const spellable = (w: Word) => /^[a-z]{3,12}$/.test(w.en)
  const pool = shuffle(words)

  // 题型槽位序列（按规划节奏表）
  const slots: QType[] = ['en2zh', 'en2zh', 'listen', 'listen', 'spell', 'spell', 'zh2en', 'zh2en', 'cloze']
  const used = new Set<string>()
  const items: QItem[] = []

  for (const type of slots) {
    // spell 需要纯字母词；cloze 需要带例句词——按槽位约束选词，找不到就降级
    let w: Word | undefined
    if (type === 'spell') w = pool.find((x) => !used.has(x.id) && spellable(x))
    else if (type === 'cloze') w = pool.find((x) => !used.has(x.id) && exHasWord(x))
    else w = pool.find((x) => !used.has(x.id))
    if (!w) continue
    used.add(w.id)

    const real: QType = w && type === 'spell' && !spellable(w) ? 'en2zh' : type
    const finalType: QType = real === 'cloze' && !exHasWord(w!) ? 'en2zh' : real

    if (finalType === 'spell') {
      const letters = w!.en.split('')
      const extra = 2
      const alphabet = 'abcdefghijklmnopqrstuvwxyz'
      const noise = Array.from({ length: extra }, () => alphabet[Math.floor(Math.random() * 26)])
      items.push({ type: 'spell', words: [w!], letters: shuffle([...letters, ...noise]), scored: true })
    } else if (finalType === 'listen') {
      // 听音选词：选项为单词
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.en !== w!.en)).slice(0, 3).map((x) => x.en)
      items.push({ type: 'listen', words: [w!], opts: choiceOpts(w!.en, fakes), scored: true })
    } else if (finalType === 'cloze') {
      const ex = exHasWord(w!)!
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.en !== w!.en)).slice(0, 3).map((x) => x.en)
      items.push({ type: 'cloze', words: [w!], prompt: clozeSentence(ex, w!.en), opts: choiceOpts(w!.en, fakes), scored: true })
    } else if (finalType === 'zh2en') {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.en !== w!.en)).slice(0, 3).map((x) => x.en)
      items.push({ type: 'zh2en', words: [w!], opts: choiceOpts(w!.en, fakes), scored: true })
    } else {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.zh !== w!.zh)).slice(0, 3).map((x) => x.zh)
      items.push({ type: 'en2zh', words: [w!], opts: choiceOpts(w!.zh, fakes), scored: true })
    }
  }

  // match 屏：5 对 = 本关词（含未出独立题的），释义去重
  const matchPool = shuffle(pool).filter((w, i, arr) => arr.findIndex((x) => x.zh === w.zh) === i)
  const matchWords = matchPool.slice(0, Math.min(5, matchPool.length))
  if (matchWords.length >= 3) {
    items.push({ type: 'match', words: matchWords, scored: false })
  }

  return items
}

/* ==================== 页面 ==================== */

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

    // 下一关：书中当前关的后续（通关弹层「下一关」按钮用）
    loadBook(unitId.split('-')[0])
      .then((b) => {
        const idx = b.units.findIndex((x) => x.unit.id === unitId)
        setNextUnitId(idx >= 0 && idx + 1 < b.units.length ? b.units[idx + 1].unit.id : null)
      })
      .catch(() => setNextUnitId(null))
  }, [unitId])

  // 同章词池（动态干扰项来源）
  const [chapterWords, setChapterWords] = useState<Word[]>([])
  useEffect(() => {
    if (!unitId || !words) return
    const chId = unitId.split('-u')[0]
    loadBook(unitId.split('-')[0]).then((b) => {
      const ch = b.chapters.find((c) => c.id === chId || c.id.endsWith(chId.split('-ch')[1] ?? ''))
      setChapterWords(ch ? ch.units.flatMap((u) => u.words) : words)
    }).catch(() => setChapterWords(words))
  }, [unitId, words])

  const questions = useMemo(() => (words && chapterWords.length ? buildQuiz(words, chapterWords) : []), [words, chapterWords])

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
  if (!words || !questions.length) {
    return (
      <div className="view">
        <div className="empty-tip">加载题目…</div>
      </div>
    )
  }

  const q = questions[qi]
  const screenTotal = questions.length
  const scoredTotal = questions.filter((x) => x.scored).length

  /* ---------- 作答统一出口：ok + 该题产出的 words 结果 ---------- */
  function answer(ok: boolean, wordResults: WordResult[]) {
    if (busyRef.current) return
    busyRef.current = true
    setPicked(-2) // 任意非 null：锁定作答
    setResults((r) => [...r, ...wordResults])
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

  function pickChoice(i: number) {
    if (picked !== null || busyRef.current) return
    setPicked(i)
    const ok = q.opts![i].ok
    answer(ok, q.words.map((w) => ({ id: w.id, ok })))
  }

  function next() {
    busyRef.current = false
    if (qi + 1 >= screenTotal) {
      void finish()
    } else {
      setQi((x) => x + 1)
      setPicked(null)
    }
  }

  async function finish() {
    const finalCorrect = correct
    const stars = starsOf(finalCorrect, scoredTotal)
    const xp = finalCorrect * 15
    const r = await finishQuiz({
      unit_id: unitId ?? '',
      correct: finalCorrect,
      total: scoredTotal,
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

  const meta = TYPE_META[q.type]

  return (
    <div className="view">
      <div className="quiz">
        <div className="qbar">
          <button type="button" className="back" onClick={() => nav('/map')} aria-label="返回">
            ←
          </button>
          <div className="qprog">
            <i style={{ width: `${(qi / screenTotal) * 100}%` }} />
          </div>
          {combo >= 2 && <span className="combo">🔥 连击 ×{combo}</span>}
        </div>

        {/* 题干区：按题型分发 */}
        {q.type === 'spell' ? (
          <SpellCard key={qi} word={q.words[0]} letters={q.letters!} onAnswer={answer} locked={picked !== null} />
        ) : q.type === 'match' ? (
          <MatchCard key={qi} words={q.words} onAnswer={answer} locked={picked !== null} />
        ) : (
          <>
            <div className="qcard">
              <div className="qtag">
                <span className="qtype-badge">{meta.icon} {meta.label}</span>
              </div>
              {q.type === 'listen' && <ListenPrompt word={q.words[0]} autoPlay />}
              {q.type === 'cloze' ? (
                <div className="cloze-sentence">{q.prompt}</div>
              ) : q.type === 'zh2en' ? (
                <div className="qword" key={qi}>{q.words[0].zh}</div>
              ) : q.type === 'en2zh' ? (
                <div className="qword" key={qi}>{q.words[0].en}</div>
              ) : null}
              {q.type !== 'listen' && (
                <button type="button" className="speak" onClick={() => { buzz(8); speak(q.words[0].en) }}>
                  🔊 发音
                </button>
              )}
            </div>

            <div className="opts">
              {q.opts!.map((o, i) => {
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
                    onClick={() => pickChoice(i)}
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
              正确 {correct}/{scoredTotal}
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

/* ==================== 题型子组件 ==================== */

/** listen：自动朗读 + 重播 */
function ListenPrompt({ word, autoPlay }: { word: Word; autoPlay?: boolean }) {
  useEffect(() => {
    if (autoPlay) speak(word.en)
    return () => speechSynthesis.cancel()
  }, [word.id, autoPlay])
  return (
    <button type="button" className="listen-big" onClick={() => speak(word.en)} aria-label="播放发音">
      🔊
      <span>点击重播</span>
    </button>
  )
}

/** spell：字母块拼词 + 键盘输入双通道 */
function SpellCard({
  word,
  letters,
  onAnswer,
  locked,
}: {
  word: Word
  letters: string[]
  onAnswer: (ok: boolean, r: WordResult[]) => void
  locked: boolean
}) {
  const [slots, setSlots] = useState<number[]>([]) // 已用字母块下标
  const [wrong, setWrong] = useState(false)
  const answerRef = useRef(onAnswer)
  answerRef.current = onAnswer

  const target = word.en
  const solved = slots.length === target.length && slots.map((i) => letters[i]).join('') === target

  // 键盘通道：字母输入 / 退格 / 回车
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked) return
      if (e.key === 'Backspace') {
        e.preventDefault()
        setSlots((s) => s.slice(0, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        submitRef.current()
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        setSlots((s) => {
          if (s.length >= target.length) return s
          const ch = e.key.toLowerCase()
          // 优先未使用的同字母块
          const used = new Set(s)
          const idx = letters.findIndex((l, i) => l === ch && !used.has(i))
          if (idx >= 0) return [...s, idx]
          return s
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [letters, target.length, locked])

  const submitRef = useRef<() => void>(() => {})
  submitRef.current = () => {
    if (slots.length < target.length || locked) return
    const ok = slots.map((i) => letters[i]).join('') === target
    if (ok) {
      onAnswer(true, [{ id: word.id, ok: true }])
    } else {
      setWrong(true)
      buzz([26, 44, 26])
      setTimeout(() => {
        setWrong(false)
        setSlots([])
        answerRef.current(false, [{ id: word.id, ok: false }])
      }, 700)
    }
  }

  // 块填满自动判分
  useEffect(() => {
    if (slots.length === target.length && !wrong) {
      const t = setTimeout(() => submitRef.current(), 250)
      return () => clearTimeout(t)
    }
  }, [slots.length, target.length, wrong])

  const used = new Set(slots)

  return (
    <>
      <div className="qcard">
        <div className="qtag">
          <span className="qtype-badge">⌨️ 拼写单词</span>
        </div>
        <div className="qword spell-zh">{word.zh}</div>
        <button type="button" className="speak" onClick={() => { buzz(8); speak(word.en) }}>
          🔊 听发音
        </button>
        {/* 字母槽 */}
        <div className={`letter-slots ${wrong ? 'no' : ''} ${solved ? 'ok' : ''}`}>
          {Array.from({ length: target.length }).map((_, i) => (
            <span key={i} className={`letter-slot ${i < slots.length ? 'filled' : ''}`}>
              {i < slots.length ? letters[slots[i]] : ''}
            </span>
          ))}
        </div>
      </div>
      {/* 字母块 */}
      <div className="letter-tiles">
        {letters.map((l, i) => (
          <button
            key={i}
            type="button"
            className={`letter-tile ${used.has(i) ? 'used' : ''}`}
            disabled={used.has(i) || locked}
            onClick={() => {
              if (slots.length >= target.length) return
              buzz(6)
              setSlots((s) => [...s, i])
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </>
  )
}

/** match：词义连连看，错配抖动不判错，全消算通过 */
function MatchCard({
  words,
  onAnswer,
  locked,
}: {
  words: Word[]
  onAnswer: (ok: boolean, r: WordResult[]) => void
  locked: boolean
}) {
  const left = useMemo(() => shuffle(words), [words])
  const right = useMemo(() => shuffle([...words]), [words])
  const [selL, setSelL] = useState<string | null>(null)
  const [selR, setSelR] = useState<string | null>(null)
  const [solved, setSolved] = useState<Set<string>>(new Set())
  const [wrongShake, setWrongShake] = useState(false)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const answeredRef = useRef(false)

  // 配对尝试
  useEffect(() => {
    if (!selL || !selR) return
    if (selL === selR) {
      // 命中
      buzz(12)
      const ns = new Set(solved)
      ns.add(selL)
      setSolved(ns)
      setSelL(null)
      setSelR(null)
      if (ns.size === words.length && !answeredRef.current) {
        answeredRef.current = true
        confetti(20, ['#58CC02', '#FFC800', '#1CB0F6'])
        setTimeout(() => onAnswer(true, words.map((w) => ({ id: w.id, ok: true }))), 550)
      }
    } else {
      // 错配：抖动后复位，不判错
      setWrongShake(true)
      setShakeId(selR)
      buzz(20)
      const t = setTimeout(() => {
        setWrongShake(false)
        setSelL(null)
        setSelR(null)
        setShakeId(null)
      }, 450)
      return () => clearTimeout(t)
    }
  }, [selL, selR]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="match-wrap">
      <div className="qcard match-head">
        <div className="qtag">
          <span className="qtype-badge">🔗 连连看 · 词义配对</span>
        </div>
        <div className="match-tip">点左侧单词，再点右侧释义 · 全部配对完成</div>
      </div>
      <div className="match-grid">
        <div className="match-col">
          {left.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`match-cell ${solved.has(w.id) ? 'solved' : ''} ${selL === w.id ? 'sel' : ''} ${wrongShake && shakeId === w.id ? 'no' : ''}`}
              disabled={solved.has(w.id) || locked || answeredRef.current}
              onClick={() => { buzz(6); setSelL(w.id) }}
            >
              {w.en}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`match-cell ${solved.has(w.id) ? 'solved' : ''} ${selR === w.id ? 'sel' : ''} ${wrongShake && shakeId === w.id ? 'no' : ''}`}
              disabled={solved.has(w.id) || locked || answeredRef.current}
              onClick={() => { buzz(6); setSelR(w.id) }}
            >
              {w.zh}
            </button>
          ))}
        </div>
      </div>
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
