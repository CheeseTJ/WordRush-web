import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BOOKS, booksByLevel, currentBookId, setCurrentBookId, type BookMeta } from '@/data/vocab'
import { currentVoice, setVoice, VOICE_OPTIONS, gamifyEnabled, setGamifyEnabled } from '@/data/exp'
import { previewVoice, resetSpeakCache } from '@/api/client'
import { useApp } from '@/state/store'
import { MeStats } from '@/components/MeStats'
import { UpdateRow } from '@/components/UpdateRow'
import { toast, buzz } from '@/ui'

const PETS = ['🐣', '🐤', '🦜', '🦉', '🐬']

/** 我的页：头像、等级、学习统计、徽章、词库选择（底部弹层）
 *  学习统计原为独立的 /stats 页，实际使用中查看频率低，合并到这里反而少一次跳转。 */
export default function Me() {
  const { profile, refresh, doLogout } = useApp()
  const nav = useNavigate()
  const [bookId, setBookId] = useState(currentBookId())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [voice, setVoiceId] = useState(currentVoice())
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [gamify, setGamify] = useState(gamifyEnabled())
  const [previewing, setPreviewing] = useState<string | null>(null)
  const activeBook = BOOKS.find((b) => b.id === bookId) ?? BOOKS[0]

  async function preview(id: string) {
    if (previewing) return
    setPreviewing(id)
    buzz(6)
    try {
      await previewVoice(id)
    } catch {
      toast('试听失败，请稍后重试')
    } finally {
      setPreviewing(null)
    }
  }

  function swapPet() {
    const av = document.querySelector('.avatar')
    if (!av) return
    const cur = av.textContent || PETS[0]
    av.textContent = PETS[(PETS.indexOf(cur) + 1) % PETS.length]
    // 换头像只给轻微触感，不撒彩纸：粒子特效留给答题答对这类「获得成就」时刻
    buzz(8)
  }

  function chooseBook(b: BookMeta) {
    if (b.id === bookId) {
      setPickerOpen(false)
      return
    }
    setCurrentBookId(b.id)
    setBookId(b.id)
    setPickerOpen(false)
    buzz(12)
    toast(`已切换到《${b.name}》`)
    void refresh()
    nav('/map', { replace: true })
  }

  return (
    <div className="view">
      <div className="prof">
        <div className="me stg" style={{ ['--d' as string]: 0 }}>
          <div className="avatar" onClick={swapPet} role="button" aria-label="换头像">
            🐣
          </div>
          <div>
            <div className="nm">单词小鸟</div>
            <div className="lv">
              Lv.{profile.level ?? 1} · <b>{profile.xp}</b> XP
            </div>
            <div className="lvbar">
              <i style={{ width: `${((profile.xp ?? 0) % 500) / 5}%` }} />
            </div>
          </div>
        </div>

        {/* 学习统计（原 /stats 页）：指标 + 近 14 天柱状图，随页面一起滚动 */}
        <MeStats />

        {/* 成就徽章：平板/桌面已有侧栏展示同一组徽章（见 Sidebar.tsx），
            该档位下由 CSS 隐藏本块，避免同屏两份完全相同的内容 */}
        <div className="panel stg me-badges" style={{ ['--d' as string]: 3, marginBottom: 16 }}>
          <h3>
            成就徽章<span>BADGES</span>
          </h3>
          <div className="badges">
            <Badge em="🔥" name="七日连胜" locked={(profile.streak_days ?? 0) < 7} />
            <Badge em="🎯" name="闯关先锋" locked={(profile.xp ?? 0) < 100} />
            <Badge em="🌙" name="夜猫子" locked />
            <Badge em="🏆" name="关卡全通" locked />
            <Badge em="💎" name="零错神" locked />
            <Badge em="🚀" name="千词飞人" locked={(profile.xp ?? 0) < 3000} />
          </div>
        </div>

        <div className="rows stg" style={{ ['--d' as string]: 4, marginBottom: 16 }}>
          <button type="button" className="rw" onClick={() => setPickerOpen(true)}>
            <div className="l">
              <span className="ic" style={{ background: 'var(--green-l)' }}>
                📚
              </span>
              当前词库
            </div>
            <span className="arr">
              {activeBook.name} · {activeBook.words} 词 ›
            </span>
          </button>
          <button type="button" className="rw" onClick={() => setVoiceOpen(true)}>
            <div className="l">
              <span className="ic" style={{ background: 'var(--yellow-l, #FFF3D6)' }}>
                🔊
              </span>
              发音音色
            </div>
            <span className="arr">
              {VOICE_OPTIONS.find((v) => v.id === voice)?.name ?? '默认'} ›
            </span>
          </button>
          <button
            type="button"
            className="rw"
            onClick={() => {
              const v = !gamify
              setGamify(v)
              setGamifyEnabled(v)
              buzz(8)
              toast(v ? '游戏化元素已开启 🎮' : '游戏化元素已关闭')
            }}
          >
            <div className="l">
              <span className="ic" style={{ background: 'var(--coral-l, #FFE3E3)' }}>
                🎮
              </span>
              游戏化元素
            </div>
            <span className="arr">{gamify ? '宝箱 / 红心 / 任务 · 开' : '关'}</span>
          </button>
          {/* 检查更新：只在原生 App 内渲染（UpdateRow 自己判定并返回 null） */}
          <UpdateRow />
        </div>

        <button
          type="button"
          className="btn alt"
          style={{ marginTop: 0 }}
          onClick={() => {
            void doLogout().then(() => {
              toast('已退出登录')
              nav('/login', { replace: true })
            })
          }}
        >
          退出登录
        </button>
      </div>

      {pickerOpen && (
        <div className="fill" onClick={(e) => e.target === e.currentTarget && setPickerOpen(false)}>
          <div className="box" style={{ textAlign: 'left' }}>
            <h2 style={{ textAlign: 'center' }}>选择词库</h2>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', marginTop: -4 }}>
              按难度由易到难排列
            </p>
            <div className="book-list">
              {booksByLevel().map((g) => (
                <div key={g.level.id} className="book-group">
                  <div className="book-group-head">
                    <b>{g.level.name}</b>
                    <span>{g.level.desc}</span>
                  </div>
                  {g.books.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`book-item ${b.id === bookId ? 'on' : ''}`}
                      onClick={() => chooseBook(b)}
                    >
                      <span className="bi-em">{b.id === bookId ? '📖' : '📕'}</span>
                      <span className="bi-tx">
                        <b>{b.name}</b>
                        <span>
                          {b.desc} · {b.words} 词 {b.units} 关
                        </span>
                      </span>
                      {b.id === bookId && <span className="bi-check">✓</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button type="button" className="btn alt" onClick={() => setPickerOpen(false)}>
              取消
            </button>
          </div>
        </div>
      )}
      {voiceOpen && (
        <div className="fill" onClick={(e) => e.target === e.currentTarget && setVoiceOpen(false)}>
          <div className="box" style={{ textAlign: 'left' }}>
            <h2 style={{ textAlign: 'center' }}>发音音色</h2>
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-soft)', marginTop: -4 }}>
              换新音色后首次发音需要几秒准备
            </p>
            <div className="book-list">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id || 'default'}
                  type="button"
                  className={`book-item ${v.id === voice ? 'on' : ''}`}
                  onClick={() => {
                    setVoice(v.id)
                    setVoiceId(v.id)
                    resetSpeakCache()
                    setVoiceOpen(false)
                    buzz(10)
                    toast(`音色已切换为 ${v.name} 🔊`)
                  }}
                >
                  <span className="bi-em">{v.id === voice ? '🔊' : '🔉'}</span>
                  <span className="bi-tx">
                    <b>{v.name}</b>
                    <span>{v.desc}</span>
                  </span>
                  {v.id === voice ? (
                    <span className="voice-check" aria-label="使用中">
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                        <path
                          d="M4.5 12.5l5 5L19.5 7"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="3.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : (
                    <span
                      className={`voice-preview ${previewing === v.id ? 'playing' : ''}`}
                      role="button"
                      aria-label={`试听 ${v.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (previewing) return
                        void preview(v.id)
                      }}
                    >
                      {previewing === v.id ? (
                        <span className="eq" aria-hidden>
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden>
                          <path d="M8 5.2v13.6L19.2 12z" fill="#fff" />
                        </svg>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" className="btn alt" onClick={() => setVoiceOpen(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Badge({ em, name, locked }: { em: string; name: string; locked?: boolean }) {
  return (
    <div
      className={`bd ${locked ? 'lock' : ''}`}
      onClick={() => toast(locked ? '锁定中 · 继续加油解锁！' : '已解锁的徽章 ✨')}
      role="button"
    >
      <span className="em">{em}</span>
      <div className="nm2">{name}</div>
    </div>
  )
}
