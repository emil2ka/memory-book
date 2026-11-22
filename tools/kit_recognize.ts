// Ревизия библиотеки (13-plan-mechanics § 3.3): тест узнавания на каждом предмете кита.
//   1) листы пачек: npx tsx tools/kit_scene_sheet.ts packN rev_packN (dev-сервер 5191)
//   2) клетки без подписей: assets/_raw/kit_sheets/cells/<id>.png (300×282, человечек 64 px)
//   3) npx tsx tools/kit_recognize.ts [id,id…]  → assets/_raw/kit_sheets/recognize.json
// Haiku (eval/recognize.ts) смотрит клетку: «что держит человечек / что перед ним» → совпало ли с названием.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recognize } from '../eval/recognize'
import { KIT_LIBRARY } from '../src/kit/library'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// .env проекта важнее окружения оболочки (как в vite.config.ts: там может быть чужой ключ)
for (const line of (existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8') : '').split(/\r?\n/)) {
  const m = /^\s*(ANTHROPIC_API_KEY|DIRECTOR_BASE_URL)\s*=\s*(.*?)\s*$/.exec(line)
  if (m && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
// KIT_CELLS=cells_toy — клетки крупного плана в игрушечном масштабе (KIT_SHEET_QUERY='&hero=120&toy=1')
const set = process.env.KIT_CELLS ?? 'cells'
const cells = join(root, 'assets/_raw/kit_sheets', set)
const outFile = join(root, 'assets/_raw/kit_sheets', set === 'cells' ? 'recognize.json' : `recognize_${set}.json`)
const only = process.argv[2]?.split(',')
const items = KIT_LIBRARY.filter((m) => m.parts.length > 0 && (!only || only.includes(m.id)))
const prev: Record<string, unknown> = existsSync(outFile) && only ? JSON.parse(readFileSync(outFile, 'utf8')) : {}

/** Короткое имя для судьи: «кесе с чаем» → «кесе с чаем», «уличный фонарь» → как есть. */
const expectName = (m: (typeof items)[number]) => m.ru

const results: Record<string, { ru: string; scene?: string; ok: boolean; how: string; held: string; phrase: string; ms: number }> = {}
let i = 0
async function worker() {
  while (i < items.length) {
    const m = items[i++]
    const png = join(cells, `${m.id}.png`)
    if (!existsSync(png)) {
      console.log(`- ${m.id}: нет клетки`)
      continue
    }
    try {
      const r = await recognize(readFileSync(png).toString('base64'), { hero_prop: expectName(m) })
      results[m.id] = { ru: m.ru, scene: m.scene ?? m.hold, ok: r.match.prop, how: r.how.prop, held: r.seen.held, phrase: r.seen.phrase, ms: r.ms.see + r.ms.judge }
      console.log(`${r.match.prop ? '✓' : '✗'} ${m.id.padEnd(18)} ${m.ru} ← «${r.seen.held}» (${r.how.prop})`)
    } catch (e) {
      console.log(`! ${m.id}: ${(e as Error).message}`)
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()])
const all = { ...prev, ...results } as typeof results
writeFileSync(outFile, JSON.stringify(all, null, 1))
const vals = Object.values(all)
console.log(`\nузнано ${vals.filter((v) => v.ok).length}/${vals.length}`)
