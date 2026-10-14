import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  chatStt,
  chatSummary,
  scenarioChat,
  speakText,
  type ChatMessage,
  type ChatSummary,
} from '@/api/client'
import { SCENARIOS, markScenarioDone } from '@/data/scenarios'
import { chatThinking, setChatThinking } from '@/data/exp'
import { useApp } from '@/state/store'
import { toast, buzz } from '@/ui'
import '@/styles-chat.css'
import '@/styles-scenario.css'

/** 对话相位：idle 空闲 / rec 录音中 / stt 转写中 / think 等 AI / speak 播报中 / grading 结算中 */
type Phase = 'idle' | 'rec' | 'stt' | 'think' | 'speak' | 'grading'
/** 视图：对话中 / 结算页 */
type View = 'chat' | 'summary'

const PHASE_TEXT: Record<Phase, string> = {
  idle: '',
  rec: '正在聆听…再点一下结束',
  stt: '识别中…',
  think: '思考中…',
  speak: '朗读中…',
  grading: '教练批改中…',
}

/** 一次对话最多带上最近 N 条历史（system 提示不计入） */
const HISTORY_LIMIT = 10

/** 把失败映射成一句用户能看懂的中文提示。 */
function noticeFor(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
  if (code === 'quota_exhausted') {
    return '🌙 今天的免费对话额度用完啦，明天 08:00（北京时间）自动恢复，先用单词卡练一会儿吧～'
  }
  if (code === 'turns_exhausted') {
    return '🏁 这一场的回合已经用完，看看结算吧'
  }
  if (code === 'unavailable') {
    return '📡 对话服务暂时不可用，稍后再试试'
  }
  return '😥 对话失败，稍后再试试'
}

/** 情景对话页（/chat/:sid）：有限回合 → 目标打勾 → 结算 */
export default function ScenarioChat() {
  const { sid } = useParams()
  const nav = useNavigate()
  const { refresh } = useApp()

  const scenario = SCENARIOS.find((s) => s.id === sid)
  const [view, setView] = useState<View>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [goalsHit, setGoalsHit] = useState<boolean[]>([])
  const [turn, setTurn] = useState(1) // 下一个回合序号（1 起）
  const [finished, setFinished] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(chatThinking)
  const [summary, setSummary] = useState<ChatSummary | null>(null)

  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const listRef = useRef<HTMLDivElement | null>(null)

  const busy = phase !== 'idle'
  const turnsUsed = turn - 1
  const goalsTotal = scenario?.goals.length ?? 0
  const hitCount = goalsHit.filter(Boolean).length

  /** 初始化 / 重开一场 */
  function reset() {
    if (!scenario) return
    setMessages([{ role: 'assistant', content: scenario.opening }])
    setGoalsHit(scenario.goals.map(() => false))
    setTurn(1)
    setFinished(false)
    setSummary(null)
    setPhase('idle')
    setDraft('')
    setView('chat')
  }

  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario?.id])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, phase])

  useEffect(() => {
    return () => {
      recRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  if (!scenario) return <Navigate to="/scenarios" replace />

  const canFinish = finished || (goalsTotal > 0 && hitCount === goalsTotal)

  function toggleThinking() {
    const next = !thinking
    setThinking(next)
    setChatThinking(next)
    toast(next ? '已开启深思：想清楚再答，稍慢' : '已切换快速：秒回更省额度')
  }

  /* ---------- 语音输入（与口语跟读同一套录音 → STT 流程） ---------- */

  async function toggleRec() {
    if (phase === 'rec') {
      recRef.current?.stop()
      return
    }
    if (busy || finished) return
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('当前环境不支持录音')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      recRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        recRef.current = null
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        void handleAudio(blob)
      }
      mr.start()
      buzz(10)
      setPhase('rec')
    } catch {
      toast('麦克风不可用')
    }
  }

  async function handleAudio(blob: Blob) {
    setPhase('stt')
    let text: string
    try {
      text = await chatStt(blob)
    } catch {
      toast('🎤 没能识别这段语音，换打字试试？')
      setPhase('idle')
      return
    }
    if (!text) {
      toast('🎤 没听到内容，再说一次吧')
      setPhase('idle')
      return
    }
    await send(text)
  }

  /* ---------- 对话主流程 ---------- */

  async function send(text: string) {
    if (!scenario) return
    const content = text.trim()
    if (!content || busy || finished) return
    if (turn > scenario.turns) {
      setFinished(true)
      return
    }
    const history: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(history)
    setDraft('')
    setPhase('think')
    let res
    try {
      const payload = history.slice(-HISTORY_LIMIT)
      res = await scenarioChat(scenario.id, turn, payload, thinking)
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
      if (code === 'turns_exhausted') setFinished(true)
      else toast(noticeFor(e))
      setPhase('idle')
      return
    }
    setMessages((m) => [...m, { role: 'assistant', content: res.reply }])
    // 目标合并：模型漏标记（goals=null）时保持原状；done 即全部达成
    if (res.goals) {
      setGoalsHit((prev) => prev.map((h, i) => h || res.goals![i] === true))
    }
    if (res.done) setGoalsHit(scenario.goals.map(() => true))
    setTurn((t) => t + 1)
    if (turn >= scenario.turns) setFinished(true)
    void playReply(res.reply)
  }

  async function playReply(text: string) {
    setPhase('speak')
    try {
      await speakText(text)
    } catch {
      toast('语音播放失败')
    }
    setPhase('idle')
  }

  /* ---------- 结算 ---------- */

  async function finish() {
    if (!scenario || summary) return
    // 朗读中（speak）也允许进入结算：最后一句较长时按钮不能"点了没反应"
    if (phase !== 'idle' && phase !== 'speak') return
    setPhase('grading')
    try {
      const data = await chatSummary(
        scenario.id,
        messages,
        hitCount,
        goalsTotal,
        Math.max(turnsUsed, 1),
        thinking,
      )
      setSummary(data)
      markScenarioDone(scenario.id)
      setView('summary')
      void refresh() // 同步档案 XP/宝石
    } catch (e) {
      toast(noticeFor(e))
    }
    setPhase('idle')
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    void send(draft)
  }

  /* ==================== 结算视图 ==================== */

  if (view === 'summary' && summary) {
    const titles = ['完成！', '干得不错！', '太棒了！', '太棒了！']
    return (
      <div className="view scn-summary">
        <div className="scn-sum-hero">
          <h2>{titles[summary.stars] ?? '完成！'}</h2>
          <p>
            {scenario.title} · 目标 {hitCount}/{goalsTotal} · 用时 {turnsUsed} 轮
          </p>
          <div className="scn-stars">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`scn-star ${i === 1 ? 'big' : ''} ${i < summary.stars ? 'lit' : ''}`} />
            ))}
          </div>
        </div>

        <div className="scn-reward-row">
          <span className="scn-reward">⚡ +{summary.xp_gained} XP</span>
          <span className="scn-reward b">💎 +{summary.gems_gained}</span>
        </div>

        <div className="scn-card">
          <b>💬 AI 教练点评</b>
          <p className="scn-comment">{summary.comment}</p>
        </div>

        {summary.phrases.length > 0 && (
          <div className="scn-card">
            <b>📚 学到的表达</b>
            {summary.phrases.map((p, i) => (
              <div key={i} className="scn-phrase">
                <span>
                  <u>{p.en}</u>
                  <i>{p.zh}</i>
                </span>
                <button type="button" className="scn-hear" title="跟读" onClick={() => void speakText(p.en)}>
                  🔊
                </button>
              </div>
            ))}
          </div>
        )}

        {summary.fixes.length > 0 && (
          <div className="scn-card">
            <b>✏️ AI 帮你改了这句</b>
            {summary.fixes.map((f, i) => (
              <div key={i} className="scn-fix">
                <span className="bad">{f.bad}</span>
                <span className="good">{f.good}</span>
                {f.why && <span className="why">{f.why}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="scn-actions">
          <div className="scn-claimed">✓ 已计入今日任务，奖励已到账</div>
          <div className="scn-btn-row">
            <button type="button" className="scn-btn ghost" onClick={reset}>
              ↻ 再来一次
            </button>
            <button type="button" className="scn-btn ghost" onClick={() => nav('/scenarios')}>
              ⇄ 换个场景
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ==================== 对话视图 ==================== */

  return (
    <div className="view chat scn-chat">
      <div className="chat-head">
        <button type="button" className="scn-back" onClick={() => nav('/scenarios')} title="返回场景列表">
          ‹
        </button>
        <b>
          {scenario.emoji} {scenario.title}
        </b>
        <button
          type="button"
          className={`think-toggle ${thinking ? 'on' : ''}`}
          onClick={toggleThinking}
          title={thinking ? '先推理再作答，更准但更慢' : '一两秒就回，最省额度'}
        >
          {thinking ? '🧠 深思' : '⚡ 快速'}
        </button>
      </div>

      {/* 场景面板：回合进度 + 目标清单 */}
      <div className="scn-panel">
        <div className="scn-panel-row">
          <span className="scn-turn-label">
            第 {Math.min(turn, scenario.turns)} / {scenario.turns} 轮
          </span>
          <span className="scn-goals-chip">
            🎯 {hitCount}/{goalsTotal}
          </span>
        </div>
        <div className="scn-turnbar">
          {Array.from({ length: scenario.turns }, (_, i) => (
            <i key={i} className={i < turnsUsed ? 'f' : ''} />
          ))}
        </div>
        <div className="scn-goal-row">
          {scenario.goals.map((g, i) => (
            <span key={i} className={`scn-goal-chip ${goalsHit[i] ? 'hit' : ''}`}>
              <i>{goalsHit[i] ? '✓' : ''}</i>
              {g}
            </span>
          ))}
        </div>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`msg ${m.role}`}
            onClick={m.role === 'assistant' && !busy ? () => void playReply(m.content) : undefined}
            title={m.role === 'assistant' ? '点击重播' : undefined}
          >
            {m.content}
          </div>
        ))}
      </div>

      <div className="chat-status">{PHASE_TEXT[phase]}</div>

      {/* 提示卡 */}
      <div className="scn-starters">
        {scenario.starters.map((s) => (
          <button key={s} type="button" className="scn-starter" onClick={() => setDraft(s)} disabled={busy || finished}>
            {s}
          </button>
        ))}
      </div>

      <form className="chat-bar" onSubmit={onSubmit}>
        <button
          type="button"
          className={`mic ${phase === 'rec' ? 'rec' : ''}`}
          onClick={() => void toggleRec()}
          disabled={(busy && phase !== 'rec') || finished}
          title="点击开始 / 结束录音"
        >
          {phase === 'rec' ? '⏹' : '🎤'}
        </button>
        <input
          className="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="输入或按麦克风说话…"
          disabled={busy || finished}
        />
        <button className="chat-send" type="submit" disabled={busy || finished || !draft.trim()}>
          发送
        </button>
      </form>

      {canFinish && (
        <button type="button" className="scn-finish-pill show" onClick={() => void finish()}>
          🎉 {finished ? '回合用完 · ' : '目标达成 · '}查看结算
        </button>
      )}
    </div>
  )
}
