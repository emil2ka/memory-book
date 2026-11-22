// Поля бита плана 13: hero_prop, place, companion, kind, weight.
// Режиссёр будет давать их сам; пока его нет (и для старых дней на полке) — заполняем из того, что уже есть:
// результат слова → главный предмет, слова цитаты → место и человек. Чистые функции, без DOM.
import { findByName, findInText, kitById } from '../kit/library'
import type { KitModel } from '../kit/format'
import { BEAT_KINDS, catalog, type Beat, type BeatKind, type BeatWeight, type Companion, type DayScript, type FullBeat, type TimeOfDay, type Weather } from '../types/script'
import { kitFromQuote, kitOf } from './results'
import { actFromText, emotionFromText, isEmotion } from './emotions'

/** Эффект — не вещь; главный предмет — то, что его показывает (план 13 § 2: «тепло» → кружка с паром). */
const EFFECT_PROP: Record<string, string> = {
  leaves: 'лист',
  snow: 'снежинка',
  rain: 'зонт',
  steam: 'кружка с паром',
  frost: 'снежинка',
  sparkles: 'звезда',
}
const EFFECT_KIND: Record<string, BeatKind> = { leaves: 'weather', snow: 'weather', rain: 'weather', frost: 'weather', steam: 'feeling', sparkles: 'feeling' }

/** Роли людей: основа слова → роль в именительном падеже. */
const ROLES: [RegExp, string][] = [
  [/^мам/, 'мама'],
  [/^пап/, 'папа'],
  [/^бабуш|^бабул|^апа$|^әже/, 'бабушка'],
  [/^дедуш|^дедул|^ата$/, 'дедушка'],
  [/^брат|^братишк/, 'брат'],
  [/^сестр|^сестрёнк/, 'сестра'],
  [/^подруг|^подружк/, 'подруга'],
  [/^друг|^друзь|^дружищ|^досым|^дос$/, 'друг'],
  [/^однокурсн|^одногрупп/, 'однокурсник'],
  [/^одноклассн/, 'одноклассник'],
  [/^преподават|^препод|^учител|^учительн/, 'преподаватель'],
  [/^коллег/, 'коллега'],
  [/^сосед/, 'сосед'],
  [/^тёт|^тет/, 'тётя'],
  [/^дяд/, 'дядя'],
  [/^ребят|^ребён|^дет/, 'ребята'],
]

/** Слова с большой буквы, которые не имена (начало предложения отсекается отдельно). */
const NOT_NAMES = new Set(['я', 'мы', 'он', 'она', 'они', 'вы', 'ты', 'москва', 'алматы', 'астана', 'казахстан', 'новый', 'год'])

const words = (s: string) => s.split(/[^\p{L}\p{N}-]+/u).filter(Boolean)

/** Человек из цитаты: роль по словам, имя — слово с большой буквы не в начале предложения. */
export function companionFromQuote(quote: string): Companion | null {
  let role: string | null = null
  for (const w of words(quote.toLowerCase())) {
    const hit = ROLES.find(([re]) => re.test(w))
    if (hit) {
      role = hit[1]
      break
    }
  }
  let name: string | null = null
  // имя: с большой буквы и не первое слово предложения
  const re = /(^|[.!?…]\s*)?(\p{Lu}[\p{Ll}-]{1,})/gu
  for (const m of quote.matchAll(re)) {
    const startOfSentence = m.index === 0 || m[1] !== undefined
    if (startOfSentence) continue
    if (NOT_NAMES.has(m[2].toLowerCase())) continue
    name = m[2]
    break
  }
  if (!role && !name) return null
  return { name: name ?? role!, role: role ?? 'друг' }
}

const isPlaceModel = (m: KitModel) => m.parts.length > 0 && (m.scene === 'stand' || m.hold === 'ground') && (m.tags.includes('place') || m.tags.includes('city') || m.tags.includes('home'))

/** Главный предмет и вид фразы из прежнего результата бита. */
function fromResult(b: Beat): { prop: string; kind: BeatKind; placeModel: KitModel | null } {
  const r = b.result
  const m = kitOf(r)
  if (m) {
    const place = isPlaceModel(m)
    const kind: BeatKind = place ? 'place' : m.tags.includes('weather') ? 'weather' : 'thing'
    return { prop: m.ru, kind, placeModel: place ? m : null }
  }
  if (r.kind === 'make') return { prop: r.name || r.id.replace(/^make:/, ''), kind: r.tags.includes('place') ? 'place' : 'thing', placeModel: null }
  if (r.kind === 'effect') return { prop: EFFECT_PROP[r.id] ?? 'звезда', kind: EFFECT_KIND[r.id] ?? 'feeling', placeModel: null }
  // человек или кристалл: вещь из слов цитаты, иначе сердце / кристалл
  const q = kitFromQuote(b.quote)
  if (r.kind === 'person') return { prop: q?.ru ?? kitById('heart')?.ru ?? 'сердце', kind: 'person', placeModel: null }
  return { prop: q?.ru ?? 'кристалл', kind: 'thing', placeModel: null }
}

const cleanStr = (v: unknown, max = 40) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Привести поля плана 13, если режиссёр их дал; null — поле не годится. */
function given(b: Beat) {
  const c = b.companion as Partial<Companion> | null | undefined
  const companion = c && typeof c === 'object' && (cleanStr(c.name) || cleanStr(c.role)) ? { name: cleanStr(c.name) ?? cleanStr(c.role)!, role: cleanStr(c.role) ?? 'друг' } : c === null ? null : undefined
  // место дня из каталога (street, park…) иногда попадает в место бита — по-русски
  const rawPlace = cleanStr(b.place)
  const place = rawPlace ? (placeRu(rawPlace) ?? rawPlace) : rawPlace
  return {
    hero_prop: cleanStr(b.hero_prop),
    place: b.place === null ? null : place ?? undefined,
    companion,
    kind: BEAT_KINDS.includes(b.kind as BeatKind) ? (b.kind as BeatKind) : null,
    weight: b.weight === 1 || b.weight === 2 || b.weight === 3 ? b.weight : null,
  }
}

const TIMES: readonly TimeOfDay[] = ['morning', 'day', 'evening', 'night']
const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'rain', 'snow', 'fog']

/** Все поля плана 13 для бита: данные режиссёром остаются, недостающие выводятся из result и цитаты. */
export function beatFields(
  b: Beat,
  script?: Partial<Pick<DayScript, 'contradiction' | 'time_of_day' | 'weather'>>,
): Pick<FullBeat, 'hero_prop' | 'place' | 'companion' | 'kind' | 'weight' | 'time_of_day' | 'weather'> {
  const g = given(b)
  const r = fromResult(b)
  // бит-человек без имени и роли в цитате («мы») — всё равно второй человечек: друг
  const companion = g.companion !== undefined ? g.companion : (companionFromQuote(b.quote) ?? (b.result.kind === 'person' ? { name: 'друг', role: 'друг' } : null))
  // место: сам предмет-место, иначе первое место из слов цитаты, если это не главный предмет
  let place: string | null
  if (g.place !== undefined) place = g.place
  else if (r.placeModel) place = r.placeModel.ru
  else {
    const hit = findInText(b.quote)
      .map((h) => kitById(h.id))
      .find((m): m is KitModel => !!m && isPlaceModel(m) && m.ru !== r.prop)
    place = hit?.ru ?? null
  }
  const kind: BeatKind = g.kind ?? (companion && r.kind !== 'weather' ? 'person' : r.kind)
  let weight: BeatWeight = g.weight ?? 2
  if (!g.weight) {
    const c = script?.contradiction
    const inContra = !!c && [c.a, c.b].some((s) => s && (b.quote.includes(s) || s.includes(b.quote)))
    if (companion || inContra) weight = 3
    else if (r.kind === 'weather' && b.result.kind === 'effect') weight = 1
  }
  const time_of_day = TIMES.includes(b.time_of_day as TimeOfDay) ? (b.time_of_day as TimeOfDay) : (script?.time_of_day ?? 'day')
  const weather = WEATHERS.includes(b.weather as Weather) ? (b.weather as Weather) : (script?.weather ?? 'clear')
  return { hero_prop: g.hero_prop ?? r.prop, place, companion, kind, weight, time_of_day, weather }
}

// ---------- правила истории (план 13 § 2) — для ответа LLM и запасного режиссёра ----------

/** Битов в фильме: 2–8 (план 15: по одной новой мысли на бит, длинная запись — до 8, остальное — в строках рассказа). */
export const MAX_BEATS = 8
export const MIN_BEATS = 2

/**
 * Какие биты — чувства (одна мысль — один раз, план 15): решает код, не только режиссёр.
 * Цитата сама — чувство без действия («мне было скучно», «На паре было скучно») → бит-чувство с эмоцией;
 * «чувство» от режиссёра у действия, человека или вещи («поехали к бабушке», «мы пошли гулять») → обычный бит.
 * Мутирует биты. Со снимком не трогает.
 */
export function settleFeelings(beats: Beat[]): string[] {
  const issues: string[] = []
  for (const b of beats) {
    if (b.photo !== undefined && b.photo !== null) continue
    const own = emotionFromText(b.quote)
    const act = actFromText(b.quote)
    if (own && !act) {
      if (b.kind !== 'feeling') issues.push(`«${b.quote}» — чувство: человечек играет ${own}, без предмета`)
      b.kind = 'feeling'
      if (!isEmotion(b.emotion)) b.emotion = own
      continue
    }
    if (b.kind === 'feeling') {
      const thing = !!act || !!companionFromQuote(b.quote) || findInText(b.quote).some((h) => (kitById(h.id)?.parts.length ?? 0) > 0)
      if (thing || !b.emotion) {
        issues.push(`«${b.quote}» — не чувство, а ${act ? 'действие' : 'вещь или человек'}: обычный бит`)
        delete b.kind
      }
    }
  }
  return issues
}

/** Бит-чувство: чувство играет человечек (emotion), предмета и сценки нет. Со снимком — обычный бит. */
export const emotionOnly = (b: Pick<Beat, 'kind' | 'emotion' | 'photo'>) => b.kind === 'feeling' && !!b.emotion && (b.photo === undefined || b.photo === null)

/** Чувства и состояния — их нельзя нарисовать вещью. */
const ABSTRACT = /^(тепл|уют|радост|счаст|груст|печал|скук|скучн|тишин|тих|спокой|усталост|устал|одиноч|любов|надежд|страх|волнен|ожидан|мысл|настроен|вдохновен|свобод|покой|тоск|нежност|душ|смех|веселье|восторг|облегчен|стыд|злост|обид|кайф|вайб|атмосфер|эмоци|чувств)/

/** Главный предмет — чувство, а не вещь (и его нет в библиотеке как вещи). */
export function isAbstractProp(s: string): boolean {
  const w = s.trim().toLowerCase().replace(/ё/g, 'е')
  if (!w) return true
  // вещью считаем только объёмный предмет библиотеки (у картинок-наклеек вроде «радужное сердце», «zzz» фигур нет)
  const solid = (id?: string) => !!id && (kitById(id)?.parts.length ?? 0) > 0
  if (solid(findByName(w)?.id) || findInText(w).some((h) => solid(h.id))) return false
  return ABSTRACT.test(w) || /(ость|ство|ние|тие)$/.test(w.split(/\s+/)[0])
}

/**
 * Привести биты к правилам истории. Мутирует копии, возвращает новые биты и список исправлений:
 * все поля плана 13; чувство в hero_prop → вещь из результата; result = предмет hero_prop из библиотеки
 * (кроме эффектов погоды: эффект остаётся, вещь погоды — hero_prop); два одинаковых hero_prop подряд — нет;
 * не больше MAX_BEATS (уходят самые лёгкие, кроме людей и противоречия).
 */
export function storyRules(beatsIn: Beat[], script: Partial<Pick<DayScript, 'contradiction' | 'time_of_day' | 'weather'>> & { text?: string }): { beats: FullBeat[]; issues: string[] } {
  const issues: string[] = []
  let beats: FullBeat[] = beatsIn.map((b) => ({ ...b, ...beatFields(b, script) }))
  for (const b of beats) {
    // бит-чувство: предмета нет — человечек играет эмоцию
    if (emotionOnly(b)) {
      b.hero_prop = ''
      continue
    }
    // чувство вместо вещи → объёмная вещь: из результата слова, из слов цитаты, иначе по виду фразы
    if (isAbstractProp(b.hero_prop)) {
      const solid = (m: KitModel | null | undefined) => (m && m.parts.length && !isAbstractProp(m.ru) ? m : null)
      const byResult = solid(kitOf(b.result))
      const byQuote = solid(kitFromQuote(b.quote))
      const prop = byResult?.ru ?? byQuote?.ru ?? (b.kind === 'weather' ? 'облако' : b.kind === 'thing' || b.kind === 'place' ? 'звезда' : 'сердце')
      issues.push(`hero_prop «${b.hero_prop}» — не вещь → «${prop}»`)
      b.hero_prop = prop
    }
    // result — тот же предмет, что hero_prop (сценка и запасной путь показывают одно и то же)
    const lib = findByName(b.hero_prop)
    if (lib && lib.parts.length && b.result.kind !== 'effect') {
      const cur = b.result.kind === 'kit' ? b.result.id : null
      if (cur !== lib.id) {
        issues.push(`result бита «${b.quote}» → ${lib.id} (по hero_prop «${b.hero_prop}»)`)
        b.result = { kind: 'kit', id: lib.id }
      }
    }
  }
  // порядок — как в тексте (режиссёр иногда переставляет соседние фразы)
  if (script.text) {
    const pos = (b: FullBeat) => {
      const i = script.text!.indexOf(b.quote)
      return i < 0 ? Number.MAX_SAFE_INTEGER : i
    }
    const before = beats.map((b) => b.quote).join('|')
    beats = beats.map((b, i) => ({ b, i })).sort((x, y) => pos(x.b) - pos(y.b) || x.i - y.i).map((x) => x.b)
    if (beats.map((b) => b.quote).join('|') !== before) issues.push('биты переставлены в порядок текста')
  }
  const c = script.contradiction
  const keep = (b: FullBeat) => !!b.companion || (!!c && [c.a, c.b].some((s) => !!s && (b.quote.includes(s) || s.includes(b.quote))))
  const rank = (b: FullBeat) => (keep(b) ? 10 : 0) + b.weight
  // первый бит — только объёмный предмет библиотеки (сценка нужна через 5 с, дорисовать не успеют):
  // нет такого — вещь из слов его цитаты, если она есть в 3D-ките
  if (beats.length && !emotionOnly(beats[0])) {
    const f = beats[0]
    const solidHero = findByName(f.hero_prop)
    if (!(solidHero && solidHero.parts.length)) {
      const q = kitFromQuote(f.quote)
      if (q && q.parts.length && q.ru.toLowerCase() !== f.hero_prop.toLowerCase()) {
        issues.push(`первый бит: «${f.hero_prop}» нет в 3D-библиотеке → «${q.ru}»`)
        f.hero_prop = q.ru
        f.result = { kind: 'kit', id: q.id }
      }
    }
  }
  // два бита подряд с одним hero_prop: у более лёгкого — другая вещь из его слова, иначе он уходит (если битов хватает)
  for (let i = 1; i < beats.length; i++) {
    if (emotionOnly(beats[i]) || emotionOnly(beats[i - 1])) continue
    if (beats[i].hero_prop.toLowerCase() !== beats[i - 1].hero_prop.toLowerCase()) continue
    const j = rank(beats[i]) >= rank(beats[i - 1]) ? i - 1 : i
    const q = kitFromQuote(beats[j].quote)
    if (q && q.parts.length && q.ru.toLowerCase() !== beats[j].hero_prop.toLowerCase()) {
      issues.push(`повтор hero_prop «${beats[j].hero_prop}» → «${q.ru}»`)
      beats[j].hero_prop = q.ru
      beats[j].result = { kind: 'kit', id: q.id }
    } else if (beats.length > MIN_BEATS) {
      issues.push(`повтор hero_prop «${beats[j].hero_prop}» — бит «${beats[j].quote}» убран`)
      beats.splice(j, 1)
      i = Math.max(0, j - 1)
    }
  }
  // не больше MAX_BEATS: убираем самые лёгкие, люди и противоречие остаются, порядок текста сохраняется
  if (beats.length > MAX_BEATS) {
    const order = beats.map((b, i) => ({ b, i })).sort((x, y) => Number(keep(x.b)) - Number(keep(y.b)) || x.b.weight - y.b.weight || y.i - x.i)
    const drop = new Set(order.slice(0, beats.length - MAX_BEATS).map((x) => x.i))
    issues.push(`битов ${beats.length} → ${MAX_BEATS}`)
    beats = beats.filter((_, i) => !drop.has(i))
  }
  return { beats, issues }
}

/** Сценарий, в котором у каждого бита есть все поля плана 13. Исходный не меняется. */
export function normalizeScript<T extends DayScript>(script: T): T & { beats: FullBeat[] } {
  return { ...script, beats: script.beats.map((b) => ({ ...b, ...beatFields(b, script) })) }
}

/** Имя места дня из каталога (park → «парк») — для подсказки сценографу, когда у бита своего места нет. */
export const placeRu = (id: string | null | undefined) => (id ? ((catalog.places as Record<string, string>)[id] ?? null) : null)
