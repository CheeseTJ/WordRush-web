/**
 * 官方免费课程（AMEPOnline）：澳洲内政部出资的成人移民英语计划。
 *
 * 设计约定（重要）：
 * - 这里只是「导航」，不是我们的课程内容。版权归 Department of Home Affairs，
 *   所以文案只描述「学完你能做什么」，不复制官方教材、不接管学习进度。
 * - 全部链接都指向官网首页：AMEPOnline 的等级分类页（course/index.php?categoryid=N）
 *   对访客不渲染课程列表，各级也没有稳定可分享的深链，写死 id 会随课程重建失效。
 *   指向首页是当前唯一长期有效的入口。
 * - 进度只能记「打开过」：官方把学习进度存在访客 cookie 里，我们读不到，
 *   因此不提供「已完成 / 进行中」这类我们无据可依的状态。
 */

export interface OfficialCourse {
  /** 稳定标识，用于 localStorage 记录 */
  id: string
  /** 轨道节点上显示的符号（等级数字；入籍不是「第 6 级」，用 ✓ 表示终点分支） */
  num: string
  /** 官方课程代号（原样展示，不做 CEFR 映射——AMEP 走 EAL 框架，不是 CEFR） */
  code: string
  /** 目标能力的中文陈述：用户记得住「能去银行开户」，记不住「Level 2」 */
  ability: string
}

export const AMEP_HOME = 'https://ameponline.homeaffairs.gov.au/'

export const OFFICIAL_COURSES: OfficialCourse[] = [
  { id: 'l1', num: '1', code: 'Level 1', ability: '能在超市问价、点一杯咖啡' },
  { id: 'l2', num: '2', code: 'Level 2', ability: '能去银行开户、约到医生' },
  { id: 'l3', num: '3', code: 'Level 3', ability: '能听懂面试官在问什么' },
  { id: 'l4', num: '4', code: 'Level 4', ability: '能看懂租房合同的关键条款' },
  { id: 'l5', num: '5', code: 'Level 5', ability: '能看懂新闻里的澳洲本地事' },
  { id: 'cit', num: '✓', code: 'Citizenship', ability: '能读懂入籍考试的题' },
]

/* ---------- 打开记录（仅本机，不上传） ---------- */

const VISITED_KEY = 'wordrush.crs.visited'

/** 打开过的课程 id 列表（读写失败一律降级为「未打开」，不阻塞页面） */
export function coursesVisited(): string[] {
  try {
    const raw = localStorage.getItem(VISITED_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function markCourseVisited(id: string): void {
  try {
    const cur = coursesVisited()
    if (cur.includes(id)) return
    localStorage.setItem(VISITED_KEY, JSON.stringify([...cur, id]))
  } catch {
    /* 隐私模式下不可写：忽略即可，不影响跳转 */
  }
}
