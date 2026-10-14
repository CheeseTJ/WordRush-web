/**
 * 情景对话场景池（迭代五）。
 *
 * - id 必须与后端 `chatScenarios` 注册表一致：人设 / 目标 / 回合上限都在服务端，
 *   前端这份只负责「展示与轮换」（卡片、目标中文文案、提示卡、开场白）。
 * - 每日场景按东八区日期做确定性轮换：同一天所有人看到的相同，且天然支持离线。
 * - 当日完成记录存 localStorage（离线优先，断网也能点亮解锁状态）。
 */

export interface Scenario {
  id: string
  emoji: string
  title: string
  en: string
  level: string
  /** 学习者回合上限（后端为准，这里用于进度条与前端预判） */
  turns: number
  /** 任务目标的中文文案（与后端英文 goals 一一对应） */
  goals: string[]
  /** 提示卡：点击填入输入框的 starter 短语 */
  starters: string[]
  /** AI 开场白（第一句由本地渲染，不发请求） */
  opening: string
  tint: 'yellow' | 'blue' | 'green' | 'coral' | 'purple'
}

export const SCENARIO_TURNS = 6

export const SCENARIOS: Scenario[] = [
  {
    id: 'coffee',
    emoji: '☕',
    title: '咖啡店点单',
    en: 'AT THE COFFEE SHOP',
    level: 'A2',
    turns: SCENARIO_TURNS,
    goals: ['点一杯饮品', '询问价格', '要求少糖'],
    starters: ["I'd like a…, please.", 'How much is…?', 'No sugar, please.', "That's all, thanks!"],
    opening: 'Good morning! Welcome to Bean & Leaf. What can I get started for you?',
    tint: 'yellow',
  },
  {
    id: 'airport',
    emoji: '🛫',
    title: '机场值机',
    en: 'CHECKING IN AT THE AIRPORT',
    level: 'A2+',
    turns: SCENARIO_TURNS,
    goals: ['办理登机牌', '托运行李并询问限重'],
    starters: ['I’d like to check in, please.', 'I have one suitcase to check in.', 'Is the flight on time?'],
    opening: 'Good afternoon! May I see your passport and booking, please?',
    tint: 'blue',
  },
  {
    id: 'hotel',
    emoji: '🏨',
    title: '酒店入住',
    en: 'HOTEL CHECK-IN',
    level: 'A2',
    turns: SCENARIO_TURNS,
    goals: ['用预订信息办理入住', '询问早餐时间', '要 Wi-Fi 密码'],
    starters: ['I have a reservation under…', 'What time is breakfast?', 'What’s the Wi-Fi password?'],
    opening: 'Welcome to the Garden Hotel! Do you have a reservation with us?',
    tint: 'green',
  },
  {
    id: 'restaurant',
    emoji: '🍜',
    title: '餐厅点餐',
    en: 'ORDERING AT A RESTAURANT',
    level: 'A2',
    turns: SCENARIO_TURNS,
    goals: ['点一个主菜和一杯饮品', '问服务员推荐', '结账买单'],
    starters: ['Could I see the menu, please?', 'What do you recommend?', 'Could we have the bill, please?'],
    opening: 'Hi there! Table for one? Here’s the menu — take your time.',
    tint: 'coral',
  },
  {
    id: 'shopping',
    emoji: '🛍️',
    title: '退换货',
    en: 'RETURNING AN ITEM',
    level: 'B1',
    turns: SCENARIO_TURNS,
    goals: ['说明商品问题', '要求退款或换货', '询问退款政策或到账时间'],
    starters: ["I'd like to return this jacket.", "It doesn't fit — it's too small.", 'Could I get a refund?'],
    opening: 'Hello! How can I help you today?',
    tint: 'purple',
  },
  {
    id: 'doctor',
    emoji: '🩺',
    title: '看医生',
    en: 'AT THE DOCTOR',
    level: 'B1',
    turns: SCENARIO_TURNS,
    goals: ['描述症状', '说明持续了多久', '请求建议或开药'],
    starters: ["I've had a sore throat…", 'It started two days ago.', 'What should I do?'],
    opening: 'Come in and have a seat. What seems to be the problem?',
    tint: 'green',
  },
  {
    id: 'interview',
    emoji: '💼',
    title: '面试自我介绍',
    en: 'JOB INTERVIEW',
    level: 'B1+',
    turns: SCENARIO_TURNS,
    goals: ['完成自我介绍', '用一个例子讲自己的优势', '问一个关于职位的问题'],
    starters: ["Let me introduce myself…", 'My biggest strength is…', "I'd like to ask about the role…"],
    opening: 'Thanks for coming in today! So, tell me a little about yourself.',
    tint: 'blue',
  },
  {
    id: 'rent',
    emoji: '🏠',
    title: '租房看房',
    en: 'VIEWING AN APARTMENT',
    level: 'B1+',
    turns: SCENARIO_TURNS,
    goals: ['询问租金和账单', '询问房屋细节（家具/宠物等）', '询问合同或入住时间'],
    starters: ["I'm here to view the apartment.", 'How much is the rent?', 'Are pets allowed?'],
    opening: 'Hi! You must be here about the apartment. Come in, let me show you around.',
    tint: 'yellow',
  },
]

/* ---------- 每日轮换 ---------- */

/** 东八区日期串（与后端 chinaDay 同一套划天规则） */
export function chinaDay(d = new Date()): string {
  return d
    .toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
    .slice(0, 10)
}

/** djb2 字符串散列：把日期映射成稳定伪随机数 */
function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export interface DailyPick {
  /** 今日 2 个场景 */
  today: Scenario[]
  /** 奖励情景：完成今日 2 个后解锁 */
  bonus: Scenario
}

/** 按当日日期确定性轮换：同一天结果恒定，刷新/离线都不变 */
export function dailyScenarios(): DailyPick {
  const n = SCENARIOS.length
  const h = djb2(chinaDay())
  const i1 = h % n
  const i2 = (i1 + 1) % n
  const ib = (i1 + Math.floor(n / 2)) % n
  return { today: [SCENARIOS[i1], SCENARIOS[i2]], bonus: SCENARIOS[ib] }
}

/* ---------- 当日完成记录（解锁奖励情景） ---------- */

const DONE_KEY = 'wordrush.scn.done'

interface DoneRecord {
  day: string
  ids: string[]
}

function readDone(): DoneRecord {
  try {
    const raw = localStorage.getItem(DONE_KEY)
    if (raw) {
      const rec = JSON.parse(raw) as DoneRecord
      if (rec.day === chinaDay()) return rec
    }
  } catch {
    /* 忽略 */
  }
  return { day: chinaDay(), ids: [] }
}

function writeDone(rec: DoneRecord): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(rec))
  } catch {
    /* 忽略 */
  }
}

/** 今日已完成的场景 id 列表 */
export function scenarioDoneToday(): string[] {
  return readDone().ids
}

/** 结算成功后记录一次完成 */
export function markScenarioDone(id: string): void {
  const rec = readDone()
  if (!rec.ids.includes(id)) {
    rec.ids.push(id)
    writeDone(rec)
  }
}

/* ---------- 展示辅助 ---------- */

/** 「10月14日 · 周三」样式的日期标签 */
export function dayLabel(d = new Date()): string {
  const cn = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${cn.getMonth() + 1}月${cn.getDate()}日 · ${weekdays[cn.getDay()]}`
}
