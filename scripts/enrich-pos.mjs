/**
 * 词性补齐：用 ECDICT（skywind3000/ECDICT，MIT）为 public/books/*.json 的每个词补 pos 字段。
 *
 * 用法：node scripts/enrich-pos.mjs   （在 WordRush-web 目录下运行）
 * 词典缓存：/tmp/ecdict.csv（缺失时自动下载，约 66MB，一次即可）
 *
 * 提取规则：一个词有多个义项、多个词性——逐行扫 definition/translation 的行首词性标记
 * （"v. postpone..." / "n. 取消"），按出现频次取前 3 个，vt/vi/aux 归并为 v。
 * 输出格式如 "n"、"v/adj"、"n/v/adj"（供 UI 徽标展示）。
 * 也被 build-books.mjs 在重新生成词库后调用，保证重建不丢词性。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const PUBLIC_BOOKS = path.join(ROOT, 'public/books')
const ECDICT = '/tmp/ecdict.csv'
const ECDICT_URL = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv'

/** 词性标签归并到展示用短名（vt/vi/aux 并入 v） */
const POS_MAP = {
  n: 'n', v: 'v', vt: 'v', vi: 'v', aux: 'v', modal: 'v',
  adj: 'adj', adv: 'adv', prep: 'prep', conj: 'conj',
  pron: 'pron', art: 'art', num: 'num', int: 'int',
}

const POS_LINE_RE = /^(n|v|vt|vi|aux|modal|adj|adv|prep|conj|pron|art|num|int)\s*[.．、]/i

/** 从 definition/translation 提取词性：行首标记按出现频次排序，最多 3 个 */
function posDisplay(...texts) {
  const count = new Map()
  for (const text of texts) {
    if (!text) continue
    for (const line of String(text).split(/\\n|\n|\[网络\]/)) {
      const m = POS_LINE_RE.exec(line.trim())
      if (!m) continue
      const tag = POS_MAP[m[1].toLowerCase()]
      if (!tag) continue
      count.set(tag, (count.get(tag) ?? 0) + 1)
    }
  }
  if (!count.size) return ''
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t)
    .join('/')
}

/** RFC4180 迷你解析：处理引号内的逗号/转义引号 */
function parseCsvLine(line) {
  const fields = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue }
      if (ch === '"') { inQuote = false; continue }
      cur += ch; continue
    }
    if (ch === '"') { inQuote = true; continue }
    if (ch === ',') { fields.push(cur); cur = ''; continue }
    cur += ch
  }
  fields.push(cur)
  return fields
}

async function ensureDict() {
  if (fs.existsSync(ECDICT) && fs.statSync(ECDICT).size > 10_000_000) return
  console.log('下载 ECDICT 词典（约 66MB，一次即可）…')
  const res = await fetch(ECDICT_URL)
  if (!res.ok) throw new Error(`ECDICT 下载失败: ${res.status}`)
  fs.writeFileSync(ECDICT, Buffer.from(await res.arrayBuffer()))
}

/** 建 word -> pos 映射（definition(3) / translation(4) 的行首词性标记） */
function buildPosMap() {
  const map = new Map()
  const lines = fs.readFileSync(ECDICT, 'utf8').split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    let word, defn, trans
    if (!line.includes('"')) {
      const f = line.split(',')
      if (f.length < 5) continue
      ;[word, , defn, trans] = f
    } else {
      const f = parseCsvLine(line)
      if (f.length < 5) continue
      ;[word, , defn, trans] = f
    }
    const p = posDisplay(defn, trans)
    if (p) map.set(word.toLowerCase(), p)
  }
  return map
}

/** 为 public/books/*.json 补 pos（就地更新，词典未收录的不加字段） */
export function enrichAll(posMap) {
  let hit = 0
  let miss = 0
  for (const f of fs.readdirSync(PUBLIC_BOOKS).sort()) {
    if (!f.endsWith('.json')) continue
    const file = path.join(PUBLIC_BOOKS, f)
    const book = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const ch of book.chapters) {
      for (const w of ch.words) {
        const p = posMap.get(w.en.toLowerCase())
        if (p) { w.pos = p; hit++ } else { miss++ }
      }
    }
    fs.writeFileSync(file, JSON.stringify(book))
  }
  console.log(`enrich: ${hit} 词命中 / ${miss} 词未命中`)
}

export async function ensurePosMap() {
  await ensureDict()
  return buildPosMap()
}

// 直接执行：node scripts/enrich-pos.mjs
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const map = await ensurePosMap()
  enrichAll(map)
}
