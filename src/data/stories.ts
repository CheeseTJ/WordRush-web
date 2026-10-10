/**
 * 情景对话（Stories，迭代四）：脚本在 public/stories/<chapterId>.json，
 * index.json 列出已上线的章节（内容生产是渐进的，未上线的章不出入口）。
 */

export interface StoryQuiz {
  answer: string
  opts: string[]
}

export interface StoryLine {
  name: string
  emoji: string
  en: string
  zh: string
  /** 本行接触的目标词（chapter 内的单词，结算时映射为 word id 记正误） */
  word?: string
  /** 挖空选择题：en 中以 ___ 占位 */
  quiz?: StoryQuiz
}

export interface StoryScript {
  id: string
  chapter: string
  title: string
  emoji: string
  scene: string
  lines: StoryLine[]
}

let indexPromise: Promise<Set<string>> | null = null

/** 已上线情景对话的章节 id 集合（只拉一次 index.json） */
export function availableStories(): Promise<Set<string>> {
  if (!indexPromise) {
    indexPromise = (async () => {
      try {
        const res = await fetch('/stories/index.json')
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { stories: string[] }
        return new Set(data.stories)
      } catch {
        return new Set<string>()
      }
    })()
  }
  return indexPromise
}

/** 拉取一章的情景脚本；不存在或损坏返回 null */
export async function loadStory(chapterId: string): Promise<StoryScript | null> {
  try {
    const res = await fetch(`/stories/${chapterId}.json`)
    if (!res.ok) return null
    return (await res.json()) as StoryScript
  } catch {
    return null
  }
}
