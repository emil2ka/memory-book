// world_pack.mjs — модели мира из Claude Design → assets/models/world/*.glb (сжатые).
// 1) JSON {"id": "<base64 glb>", ...} из буфера обмена (pbpaste) или из файла: node tools/world_pack.mjs [file.json] [--only a,b]
// 2) исходники → assets/_raw/world/<id>.glb
// 3) gltf-transform: текстуры до 1024 → WebP, геометрия → meshopt. Пустые узлы-слоты сохраняются (prune/flatten/join не делаем).
// 4) проверка: размер файла (до 300 КБ), загрузка three.js (tools/load_glb_three.mjs).
// Пакеты: npx -y @gltf-transform/cli@4.5.1 (или GT=/путь/к/gltf-transform).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'assets/_raw/world')
const OUT = join(ROOT, 'assets/models/world')
const TMP = join(RAW, '.tmp')
const LIMIT_KB = 300
/** Люди тяжелее вещей: до 1.2 МБ после сжатия. */
const LIMIT_BY_ID = { boy: 1200, girl: 1200 }

const args = process.argv.slice(2)
const onlyIdx = args.indexOf('--only')
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null
const maxTex = Number(args[args.indexOf('--tex') + 1]) || 1024
const quality = Number(args[args.indexOf('--q') + 1]) || 82
const src = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only' && args[i - 1] !== '--tex' && args[i - 1] !== '--q')
const text = src ? readFileSync(src, 'utf8') : execFileSync('pbpaste', { maxBuffer: 1 << 30 }).toString('utf8')
let data
try {
  data = JSON.parse(text.trim())
} catch {
  console.error('буфер обмена не JSON: нажми COPY ALL · JSON в Claude Design')
  process.exit(1)
}

const gt = (cmd) => {
  const bin = process.env.GT
  if (bin) execFileSync(bin, cmd, { stdio: 'pipe' })
  else execFileSync('npx', ['-y', '@gltf-transform/cli@4.5.1', ...cmd], { stdio: 'pipe' })
}

mkdirSync(RAW, { recursive: true })
mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })
let bad = 0
for (const [id, b64] of Object.entries(data)) {
  if (only && !only.has(id)) continue
  if (typeof b64 !== 'string' || b64.length < 100) {
    console.log(`${id}: пусто`)
    bad++
    continue
  }
  const raw = join(RAW, `${id}.glb`)
  const buf = Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64')
  if (buf.readUInt32LE(0) !== 0x46546c67) {
    console.log(`${id}: не GLB`)
    bad++
    continue
  }
  writeFileSync(raw, buf)
  const a = join(TMP, `${id}.a.glb`)
  const b = join(TMP, `${id}.b.glb`)
  const out = join(OUT, `${id}.glb`)
  gt(['resize', raw, a, '--width', String(maxTex), '--height', String(maxTex)])
  gt(['webp', a, b, '--quality', String(quality)])
  gt(['meshopt', b, out, '--level', 'medium'])
  const kb = statSync(out).size / 1024
  let load = ''
  try {
    load = execFileSync('node', [join(ROOT, 'tools/load_glb_three.mjs'), out], { stdio: 'pipe' }).toString()
  } catch (e) {
    load = String(e.stdout ?? e)
  }
  const ok = /RESULT LOAD OK/.test(load)
  const tris = (load.match(/(\d+) triangles/) ?? [])[1] ?? '?'
  const limit = LIMIT_BY_ID[id] ?? LIMIT_KB
  console.log(`${id}: ${(buf.length / 1024).toFixed(0)} КБ → ${kb.toFixed(0)} КБ${kb > limit ? ` (БОЛЬШЕ ${limit})` : ''}, треугольников ${tris}, three.js ${ok ? 'ok' : 'ОШИБКА'}`)
  if (!ok || kb > limit) bad++
}
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true })
process.exit(bad ? 2 : 0)
