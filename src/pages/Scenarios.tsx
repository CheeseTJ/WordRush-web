import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { claimTask, fetchTasks, type Task } from '@/api/client'
import { dailyScenarios, dayLabel, scenarioDoneToday, type Scenario } from '@/data/scenarios'
import { gamifyEnabled } from '@/data/exp'
import { useApp } from '@/state/store'
import { toast } from '@/ui'
import '@/styles-scenario.css'

/** 一张场景卡：进行中 / 已完成 / 锁定三种状态 */
function ScenarioCard({
  scn,
  done,
  locked,
  lockedText,
  onStart,
}: {
  scn: Scenario
  done: boolean
  locked?: boolean
  lockedText?: string
  onStart: () => void
}) {
  return (
    <div
      className={`scn-card ${done ? 'done' : ''} ${locked ? 'locked' : ''}`}
      onClick={locked ? undefined : onStart}
      role="button"
      tabIndex={locked ? -1 : 0}
      onKeyDown={(e) => {
        if (!locked && (e.key === 'Enter' || e.key === ' ')) onStart()
      }}
    >
      <span className={`scn-emoji tint-${scn.tint}`}>{scn.emoji}</span>
      <span className="scn-info">
        <b>{scn.title}</b>
        <i>{scn.en}</i>
        <span className="scn-tags">
          <em className="tag lvl">{scn.level}</em>
          <em className="tag goal">{scn.goals.length} 个目标</em>
          {!locked && <em className="tag xp">满星 +15 XP</em>}
          {locked && <em className="tag dim">🔒 {lockedText}</em>}
        </span>
      </span>
      {locked ? (
        <span className="scn-badge lock">🔒</span>
      ) : done ? (
        <span className="scn-badge check">✓</span>
      ) : (
        <span className="scn-play" aria-hidden />
      )}
    </div>
  )
}

/** 今日情景：场景选择页（/scenarios） */
export default function Scenarios() {
  const nav = useNavigate()
  const { refresh } = useApp()
  const [tasks, setTasks] = useState<Task[]>([])
  // 从对话页返回时本组件会重新挂载，直接读当日完成记录即可，无需跨页同步
  const doneIds = scenarioDoneToday()
  const { today, bonus } = dailyScenarios()

  const chatTask = tasks.find((t) => t.id === 'chat')
  const bothDone = today.every((s) => doneIds.includes(s.id))

  useEffect(() => {
    if (!gamifyEnabled()) return // 纯学习模式：不拉任务也不展示任务条
    void fetchTasks()
      .then(setTasks)
      .catch(() => {
        /* 断网时任务条隐藏即可，不影响选场景 */
      })
  }, [])

  async function claim() {
    try {
      await claimTask('chat')
      toast('✓ 已领取情景对话奖励')
      void refresh()
      void fetchTasks()
        .then(setTasks)
        .catch(() => {})
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : '领取失败')
    }
  }

  function open(id: string) {
    nav(`/chat/${id}`)
  }

  return (
    <div className="view scn-picker">
      <div className="chat-head">
        <b>今日情景</b>
        <span>{dayLabel()} · 每天 2 个新场景</span>
      </div>

      <div className="scn-list">
        {today.map((s) => (
          <ScenarioCard key={s.id} scn={s} done={doneIds.includes(s.id)} onStart={() => open(s.id)} />
        ))}

        {/* 奖励情景：完成今日 2 个后解锁 */}
        <ScenarioCard
          scn={bonus}
          done={doneIds.includes(bonus.id)}
          locked={!bothDone}
          // 提示文案刻意与「满星 +15 XP」同宽级：保证锁定/解锁两态标签都单行排布，卡片高度一致
          lockedText="完成2场解锁"
          onStart={() => (bothDone ? open(bonus.id) : toast('先完成今日 2 个场景，解锁神秘情景 🔒'))}
        />
      </div>

      <div className="scn-note">
        <span>🎬 每场固定 6 轮 · 达成目标拿星星 · 结算有专属点评</span>
      </div>

      {gamifyEnabled() && chatTask && (
        <div className="scn-task">
          <span className="ic">📋</span>
          <span className="tx">
            <b>{chatTask.label}</b>
            <span>
              每日任务 · {chatTask.current}/{chatTask.target}
            </span>
          </span>
          <button
            type="button"
            className={`scn-claim ${chatTask.done && !chatTask.claimed ? 'ready' : ''}`}
            disabled={!chatTask.done || chatTask.claimed}
            onClick={() => void claim()}
          >
            {chatTask.claimed ? '已领取' : '领取'}
          </button>
        </div>
      )}
    </div>
  )
}
