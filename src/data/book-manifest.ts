/**
 * 本文件由 scripts/build-books.mjs 生成（网络词库来源 qwerty-learner，MIT License；
 * cet4 / cet6 为手编书，由 scripts/extract-cet.mjs 生成）。
 * 只含轻量清单；词库正文在 public/books/<id>.json，由 vocab.ts 按需加载。请勿手工编辑。
 */
export interface BookMeta {
  id: string
  name: string
  en: string
  desc: string
  words: number
  units: number
  chapters: number
}

export const BOOK_MANIFEST: BookMeta[] = [
  {
    "id": "cet4",
    "name": "CET-4 核心词",
    "en": "CET-4",
    "desc": "大学英语四级 · 全书词库",
    "words": 2565,
    "units": 257,
    "chapters": 52
  },
  {
    "id": "cet6",
    "name": "CET-6 精选",
    "en": "CET-6",
    "desc": "大学英语六级 · 全书词库",
    "words": 2223,
    "units": 223,
    "chapters": 45
  },
  {
    "id": "gre",
    "name": "GRE 核心",
    "en": "GRE",
    "desc": "GRE3000 · 全书词库",
    "words": 3027,
    "units": 303,
    "chapters": 61
  },
  {
    "id": "ielts",
    "name": "雅思精选",
    "en": "IELTS",
    "desc": "雅思核心 · 全书词库",
    "words": 1984,
    "units": 199,
    "chapters": 40
  },
  {
    "id": "junior",
    "name": "初中核心词",
    "en": "JUNIOR",
    "desc": "人教版初中 7-9 年级 · 全书词库",
    "words": 1827,
    "units": 183,
    "chapters": 37
  },
  {
    "id": "kaoyan",
    "name": "考研红宝书",
    "en": "POSTGRAD",
    "desc": "2025 红宝书 · 全书词库",
    "words": 6326,
    "units": 633,
    "chapters": 127
  },
  {
    "id": "primary",
    "name": "小学基础词",
    "en": "PRIMARY",
    "desc": "人教版小学 3-6 年级 · 全书词库",
    "words": 593,
    "units": 60,
    "chapters": 12
  },
  {
    "id": "senior",
    "name": "高中进阶词",
    "en": "SENIOR",
    "desc": "人教版高中 · 全书词库",
    "words": 2906,
    "units": 291,
    "chapters": 59
  },
  {
    "id": "toefl",
    "name": "托福精选",
    "en": "TOEFL",
    "desc": "词以类记 · 全书词库",
    "words": 3393,
    "units": 340,
    "chapters": 68
  }
]
