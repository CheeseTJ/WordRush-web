/**
 * 实验特性开关（迭代四）：localStorage 持久化。
 * - speak：口语跟读。默认开启——优先后端评测（OpenPronounce），失败降级浏览器识别；
 *   显式写入 '0' 才视为关闭。
 */

const SPEAK_KEY = 'wordrush.exp.speak'

export function speakEnabled(): boolean {
  try {
    return localStorage.getItem(SPEAK_KEY) !== '0'
  } catch {
    return true
  }
}

export function setSpeakEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(SPEAK_KEY) // 默认即开
    else localStorage.setItem(SPEAK_KEY, '0')
  } catch {
    /* 忽略 */
  }
}

/* ---------- 游戏化元素（宝箱 / 红心 / 连击 / 宝石任务） ---------- */

const GAMIFY_KEY = 'wordrush.exp.gamify'

/** 游戏化激励层总开关：宝箱、红心、连击、每日任务等。默认关闭（纯学习模式）。 */
export function gamifyEnabled(): boolean {
  try {
    return localStorage.getItem(GAMIFY_KEY) === '1'
  } catch {
    return false
  }
}

export function setGamifyEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(GAMIFY_KEY, '1')
    else localStorage.removeItem(GAMIFY_KEY)
  } catch {
    /* 忽略 */
  }
}

/* ---------- 发音音色（Piper voice id） ---------- */

const VOICE_KEY = 'wordrush.tts.voice'

export interface VoiceOption {
  id: string
  name: string
  desc: string
}

/** 候选音色（Piper 预训练库；file 为打包进前端的试听样例，秒播） */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'en_US-lessac-medium', name: 'Lessac', desc: '默认 · 清晰女声（美音 · 最自然）' },
  { id: 'en_US-amy-medium', name: 'Amy', desc: '温暖女声（美音）' },
  { id: 'en_US-ryan-high', name: 'Ryan', desc: '沉稳男声（美音 · 高音质）' },
  { id: 'en_GB-cori-medium', name: 'Cori', desc: '英式女声' },
  { id: 'en_GB-alan-medium', name: 'Alan', desc: '英式男声' },
  { id: 'en_GB-semaine-medium', name: 'Semaine', desc: '英式女声 · 情绪丰富' },
  { id: 'en_GB-alba-medium', name: 'Alba', desc: '英式女声 · 清亮活泼' },
]

const DEFAULT_VOICE = 'en_US-lessac-medium'

/** 当前选中的音色 id（未设置过 = Amy） */
export function currentVoice(): string {
  try {
    return localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE
  } catch {
    return DEFAULT_VOICE
  }
}

export function setVoice(id: string): void {
  try {
    localStorage.setItem(VOICE_KEY, id)
  } catch {
    /* 忽略 */
  }
}

/* ---------- 口语对话：思考模式 ---------- */

const THINKING_KEY = 'wordrush.chat.thinking'

/** 对话思考模式：开启后模型先推理再作答，更准但更慢、更费额度。默认关闭。 */
export function chatThinking(): boolean {
  try {
    return localStorage.getItem(THINKING_KEY) === '1'
  } catch {
    return false
  }
}

export function setChatThinking(on: boolean): void {
  try {
    if (on) localStorage.setItem(THINKING_KEY, '1')
    else localStorage.removeItem(THINKING_KEY)
  } catch {
    /* 忽略 */
  }
}

/* ---------- 口语对话：听力模式 ---------- */

const LISTEN_KEY = 'wordrush.exp.listen'

/** 听力模式：AI 回复只播声音不出字（点气泡可显示该条原文）。默认关闭。 */
export function listenMode(): boolean {
  try {
    return localStorage.getItem(LISTEN_KEY) === '1'
  } catch {
    return false
  }
}

export function setListenMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(LISTEN_KEY, '1')
    else localStorage.removeItem(LISTEN_KEY)
  } catch {
    /* 忽略 */
  }
}

/* ---------- 口语对话：语音优先输入 ---------- */

const VOICE_FIRST_KEY = 'wordrush.exp.voicefirst'

/** 语音优先：输入条默认只留麦克风，点键盘才切打字。默认开启。 */
export function voiceFirst(): boolean {
  try {
    return localStorage.getItem(VOICE_FIRST_KEY) !== '0'
  } catch {
    return true
  }
}

export function setVoiceFirst(on: boolean): void {
  try {
    if (on) localStorage.removeItem(VOICE_FIRST_KEY)
    else localStorage.setItem(VOICE_FIRST_KEY, '0')
  } catch {
    /* 忽略 */
  }
}
