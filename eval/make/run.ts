// Прогон дорисовки: npx tsx eval/make/run.ts [--only самокат,глобус]
// Каждое слово — 1–2 реальных вызова claude-haiku-5-5 (повтор, если проверка не прошла).
// Пишет eval/make/results.json (метрики) и eval/make/models.json (картинки для витрины ?lab=kit&mode=2d&src=/eval/make/models.json).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAKE_MODEL, MakeError, runMake, type MakeInput } from '../../api/make'
import { findByWord } from '../../src/kit/library'
import type { KitPicture } from '../../src/kit/svg'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch { /* нет .env */ }

const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const timeoutMs = args.includes('--timeout') ? Number(args[args.indexOf('--timeout') + 1]) : undefined
const words = (JSON.parse(readFileSync(join(here, 'words.json'), 'utf8')) as MakeInput[]).filter((w) => !only || only.includes(w.name))

interface Row { name: string; ok: boolean; id?: string; latencyMs: number; attempts?: number; parts?: number; firstErrors?: string[]; error?: string; errors?: string[]; inLibrary?: string | null; output?: number }
const rows: Row[] = []
const models: KitPicture[] = []
for (const w of words) {
  const t0 = Date.now()
  try {
    const r = await runMake(w, { timeoutMs })
    rows.push({ name: w.name, ok: true, id: r.model.id, latencyMs: r.latencyMs, attempts: r.attempts, parts: (r.model.svg.match(/<(path|rect|circle|ellipse|polygon|polyline|line)\b/g) ?? []).length, firstErrors: r.firstErrors, inLibrary: findByWord(w.name)?.id ?? null, output: r.usage.output })
    models.push(r.model)
    console.log(`✓ ${w.name} → ${r.model.id}: ${r.model.svg.length} знаков, ${r.latencyMs} мс, попыток ${r.attempts}, вывод ${r.usage.output} ток.`)
  } catch (e) {
    const err = e instanceof MakeError ? e : null
    rows.push({ name: w.name, ok: false, latencyMs: Date.now() - t0, error: err?.code ?? String(e), errors: err?.errors })
    console.log(`✗ ${w.name}: ${err?.code ?? e} ${err?.message ?? ""} ${err?.errors?.slice(0, 3).join('; ') ?? ''}`)
  }
}
const lat = rows.filter((r) => r.ok).map((r) => r.latencyMs).sort((a, b) => a - b)
const summary = {
  model: MAKE_MODEL,
  total: rows.length,
  ok: rows.filter((r) => r.ok).length,
  firstTry: rows.filter((r) => r.ok && r.attempts === 1).length,
  medianMs: lat[Math.floor(lat.length / 2)] ?? null,
  maxMs: lat[lat.length - 1] ?? null,
}
console.log(summary)
if (!only) {
  writeFileSync(join(here, 'results.json'), JSON.stringify({ summary, rows }, null, 1) + '\n')
  writeFileSync(join(here, 'models.json'), JSON.stringify(models, null, 1) + '\n')
} else {
  writeFileSync(join(here, 'results.partial.json'), JSON.stringify({ summary, rows, models }, null, 1) + '\n')
}
