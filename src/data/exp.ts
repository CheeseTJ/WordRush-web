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
