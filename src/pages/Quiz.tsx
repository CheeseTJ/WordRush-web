import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Diamond, Flame } from '@phosphor-icons/react'
import { findUnitSync, loadBook, findWordAsync } from '@/data/vocab'
import type { Word } from '@/data/vocab'
import { speakEnabled, gamifyEnabled } from '@/data/exp'
import { assessSpeak, prefetchSpeak, speakWord } from '@/api/client'
import { useApp } from '@/state/store'
import { fetchReviewQueue } from '@/api/client'
import type { WordResult } from '@/api/client'
import { confetti, confettiAnchor, toast, buzz, sfxCorrect, sfxWrong } from '@/ui'

/* ==================== 题型定义 ==================== */

export type QType = 'en2zh' | 'zh2en' | 'listen' | 'spell' | 'match' | 'cloze' | 'chest' | 'speak'

const TYPE_META: Record<QType, { icon: string; label: string }> = {
  en2zh: { icon: '📖', label: '选择释义' },
  zh2en: { icon: '🔍', label: '选出单词' },
  listen: { icon: '🔊', label: '听音辨词' },
  spell: { icon: '⌨️', label: '拼写单词' },
  match: { icon: '🔗', label: '连连看' },
  cloze: { icon: '📝', label: '例句填空' },
  chest: { icon: '🎁', label: '宝箱' },
  speak: { icon: '🗣️', label: '口语跟读' },
}

interface QItem {
  type: QType
  /** 涉及词（match 为 5 个，其余 1 个） */
  words: Word[]
  /** 选择类选项（en2zh/zh2en/listen/cloze）；pos 为该选项的词性（英文词选项才有） */
  opts?: { t: string; ok: boolean; pos?: string }[]
  /** cloze：挖空例句（____ 为空位） */
  prompt?: string
  /** 计分题（match/chest 不计分，纯强化屏） */
  scored: boolean
  /** 到期复习词混入的题（题面带角标） */
  review?: boolean
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 由字符串种子生成确定性随机数（mulberry32）——同一关每次进题序一致 */
function seededRng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
function choiceOpts(correct: string, fakes: string[], rng: () => number = Math.random): { t: string; ok: boolean }[] {
  const uniq = [...new Set(fakes.filter((f) => f && f !== correct))].slice(0, 3)
  while (uniq.length < 3) uniq.push(['似是而非', '无从知晓', '扑朔迷离', '雾里看花'][uniq.length])
  return shuffle([correct, ...uniq], rng).map((t) => ({ t, ok: t === correct }))
}

/** 英文词选项（正确项 + 3 干扰项），附词性供选项徽标展示 */
function wordOpts(w: Word, fakes: string[], chapterWords: Word[], rng: () => number = Math.random) {
  const posMap = new Map(chapterWords.map((x) => [x.en, x.pos]))
  return choiceOpts(w.en, fakes, rng).map((o) => ({ ...o, pos: o.ok ? w.pos : posMap.get(o.t) }))
}

/** 词性小徽标（数据缺失时不渲染） */
function Pos({ p }: { p?: string }) {
  if (!p) return null
  return <em className="pos">{p}</em>
}

/* ==================== 出题工厂 ==================== */

/**
 * 每关节奏（规划迭代一）：
 *   计分 9 题 = en2zh*2 + listen*2 + spell*2 + zh2en*2 + cloze*1（无例句降级 en2zh）
 *   强化 1 屏 = match 5 对（不计分，词记入 words[] 全部 ok）
 */
function buildQuiz(words: Word[], chapterWords: Word[], dueWords: Word[] = [], seed = ''): QItem[] {
  const rng = seededRng(seed || words[0]?.id || 'seed')
  const spellable = (w: Word) => /^[a-z]{3,12}$/.test(w.en)
  const pool = shuffle(words, rng)

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
      items.push({ type: 'spell', words: [w!], scored: true })
    } else if (finalType === 'listen') {
      // 听音选词：选项为单词
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.en !== w!.en), rng).slice(0, 3).map((x) => x.en)
      items.push({ type: 'listen', words: [w!], opts: wordOpts(w!, fakes, chapterWords, rng), scored: true })
    } else if (finalType === 'cloze') {
      const ex = exHasWord(w!)!
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.en !== w!.en), rng).slice(0, 3).map((x) => x.en)
      items.push({ type: 'cloze', words: [w!], prompt: clozeSentence(ex, w!.en), opts: wordOpts(w!, fakes, chapterWords, rng), scored: true })
    } else if (finalType === 'zh2en') {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.en !== w!.en), rng).slice(0, 3).map((x) => x.en)
      items.push({ type: 'zh2en', words: [w!], opts: wordOpts(w!, fakes, chapterWords, rng), scored: true })
    } else {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w!.id && x.zh !== w!.zh), rng).slice(0, 3).map((x) => x.zh)
      items.push({ type: 'en2zh', words: [w!], opts: choiceOpts(w!.zh, fakes, rng), scored: true })
    }
  }

  // 到期复习词混入（<=3）：轻题型轮换，题面带「复习」角标——闯关即复习
  const reviewTypes: QType[] = ['listen', 'en2zh', 'zh2en']
  dueWords.slice(0, 3).forEach((w, i) => {
    if (used.has(w.id)) return
    const t = reviewTypes[i % reviewTypes.length]
    if (t === 'listen') {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w.id && x.en !== w.en), rng).slice(0, 3).map((x) => x.en)
      items.push({ type: 'listen', words: [w], opts: wordOpts(w, fakes, chapterWords, rng), scored: true, review: true })
    } else if (t === 'zh2en') {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w.id && x.en !== w.en), rng).slice(0, 3).map((x) => x.en)
      items.push({ type: 'zh2en', words: [w], opts: wordOpts(w, fakes, chapterWords, rng), scored: true, review: true })
    } else {
      const fakes = shuffle(chapterWords.filter((x) => x.id !== w.id && x.zh !== w.zh), rng).slice(0, 3).map((x) => x.zh)
      items.push({ type: 'en2zh', words: [w], opts: choiceOpts(w.zh, fakes, rng), scored: true, review: true })
    }
    used.add(w.id)
  })

  // 口语跟读（默认开）：追加 1 题跟读
  if (speakEnabled()) {
    const w = pool.find((x) => !used.has(x.id) && spellable(x))
    if (w) {
      used.add(w.id)
      items.push({ type: 'speak', words: [w], scored: true })
    }
  }

  // match 屏：5 对 = 本关词 + 到期词（含未出独立题的），释义去重
  const matchPool = shuffle([...pool, ...dueWords], rng).filter((w, i, arr) => arr.findIndex((x) => x.zh === w.zh) === i)
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
  const { finishQuiz, refillHearts, profile } = useApp()
  const [words, setWords] = useState<Word[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [nextUnitId, setNextUnitId] = useState<string | null>(null)
  // 红心归零：本关失败结算（补心 / 等待恢复）
  const [outOfHearts, setOutOfHearts] = useState(false)
  const [refilling, setRefilling] = useState(false)

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
    setAttempts(0)
    replayRef.current = []
    replayDoneRef.current = new Set()
    chestGivenRef.current = false
    chestPendingRef.current = false
    busyRef.current = false
    setOutOfHearts(false)

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

  // 到期复习词（迭代二）：进关时拉取，混入新关
  const [dueWords, setDueWords] = useState<Word[]>([])
  useEffect(() => {
    if (!unitId) return
    let alive = true
    fetchReviewQueue(3)
      .then(async (ids) => {
        const ws = (await Promise.all(ids.map((id) => findWordAsync(id)))).filter((w): w is Word => !!w)
        if (alive) setDueWords(ws)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [unitId])

  // 题面生成：仅在本关尚未开答（qi === 0）时允许因 dueWords 到位而重建，
  // 避免答题中途题面数组被重建引发进度错位甚至越界白屏
  const qiRef = useRef(0) // qi 镜像：供重建守卫读取最新进度（声明在 qi state 之后赋值）
  useEffect(() => {
    if (!words || !chapterWords.length) return
    setQuestions((prev) => {
      if (prev.length && qiRef.current > 0) return prev // 已开答：不动进行中的题面
      return buildQuiz(words, chapterWords, dueWords, unitId)
    })
    // 发音预取（后端 TTS）：进关即拉本关 + 到期词，点按时零延迟
    prefetchSpeak([...words.map((w) => w.en), ...dueWords.map((w) => w.en)])
  }, [words, chapterWords, dueWords, unitId])

  const [qi, setQi] = useState(0)
  qiRef.current = qi

  const [picked, setPicked] = useState<number | null>(null)
  const [combo, setCombo] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [results, setResults] = useState<WordResult[]>([])
  const [done, setDone] = useState<null | { stars: number; xp: number; queued: boolean }>(null)
  const [questions, setQuestions] = useState<QItem[]>([])
  const [attempts, setAttempts] = useState(0) // 当前题失败次数（3 次后出解析）
  const busyRef = useRef(false)
  // 关内自适应：错词关尾重现 / 连击宝箱（必须在提前 return 之前声明，保证 Hooks 顺序稳定）
  const replayRef = useRef<string[]>([])
  const replayDoneRef = useRef<Set<string>>(new Set())
  const chestPendingRef = useRef(false)
  const chestGivenRef = useRef(false)

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

  // 题面越界兜底：qi 越过数组末尾时不再渲染（防 undefined 崩溃白屏），给一键重开
  if (!q) {
    return (
      <div className="view">
        <div className="empty-tip">
          题目状态异常
          <button
            type="button"
            className="btn"
            style={{ margin: '14px auto 0', display: 'block' }}
            onClick={() => {
              setQi(0)
              setPicked(null)
              setCorrect(0)
              setResults([])
              setDone(null)
              setOutOfHearts(false)
              replayRef.current = []
              replayDoneRef.current = new Set()
              chestGivenRef.current = false
              chestPendingRef.current = false
              if (words && chapterWords.length) setQuestions(buildQuiz(words, chapterWords, dueWords, unitId))
              busyRef.current = false
            }}
          >
            重新开始本题
          </button>
        </div>
      </div>
    )
  }

  /* ---------- 作答统一出口：ok + 该题产出的 words 结果 ----------
   * 答错不跳题：解锁重试，同一题连续失败 3 次后停在解析屏（正确答案 + 例句）。
   * final=true 表示子组件已自行完成重试（跟读 3 次），失败直接进解析屏 */
  function answer(ok: boolean, wordResults: WordResult[], final = false) {
    if (busyRef.current) return
    busyRef.current = true
    // 选择题保留点选索引（选错的那项标红），其余题型（直接调 answer）锁定为 -2
    setPicked((p) => (p === null ? -2 : p))
    if (ok) {
      // 重试成功不再重复记结果（首次失败已记，词已进复习计划）
      if (attempts === 0) setResults((r) => [...r, ...wordResults])
      setCorrect((c) => c + 1)
      setCombo((c) => {
        const n = c + 1
        if (gamifyEnabled() && n === 5 && !chestGivenRef.current) {
          chestGivenRef.current = true
          chestPendingRef.current = true // 连击 5 里程碑：下一屏插宝箱
        }
        return n
      })
      confetti(16, ['#58CC02', '#FFC800', '#1CB0F6'], confettiAnchor())
      sfxCorrect()
      buzz(12)
      setTimeout(next, 650)
      return
    }
    const n = attempts + 1
    setAttempts(n)
    if (n === 1) {
      // 首次失败才记结果（红心/复习计划只吃一次）
      setResults((r) => [...r, ...wordResults])
      if (wordResults.length === 1) replayRef.current.push(wordResults[0].id)
    }
    setCombo(0)
    sfxWrong()
    buzz([26, 44, 26])
    document.querySelector('.app')?.classList.add('shakeit')
    setTimeout(() => document.querySelector('.app')?.classList.remove('shakeit'), 440)
    if (n >= 3 || final) {
      setPicked(-3) // 停在解析屏，等「继续」按钮
    } else {
      // 展示错误反馈后解锁重试
      setTimeout(() => {
        busyRef.current = false
        setPicked(null)
      }, 950)
    }
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
      // 关尾：错词变体重现（每词一次）后再结算
      const pendingId = replayRef.current.shift()
      if (pendingId && !replayDoneRef.current.has(pendingId)) {
        replayDoneRef.current.add(pendingId)
        const w = questions.find((x) => x.words.some((y) => y.id === pendingId))?.words[0] ??
          chapterWords.find((y) => y.id === pendingId)
        if (w) {
          const fakes = shuffle(chapterWords.filter((x) => x.id !== w.id && x.zh !== w.zh)).slice(0, 3).map((x) => x.zh)
          const item: QItem = {
            type: 'en2zh',
            words: [w],
            opts: choiceOpts(w.zh, fakes),
            scored: true,
            review: true,
          }
          setQuestions((qs) => [...qs, item])
          setQi((x) => x + 1)
          setPicked(null)
          setAttempts(0)
          toast('再来一道，加深印象 💪')
          return
        }
      }
      void finish()
      return
    }
    // 连击宝箱：插一屏免答庆祝
    if (chestPendingRef.current) {
      chestPendingRef.current = false
      setQuestions((qs) => {
        const cp = [...qs]
        cp.splice(qi + 1, 0, { type: 'chest', words: [], scored: false })
        return cp
      })
    }
    setQi((x) => x + 1)
    setPicked(null)
    setAttempts(0)
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
    // 红心归零：改出失败结算页（不展示常规结算）
    if (gamifyEnabled() && !r.queued && r.profile && (r.profile.hearts ?? 5) <= 0) {
      setOutOfHearts(true)
      buzz([40, 60, 40])
      return
    }
    setDone({ stars, xp, queued: r.queued })
    confetti(stars >= 2 ? 80 : 40, ['#58CC02', '#FFC800', '#1CB0F6', '#FF6B6B'])
  }

  async function doRefill() {
    if (refilling) return
    setRefilling(true)
    try {
      await refillHearts()
      setOutOfHearts(false)
      toast('红心已补满 ❤️')
    } catch (e) {
      toast(e instanceof Error ? e.message : '补心失败，稍后再试')
    } finally {
      setRefilling(false)
    }
  }

  function restart() {
    setQi(0)
    setPicked(null)
    setCombo(0)
    setCorrect(0)
    setResults([])
    setDone(null)
    setAttempts(0)
    replayRef.current = []
    replayDoneRef.current = new Set()
    chestGivenRef.current = false
    chestPendingRef.current = false
    if (words && chapterWords.length) setQuestions(buildQuiz(words, chapterWords, dueWords, unitId))
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
          {gamifyEnabled() && combo >= 2 && (
            <span className="combo">
              <Flame weight="fill" size={12} style={{ verticalAlign: '-1.5px' }} /> 连击 ×{combo}
            </span>
          )}
        </div>

        {/* 题干区：按题型分发 */}
        {q.type === 'chest' ? (
          <ChestCard key={qi} onDone={next} />
        ) : q.type === 'speak' ? (
          <SpeakCard key={qi} word={q.words[0]} onAnswer={answer} locked={picked !== null} />
        ) : q.type === 'spell' ? (
          <SpellCard key={qi} word={q.words[0]} onAnswer={answer} locked={picked !== null} />
        ) : q.type === 'match' ? (
          <MatchCard key={qi} words={q.words} onAnswer={answer} locked={picked !== null} />
        ) : (
          <>
            <div className="qcard">
              <div className="qtag">
                <span className="qtype-badge">{meta.icon} {meta.label}</span>
                {q.review && <span className="review-badge">🔁 复习</span>}
              </div>
              {q.type === 'listen' && <ListenPrompt word={q.words[0]} autoPlay />}
              {q.type === 'cloze' ? (
                <div className="cloze-sentence">{q.prompt}</div>
              ) : q.type === 'zh2en' ? (
                <div className="qword" key={qi}>{q.words[0].zh}</div>
              ) : q.type === 'en2zh' ? (
                <div className="qword" key={qi}>{q.words[0].en}<Pos p={q.words[0].pos} /></div>
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
                    <span>{o.t}<Pos p={o.pos} /></span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* 连续 3 次失败：解析屏（正确答案 + 词性 + 例句） */}
        {picked === -3 && q.type !== 'match' && q.type !== 'chest' && q.words[0] && (
          <div className="reveal-sheet">
            <div className="reveal-title">连续 3 次未通过 · 记住这个词</div>
            <div className="reveal-word">
              {q.words[0].en} <Pos p={q.words[0].pos} />
            </div>
            <div className="reveal-zh">{q.words[0].zh}</div>
            {q.words[0].ex && <div className="reveal-ex">{q.words[0].ex}</div>}
            <button
              type="button"
              className="btn"
              onClick={() => {
                busyRef.current = false
                next()
              }}
            >
              继续 →
            </button>
          </div>
        )}
      </div>

      {done && !outOfHearts && (
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
      {outOfHearts && (
        <div className="fill">
          <div className="box hearts-out">
            <div className="fail-heart">💔</div>
            <h2>红心用完了</h2>
            <p>
              答错的词都已进入复习计划
              <br />
              每半小时自动恢复 1 颗红心
            </p>
            <p className="gem-line">
              <Diamond weight="fill" size={13} style={{ verticalAlign: '-2px', color: 'var(--blue)' }} /> 剩余{' '}
              {profile.gems ?? 0} · 补满红心需 25
            </p>
            <button
              type="button"
              className="btn"
              disabled={refilling || (profile.gems ?? 0) < 25}
              onClick={doRefill}
            >
              {refilling ? (
                '补心中…'
              ) : (
                <>
                  <Diamond weight="fill" size={13} style={{ verticalAlign: '-2px' }} /> 25 补满红心
                </>
              )}
            </button>
            <button type="button" className="btn alt" onClick={() => nav('/map')}>
              等待恢复，返回地图
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ==================== 题型子组件 ==================== */

/* ---------- 发音不准的字母定位：IPA 音素 → 字母区间 ---------- */

// 引擎返回美式 IPA；归一化长音符与儿化写法，缩小映射表规模
function normPhone(p: string): string {
  return p
    .replace(/ː/g, '')
    .replace(/ɚ|ɝ/g, 'ər')
    .replace('əʊ', 'oʊ')
    .replace('ɪə', 'ɪr')
    .replace('eə', 'er')
    .replace('ʊə', 'ʊr')
}

/** 常见音素 → 字母组合候选（长的在前优先匹配） */
const PHONE_LETTERS: Record<string, string[]> = {
  // 元音
  i: ['ee', 'ea', 'ie', 'ey', 'e', 'i'],
  ɪ: ['i', 'y', 'u', 'e', 'ie'],
  e: ['ea', 'ai', 'ie', 'ay', 'e', 'a'],
  æ: ['a', 'au'],
  ɑ: ['ar', 'al', 'au', 'a', 'o'],
  ɔ: ['ore', 'our', 'oor', 'oar', 'aw', 'au', 'or', 'ar', 'a'],
  ʊ: ['oo', 'ou', 'u', 'o'],
  u: ['oo', 'ue', 'ew', 'ou', 'u', 'o'],
  ʌ: ['ou', 'u', 'o'],
  ə: ['a', 'e', 'i', 'o', 'u', 'ou'],
  'ɜr': ['ear', 'our', 'ir', 'ur', 'er'],
  'eɪ': ['ei', 'ey', 'ai', 'ay', 'ea', 'a'],
  'aɪ': ['igh', 'eigh', 'uy', 'ie', 'y', 'i'],
  'ɔɪ': ['oi', 'oy'],
  'aʊ': ['ou', 'ow'],
  oʊ: ['oe', 'ough', 'oa', 'ow', 'ew', 'o'],
  'ɪr': ['eer', 'ear', 'ere', 'ier'],
  er: ['ere', 'air', 'are', 'ear', 'ayer', 'ar'],
  'ʊr': ['oor', 'our', 'ure'],
  // 辅音
  p: ['pp', 'p'],
  b: ['bb', 'b'],
  t: ['tt', 'ght', 't'],
  d: ['dd', 'ed', 'd'],
  k: ['ck', 'ch', 'cc', 'que', 'q', 'c', 'k'],
  g: ['gg', 'gu', 'gh', 'g'],
  f: ['ph', 'ff', 'gh', 'f'],
  v: ['ve', 'v'],
  θ: ['th'],
  ð: ['the', 'th'],
  s: ['ss', 'se', 'ce', 'ps', 'c', 's'],
  z: ['zz', 'es', 'se', 'z', 's'],
  ʃ: ['ch', 'sh', 'ss', 'ti', 'ci', 'ssi'],
  ʒ: ['si', 'ge', 's'],
  'tʃ': ['tch', 'ch'],
  'dʒ': ['dge', 'ge', 'gg', 'j', 'g'],
  m: ['mm', 'mb', 'mn', 'm'],
  n: ['nn', 'kn', 'gn', 'pn', 'n'],
  ŋ: ['ngue', 'ng', 'nk'],
  l: ['ll', 'le', 'el', 'ol', 'al', 'ul', 'il', 'l'],
  r: ['rr', 'wr', 'rh', 'r'],
  w: ['wh', 'w'],
  j: ['y'],
  h: ['wh', 'h'],
  // 音节化辅音（apple 的 əl、button 的 ən 等）
  'əl': ['le', 'al', 'el', 'ol', 'ul', 'il', 're'],
  'ər': ['our', 'ore', 'ere', 'er', 'or', 'ar', 'ir', 'ur', 're'],
  'ən': ['on', 'en', 'an', 'un', 'in', 'n'],
  'əm': ['om', 'em', 'am', 'm'],
}

/** 在 word 的 from 位置起为音素找字母区间；对不上时返回 null */
function matchPhone(word: string, from: number, phone: string): [number, number] | null {
  for (const c of PHONE_LETTERS[phone] ?? []) {
    if (word.startsWith(c, from)) return [from, from + c.length]
  }
  return from < word.length ? [from, from + 1] : null
}

/**
 * 计算单词里发音不准的字母区间。
 * 引擎的 phones 与 expected_phones 等长按序对应，heard≠expected 即读错；
 * 音素与字母按候选表顺序贪心对齐，近似定位，够标红提示用。
 */
function badLetterSpans(
  word: string,
  allPhones: string[],
  errs: { phones?: { expected: string; heard: string }[] }[],
  heardPhones: string[],
): [number, number][] {
  const w = word.toLowerCase()
  const errPhones = errs[0]?.phones ?? []
  if (!w || !allPhones.length) return []
  const badIdx = new Set<number>()
  if (errPhones.length === allPhones.length) {
    // 引擎实测：phones 与 expected_phones 等长按序对应，heard≠expected 即读错（heard 空为漏读）
    errPhones.forEach((p, i) => {
      if (normPhone(p.heard) !== normPhone(allPhones[i])) badIdx.add(i)
    })
  } else if (!errPhones.length && heardPhones.length === allPhones.length) {
    // 近音小误差引擎不出 errors（如 ship 读成 sheep）：heard_phones 等长，逐位比对
    heardPhones.forEach((h, i) => {
      if (normPhone(h) !== normPhone(allPhones[i])) badIdx.add(i)
    })
  } else if (errPhones.length) {
    // 兜底：phones 只含读错的音素（有序子集），按 expected 匹配下标
    let k = 0
    allPhones.forEach((ph, i) => {
      if (k < errPhones.length && normPhone(errPhones[k].expected) === normPhone(ph)) {
        badIdx.add(i)
        k++
      }
    })
  } else {
    return []
  }
  if (!badIdx.size) return []
  if (badIdx.size === allPhones.length) return [[0, w.length]] // 全错：整词标红
  const spans: [number, number][] = []
  let cur = 0
  allPhones.forEach((ph, i) => {
    const left = allPhones.length - i
    let span = matchPhone(w, cur, normPhone(ph))
    if (!span) span = [cur, Math.min(w.length, cur + Math.max(1, Math.ceil((w.length - cur) / left)))]
    if (i === allPhones.length - 1 && cur < w.length) span = [cur, w.length] // 末音素吃掉剩余字母（含静音 e）
    if (badIdx.has(i) && span[1] > span[0]) spans.push(span)
    cur = span[1]
  })
  const merged: [number, number][] = []
  for (const s of spans) {
    const last = merged[merged.length - 1]
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1])
    else merged.push([s[0], s[1]])
  }
  return merged
}

/** 单词渲染：读错的字母标红 */
function renderWord(w: string, spans: [number, number][]): ReactNode {
  if (!spans.length) return w
  const out: ReactNode[] = []
  let cur = 0
  for (const [s, e] of spans) {
    if (s > cur) out.push(w.slice(cur, s))
    out.push(
      <b key={s} className="bad-letter">
        {w.slice(Math.max(s, cur), e)}
      </b>,
    )
    cur = Math.max(cur, e)
  }
  if (cur < w.length) out.push(w.slice(cur))
  return out
}

/** speak：口语跟读——录音上传后端评测（OpenPronounce），失败展示错误并可重试 */
function SpeakCard({
  word,
  onAnswer,
  locked,
}: {
  word: Word
  onAnswer: (ok: boolean, r: WordResult[], final?: boolean) => void
  locked: boolean
}) {
  const [state, setState] = useState<'idle' | 'rec' | 'upload' | 'done' | 'err'>('idle')
  const [heard, setHeard] = useState('')
  const [score, setScore] = useState(0)
  const [tier, setTier] = useState<'yellow' | 'green' | 'red'>('yellow')
  const [tries, setTries] = useState(0)
  const [badSpans, setBadSpans] = useState<[number, number][]>([])
  const [errMsg, setErrMsg] = useState('')
  const ex = word.ex ?? ''
  const target = ex || word.en // 有例句跟读整句，否则跟读单词
  const answeredRef = useRef(false)
  const triesRef = useRef(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const pressRef = useRef(false) // 是否仍按住麦克风（授权等待中松手则取消）
  const startAtRef = useRef(0)
  const mineUrlRef = useRef('') // 本次录音的回放 blobURL
  const mineAudioRef = useRef<HTMLAudioElement | null>(null)
  const barsRef = useRef<HTMLSpanElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef(0)
  const vizOnRef = useRef(false)

  /** 录音可视化：AnalyserNode 取频谱，5 组频段驱动均衡器柱（跟 listen 题按钮同一视觉语言） */
  function startViz(stream: MediaStream) {
    try {
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.75
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const groups: [number, number][] = [[1, 3], [4, 6], [7, 10], [11, 16], [17, 24]]
      vizOnRef.current = true
      const loop = () => {
        if (!vizOnRef.current) return
        analyser.getByteFrequencyData(data)
        const bars = barsRef.current?.children
        if (bars) {
          for (let i = 0; i < 5; i++) {
            const [a, b] = groups[i]
            let sum = 0
            for (let j = a; j <= b; j++) sum += data[j] ?? 0
            const v = Math.min(1.15, 0.28 + (sum / (b - a + 1) / 255) * 2.2)
            ;(bars[i] as HTMLElement).style.transform = `scaleY(${v})`
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      loop()
    } catch {
      /* 可视化失败不影响录音与评测 */
    }
  }

  function stopViz() {
    vizOnRef.current = false
    cancelAnimationFrame(rafRef.current)
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }

  useEffect(() => () => {
    const mr = recRef.current
    if (mr && mr.state !== 'inactive') mr.stop() // 按住中途卸载：释放录音与麦克风
    stopMine()
    stopViz()
  }, [])

  // 句子跟读：进题先听一遍示范（单词跟读保持手动点听）
  useEffect(() => {
    if (ex) speak(ex)
  }, [])

  /** 分数档位：<60 不过（红，重说），60-79 及格（黄），80-100 优秀（绿） */
  const tierOf = (s: number): 'yellow' | 'green' | 'red' =>
    s >= 80 ? 'green' : s >= 60 ? 'yellow' : 'red'

  function settle(ok: boolean) {
    setState('done')
    if (answeredRef.current) return
    answeredRef.current = true
    const result: WordResult = { id: word.id, ok }
    if (ok) {
      confetti(14, ['#58CC02', '#1CB0F6'], confettiAnchor())
      buzz(12)
    } else {
      buzz([26, 44, 26])
    }
    // 失败多留点时间看错误对照；final=true：跟读已自行重试完，失败也直接进解析
    setTimeout(() => onAnswer(ok, [result], true), ok ? 900 : 2600)
  }

  /** 松手（或 pointercancel）：停止录音进入评测 */
  function stopRec() {
    pressRef.current = false
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
  }

  /** 停掉回放并释放上一条录音的 blobURL */
  function stopMine() {
    mineAudioRef.current?.pause()
    if (mineUrlRef.current) {
      URL.revokeObjectURL(mineUrlRef.current)
      mineUrlRef.current = ''
    }
  }

  /** 回放本次录音（流利说式「听我的 / 听示范」对比） */
  function playMine() {
    if (!mineUrlRef.current) return
    const a = mineAudioRef.current ?? (mineAudioRef.current = new Audio())
    a.src = mineUrlRef.current
    void a.play().catch(() => {})
  }

  /** 按下开始录音；若麦克风授权完成前已松手，拿到流后直接释放不录 */
  function startRec() {
    if (locked || state === 'rec' || state === 'upload' || answeredRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrMsg('当前环境不支持录音')
      setState('err')
      return
    }
    setErrMsg('')
    setHeard('')
    stopMine() // 新一次录音：先停掉旧回放
    pressRef.current = true
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (!pressRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const mr = new MediaRecorder(stream)
        recRef.current = mr
        startAtRef.current = Date.now()
        const chunks: Blob[] = []
        mr.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data)
        }
        mr.onstop = () => {
          stopViz()
          stream.getTracks().forEach((t) => t.stop())
          if (Date.now() - startAtRef.current < 500) {
            // 按得太短没有有效语音：不计结果，回待机重说
            setErrMsg('太短了，按住麦克风说话，松手结束')
            setState('err')
            return
          }
          setState('upload')
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' })
          mineUrlRef.current = URL.createObjectURL(blob) // 供评测后回放
          assessSpeak(target, blob)
            .then((r) => {
              const t = tierOf(r.score)
              setScore(r.score)
              setTier(t)
              setHeard(r.transcript)
              // 只有单词模式且不及格才标红字母：及格了还标红只会添乱（引擎对微小偏差也报 heard 差异）
              setBadSpans(t === 'red' && !ex ? badLetterSpans(word.en, r.expected_phones ?? [], r.errors ?? [], r.heard_phones ?? []) : [])
              const n = triesRef.current + 1
              triesRef.current = n
              setTries(n)
              if (t === 'red' && n < 3) {
                // 未达 80 分：不计分不跳题，回待机重说
                buzz([26, 44, 26])
                setTimeout(() => setState('idle'), 1500)
                return
              }
              settle(t !== 'red')
            })
            .catch((e) => {
              // 不做浏览器兜底：直接暴露错误便于定位评测链路
              setErrMsg(e instanceof Error ? e.message : '评测失败，请重试')
              setState('err')
            })
        }
        mr.onerror = () => {
          stopViz()
          stream.getTracks().forEach((t) => t.stop())
          setErrMsg('录音失败，请重试')
          setState('err')
        }
        mr.start()
        startViz(stream)
        setState('rec')
      })
      .catch(() => {
        pressRef.current = false
        setErrMsg('麦克风权限被拒绝，请在浏览器设置中允许')
        setState('err')
      })
  }

  return (
    <>
      <div className="qcard">
        <div className="qtag">
          <span className="qtype-badge">🗣️ {ex ? '跟读句子' : '口语跟读'}</span>
        </div>
        {ex ? (
          <>
            <div className="qword speak-ex" key={word.id}>{ex}</div>
            <div className="spell-zh">{word.zh}</div>
          </>
        ) : (
          <>
            <div className="qword">{renderWord(word.en, badSpans)}</div>
            <div className="spell-zh">{word.zh}</div>
          </>
        )}
        <button type="button" className="speak" onClick={() => speak(target)}>
          🔊 听示范
        </button>
      </div>
      <div className="speak-panel">
        <button
          type="button"
          className={`mic ${state === 'rec' ? 'rec' : ''} ${state === 'done' ? `done t-${tier}` : ''}`}
          onPointerDown={(e) => {
            e.preventDefault() // 防长按选中/拖拽
            try {
              e.currentTarget.setPointerCapture(e.pointerId) // 移出按钮也能收到松手
            } catch {
              /* 不支持捕获则需在按钮上松手 */
            }
            if (state !== 'rec') startRec()
          }}
          onPointerUp={() => {
            if (state === 'rec') stopRec()
            else pressRef.current = false // 授权等待中松手：取消本次
          }}
          onPointerCancel={() => {
            if (state === 'rec') stopRec()
            else pressRef.current = false
          }}
          onContextMenu={(e) => e.preventDefault()}
          disabled={locked || state === 'upload' || state === 'done'}
          aria-label="按住跟读，松手结束"
        >
          {state === 'rec' || state === 'upload' ? (
            <span className="eq-bars" ref={state === 'rec' ? barsRef : undefined} aria-hidden="true"><i /><i /><i /><i /><i /></span>
          ) : state === 'done' ? (
            <span className="mic-done" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5 L10 18 L19.5 6.5" /></svg>
              <b>{score}</b>
            </span>
          ) : (
            <svg className="mic-ico" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2.5" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3.5" />
            </svg>
          )}
        </button>
        {state === 'rec' && <div className="speak-tip">录音中 · 松手结束</div>}
        {state === 'upload' && <div className="speak-tip">评测中…</div>}
        {state === 'err' && <div className="speak-tip no">⚠️ {errMsg || '评测失败，请重试'}</div>}
        {state === 'idle' && tries > 0 && tier === 'red' && (
          <div className="speak-tip no">
            上次 {score} 分 · {ex ? '再听一遍示范，慢慢说' : '差一点点，看着标红的字母再读一次'}
          </div>
        )}
        {state === 'done' && heard && (
          <div className="speak-heard">
            听到：「{heard}」 · {tier === 'green' ? '🌟 发音很棒！' : tier === 'yellow' ? '👍 过关！' : '差一点，多练几次'}
          </div>
        )}
        {state === 'done' && (
          <div className="speak-replay">
            <button type="button" className="btn" onClick={playMine}>🎧 听我的</button>
            <button type="button" className="btn alt" onClick={() => speak(target)}>🔊 听示范</button>
          </div>
        )}
        {state === 'idle' && tries === 0 && (
          <div className="speak-tip">{ex ? '先听示范，按住麦克风跟读句子，松手结束' : '按住麦克风读出单词，松手结束'}</div>
        )}
      </div>
    </>
  )
}

/** listen：自动朗读 + 重播（均衡器胶囊动效，播放中快跳；speakWord 在播放自然结束后 resolve，
 * 动效随之停止；发音走后端 TTS，audio 单例自动顶掉上一条） */
function ListenPrompt({ word, autoPlay }: { word: Word; autoPlay?: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null)

  const play = () => {
    btnRef.current?.classList.add('is-playing')
    speak(word.en).finally(() => btnRef.current?.classList.remove('is-playing'))
  }

  useEffect(() => {
    if (autoPlay) play()
  }, [word.id, autoPlay])

  return (
    <button type="button" className="listen-big" aria-label="播放发音" ref={btnRef} onClick={play}>
      <span className="eq-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
    </button>
  )
}

/** 听写答案归一化：小写、弯引号转直、去标点、压空白（句子/单词通用） */
function normAns(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** spell：键盘输入听写——有例句的词升级为听写整句，否则听写单词；进入自动朗读并聚焦拉起键盘 */
function SpellCard({
  word,
  onAnswer,
  locked,
}: {
  word: Word
  onAnswer: (ok: boolean, r: WordResult[]) => void
  locked: boolean
}) {
  const [val, setVal] = useState('')
  const [wrong, setWrong] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const answerRef = useRef(onAnswer)
  answerRef.current = onAnswer

  const ex = word.ex ?? ''
  const target = ex || word.en

  // 进入题目：自动朗读一遍（与 listen 题同款）
  useEffect(() => {
    speak(target)
  }, [])

  // 解锁（首次进入 / 重试解锁）时聚焦，移动端自动拉起输入法
  useEffect(() => {
    if (!locked && !wrong) inputRef.current?.focus()
  }, [locked, wrong])

  const submit = () => {
    if (locked || wrong) return
    if (normAns(val) === normAns(target)) {
      onAnswer(true, [{ id: word.id, ok: true }])
    } else {
      setWrong(true)
      buzz([26, 44, 26])
      setTimeout(() => {
        setWrong(false)
        setVal('')
        answerRef.current(false, [{ id: word.id, ok: false }])
      }, 700)
    }
  }

  const onChange = (raw: string) => {
    if (ex) {
      // 句子：允许空格与撇号
      setVal(raw.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' '))
    } else {
      setVal(raw.replace(/[^a-zA-Z]/g, '').toLowerCase())
    }
  }

  return (
    <>
      <div className="qcard">
        <div className="qtag">
          <span className="qtype-badge">{ex ? '🎧 听写句子' : '⌨️ 拼写单词'}</span>
        </div>
        <div className="qword spell-zh">{word.zh}</div>
        <button type="button" className="speak" onClick={() => { buzz(8); speak(target) }}>
          {ex ? '🔊 再听一遍' : '🔊 听发音'}
        </button>
        <input
          ref={inputRef}
          className={`spell-input ${wrong ? 'no' : ''} ${ex ? 'wide' : ''}`}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          disabled={locked || wrong}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label={ex ? '输入你听到的句子' : '输入单词拼写'}
          placeholder={ex ? '听写你听到的句子' : '听发音，输入英文单词'}
        />
      </div>
      <button type="button" className="btn spell-submit" disabled={locked || wrong || !val.trim()} onClick={submit}>
        检查
      </button>
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
        confetti(20, ['#58CC02', '#FFC800', '#1CB0F6'], confettiAnchor())
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
              onClick={() => { buzz(6); speak(w.en); setSelL(w.id) }}
            >
              {w.en}<Pos p={w.pos} />
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

/** chest：连击里程碑宝箱——免答庆祝屏，自动通过 */
function ChestCard({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    confetti(26, ['#FFC800', '#FF9600', '#58CC02'])
    buzz(20)
    const t = setTimeout(onDone, 1600)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="chest-wrap">
      <div className="chest-emoji">🎁</div>
      <div className="chest-title">连击 x5 ！</div>
      <div className="chest-sub">保持这个节奏～</div>
    </div>
  )
}

function speak(text: string): Promise<void> {
  // catch 后转为正常 resolve：调用方的 .finally（停动效）在播放结束或失败时都会执行
  return speakWord(text).catch((e) => toast(e instanceof Error ? e.message : '发音失败，请稍后重试'))
}
