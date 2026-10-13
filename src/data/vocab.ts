/**
 * 词库加载体系：清单打进主包，词库正文按书懒加载（public/books/<id>.json，
 * SW CacheFirst 离线缓存）。加载后把全量词注册进 wordIndex，供答题/复习按 id 查找。
 *
 * id 约定：unit = <book>-ch<c>-u<k>，word = <book>-ch<c>-u<k>-w<i>，不同书天然隔离。
 */

import { BOOK_MANIFEST, type BookMeta } from './book-manifest'

export type { BookMeta }

export interface Word {
  id: string
  en: string
  zh: string
  pos: string
  /** 手编书的固定干扰项（转换书为空，运行时从同章动态生成） */
  fakes?: string[]
  ex?: string
  exZh?: string
}

export interface Unit {
  id: string
  title: string
  words: Word[]
}

export interface Chapter {
  id: string
  title: string
  en: string
  units: Unit[]
  /** 章内词数（不含切关细节） */
  wordCount: number
}

export interface LoadedBook {
  meta: BookMeta
  chapters: Chapter[]
  /** 全书关卡按顺序（每 10 词一关） */
  units: { unit: Unit; chapter: Chapter }[]
}

export const DEFAULT_BOOK = 'junior'
const BOOK_KEY = 'wordrush.book'

export const BOOKS: BookMeta[] = BOOK_MANIFEST

/** 当前词库 id（localStorage 持久化） */
export function currentBookId(): string {
  try {
    const v = localStorage.getItem(BOOK_KEY)
    if (v && BOOKS.some((b) => b.id === v)) return v
  } catch {
    /* 忽略 */
  }
  return DEFAULT_BOOK
}

export function setCurrentBookId(id: string): void {
  try {
    localStorage.setItem(BOOK_KEY, id)
  } catch {
    /* 忽略 */
  }
}

export function bookMeta(bookId: string): BookMeta {
  return BOOKS.find((b) => b.id === bookId) ?? BOOKS[0]
}

/* ==================== 懒加载与词索引 ==================== */

const PER_UNIT = 10

const loaded = new Map<string, LoadedBook>()
const loading = new Map<string, Promise<LoadedBook>>()
const wordIndex = new Map<string, Word & { unitId: string }>()
const unitIndex = new Map<string, Unit>()

/** 拉取并组装一本书：fetch JSON → 按 10 词切关 → 注册进全局索引 */
export function loadBook(bookId: string): Promise<LoadedBook> {
  const cached = loaded.get(bookId)
  if (cached) return Promise.resolve(cached)
  const inflight = loading.get(bookId)
  if (inflight) return inflight

  const p = (async () => {
    const meta = bookMeta(bookId)
    const res = await fetch(`/books/${bookId}.json`)
    if (!res.ok) throw new Error(`词库 ${bookId} 加载失败 ${res.status}`)
    const data = (await res.json()) as {
      chapters: {
        id: string
        title: string
        en: string
        words: { en: string; zh: string; pos?: string; fakes?: string[]; ex?: string; exZh?: string }[]
      }[]
    }

    const chapters: Chapter[] = []
    const units: LoadedBook['units'] = []

    for (const ch of data.chapters) {
      const chapter: Chapter = { id: ch.id, title: ch.title, en: ch.en, units: [], wordCount: ch.words.length }
      const unitCount = Math.ceil(ch.words.length / PER_UNIT)
      for (let u = 0; u < unitCount; u++) {
        const slice = ch.words.slice(u * PER_UNIT, (u + 1) * PER_UNIT)
        const unit: Unit = {
          id: `${bookId}-${ch.id.replace(`${bookId}-`, '')}-u${u + 1}`,
          title: `${chapter.title.replace(/^第 \d+ 章 · /, '')} ${u + 1}`,
          words: [],
        }
        slice.forEach((x, k) => {
          const word: Word & { unitId: string } = {
            id: `${unit.id}-w${k + 1}`,
            en: x.en,
            zh: x.zh,
            pos: x.pos ?? '',
            ...(x.fakes ? { fakes: x.fakes } : {}),
            ...(x.ex ? { ex: x.ex } : {}),
            ...(x.exZh ? { exZh: x.exZh } : {}),
            unitId: unit.id,
          }
          unit.words.push(word)
          wordIndex.set(word.id, word)
        })
        unitIndex.set(unit.id, unit)
        chapter.units.push(unit)
        units.push({ unit, chapter })
      }
      chapters.push(chapter)
    }

    const book: LoadedBook = { meta, chapters, units }
    loaded.set(bookId, book)
    return book
  })()

  loading.set(bookId, p)
  return p
}

/** 从已加载的书中按 id 找单词；miss 时自动加载所属书（id 前缀即书 id） */
export async function findWordAsync(id: string): Promise<Word | undefined> {
  const hit = wordIndex.get(id)
  if (hit) return hit
  const bookId = id.split('-')[0]
  if (!BOOKS.some((b) => b.id === bookId)) return undefined
  await loadBook(bookId).catch(() => undefined)
  return wordIndex.get(id)
}

/** 同步查找（仅命中已加载的书），供渲染路径使用 */
export function findUnitSync(id: string): Unit | undefined {
  return unitIndex.get(id)
}
