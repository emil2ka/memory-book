// Библиотека предметов кита: всё, что нарисовано заранее (assets/kit/<категория>.json).
// Поиск по слову из текста дня — по основам ru/kk/en; образцы для дорисовки — по тегам.
import type { KitModel } from './format'
import { CATEGORIES, type Category } from './categories'
import drinks from '../../assets/kit/drinks.json'
import food from '../../assets/kit/food.json'
import weather from '../../assets/kit/weather.json'
import nature from '../../assets/kit/nature.json'
import city from '../../assets/kit/city.json'
import home from '../../assets/kit/home.json'
import study from '../../assets/kit/study.json'
import transport from '../../assets/kit/transport.json'
import play from '../../assets/kit/play.json'
import music from '../../assets/kit/music.json'
import animals from '../../assets/kit/animals.json'
import holiday from '../../assets/kit/holiday.json'
import feelings from '../../assets/kit/feelings.json'
import kz from '../../assets/kit/kz.json'
import packsJson from '../../assets/kit/packs.json'
import meta2d from '../../assets/kit2d/meta.json'

export { CATEGORIES, CATEGORY_RU, type Category } from './categories'

const FILES: Record<Category, unknown[]> = { drinks, food, weather, nature, city, home, study, transport, play, music, animals, holiday, feelings, kz }

/**
 * Предметы, нарисованные только картинкой (assets/kit2d/meta.json, рисовалки assets/kit2d/src/pack5+.py):
 * поля поиска как у кита, фигур нет (parts пустой).
 */
interface Meta2D extends Omit<KitModel, 'parts'> {
  cat: Category
  pack: string
}
// у кого уже есть 3D-фигуры (сценки, assets/kit/src/pack5+), запись «только картинка» не нужна:
// предмет с фигурами важнее, картинка по тому же id остаётся в assets/kit2d
const IDS_3D = new Set(CATEGORIES.flatMap((c) => (FILES[c] as KitModel[]).map((m) => m.id)))
const PICTURE_ONLY = (meta2d as unknown as Meta2D[]).filter((m) => !IDS_3D.has(m.id))

/** Все предметы библиотеки: 3D-кит (assets/kit) + только картинки (assets/kit2d/meta.json). */
export const KIT_LIBRARY: readonly KitModel[] = [
  ...CATEGORIES.flatMap((c) => FILES[c] as KitModel[]),
  ...PICTURE_ONLY.map(({ cat: _c, pack: _p, ...m }) => ({ ...m, parts: [], by: 'library' as const })),
]

const BY_ID = new Map<string, KitModel>(KIT_LIBRARY.map((m) => [m.id, m]))
const CAT_OF = new Map<string, Category>([
  ...CATEGORIES.flatMap((c) => (FILES[c] as KitModel[]).map((m) => [m.id, c] as const)),
  ...PICTURE_ONLY.map((m) => [m.id, m.cat] as const),
])

/** Пачки: pack1 → [id…]. */
export const KIT_PACKS: Readonly<Record<string, readonly string[]>> = (() => {
  const out: Record<string, string[]> = { ...(packsJson as Record<string, string[]>) }
  for (const m of PICTURE_ONLY) (out[m.pack] ??= []).push(m.id)
  return out
})()

export const kitById = (id: string): KitModel | undefined => BY_ID.get(id)
export const categoryOf = (id: string): Category | undefined => CAT_OF.get(id)
export const kitIds = (): string[] => KIT_LIBRARY.map((m) => m.id)
export const packOf = (id: string): string | undefined => Object.keys(KIT_PACKS).find((p) => KIT_PACKS[p].includes(id))

/** Нижний регистр, ё → е, без знаков по краям. Казахские буквы сохраняются. */
export const normWord = (w: string) =>
  w
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

/** Ключ дорисовки и кэша: нижний регистр, ё → е, пробелы схлопнуты. */
export const makeKey = (name: string) =>
  name
    .split(/\s+/)
    .map(normWord)
    .filter(Boolean)
    .join(' ')

interface StemRule {
  stem: string
  exact: boolean
  id: string
}

/**
 * Основы: «кофе» — начало слова; «кот$» — только слово целиком (чтобы «который» не стал котом).
 * Сначала длинные: «кофейн» (кафе) важнее «кофе».
 */
function stemRules(models: readonly KitModel[]): StemRule[] {
  const rules: StemRule[] = []
  const add = (raw: string, exact: boolean, id: string) => {
    const stem = normWord(raw)
    if (stem.length >= 2 && !rules.some((r) => r.stem === stem && r.exact === exact)) rules.push({ stem, exact, id })
  }
  for (const m of models) {
    // основа — начало слова, «$» в конце — слово целиком
    for (const s of m.stems) add(s.replace(/\$$/, ''), s.endsWith('$'), m.id)
    // сами названия — только целиком: «лист» не должен ловить «листать»
    for (const name of [m.ru, m.kk, m.en]) if (name) add(name, true, m.id)
  }
  return rules.sort((a, b) => b.stem.length - a.stem.length)
}

let RULES = stemRules(KIT_LIBRARY)

/** Предмет по одному слову текста: «кружку» → cocoa? нет — «какао» → cocoa. null, если не знаем. */
export function findByWord(word: string): KitModel | null {
  const w = normWord(word)
  if (w.length < 2) return null
  for (const r of RULES) {
    if (r.exact ? w === r.stem : w.startsWith(r.stem)) return BY_ID.get(r.id) ?? null
  }
  return null
}

/** Предмет по названию целиком (ru, kk или en, регистр и ё не важны), включая дорисованные. */
export function findByName(name: string): KitModel | null {
  const key = makeKey(name)
  for (const m of BY_ID.values()) if ([m.ru, m.kk, m.en].some((n) => n && makeKey(n) === key)) return m
  return null
}

/** Все предметы, которые находятся в тексте: [{ id, word, index }] по порядку. Фразы из нескольких слов — тоже. */
export function findInText(text: string): { id: string; word: string; index: number }[] {
  const out: { id: string; word: string; index: number }[] = []
  const re = /[\p{L}\p{N}-]+/gu
  for (const m of text.matchAll(re)) {
    const found = findByWord(m[0])
    if (found) out.push({ id: found.id, word: m[0], index: m.index ?? 0 })
  }
  // названия из нескольких слов («уличный фонарь», «горы алатау»)
  const low = normWord(text).replace(/\s+/g, ' ')
  for (const r of RULES) {
    if (!r.stem.includes(' ')) continue
    const i = low.indexOf(r.stem)
    if (i >= 0 && !out.some((o) => o.id === r.id)) out.push({ id: r.id, word: text.substr(i, r.stem.length), index: i })
  }
  return out.sort((a, b) => a.index - b.index)
}

/**
 * Похожие предметы по тегам (для образцов дорисовки и запасного варианта).
 * Счёт — пересечение тегов; при равенстве — разнообразие категорий и hold.
 */
export function similar(tags: readonly string[], n = 6, opts: { exclude?: readonly string[]; hold?: KitModel['hold'] } = {}): KitModel[] {
  const want = new Set(tags.map((t) => t.toLowerCase()))
  const skip = new Set(opts.exclude ?? [])
  const scored = KIT_LIBRARY.filter((m) => !skip.has(m.id)).map((m, i) => {
    let s = 0
    for (const t of m.tags) if (want.has(t)) s += 1
    if (opts.hold && m.hold === opts.hold) s += 0.5
    return { m, s, i }
  })
  scored.sort((a, b) => b.s - a.s || a.i - b.i)
  const out: KitModel[] = []
  const cats = new Map<string, number>()
  // не больше трёх из одной категории, чтобы образцы были разные
  for (const { m, s } of scored) {
    if (out.length >= n) break
    const c = CAT_OF.get(m.id) ?? ''
    if ((cats.get(c) ?? 0) >= 3 && s < 2) continue
    cats.set(c, (cats.get(c) ?? 0) + 1)
    out.push(m)
  }
  for (const { m } of scored) {
    if (out.length >= n) break
    if (!out.includes(m)) out.push(m)
  }
  return out
}

/** Добавить дорисованные предметы в поиск (из кэша браузера). Библиотечные id не перекрываются. */
export function registerExtra(models: readonly KitModel[]): void {
  let added = false
  for (const m of models) {
    if (BY_ID.has(m.id)) continue
    BY_ID.set(m.id, m)
    added = true
  }
  if (added) RULES = stemRules([...BY_ID.values()])
}
