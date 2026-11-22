// Проба (план 14, роль фото): что claude-haiku-5-5 вытаскивает из снимка дня, сразу словами нашей 3D-библиотеки.
// Запуск: npx tsx eval/photo-probe.ts <фото.jpg> [ещё.jpg …] [--day "текст дня"]
// Пишет eval/photo-probe/cards.json. Фото — только тестовые (assets/_raw/photos_test), в сборку не идут.
import Anthropic from '@anthropic-ai/sdk'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENE_LIBRARY } from '../src/kit/sceneCheck'
import { COLOR_NAMES } from '../src/kit/validate'
import companions from '../assets/kit/companions.json'

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

const args = process.argv.slice(2)
const dayIdx = args.indexOf('--day')
const day = dayIdx >= 0 ? args[dayIdx + 1] : ''
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--day')

const places = SCENE_LIBRARY.filter((m) => m.scene === 'stand' || m.hold === 'ground').map((m) => `${m.id} — ${m.ru}`)
const things = SCENE_LIBRARY.filter((m) => m.scene !== 'stand' && m.hold !== 'ground').map((m) => `${m.id} — ${m.ru}`)
const acc = (companions as { accessories: string[] }).accessories

const SYSTEM = `Ты смотришь на фото, которое человек приложил к записи о своём дне. По фото код соберёт крошечную объёмную диораму из готовых игрушечных предметов и пиксельных человечков: место сзади, 2–4 вещи, люди с фото — человечками в той же одежде. Лиц не будет, только цвета одежды и одна вещь на голове.
Опиши фото ТОЛЬКО тем, что видно. Каждую вещь и место переводи в id библиотеки (если подходящего нет — пустой ref и ru-название). Цвета — только имена палитры: ${COLOR_NAMES.join(', ')}.
Места (стенды): ${places.join('; ')}
Вещи: ${things.join('; ')}
Вещь на голове человечка — одна из: ${acc.join(', ')}.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['caption', 'place', 'things', 'people', 'time_of_day', 'weather', 'palette', 'mood', 'match'],
  properties: {
    caption: { type: 'string', description: 'подпись к фото от первого лица, 4–8 слов: «мы с подругой пьём какао в кофейне»' },
    place: {
      type: 'object',
      additionalProperties: false,
      required: ['ru', 'ref'],
      properties: { ru: { type: 'string' }, ref: { type: 'string' } },
    },
    things: {
      type: 'array',
      description: 'до 4 самых заметных вещей',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ru', 'ref', 'where'],
        properties: { ru: { type: 'string' }, ref: { type: 'string' }, where: { type: 'string', enum: ['hand', 'table', 'ground', 'wall', 'sky'] } },
      },
    },
    people: {
      type: 'array',
      description: 'до 3 человек на фото',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'jacket', 'scarf', 'hair', 'accessory', 'action'],
        properties: {
          role: { type: 'string', description: 'кто это по виду: подруга, друг, бабушка, ребёнок, мама…' },
          jacket: { type: 'string', enum: COLOR_NAMES },
          scarf: { type: 'string', enum: COLOR_NAMES },
          hair: { type: 'string', enum: COLOR_NAMES },
          accessory: { type: 'string', enum: acc },
          action: { type: 'string', enum: ['idle', 'cheer', 'drink', 'carry', 'sit', 'shiver', 'shake'] },
        },
      },
    },
    time_of_day: { type: 'string', enum: ['morning', 'day', 'evening', 'night'] },
    weather: { type: 'string', enum: ['clear', 'rain', 'snow', 'cloudy', 'fog'] },
    palette: { type: 'array', items: { type: 'string', enum: COLOR_NAMES } },
    mood: { type: 'string', description: '2–4 слова' },
    match: { type: 'string', description: 'точная фраза из текста дня, к которой относится это фото; пусто, если текста нет или ни одна не подходит' },
  },
} as const

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 })

async function card(file: string) {
  const t0 = Date.now()
  const data = readFileSync(file).toString('base64')
  const media = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
  const res = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media, data } },
          { type: 'text', text: day ? `Текст дня: «${day}». Опиши фото.` : 'Опиши фото.' },
        ],
      },
    ],
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
  } as Anthropic.MessageCreateParamsNonStreaming)
  const text = res.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? '{}'
  return { file: basename(file), ms: Date.now() - t0, ...JSON.parse(text) }
}

const cards = []
for (const f of files) {
  const c = await card(f)
  cards.push(c)
  console.log(JSON.stringify(c, null, 1))
}
mkdirSync(join(here, 'photo-probe'), { recursive: true })
writeFileSync(join(here, 'photo-probe', 'cards.json'), JSON.stringify(cards, null, 1))
