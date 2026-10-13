import { useEffect, useRef, useState, type FormEvent } from 'react'
import { chatSend, chatStt, speakText, type ChatMessage } from '@/api/client'
import { chatThinking, setChatThinking } from '@/data/exp'
import { toast, buzz } from '@/ui'
import '@/styles-chat.css'

/** 对话相位：idle 空闲 / rec 录音中 / stt 转写中 / think 等 AI / speak 播报中 */
type Phase = 'idle' | 'rec' | 'stt' | 'think' | 'speak'

/** 一条消息：user/assistant 为对话，system 为常驻系统提示（不发给后端） */
type ChatMsg = ChatMessage | { role: 'system'; content: string }

const PHASE_TEXT: Record<Phase, string> = {
  idle: '',
  rec: '正在聆听…再点一下结束',
  stt: '识别中…',
  think: '思考中…',
  speak: '朗读中…',
}

const GREETING: ChatMsg = {
  role: 'assistant',
  content: "Hi! I'm your English buddy. Tap the mic and say something in English — I'll reply and help you.",
}

/** 一次对话最多带上最近 N 条历史（控制上下文 token）；system 提示不计入。 */
const HISTORY_LIMIT = 10

/** 把失败映射成一句用户能看懂的中文提示（额度耗尽 / 服务不可用 / 其它）。 */
function noticeFor(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code) : ''
  if (code === 'quota_exhausted') {
    return '🌙 今天的免费对话额度用完啦，明天 08:00（北京时间）自动恢复，先用单词卡练一会儿吧～'
  }
  if (code === 'unavailable') {
    return '📡 对话服务暂时不可用，稍后再试试'
  }
  return '😥 对话失败，稍后再试试'
}

/** 口语对话页：录音 → 本地 STT → GLM-4.7-Flash → 本地 Piper 语音回复 */
export default function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING])
  const [phase, setPhase] = useState<Phase>('idle')
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(chatThinking)
  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const listRef = useRef<HTMLDivElement | null>(null)

  const busy = phase !== 'idle'

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

  /** 追加一条常驻系统提示（不参与对话历史，不会被发给后端）。 */
  function addNotice(content: string) {
    setMessages((m) => [...m, { role: 'system', content }])
  }

  function toggleThinking() {
    const next = !thinking
    setThinking(next)
    setChatThinking(next)
    toast(next ? '已开启深思：想清楚再答，稍慢' : '已切换快速：秒回更省额度')
  }

  async function toggleRec() {
    if (phase === 'rec') {
      recRef.current?.stop()
      return
    }
    if (busy) return
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
      addNotice('🎤 没能识别这段语音，换打字试试？')
      setPhase('idle')
      return
    }
    if (!text) {
      addNotice('🎤 没听到内容，再说一次吧')
      setPhase('idle')
      return
    }
    await send(text)
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content) return
    const history: ChatMsg[] = [...messages, { role: 'user', content }]
    setMessages(history)
    setDraft('')
    setPhase('think')
    let reply: string
    try {
      // 只把 user/assistant 发给后端，system 提示仅本地展示
      const payload = history.filter((m): m is ChatMessage => m.role !== 'system').slice(-HISTORY_LIMIT)
      reply = await chatSend(payload, thinking)
    } catch (e) {
      addNotice(noticeFor(e))
      setPhase('idle')
      return
    }
    setMessages((m) => [...m, { role: 'assistant', content: reply }])
    void playReply(reply)
  }

  async function playReply(reply: string) {
    setPhase('speak')
    try {
      await speakText(reply)
    } catch {
      toast('语音播放失败')
    }
    setPhase('idle')
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    void send(draft)
  }

  return (
    <div className="view chat">
      <div className="chat-head">
        <b>口语对话</b>
        <span>和 AI 用英语聊天</span>
        <button
          type="button"
          className={`think-toggle ${thinking ? 'on' : ''}`}
          onClick={toggleThinking}
          title={thinking ? '先推理再作答，更准但更慢' : '一两秒就回，最省额度'}
        >
          {thinking ? '🧠 深思' : '⚡ 快速'}
        </button>
      </div>

      <div className="chat-list" ref={listRef}>
        {messages.map((m, i) =>
          m.role === 'system' ? (
            <div key={i} className="msg system">
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className={`msg ${m.role}`}
              onClick={m.role === 'assistant' && !busy ? () => void playReply(m.content) : undefined}
              title={m.role === 'assistant' ? '点击重播' : undefined}
            >
              {m.content}
            </div>
          ),
        )}
      </div>

      <div className="chat-status">{PHASE_TEXT[phase]}</div>

      <form className="chat-bar" onSubmit={onSubmit}>
        <button
          type="button"
          className={`mic ${phase === 'rec' ? 'rec' : ''}`}
          onClick={() => void toggleRec()}
          disabled={busy && phase !== 'rec'}
          title="点击开始 / 结束录音"
        >
          {phase === 'rec' ? '⏹' : '🎤'}
        </button>
        <input
          className="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="也可以直接打字…"
          disabled={busy}
        />
        <button className="chat-send" type="submit" disabled={busy || !draft.trim()}>
          发送
        </button>
      </form>
    </div>
  )
}
