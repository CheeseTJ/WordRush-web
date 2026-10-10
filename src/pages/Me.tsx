import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BOOKS, currentBookId, setCurrentBookId, type BookMeta } from '@/data/vocab'
import { useApp } from '@/state/store'
import { toast, confetti, buzz } from '@/ui'

const PETS = ['🐣', '🐤', '🦜', '🦉', '🐬']

/** 我的页：头像、等级、徽章、词库选择（底部弹层） */
export default function Me() {
  const { profile, pending, refresh, doLogout } = useApp()
  const nav = useNavigate()
  const [bookId, setBookId] = useState(currentBookId())
  const [pickerOpen, setPickerOpen] = useState(false)
  const activeBook = BOOKS.find((b) => b.id === bookId) ?? BOOKS[0]

  function swapPet() {
    const av = document.querySelector('.avatar')
    if (!av) return
    const cur = av.textContent || PETS[0]
    av.textContent = PETS[(PETS.indexOf(cur) + 1) % PETS.length]
    confetti(10, ['#58CC02', '#1CB0F6'])
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

        <div className="panel stg" style={{ ['--d' as string]: 1, marginBottom: 16 }}>
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

        <div className="rows stg" style={{ ['--d' as string]: 2, marginBottom: 16 }}>
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
          <button
            type="button"
            className="rw"
            onClick={() => toast(pending > 0 ? `${pending} 条离线成绩待同步` : '所有成绩已同步 ✓')}
          >
            <div className="l">
              <span className="ic" style={{ background: 'var(--blue-l)' }}>
                🔄
              </span>
              同步状态
            </div>
            <span className="arr">{pending > 0 ? `${pending} 条待同步 ›` : '已同步 ›'}</span>
          </button>
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
            <div className="book-list">
              {BOOKS.map((b) => (
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
            <button type="button" className="btn alt" onClick={() => setPickerOpen(false)}>
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
