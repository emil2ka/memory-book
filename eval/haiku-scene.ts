// Проба: может ли claude-haiku-5-5 собрать из фразы дня объёмную сценку («стенд»)
// из простых фигур кита — предмет в руках человечка + крупный предмет за ним + деталь.
// Запуск: npx tsx eval/haiku-scene.ts
// Пишет eval/haiku-scene/scenes.json — его показывает window.__dev.showScenes() в dev-сборке.
import Anthropic from '@anthropic-ai/sdk'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PALETTE } from '../src/scene/palette'
import { validateKit } from '../src/kit/validate'
import type { KitModel } from '../src/kit/format'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch {
  /* нет .env */
}

const MODEL = 'claude-haiku-5-5'
const PHRASES = [
  'Купил мороженое в парке',
  'Катался на самокате до вечера',
  'Ночью доделывал проект за ноутбуком',
  'Пили какао у окна, шёл снег',
  'Купил шарики на день рождения сестры',
  'Играл на домбре у бабушки в ауле',
]
const ACTIONS = ['idle', 'cheer', 'drink', 'carry', 'sit', 'shiver', 'shake'] as const

const lib = (file: string) => JSON.parse(readFileSync(join(root, 'assets/kit', file), 'utf8')) as KitModel[]
const all = ['drinks.json', 'city.json', 'nature.json', 'home.json'].flatMap(lib)
// образцы — предметы, которых нет во фразах, чтобы проба показывала, как Haiku рисует сама
const EXEMPLARS = ['cocoa', 'bench', 'tree', 'gift']
  .map((id) => all.find((m) => m.id === id))
  .filter((m): m is KitModel => !!m)
  .map(({ id, ru, hold, parts }) => ({ id, ru, hold, parts }))

const SYSTEM = `Ты — художник крошечных объёмных сценок для дневника. На странице книги стоит пиксельный человечек ростом 34 единицы (большая голова, шарф). Каждая фраза дня превращается в маленький стенд вокруг него: предмет в руках, крупный предмет-декорация за ним и, если нужно, маленькая деталь рядом. Движок рисует всё крупными пикселями со ступенчатым светом и тёмным контуром, поэтому:
- только крупные простые формы, главная черта предмета преувеличена, игрушечные пухлые пропорции;
- 3–5 цветов на предмет, детали — тёмным или светлым оттенком той же семьи цветов;
- ничего тоньше 1 единицы.

Формат предмета — список фигур parts. У фигуры:
- s: box | cyl (цилиндр по Y) | sph (шар/эллипсоид) | cone (конус вершиной вверх, k:4 — пирамида) | cap (капсула по Y) | torus (кольцо стоит в плоскости XY, как ручка кружки) | wedge (клин) | prism (призма-крыша, конёк вдоль Z);
- p: [x, y, z] центр, Y вверх, y = 0 — бумага, предмет смотрит на +Z (в камеру);
- d: [ширина, высота, глубина] габариты;
- r: [x, y, z] поворот в градусах (необязательно);
- c: цвет — имя из палитры: ${Object.keys(PALETTE).join(', ')};
- k: число граней 3–24 (необязательно), glow: true — светится (лампа, огонь, экран).
Не больше 40 фигур на предмет, центр фигуры не дальше 70 от нуля.

Размеры: предмет в руке 6–12 в высоту, декорация за человечком 25–60 в высоту и до 50 в ширину, деталь 6–20.

Поле at — где стоит предмет относительно человечка в единицах: [x, z]; x вправо, z к камере. Декорация стоит сзади (z от −22 до −40) или сбоку (|x| 22–35), деталь — рядом на бумаге. Предмету в руках at не нужен (поставь [0, 0]).
Поле action — что делает человечек: idle (стоит), cheer (прыгает от радости), drink (подносит к губам: пьёт или ест то, что в руке), carry (держит перед собой двумя руками), sit (сидит), shiver (мёрзнет), shake (трясёт предмет над головой).`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['look', 'action', 'objects'],
  properties: {
    look: { type: 'string', description: 'план сценки до 20 слов' },
    action: { type: 'string', enum: [...ACTIONS] },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'ru', 'at', 'rotY', 'parts'],
        properties: {
          role: { type: 'string', enum: ['hand', 'stand', 'detail'] },
          ru: { type: 'string' },
          at: { type: 'array', items: { type: 'number' } },
          rotY: { type: 'number' },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['s', 'p', 'd', 'c'],
              properties: {
                s: { type: 'string', enum: ['box', 'cyl', 'sph', 'cone', 'cap', 'torus', 'wedge', 'prism'] },
                p: { type: 'array', items: { type: 'number' } },
                d: { type: 'array', items: { type: 'number' } },
                r: { type: 'array', items: { type: 'number' } },
                c: { type: 'string', enum: Object.keys(PALETTE) },
                k: { type: 'integer' },
                glow: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
} as const

interface SceneObject {
  role: 'hand' | 'stand' | 'detail'
  ru: string
  at: [number, number]
  rotY: number
  parts: KitModel['parts']
}
interface Scene {
  phrase: string
  look: string
  action: (typeof ACTIONS)[number]
  objects: SceneObject[]
  latencyMs: number
  output: number
  errors: string[]
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 })

async function one(phrase: string): Promise<Scene> {
  const t0 = Date.now()
  const user = [
    'Образцы предметов в этом формате:',
    ...EXEMPLARS.map((e) => JSON.stringify(e)),
    '',
    `Фраза дня: «${phrase}». Собери сценку.`,
  ].join('\n')
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 9000,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
  } as Anthropic.MessageCreateParamsNonStreaming)
  const text = res.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? '{}'
  const raw = JSON.parse(text) as Omit<Scene, 'phrase' | 'latencyMs' | 'output' | 'errors'>
  const errors: string[] = []
  const objects: SceneObject[] = []
  raw.objects.slice(0, 3).forEach((o, i) => {
    const check = validateKit(
      { id: `obj_${i}`, ru: o.ru || 'предмет', stems: ['предмет'], tags: ['scene'], hold: o.role === 'hand' ? 'hand' : 'ground', parts: o.parts },
      { fit: true, heightSlack: 0.5 },
    )
    if (check.ok && check.model) objects.push({ ...o, parts: check.model.parts })
    else errors.push(`${o.ru}: ${check.errors.slice(0, 3).join('; ')}`)
  })
  return { phrase, look: raw.look, action: raw.action, objects, latencyMs: Date.now() - t0, output: res.usage.output_tokens, errors }
}

const scenes = await Promise.all(
  PHRASES.map((p) =>
    one(p).catch((e) => ({ phrase: p, look: '', action: 'idle' as const, objects: [], latencyMs: 0, output: 0, errors: [String(e instanceof Error ? e.message : e)] })),
  ),
)
mkdirSync(join(here, 'haiku-scene'), { recursive: true })
writeFileSync(join(here, 'haiku-scene', 'scenes.json'), JSON.stringify(scenes, null, 1))
for (const s of scenes) {
  console.log(
    `${s.errors.length ? '!' : '✓'} ${s.phrase}: ${s.action}, ${s.objects.map((o) => `${o.role}:${o.ru}(${o.parts.length})`).join(', ')}; ${s.latencyMs} мс, ${s.output} ток.${s.errors.length ? ' — ' + s.errors.join(' | ') : ''}`,
  )
}
