/**
 * 实验特性开关（迭代四）：localStorage 持久化，默认关闭。
 * - speak：口语跟读（webkitSpeechRecognition 词匹配率打分；Android/Chrome 可用，iOS 受限）
 */

const SPEAK_KEY = 'wordrush.exp.speak'

export function speakEnabled(): boolean {
  try {
    return localStorage.getItem(SPEAK_KEY) === '1'
  } catch {
    return false
  }
}

export function setSpeakEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(SPEAK_KEY, '1')
    else localStorage.removeItem(SPEAK_KEY)
  } catch {
    /* 忽略 */
  }
}
