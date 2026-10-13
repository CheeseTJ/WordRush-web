/**
 * 词库转换脚本：qwerty-learner（MIT）开放词库 → WordRush 全量词库文件。
 *
 * 用法：node scripts/build-books.mjs   （在 WordRush-web 目录下运行）
 *
 * 输出：
 *  1. public/books/<id>.json      每书一个完整词库文件（按需 fetch + SW 离线缓存）
 *  2. src/data/book-manifest.ts   轻量清单（书名/描述/章数/关数），扫描 public/books 生成
 *
 * 切分规则：每章 50 词（5 关 × 10 词）。干扰项不落盘，答题时运行时从同章动态抽取。
 * cet4 / cet6 为手编书（带例句），由 scripts/extract-cet.mjs 生成，这里只负责纳入清单。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const PUBLIC_BOOKS = path.join(ROOT, 'public/books')

const SOURCES = [
  { id: 'primary', name: '小学基础词', en: 'PRIMARY', desc: '人教版小学 3-6 年级 · 全书词库', parts: [
    { file: '/tmp/qwl_PEPXiaoXue3_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue3_1_T.json' },
    { file: '/tmp/qwl_PEPXiaoXue3_2_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue3_2_T.json' },
    { file: '/tmp/qwl_PEPXiaoXue4_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue4_1_T.json' },
    { file: '/tmp/qwl_PEPXiaoXue4_2_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue4_2_T.json' },
    { file: '/tmp/qwl_PEPXiaoXue5_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue5_1_T.json' },
    { file: '/tmp/qwl_PEPXiaoXue5_2_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue5_2_T.json' },
    { file: '/tmp/qwl_PEPXiaoXue6_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue6_1_T.json' },
    { file: '/tmp/qwl_PEPXiaoXue6_2_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPXiaoXue6_2_T.json' },
  ] },
  { id: 'junior', name: '初中核心词', en: 'JUNIOR', desc: '人教版初中 7-9 年级 · 全书词库', parts: [
    { file: '/tmp/qwl_PEPChuZhong7_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPChuZhong7_1_T.json' },
    { file: '/tmp/qwl_PEPChuZhong7_2_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPChuZhong7_2_T.json' },
    { file: '/tmp/qwl_PEPChuZhong8_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPChuZhong8_1_T.json' },
    { file: '/tmp/qwl_PEPChuZhong8_2_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPChuZhong8_2_T.json' },
    { file: '/tmp/qwl_PEPChuZhong9_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPChuZhong9_1_T.json' },
  ] },
  { id: 'senior', name: '高中进阶词', en: 'SENIOR', desc: '人教版高中 · 全书词库', parts: [
    { file: '/tmp/qwl_PEPGaoZhong_1_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_1_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_2_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_2_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_3_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_3_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_4_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_4_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_5_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_5_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_6_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_6_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_7_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_7_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_8_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_8_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_9_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_9_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_10_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_10_T.json' },
    { file: '/tmp/qwl_PEPGaoZhong_11_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/PEPGaoZhong_11_T.json' },
  ] },
  { id: 'cet4', name: 'CET-4 核心词', en: 'CET-4', desc: '大学英语四级 · 全书词库', parts: [
    { file: '/tmp/qwl_CET4_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/CET4_T.json' },
  ] },
  { id: 'cet6', name: 'CET-6 精选', en: 'CET-6', desc: '大学英语六级 · 全书词库', parts: [
    { file: '/tmp/qwl_CET6_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/CET6_T.json' },
  ] },
  { id: 'toefl', name: '托福精选', en: 'TOEFL', desc: '词以类记 · 全书词库', parts: [
    { file: '/tmp/qwl_Categorized_TOEFL_Vocabulary_by_Zhanghongyan.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/Categorized_TOEFL_Vocabulary_by_Zhanghongyan.json' },
  ] },
  { id: 'ielts', name: '雅思精选', en: 'IELTS', desc: '雅思核心 · 全书词库', parts: [
    { file: '/tmp/qwl_DuckCircle_IELTS.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/DuckCircle_IELTS.json' },
  ] },
  { id: 'gre', name: 'GRE 核心', en: 'GRE', desc: 'GRE3000 · 全书词库', parts: [
    { file: '/tmp/qwl_GRE3000_3_T.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/GRE3000_3_T.json' },
  ] },
  { id: 'kaoyan', name: '考研红宝书', en: 'POSTGRAD', desc: '2025 红宝书 · 全书词库', parts: [
    { file: '/tmp/qwl_2025KaoYanHongBaoShu.json', url: 'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/2025KaoYanHongBaoShu.json' },
  ] },
]

const PER_UNIT = 10 // 每关词数
const PER_CHAPTER = 50 // 每章词数（5 关）

/** 从 trans 数组里挑第一条像样的中文释义，去掉词性/助记前缀 */
function pickZh(trans) {
  if (!Array.isArray(trans)) return ''
  for (const raw of trans) {
    if (typeof raw !== 'string') continue
    if (/^[\d.\s]*$/.test(raw)) continue
    if (raw.includes('【记】') || raw.includes('【例】') || raw.includes('【考】')) continue
    if (!/[\u4e00-\u9fff]/.test(raw)) continue
    const s = raw
      .replace(/^[a-z]+\s*[．.、]\s*/i, '')
      .replace(/^[（(][^）)]*[)）]\s*/, '')
      .replace(/【[^】]*】/g, '')
      .trim()
    if (s.length >= 2 && s.length <= 30) return s
  }
  return ''
}

function convert(src) {
  const clean = []
  const seen = new Set()
  for (const part of src.parts) {
    const raw = JSON.parse(fs.readFileSync(part.file, 'utf8'))
    for (const item of raw) {
      const en = (item.name || '').trim().toLowerCase()
      if (!/^[a-z][a-z-]{1,19}$/.test(en) || seen.has(en)) continue
      const zh = pickZh(item.trans)
      if (!zh) continue
      seen.add(en)
      clean.push([en, zh])
    }
  }

  const chapters = []
  const chapterCount = Math.ceil(clean.length / PER_CHAPTER)
  for (let c = 0; c < chapterCount; c++) {
    const slice = clean.slice(c * PER_CHAPTER, (c + 1) * PER_CHAPTER)
    chapters.push({
      id: `${src.id}-ch${c + 1}`,
      title: `第 ${c + 1} 章`,
      en: `PART ${c + 1}`,
      words: slice.map(([en, zh]) => ({ en, zh })),
    })
  }

  const file = path.join(PUBLIC_BOOKS, `${src.id}.json`)
  fs.writeFileSync(file, JSON.stringify({ id: src.id, chapters }))
  console.log(`${src.id}: ${clean.length} 词 / ${chapterCount} 章`)
}

function buildManifest() {
  const manifest = []
  for (const f of fs.readdirSync(PUBLIC_BOOKS).sort()) {
    if (!f.endsWith('.json')) continue
    const book = JSON.parse(fs.readFileSync(path.join(PUBLIC_BOOKS, f), 'utf8'))
    const meta = SOURCES.find((s) => s.id === book.id)
    const units = book.chapters.reduce((a, ch) => a + Math.ceil(ch.words.length / PER_UNIT), 0)
    const words = book.chapters.reduce((a, ch) => a + ch.words.length, 0)
    manifest.push({
      id: book.id,
      name: meta?.name ?? book.id.toUpperCase(),
      en: meta?.en ?? book.id.toUpperCase(),
      desc: meta?.desc ?? `${book.chapters.length} 章 · ${words} 词`,
      words,
      units,
      chapters: book.chapters.length,
    })
  }
  return manifest
}

async function main() {
  fs.mkdirSync(PUBLIC_BOOKS, { recursive: true })

  for (const src of SOURCES) {
    // 源文件缺失时自动从上游重新下载，保证脚本可重复执行
    for (const part of src.parts) {
      if (fs.existsSync(part.file)) continue
      try {
        const res = await fetch(part.url)
        if (!res.ok) throw new Error(String(res.status))
        fs.writeFileSync(part.file, Buffer.from(await res.arrayBuffer()))
        console.log(`downloaded: ${part.file}`)
      } catch (e) {
        console.warn(`跳过（下载失败）: ${src.id} ${part.file}`, e)
      }
    }
    if (!src.parts.every((p) => fs.existsSync(p.file))) continue
    convert(src)
  }

  // cet4/cet6 为手编书不走 convert；词性统一由 enrich-pos.mjs 就地补齐
  const { ensurePosMap, enrichAll } = await import('./enrich-pos.mjs')
  enrichAll(await ensurePosMap())

  // 例句统一由 enrich-ex.mjs 就地补齐（重建不丢例句）
  const { enrichAllEx, buildExMap } = await import('./enrich-ex.mjs')
  enrichAllEx(await buildExMap())

  const manifest = buildManifest()
  const out = `/**
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

export const BOOK_MANIFEST: BookMeta[] = ${JSON.stringify(manifest, null, 2)}
`
  const dest = path.join(ROOT, 'src/data/book-manifest.ts')
  fs.writeFileSync(dest, out)
  for (const m of manifest) console.log(`manifest: ${m.id} ${m.words} 词 / ${m.units} 关 / ${m.chapters} 章`)
  console.log('written:', dest)
}

await main()
