// Страховка (05-director-llm, «Страховка в коде»): из любого ответа LLM делает валидный DayScript.
import type { ActionId, Beat, BeatResult, CameraId, Contradiction, DayScript, Mood, PhotoCard, PlaceId, SceneEffectId, StagingId, Tempo, TimeOfDay, Weather } from '../types/script'
import { contradictionFromText, fallbackDirect, moodFromText, varyActions } from './fallback'
import { ACTION_SYNONYMS, CAMERA_SYNONYMS, LEXICON, RESULT_SYNONYMS, SCENE_EFFECT_SYNONYMS, STAGING_SYNONYMS } from './lexicon'
import { ids } from './schema'
import { expandToWord, findStem, isLetter, nearestQuote, norm, words } from './text'
import { findByName, findByWord, kitById } from '../kit/library'
import { kitFromQuote, kitResult, makeResult, toKit } from './results'
import { MAX_BEATS, MIN_BEATS, emotionOnly, settleFeelings, storyRules } from './beatFields'
import { emotionFromText, isAct, isEmotion } from './emotions'
import { matchPhotos } from './photos'
import { dropRepeats, fillStories, photoRef } from './story'

export interface ValidationReport {
  script: DayScript
  /** Что пришлось исправить. Пусто — ответ был чистым. */
  issues: string[]
  /** Сколько битов пришло, сколько выкинуто и сколько добавлено. */
  stats: { beatsIn: number; dropped: number; padded: number; quotesFixed: number; idsFixed: number }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const asStr = (v: unknown) => (typeof v === 'string' ? v : '')
const key = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_')
const inList = <T extends string>(list: string[], v: unknown): v is T => typeof v === 'string' && list.includes(v)
const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

/** Привести цитату к точной подстроке текста. null — бит выкинуть. */
export function fixQuote(text: string, quote: string): { quote: string; fixed: boolean } | null {
  const q = quote.trim().replace(/^[«»"'„“”.,!?:;\s]+|[«»"'„“”.,!?:;\s]+$/g, '')
  // Точная подстрока, но режет слово («парк» внутри «парку») → расширить до целого слова.
  const whole = (c: string): string | null => {
    let i = text.indexOf(c)
    if (i < 0) return null
    const first = i
    while (i >= 0) {
      if (!isLetter(text[i - 1]) && !isLetter(text[i + c.length])) return c
      i = text.indexOf(c, i + 1)
    }
    const w = expandToWord(text, first, first + c.length)
    return text.slice(w.start, w.end)
  }
  if (quote && quote.trim() === quote) {
    const w = whole(quote)
    if (w) return { quote: w, fixed: w !== quote }
  }
  if (q) {
    const w = whole(q)
    if (w) return { quote: w, fixed: true }
  }
  if (!q) return null
  const i = norm(text).indexOf(norm(q))
  if (i >= 0) {
    const w = expandToWord(text, i, i + q.length)
    return { quote: text.slice(w.start, w.end), fixed: true }
  }
  const near = nearestQuote(text, q)
  return near ? { quote: near, fixed: true } : null
}

const RESULT_LISTS: Record<string, string[]> = { popup: ids.popups, item: ids.items, effect: ids.effects, person: ids.persons }
const CRYSTAL: BeatResult = { kind: 'kit', id: 'crystal' }

/** Сколько дорисовок допускается в одном дне (каждая — вызов /api/make). */
export const MAX_MAKES = 3

/**
 * Привести результат к каталогу и библиотеке кита.
 * kit с известным id → как есть; прежние item/popup → kit; неизвестный id → синоним, слово по-русски, слово цитаты;
 * make → kit, если такое слово уже есть в библиотеке; иначе кристалл (тоже предмет библиотеки).
 */
export function fixResult(raw: unknown, quote = ''): { result: BeatResult; fixed: boolean } {
  const r = isObj(raw) ? raw : {}
  const kind = asStr(r.kind)
  const id = asStr(r.id)
  if (kind === 'effect' || kind === 'person') {
    if (RESULT_LISTS[kind].includes(id)) return { result: { kind, id } as BeatResult, fixed: false }
  }
  if (kind === 'kit' && kitById(id)) return { result: kitResult(id), fixed: false }
  if ((kind === 'item' || kind === 'popup') && kitById(id)) return { result: kitResult(id), fixed: false }
  if (kind === 'make') {
    const name = asStr(r.name).trim() || quote
    // одно слово, которое уже есть в библиотеке, — не дорисовывать. Составное («швейная машинка») —
    // не дробить по словам: «машинка» в нём не машина.
    const lib = name.includes(' ') ? findByName(name) : findByWord(name)
    if (lib) return { result: kitResult(lib.id), fixed: true }
    if (name) return { result: makeResult(name, asStr(r.hint), Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : []), fixed: false }
  }
  if (kind === 'crystal') return { result: kitResult('crystal'), fixed: id !== 'crystal' }
  // id есть, но в другом разделе каталога
  if (kitById(id)) return { result: kitResult(id), fixed: true }
  for (const [k, list] of Object.entries(RESULT_LISTS)) if (list.includes(id)) return { result: toKit({ kind: k, id } as BeatResult), fixed: true }
  const syn = RESULT_SYNONYMS[key(id)]
  if (syn) return { result: toKit(syn), fixed: true }
  // id по-русски или английское слово — через библиотеку и словарь
  if (id) {
    const lib = findByWord(id)
    if (lib) return { result: kitResult(lib.id), fixed: true }
    const nid = norm(id)
    for (const e of LEXICON) if (e.stems.some((s) => findStem(nid, s) >= 0)) return { result: toKit(e.result), fixed: true }
  }
  const byQuote = kitFromQuote(quote)
  if (byQuote) return { result: kitResult(byQuote.id), fixed: true }
  return { result: kitResult('crystal'), fixed: true }
}

function fixEnum<T extends string>(list: string[], syn: Record<string, T>, v: unknown, dflt: T): { value: T; fixed: boolean } {
  if (inList<T>(list, v)) return { value: v, fixed: false }
  const s = typeof v === 'string' ? syn[key(v)] : undefined
  return { value: s ?? dflt, fixed: true }
}

function fixTitle(raw: string, fallbackTitle: string): string {
  let t = raw.replace(/[\r\n]+/g, ' ').replace(/^[«"'\s]+|[»"'.\s]+$/g, '').replace(/\s+/g, ' ').trim()
  const w = t.split(' ').filter(Boolean)
  if (w.length > 7) t = w.slice(0, 7).join(' ').replace(/[,:;—-]+$/, '')
  // длина по словам (тире и двоеточие не слова); короче 3 слов — запасное название
  const count = t.split(' ').filter((x) => /[\p{L}\p{N}]/u.test(x)).length
  return count >= 3 && count <= 7 ? t : fallbackTitle
}

/**
 * Бит из конца длинной записи (≥ 600 знаков), если последний бит режиссёра — раньше последней четверти текста:
 * ближайший к концу бит запасного словаря после него. null — не нужен или не нашёлся.
 */
export function endingBeat<B extends Beat>(beats: readonly Beat[], text: string, candidates: readonly B[]): B | null {
  const len = text.trim().length
  if (len < 600 || !beats.length) return null
  const lastPos = Math.max(...beats.map((b) => text.indexOf(b.quote)))
  if (lastPos >= len * 0.75) return null
  const later = candidates
    .map((b) => ({ b, pos: text.indexOf(b.quote) }))
    .filter((x) => x.pos > lastPos + len * 0.1 && !beats.some((b) => b.quote === x.b.quote))
    .sort((a, b) => b.pos - a.pos)
  return later[0]?.b ?? null
}

/** Проверить и починить сценарий. Никогда не бросает. */
export function validateScript(raw: unknown, text: string, ctx: { photos?: number; cards?: readonly (PhotoCard | null)[]; hero?: 'boy' | 'girl' } = {}): ValidationReport {
  const issues: string[] = []
  const stats = { beatsIn: 0, dropped: 0, padded: 0, quotesFixed: 0, idsFixed: 0 }
  const src = isObj(raw) ? raw : {}
  if (!isObj(raw)) issues.push('ответ не объект')
  const fb = fallbackDirect({ text, photos: [], song: null })

  // --- биты ---
  const rawBeats = Array.isArray(src.beats) ? src.beats : []
  stats.beatsIn = rawBeats.length
  const beats: Beat[] = []
  const usedQuotes = new Set<string>()
  for (const rb of rawBeats) {
    const b = isObj(rb) ? rb : {}
    const fq = fixQuote(text, asStr(b.quote))
    if (!fq) {
      stats.dropped++
      issues.push(`цитаты нет в тексте: «${asStr(b.quote)}»`)
      continue
    }
    if (fq.fixed) {
      stats.quotesFixed++
      issues.push(`цитата исправлена: «${asStr(b.quote)}» → «${fq.quote}»`)
    }
    if (usedQuotes.has(fq.quote)) {
      stats.dropped++
      issues.push(`повтор цитаты: «${fq.quote}»`)
      continue
    }
    usedQuotes.add(fq.quote)
    const action = fixEnum<ActionId>(ids.actions, ACTION_SYNONYMS, b.action, 'pull')
    const result = fixResult(b.result, fq.quote)
    const camera = fixEnum<CameraId>(ids.cameras, CAMERA_SYNONYMS, b.camera, 'wide')
    let effect: SceneEffectId | null = null
    let effFixed = false
    if (b.effect !== null && b.effect !== undefined && b.effect !== '' && b.effect !== 'null') {
      const e = fixEnum<SceneEffectId>(ids.sceneEffects, SCENE_EFFECT_SYNONYMS, b.effect, 'palette_shift')
      effect = inList(ids.sceneEffects, b.effect) || SCENE_EFFECT_SYNONYMS[key(asStr(b.effect))] ? e.value : null
      effFixed = e.fixed
    }
    const nFixed = [action.fixed, result.fixed, camera.fixed, effFixed].filter(Boolean).length
    if (nFixed) {
      stats.idsFixed += nFixed
      issues.push(`id исправлены в бите «${fq.quote}»`)
    }
    // поля плана 13 как пришли — их приводит в порядок storyRules ниже
    beats.push({
      quote: fq.quote,
      action: action.value,
      result: result.result,
      camera: camera.value,
      effect,
      ...(typeof b.hero_prop === 'string' ? { hero_prop: b.hero_prop } : {}),
      ...(b.place === null || typeof b.place === 'string' ? { place: (b.place as string | null) || null } : {}),
      ...(b.companion === null || isObj(b.companion) ? { companion: b.companion as Beat['companion'] } : {}),
      ...(typeof b.kind === 'string' ? { kind: b.kind as Beat['kind'] } : {}),
      ...(typeof b.weight === 'number' ? { weight: Math.round(b.weight) as Beat['weight'] } : {}),
      ...(inList<TimeOfDay>(ids.timesOfDay, b.time_of_day) ? { time_of_day: b.time_of_day } : {}),
      ...(inList<Weather>(ids.weathers, b.weather) ? { weather: b.weather } : {}),
      ...(typeof b.photo === 'number' ? { photo: Math.round(b.photo) } : b.photo === null ? { photo: null } : {}),
      ...(typeof b.story === 'string' ? { story: b.story } : {}),
      ...(isEmotion(b.emotion) ? { emotion: b.emotion } : b.emotion === null ? { emotion: null } : {}),
      ...(isAct(b.act) ? { act: b.act } : b.act === null ? { act: null } : {}),
    })
  }
  // грубый предел до правил истории (там — MAX_BEATS по важности)
  if (beats.length > 10) {
    issues.push(`битов ${beats.length} → 10`)
    beats.length = 10
  }
  // не больше MAX_MAKES дорисовок: лишние — кристалл (каждая дорисовка — отдельный вызов)
  let makes = 0
  for (const b of beats) {
    if (b.result.kind !== 'make') continue
    if (++makes > MAX_MAKES) {
      b.result = CRYSTAL
      issues.push(`лишняя дорисовка «${b.quote}» → кристалл`)
    }
  }

  // Меньше MIN_BEATS — добрать из запасного словаря (только новые мысли), потом кристаллами на самых длинных словах.
  if (beats.length < MIN_BEATS) {
    for (const fbBeat of fb.beats) {
      if (beats.length >= MIN_BEATS) break
      if (usedQuotes.has(fbBeat.quote) || beats.some((b) => b.quote.includes(fbBeat.quote) || fbBeat.quote.includes(b.quote))) continue
      usedQuotes.add(fbBeat.quote)
      beats.push({ ...fbBeat, story: undefined, action: fbBeat.result.kind === 'crystal' || fbBeat.result.id === 'crystal' ? 'walk' : fbBeat.action })
      stats.padded++
    }
    const long = words(text).filter((w) => !usedQuotes.has(w.text)).sort((a, b) => b.text.length - a.text.length)
    let k = 0
    while (beats.length < MIN_BEATS) {
      const w = long[k++]
      const quote = w ? w.text : beats[0]?.quote ?? (text.trim() || text)
      if (w) usedQuotes.add(w.text)
      beats.push({ quote, action: beats.length % 2 ? 'walk' : 'sit', result: CRYSTAL, camera: 'wide', effect: null })
      stats.padded++
    }
    issues.push(`добавлено битов: ${stats.padded}`)
    // по порядку текста
    beats.sort((a, b) => text.indexOf(a.quote) - text.indexOf(b.quote))
  }
  const before = beats.map((b) => b.action).join()
  varyActions(beats)
  if (beats.map((b) => b.action).join() !== before) issues.push('действия разнообразены (не больше двух подряд)')

  // --- настроение ---
  const rm = isObj(src.mood) ? src.mood : null
  if (!rm) issues.push('нет mood — по словам текста')
  const tm = moodFromText(text)
  const mood: Mood = {
    warmth: clamp(rm?.warmth, -1, 1, tm.warmth),
    tension: clamp(rm?.tension, -1, 1, tm.tension),
    energy: clamp(rm?.energy, -1, 1, tm.energy),
    openness: clamp(rm?.openness, -1, 1, tm.openness),
  }

  // --- противоречие ---
  let contradiction: Contradiction | null = null
  if (isObj(src.contradiction)) {
    const c = src.contradiction
    const a = asStr(c.a).trim()
    const b = asStr(c.b).trim()
    if (a && b) {
      const st = fixEnum<StagingId>(ids.stagings, STAGING_SYNONYMS, c.staging, contradictionFromText(text)?.staging ?? 'slow_walk_bright_light')
      if (st.fixed) issues.push('staging исправлен')
      contradiction = { a, b, staging: st.value }
    } else issues.push('contradiction без a/b → null')
  }

  // --- сцена ---
  const time = inList<TimeOfDay>(ids.timesOfDay, src.time_of_day) ? src.time_of_day : fb.time_of_day
  const weather = inList<Weather>(ids.weathers, src.weather) ? src.weather : fb.weather
  const place = inList<PlaceId>(ids.places, src.place) ? src.place : fb.place
  if (time !== src.time_of_day || weather !== src.weather || place !== src.place) issues.push('сцена (время/погода/место) дополнена')

  // --- правила истории (план 13): главный предмет — вещь, result = он, без повторов подряд, 4–6 битов ---
  // какие биты — чувства, решает код (режиссёр путает): цитата-чувство без действия — бит-чувство, остальное — обычный бит
  issues.push(...settleFeelings(beats))
  // эмоции (до правил истории: бит-чувство остаётся без предмета): бит-чувство без эмоции от режиссёра — по словам цитаты и строки; не нашлась — обычный бит с предметом
  for (const b of beats) {
    if (b.emotion === undefined || (b.kind === 'feeling' && !b.emotion)) {
      const e = emotionFromText(`${b.quote} ${b.story ?? ''}`)
      if (e) b.emotion = e
    }
  }
  const told = storyRules(beats, { contradiction, time_of_day: time, weather, text })
  issues.push(...told.issues)
  beats.splice(0, beats.length, ...told.beats)
  // одна мысль — один раз: бит, чья мысль уже сказана рассказом прошлого бита, или то же чувство подряд — уходит
  const rep = dropRepeats(beats, MIN_BEATS, emotionOnly)
  if (rep.issues.length) {
    issues.push(...rep.issues)
    beats.splice(0, beats.length, ...rep.beats)
  }
  // длинная запись, а биты кончились в середине дня — рассказ обрывается: бит из конца записи (запасной словарь)
  const ending = endingBeat(beats, text, fb.beats)
  if (ending) {
    if (beats.length >= MAX_BEATS) {
      // место — за счёт самого лёгкого бита (не первого и не с человеком)
      let drop = -1
      beats.forEach((b, i) => {
        if (i === 0 || b.companion || (drop >= 0 && (b.weight ?? 2) >= (beats[drop].weight ?? 2))) return
        drop = i
      })
      if (drop >= 0) beats.splice(drop, 1)
    }
    if (beats.length < MAX_BEATS) {
      beats.push({ ...ending, story: undefined })
      issues.push(`конец дня: добавлен бит «${ending.quote}»`)
    }
  }
  // снимки: номер в пределах фото дня, один бит на снимок (первому биту снимок проявляет сцена во время раскрытия книги)
  const seenPhoto = new Set<number>()
  beats.forEach((b, i) => {
    if (b.photo === undefined || b.photo === null) return
    const n = ctx.photos ?? 0
    if (b.photo < 0 || b.photo >= n || seenPhoto.has(b.photo)) {
      issues.push(`photo ${b.photo} у бита «${b.quote}» → null`)
      b.photo = null
      return
    }
    seenPhoto.add(b.photo)
  })
  // режиссёр не связал снимок с фразой — связываем кодом по вещам и месту с фото (match — запасной признак);
  // связь хранится в сценарии, и день с полки собирается так же
  if (ctx.cards?.some(Boolean)) {
    const taken = beats.map((b, i) => (b.photo !== undefined && b.photo !== null ? i : -1)).filter((i) => i >= 0)
    const pairs = matchPhotos(beats, ctx.cards, { takenBeats: taken, takenPhotos: [...seenPhoto], max: Math.max(0, 3 - seenPhoto.size) })
    for (const [i, p] of pairs) {
      beats[i].photo = p
      issues.push(`снимок ${p} → бит «${beats[i].quote}»`)
    }
  }
  // строки рассказа (план 15 § 1.1): строка режиссёра, если годится (длина, имена из текста), иначе — предложение бита со связкой
  // факты сверяем с записью и снимками; род «я» — по герою
  const st = fillStories(beats, text, { hero: ctx.hero, ref: [text, ...photoRef(ctx.cards)].join('\n') })
  beats.splice(0, beats.length, ...st.beats)
  issues.push(...st.issues)
  // ещё раз «одна мысль — один раз» по итоговым строкам: запасная строка могла сказать и мысль следующего бита
  const rep2 = dropRepeats(beats, MIN_BEATS, emotionOnly)
  if (rep2.issues.length) {
    issues.push(...rep2.issues)
    beats.splice(0, beats.length, ...rep2.beats)
  }
  let palette = (Array.isArray(src.palette_hint) ? src.palette_hint : []).filter((c): c is string => inList(ids.paletteColors, c))
  palette = [...new Set(palette)].slice(0, 5)
  if (palette.length === 0) {
    palette = fb.palette_hint
    issues.push('palette_hint пустой')
  }

  // --- песня ---
  const rs = isObj(src.song) ? src.song : {}
  const song = {
    tempo: inList<Tempo>(ids.tempos, rs.tempo) ? rs.tempo : fb.song.tempo,
    energy: clamp(rs.energy, 0, 1, fb.song.energy),
    estimated: typeof rs.estimated === 'boolean' ? rs.estimated : true,
  }

  // --- название и причины ---
  const rawTitle = asStr(src.title)
  const title = fixTitle(rawTitle, fb.title)
  if (title !== rawTitle) issues.push(`название исправлено: «${rawTitle}» → «${title}»`)
  const rawWhy = (Array.isArray(src.why) ? src.why : []).map(asStr).map((s) => s.trim()).filter(Boolean)
  const why = [0, 1, 2].map((i) => rawWhy[i] ?? fb.why[i]) as [string, string, string]
  if (rawWhy.length !== 3) issues.push(`why: ${rawWhy.length} строк → 3`)

  return {
    script: { title, mood, contradiction, time_of_day: time, weather, place, palette_hint: palette, song, beats, why },
    issues,
    stats,
  }
}

/** Строгая проверка без починки — для тестов и оценки. Возвращает список нарушений. */
export function checkScript(s: DayScript, text: string): string[] {
  const errs: string[] = []
  if (!s || typeof s !== 'object') return ['не объект']
  const tw = s.title?.split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x)).length ?? 0
  if (tw < 3 || tw > 7) errs.push(`title ${tw} слов`)
  if (!Array.isArray(s.beats) || s.beats.length < MIN_BEATS || s.beats.length > MAX_BEATS) errs.push(`битов ${s.beats?.length}`)
  for (const b of s.beats ?? []) {
    if (!b.quote || !text.includes(b.quote)) errs.push(`quote не подстрока: «${b.quote}»`)
    if (!ids.actions.includes(b.action)) errs.push(`action ${b.action}`)
    if (!ids.cameras.includes(b.camera)) errs.push(`camera ${b.camera}`)
    if (b.effect !== null && !ids.sceneEffects.includes(b.effect)) errs.push(`effect ${b.effect}`)
    const r = b.result
    if (r?.kind === 'kit') {
      if (!kitById(r.id)) errs.push(`kit ${r.id}`)
    } else if (r?.kind === 'make') {
      if (!r.name?.trim() || !r.id?.startsWith('make:') || !Array.isArray(r.tags)) errs.push(`make ${r.name}`)
    } else {
      const list = r?.kind === 'crystal' ? ['crystal'] : RESULT_LISTS[r?.kind]
      if (!list || !list.includes(r.id)) errs.push(`result ${r?.kind}:${r?.id}`)
    }
  }
  for (const k of ['warmth', 'tension', 'energy', 'openness'] as const) {
    const v = s.mood?.[k]
    if (typeof v !== 'number' || v < -1 || v > 1) errs.push(`mood.${k}`)
  }
  if (s.contradiction && !ids.stagings.includes(s.contradiction.staging)) errs.push('staging')
  if (!ids.timesOfDay.includes(s.time_of_day)) errs.push('time_of_day')
  if (!ids.weathers.includes(s.weather)) errs.push('weather')
  if (!ids.places.includes(s.place)) errs.push('place')
  if (!Array.isArray(s.palette_hint) || s.palette_hint.some((c) => !ids.paletteColors.includes(c))) errs.push('palette_hint')
  if (!s.song || !ids.tempos.includes(s.song.tempo) || s.song.energy < 0 || s.song.energy > 1 || typeof s.song.estimated !== 'boolean') errs.push('song')
  if (!Array.isArray(s.why) || s.why.length !== 3 || s.why.some((w) => typeof w !== 'string' || !w)) errs.push('why')
  return errs
}
