// Прогон сценок (POST /api/scene → runScene) на фразах: все биты трёх демо-дней + 10 бытовых + 3 казахских.
// Пишет eval/scene/results.json (метрики) и eval/scene/scenes.json (формат __dev.showScenes, как eval/haiku-scene).
//   npx tsx eval/scene/run.ts                  — все фразы, effort low
//   npx tsx eval/scene/run.ts --effort medium --only 10 --out medium
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sceneRef } from '../../src/kit/sceneCheck'
import type { KitScene, SceneObject } from '../../src/kit/scene'
import type { DayScript } from '../../src/types/script'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch {
  /* нет .env */
}
const { runScene } = await import('../../api/scene')

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const effort = (arg('effort') as 'low' | 'medium' | undefined) ?? 'low'
const only = Number(arg('only') ?? 0)
const outName = arg('out') ?? ''

interface Phrase {
  quote: string
  day: string
  hint?: string
  set: 'demo' | 'own' | 'kz'
}

const phrases: Phrase[] = []
for (const n of [1, 2, 3]) {
  const script = JSON.parse(readFileSync(join(root, `src/timeline/samples/day${n}.json`), 'utf8')) as DayScript
  const text = readFileSync(join(root, `src/timeline/samples/day${n}.txt`), 'utf8')
  for (const b of script.beats) {
    const r = b.result as { kind: string; id?: string }
    const hint = r.kind === 'effect' ? `эффект «${r.id}»` : r.kind === 'person' ? 'второй человек рядом' : r.id
    phrases.push({ quote: b.quote, day: text.slice(0, 600), hint, set: 'demo' })
  }
}
const OWN = [
  'Купил мороженое в парке',
  'Катался на самокате до вечера',
  'Ждал автобус под дождём',
  'Мама испекла блины на завтрак',
  'Весь вечер играл с котом',
  'Читал книгу на скамейке у фонтана',
  'Опоздал на урок и бежал по лестнице',
  'Купил шарики на день рождения сестры',
  'Поливал цветы на балконе',
  'Сдал экзамен и прыгал от радости',
]
const KZ = ['Әжемнің үйінде бауырсақ жедік', 'Таңертең қар жауды, аула аппақ', 'Досыммен домбыра тарттық']
for (const q of OWN) phrases.push({ quote: q, day: q, set: 'own' })
for (const q of KZ) phrases.push({ quote: q, day: q, set: 'kz' })
const list = only ? phrases.slice(0, only) : phrases

interface Row {
  quote: string
  set: Phrase['set']
  ok: boolean
  latencyMs: number
  attempts: number
  refs: number
  models: number
  action?: string
  objects?: string[]
  firstErrors: string[]
  error?: string
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  scene?: KitScene
}

async function one(p: Phrase): Promise<Row> {
  const t0 = Date.now()
  try {
    const r = await runScene({ quote: p.quote, day: p.day, ...(p.hint ? { hint: p.hint } : {}) }, { effort })
    return {
      quote: p.quote,
      set: p.set,
      ok: true,
      latencyMs: r.latencyMs,
      attempts: r.attempts,
      refs: r.refs,
      models: r.models,
      action: r.scene.action,
      objects: r.scene.objects.map((o) => `${o.role}:${o.ref ? `ref ${o.ref}` : `model ${o.ru} (${o.model?.parts.length})`}`),
      firstErrors: r.firstErrors,
      usage: r.usage,
      scene: r.scene,
    }
  } catch (e) {
    const err = e as { code?: string; message?: string; errors?: string[] }
    return { quote: p.quote, set: p.set, ok: false, latencyMs: Date.now() - t0, attempts: 0, refs: 0, models: 0, firstErrors: err.errors ?? [], error: `${err.code ?? 'error'}: ${err.message ?? String(e)}` }
  }
}

// по 4 запроса одновременно: первый греет кэш system, остальные читают его
const rows: Row[] = []
rows.push(await one(list[0]))
for (let i = 1; i < list.length; i += 4) rows.push(...(await Promise.all(list.slice(i, i + 4).map(one))))

const ok = rows.filter((r) => r.ok)
const lat = ok.map((r) => r.latencyMs).sort((a, b) => a - b)
const objs = ok.reduce((s, r) => s + r.refs + r.models, 0)
const summary = {
  model: 'claude-haiku-5-5',
  effort,
  phrases: rows.length,
  ok: ok.length,
  firstTry: ok.filter((r) => r.attempts === 1 && !r.firstErrors.length).length,
  latency: { median: lat[lat.length >> 1] ?? 0, p90: lat[Math.floor(lat.length * 0.9)] ?? 0, max: lat[lat.length - 1] ?? 0 },
  objects: objs,
  refShare: objs ? +(ok.reduce((s, r) => s + r.refs, 0) / objs).toFixed(2) : 0,
  modelShare: objs ? +(ok.reduce((s, r) => s + r.models, 0) / objs).toFixed(2) : 0,
  actions: Object.fromEntries([...new Set(ok.map((r) => r.action))].map((a) => [a, ok.filter((r) => r.action === a).length])),
  // полнота стенда: место + что в руках + деталь
  full: ok.filter((r) => ['stand', 'hand', 'detail'].every((role) => r.scene!.objects.some((o) => o.role === role))).length,
  withHand: ok.filter((r) => r.scene!.objects.some((o) => o.role === 'hand')).length,
  withStand: ok.filter((r) => r.scene!.objects.some((o) => o.role === 'stand')).length,
  handButIdle: ok.filter((r) => r.action === 'idle' && r.scene!.objects.some((o) => o.role === 'hand')).length,
  avgObjects: ok.length ? +(objs / ok.length).toFixed(2) : 0,
  retried: ok.filter((r) => r.attempts > 1).length,
  outputTokens: { median: [...ok.map((r) => r.usage?.output ?? 0)].sort((a, b) => a - b)[ok.length >> 1] ?? 0 },
  cacheRead: ok.reduce((s, r) => s + (r.usage?.cacheRead ?? 0), 0),
}

// формат __dev.showScenes (eval/haiku-scene/scenes.json): предметы с фигурами и местом at [x, z]
const AT: Record<string, [number, number]> = { back: [0, -30], left: [-28, -6], right: [28, -6], front: [14, 10] }
const show = ok.map((r) => ({
  phrase: r.quote,
  look: '',
  action: r.action,
  objects: r.scene!.objects.map((o: SceneObject) => ({
    role: o.role,
    ru: o.ru,
    at: o.role === 'hand' ? [0, 0] : AT[o.side ?? 'back'],
    rotY: 0,
    parts: o.ref ? sceneRef(o.ref)?.parts ?? [] : o.model?.parts ?? [],
    ...(o.ref ? { ref: o.ref } : {}),
  })),
  latencyMs: r.latencyMs,
  errors: r.firstErrors,
  scene: r.scene,
}))

mkdirSync(here, { recursive: true })
const suffix = outName ? `.${outName}` : ''
writeFileSync(join(here, `results${suffix}.json`), JSON.stringify({ summary, rows: rows.map(({ scene: _s, ...r }) => r) }, null, 1))
writeFileSync(join(here, `scenes${suffix}.json`), JSON.stringify(show, null, 1))
for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} [${r.set}] ${r.quote}: ${r.ok ? `${r.action}; ${r.objects!.join(', ')}; ${r.latencyMs} мс${r.attempts > 1 ? ', повтор' : ''}` : r.error}`)
console.log(JSON.stringify(summary, null, 1))
