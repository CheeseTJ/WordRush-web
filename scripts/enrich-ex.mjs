/**
 * 例句补齐：4000 Essential English Words 句库（qwerty-learner，MIT）→ public/books/*.json 的 ex 字段。
 *
 * 用法：node scripts/enrich-ex.mjs   （在 WordRush-web 目录下运行；也被 build-books.mjs 调用）
 * 句库缓存：/tmp/qwl_4000sent.json（缺失时自动下载）。
 * 只补英文例句（句库无中文译文，exZh 由后续内容生产补充）；已有 ex 的词不覆盖。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const PUBLIC_BOOKS = path.join(ROOT, 'public/books')
const SENT_FILE = '/tmp/qwl_4000sent.json'
const SENT_URL =
  'https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/4000_Essential_English_Words-sentence.json'

const MAX_EX_LEN = 200 // 与后端评测/合成上限对齐

async function ensureSentDict() {
  if (fs.existsSync(SENT_FILE) && fs.statSync(SENT_FILE).size > 100_000) return
  console.log('下载 4000 句库…')
  const res = await fetch(SENT_URL)
  if (!res.ok) throw new Error(`句库下载失败: ${res.status}`)
  fs.writeFileSync(SENT_FILE, Buffer.from(await res.arrayBuffer()))
}

/** word -> 英文例句 */
export async function buildExMap() {
  await ensureSentDict()
  const raw = JSON.parse(fs.readFileSync(SENT_FILE, 'utf8'))
  const map = new Map()
  for (const item of raw) {
    const w = (item.name || '').trim().toLowerCase()
    const s = (item.trans?.[0] || '').trim()
    if (!/^[a-z][a-z-]{1,19}$/.test(w) || !s || s.length > MAX_EX_LEN) continue
    if (!map.has(w)) map.set(w, s)
  }
  return map
}

/** 为 public/books/*.json 补 ex（就地更新；已有 ex 不覆盖） */
export function enrichAllEx(exMap) {
  let hit = 0
  for (const f of fs.readdirSync(PUBLIC_BOOKS).sort()) {
    if (!f.endsWith('.json')) continue
    const file = path.join(PUBLIC_BOOKS, f)
    const book = JSON.parse(fs.readFileSync(file, 'utf8'))
    let bookHit = 0
    for (const ch of book.chapters) {
      for (const w of ch.words) {
        if (w.ex) continue
        const s = exMap.get(w.en.toLowerCase())
        if (s) {
          w.ex = s
          bookHit++
        }
      }
    }
    if (bookHit) {
      fs.writeFileSync(file, JSON.stringify(book))
      console.log(`  ${book.id}: +${bookHit} 例句`)
    }
    hit += bookHit
  }
  console.log(`enrich-ex: 共补 ${hit} 条例句`)
}

// 直接执行：node scripts/enrich-ex.mjs
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  enrichAllEx(await buildExMap())
}
