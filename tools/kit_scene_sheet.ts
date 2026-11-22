// Лист 3D-кита для сценок в пиксельном слое рядом с человечком (src/lab/KitSceneLab.tsx) → PNG.
//   npx tsx tools/kit_scene_sheet.ts pack5            → assets/_raw/kit_sheets/scene_pack5.png
//   npx tsx tools/kit_scene_sheet.ts ice_cream,cocoa hand_check
// Нужен dev-сервер (по умолчанию http://localhost:5191, другой — KIT_SHEET_HOST).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const [which = 'pack1', name] = process.argv.slice(2)
const host = process.env.KIT_SHEET_HOST ?? 'http://localhost:5191'
const packs = JSON.parse(readFileSync(join(root, 'assets/kit/packs.json'), 'utf8')) as Record<string, string[]>
const count = /^pack\d+$/.test(which) ? (packs[which]?.length ?? 0) : which.split(',').length
if (!count) throw new Error(`нет предметов: ${which}`)
const COLS = 5
const width = COLS * 300
const height = Math.ceil(count / COLS) * 330
const out = join(root, 'assets/_raw/kit_sheets', `${name ?? `scene_${which}`}.png`)
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${width},${height}`, '--virtual-time-budget=15000',
  `--screenshot=${out}`, `${host}/?lab=world&kitscene=${encodeURIComponent(which)}&sheet=1`,
], { stdio: 'ignore' })
console.log(`${out} (${count} предметов, ${width}×${height})`)
