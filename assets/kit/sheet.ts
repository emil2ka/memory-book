// Лист витрины в PNG через headless Chrome (dev-сервер на 5183 должен работать):
//   npx tsx assets/kit/sheet.ts 2          → assets/_raw/kit_sheets/pack2.png
//   npx tsx assets/kit/sheet.ts make /eval/make/models.json → assets/_raw/kit_sheets/make.png
//   npx tsx assets/kit/sheet.ts all --2d   → картинки assets/kit2d → assets/_raw/kit_sheets/svg_all.png
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const mode2d = argv.includes('--2d')
const [which = '1', src] = argv.filter((a) => a !== '--2d')
const packs = JSON.parse(readFileSync(join(here, 'packs.json'), 'utf8')) as Record<string, string[]>
let count: number
let query: string
if (mode2d) {
  const { readdirSync } = await import('node:fs')
  const svgs = readdirSync(join(here, '../kit2d')).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, ''))
  const inCat = which === 'all' ? null : new Set((JSON.parse(readFileSync(join(here, `${which}.json`), 'utf8')) as { id: string }[]).map((m) => m.id))
  count = svgs.filter((id) => !inCat || inCat.has(id)).length
  query = `mode=2d${which !== 'all' ? `&cat=${which}` : ''}`
} else if (src) {
  const list = JSON.parse(readFileSync(join(here, '../..', src), 'utf8'))
  count = (Array.isArray(list) ? list : list.models).length
  query = `src=${encodeURIComponent(src)}&cat=extra`
} else {
  count = packs[`pack${which}`]?.length ?? 0
  if (!count) throw new Error(`нет пачки ${which}`)
  query = `pack=${which}`
}
const rows = Math.ceil(count / 8)
const height = 48 + rows * 262
const out = join(here, '../_raw/kit_sheets', `${mode2d ? `svg_${which}` : src ? which : `pack${which}`}.png`)
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=1600,${height}`, '--virtual-time-budget=10000',
  `--screenshot=${out}`, `http://localhost:5183/?lab=kit&${query}&sheet=1`,
], { stdio: 'ignore' })
console.log(`${out} (${count} предметов, ${1600}×${height})`)
