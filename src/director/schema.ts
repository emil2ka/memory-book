// JSON-схема сценария и текст каталога — оба собираются из assets/catalog.json,
// поэтому промпт, схема и движок не расходятся.
import { catalog } from '../types/script'
import { CATEGORIES, CATEGORY_RU, KIT_LIBRARY, categoryOf } from '../kit/library'
import { MAKE_TAGS } from './results'

const keys = (o: Record<string, string>) => Object.keys(o)

export const ids = {
  actions: keys(catalog.actions),
  popups: keys(catalog.popups),
  items: keys(catalog.items),
  effects: keys(catalog.effects),
  persons: keys(catalog.persons),
  cameras: keys(catalog.cameras),
  sceneEffects: keys(catalog.sceneEffects),
  stagings: keys(catalog.stagings),
  places: keys(catalog.places),
  timesOfDay: [...catalog.timesOfDay],
  weathers: [...catalog.weathers],
  tempos: [...catalog.tempos],
  paletteColors: [...catalog.paletteColors],
  /** Все предметы библиотеки кита (включая прежние items и popups с теми же id). */
  kit: KIT_LIBRARY.map((m) => m.id),
}

const str = (description?: string) => (description ? { type: 'string', description } : { type: 'string' })
const num = (description: string) => ({ type: 'number', description })
const en = (values: string[], description?: string) => ({ type: 'string', enum: values, ...(description ? { description } : {}) })
const obj = (properties: Record<string, unknown>, description?: string) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...(description ? { description } : {}),
})
const result = (kind: string, values: string[]) => obj({ kind: { type: 'string', const: kind }, id: en(values) })

/** Схема для output_config.format (структурированный вывод). Ограничения чисел и длин проверяет validate.ts. */
export function buildScriptSchema(): Record<string, unknown> {
  return obj({
    title: str('3–7 слов, на языке записи'),
    mood: obj({
      warmth: num('-1..1'),
      tension: num('-1..1'),
      energy: num('-1..1'),
      openness: num('-1..1'),
    }),
    contradiction: {
      anyOf: [
        { type: 'null' },
        obj({ a: str('первое чувство'), b: str('противоположное чувство'), staging: en(ids.stagings) }),
      ],
    },
    time_of_day: en(ids.timesOfDay),
    weather: en(ids.weathers),
    place: en(ids.places),
    palette_hint: { type: 'array', items: en(ids.paletteColors), description: '3–5 цветов' },
    song: obj({ tempo: en(ids.tempos), energy: num('0..1'), estimated: { type: 'boolean' } }),
    beats: {
      type: 'array',
      description: 'от 4 до 7 битов',
      items: obj({
        quote: str('ТОЧНАЯ подстрока текста записи, 1–4 слова'),
        action: en(ids.actions),
        result: {
          anyOf: [
            result('kit', ids.kit),
            obj(
              {
                kind: { type: 'string', const: 'make' },
                name: str('предмет в именительном падеже, 1–3 слова'),
                hint: str('как выглядит, главное в силуэте, до 12 слов'),
                tags: { type: 'array', items: en([...MAKE_TAGS]), description: '2–4 тега' },
              },
              'дорисовать предмет, которого нет в библиотеке',
            ),
            result('effect', ids.effects),
            result('person', ids.persons),
          ],
        },
        camera: en(ids.cameras),
        effect: { anyOf: [en(ids.sceneEffects), { type: 'null' }] },
      }),
    },
    why: { type: 'array', items: str(), description: 'ровно 3 строки: Текст / Фото / Песня' },
  })
}

function section(title: string, o: Record<string, string>): string {
  return `${title}:\n` + Object.entries(o).map(([k, v]) => `- ${k} — ${v}`).join('\n')
}

/** Библиотека кита компактно: по строке на категорию, «id название». ground — встаёт на странице объёмом. */
function kitText(): string {
  const lines = CATEGORIES.map((c) => {
    const items = KIT_LIBRARY.filter((m) => categoryOf(m.id) === c)
    if (!items.length) return ''
    return `- ${CATEGORY_RU[c]}: ` + items.map((m) => `${m.id} ${m.ru}${m.hold === 'ground' ? '*' : ''}`).join('; ')
  }).filter(Boolean)
  return 'Результат kind="kit" — слово становится предметом из библиотеки (id — латиницей; * — большой, встаёт на странице объёмом, как pop-up):\n' + lines.join('\n')
}

/** Текст каталога для системного промпта. */
export function buildCatalogText(): string {
  return [
    section('Действия человечка (action)', catalog.actions),
    kitText(),
    'Результат kind="make" — слова нет в библиотеке: предмет дорисуют по твоему описанию. name — что это (именительный падеж), hint — как выглядит, tags — 2–4 тега из: ' + MAKE_TAGS.join(', ') + '.',
    section('Результат kind="effect" — слово рассыпается в эффект', catalog.effects),
    section('Результат kind="person"', catalog.persons),
    section('Камера (camera)', catalog.cameras),
    section('Эффект сцены (effect, может быть null)', catalog.sceneEffects),
    section('Постановка противоречия (contradiction.staging)', catalog.stagings),
    section('Место (place)', catalog.places),
    `Время суток (time_of_day): ${catalog.timesOfDay.join(', ')}`,
    `Погода (weather): ${catalog.weathers.join(', ')}`,
    `Темп песни (song.tempo): ${catalog.tempos.join(', ')}`,
    `Цвета палитры (palette_hint): ${catalog.paletteColors.join(', ')}`,
  ].join('\n\n')
}
