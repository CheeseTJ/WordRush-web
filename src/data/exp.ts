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

/* ---------- 发音音色（Piper voice id） ---------- */

const VOICE_KEY = 'wordrush.tts.voice'

export interface VoiceOption {
  id: string
  name: string
  desc: string
}

/** 候选音色（Piper 预训练库；file 为打包进前端的试听样例，秒播） */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'en_US-amy-medium', name: 'Amy', desc: '默认 · 温暖女声（美音）' },
  { id: 'en_US-lessac-medium', name: 'Lessac', desc: '清晰女声（美音）' },
  { id: 'en_US-ryan-high', name: 'Ryan', desc: '沉稳男声（美音 · 高音质）' },
  { id: 'en_GB-cori-medium', name: 'Cori', desc: '英式女声' },
  { id: 'en_GB-alan-medium', name: 'Alan', desc: '英式男声' },
]

const DEFAULT_VOICE = 'en_US-amy-medium'

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
