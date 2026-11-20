// Оценка режиссёра: npx tsx eval/run.ts [--only id1,id2] [--effort low|medium|high]
// Каждый пункт = ОДИН реальный вызов LLM. Модель — DIRECTOR_MODEL или claude-haiku-5-5.
// Метрики считаются по СЫРОМУ ответу модели (до страховки), плюс итог после validateScript.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, crc32 } from 'node:zlib'
import type { DayScript, DirectorInput } from '../src/types/script'
import { checkScript } from '../src/director/validate'
import { ids } from '../src/director/schema'
import { choreograph } from '../src/timeline/choreograph'
import { DEFAULT_MODEL, runDirector } from '../api/direct'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// .env → process.env, .env важнее окружения оболочки (значения не печатаются)
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch { /* нет .env */ }

interface Story {
  id: string
  lang: string
  expectContradiction: boolean
  text: string
  song: DirectorInput['song']
  photo?: 'amber'
}

/** Синтетическое фото 64×48: тёплый градиент (своё, не чужое), чтобы проверить путь с картинкой. */
function amberPng(): string {
  const w = 64, h = 48
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = 230 - y
      raw[o + 1] = 150 + (x >> 1) - y
      raw[o + 2] = 40 + (y >> 1)
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  return 'data:image/png;base64,' + png.toString('base64')
}

const args = process.argv.slice(2)
const argVal = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const only = argVal('--only')?.split(',')
const effort = argVal('--effort') as 'low' | 'medium' | 'high' | undefined
const outFile = argVal('--out') ?? join(here, 'results.json')

const stories = (JSON.parse(readFileSync(join(here, 'stories.json'), 'utf8')) as Story[]).filter((s) => !only || only.includes(s.id))
const model = process.env.DIRECTOR_MODEL || DEFAULT_MODEL
if (model !== 'claude-haiku-5-5') console.warn(`ВНИМАНИЕ: модель ${model}, а правило проекта — claude-haiku-5-5`)
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Нет ANTHROPIC_API_KEY (.env)')
  process.exit(1)
}

const RESULT_LISTS: Record<string, string[]> = { popup: ids.popups, item: ids.items, effect: ids.effects, person: ids.persons, crystal: ['crystal'] }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

interface Row {
  id: string
  ok: boolean
  error?: string
  schemaOk: boolean
  quotesExact: string
  idsOk: boolean
  beats: number
  variety: boolean
  distinctActions: number
  contradiction: string
  latencyS: number
  cacheRead: number
  title: string
  fixes: number
  filmS: number
}

const rows: Row[] = []
const details: unknown[] = []
let calls = 0

for (const s of stories) {
  const input: DirectorInput = { text: s.text, photos: s.photo ? [amberPng()] : [], song: s.song }
  calls++
  const t0 = Date.now()
  try {
    const run = await runDirector(input, { model, effort })
    const raw = run.raw as DayScript
    const rawBeats = Array.isArray(raw?.beats) ? raw.beats : []
    const exact = rawBeats.filter((b) => isObj(b) && typeof b.quote === 'string' && s.text.includes(b.quote)).length
    const idsOk = rawBeats.every((b) =>
      isObj(b) && ids.actions.includes(b.action) && ids.cameras.includes(b.camera) && (b.effect === null || ids.sceneEffects.includes(b.effect)) &&
      !!RESULT_LISTS[b.result?.kind]?.includes(b.result?.id)) &&
      ids.places.includes(raw.place) && (!raw.contradiction || ids.stagings.includes(raw.contradiction.staging))
    const acts = rawBeats.map((b) => b.action)
    let variety = true
    for (let i = 2; i < acts.length; i++) if (acts[i] === acts[i - 1] && acts[i] === acts[i - 2]) variety = false
    const schemaErrs = checkScript(raw, s.text)
    const hasC = !!raw?.contradiction
    const film = choreograph(run.script, { seed: 1 })
    rows.push({
      id: s.id,
      ok: true,
      schemaOk: schemaErrs.length === 0,
      quotesExact: `${exact}/${rawBeats.length}`,
      idsOk,
      beats: rawBeats.length,
      variety,
      distinctActions: new Set(acts).size,
      contradiction: s.expectContradiction ? (hasC ? 'да ✓' : 'нет ✗') : hasC ? 'да (не ждали)' : 'нет ✓',
      latencyS: Math.round(run.latencyMs / 100) / 10,
      cacheRead: run.usage.cacheRead,
      title: run.script.title,
      fixes: run.issues.length,
      filmS: film.duration,
    })
    details.push({ id: s.id, latencyMs: run.latencyMs, usage: run.usage, model: run.model, schemaErrors: schemaErrs, issues: run.issues, raw: run.raw, script: run.script })
  } catch (e) {
    const msg = e instanceof Error ? `${(e as { code?: string }).code ?? e.name}: ${e.message}` : String(e)
    rows.push({ id: s.id, ok: false, error: msg, schemaOk: false, quotesExact: '-', idsOk: false, beats: 0, variety: false, distinctActions: 0, contradiction: '-', latencyS: Math.round((Date.now() - t0) / 100) / 10, cacheRead: 0, title: '', fixes: 0, filmS: 0 })
    details.push({ id: s.id, error: msg })
  }
  const r = rows[rows.length - 1]
  console.log(`${r.ok ? '✓' : '✗'} ${s.id} ${r.latencyS}s ${r.error ?? r.title}`)
}

// ---- таблица ----
const yes = (b: boolean) => (b ? '✓' : '✗')
const header = ['id', 'JSON', 'схема', 'цитаты', 'id', 'битов', 'разнообр.', 'действий', 'противоречие', 'сек', 'кеш', 'правок', 'фильм', 'название']
const table = rows.map((r) => [r.id, yes(r.ok), yes(r.schemaOk), r.quotesExact, yes(r.idsOk), String(r.beats), yes(r.variety), String(r.distinctActions), r.contradiction, r.latencyS.toFixed(1), String(r.cacheRead), String(r.fixes), r.filmS ? r.filmS.toFixed(0) + 'с' : '-', r.title || r.error || ''])
const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)))
const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |'
console.log('\n' + line(header))
console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|')
for (const row of table) console.log(line(row))

const ok = rows.filter((r) => r.ok)
const totalQ = ok.reduce((s, r) => s + Number(r.quotesExact.split('/')[1]), 0)
const exactQ = ok.reduce((s, r) => s + Number(r.quotesExact.split('/')[0]), 0)
const expC = rows.filter((r, i) => stories[i].expectContradiction && r.ok)
const lat = ok.map((r) => r.latencyS).sort((a, b) => a - b)
const summary = {
  model,
  effort: effort ?? process.env.DIRECTOR_EFFORT ?? 'low',
  calls,
  validJson: `${ok.length}/${rows.length}`,
  schemaValidRaw: `${ok.filter((r) => r.schemaOk).length}/${rows.length}`,
  quotesExact: `${exactQ}/${totalQ}`,
  idsInCatalog: `${ok.filter((r) => r.idsOk).length}/${rows.length}`,
  beatsIn4to7: `${ok.filter((r) => r.beats >= 4 && r.beats <= 7).length}/${rows.length}`,
  actionVariety: `${ok.filter((r) => r.variety).length}/${rows.length}`,
  contradictionWhenExpected: `${expC.filter((r) => r.contradiction.startsWith('да')).length}/${expC.length}`,
  latencyMedianS: lat.length ? lat[Math.floor(lat.length / 2)] : null,
  latencyMaxS: lat.length ? lat[lat.length - 1] : null,
  over20s: ok.filter((r) => r.latencyS > 20).length,
}
console.log('\nИтог:', summary)
writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), summary, rows, details }, null, 2))
console.log(`Сохранено: ${outFile}`)
