// Страховка (05-director-llm, «Страховка в коде»): из любого ответа LLM делает валидный DayScript.
import type { ActionId, Beat, BeatResult, CameraId, Contradiction, DayScript, Mood, PlaceId, SceneEffectId, StagingId, Tempo, TimeOfDay, Weather } from '../types/script'
import { contradictionFromText, fallbackDirect, moodFromText, varyActions } from './fallback'
import { ACTION_SYNONYMS, CAMERA_SYNONYMS, LEXICON, RESULT_SYNONYMS, SCENE_EFFECT_SYNONYMS, STAGING_SYNONYMS } from './lexicon'
import { ids } from './schema'
import { expandToWord, findStem, isLetter, nearestQuote, norm, words } from './text'

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
const CRYSTAL: BeatResult = { kind: 'crystal', id: 'crystal' }

/** Привести результат к каталогу: неизвестный id → синоним → кристалл. */
export function fixResult(raw: unknown): { result: BeatResult; fixed: boolean } {
  const r = isObj(raw) ? raw : {}
  const kind = asStr(r.kind)
  const id = asStr(r.id)
  if (kind === 'crystal') return { result: CRYSTAL, fixed: id !== 'crystal' }
  if (RESULT_LISTS[kind]?.includes(id)) return { result: { kind, id } as BeatResult, fixed: false }
  // id есть, но в другом разделе каталога
  for (const [k, list] of Object.entries(RESULT_LISTS)) if (list.includes(id)) return { result: { kind: k, id } as BeatResult, fixed: true }
  const syn = RESULT_SYNONYMS[key(id)]
  if (syn) return { result: syn, fixed: true }
  // id по-русски — через словарь
  if (id) {
    const nid = norm(id)
    for (const e of LEXICON) if (e.stems.some((s) => findStem(nid, s) >= 0)) return { result: e.result, fixed: true }
  }
  return { result: CRYSTAL, fixed: true }
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

/** Проверить и починить сценарий. Никогда не бросает. */
export function validateScript(raw: unknown, text: string): ValidationReport {
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
    const result = fixResult(b.result)
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
    beats.push({ quote: fq.quote, action: action.value, result: result.result, camera: camera.value, effect })
  }
  if (beats.length > 7) {
    issues.push(`битов ${beats.length} → 7`)
    beats.length = 7
  }

  // Меньше 4 — добрать из запасного словаря, потом кристаллами на самых длинных словах.
  if (beats.length < 4) {
    for (const fbBeat of fb.beats) {
      if (beats.length >= 4) break
      if (usedQuotes.has(fbBeat.quote)) continue
      usedQuotes.add(fbBeat.quote)
      beats.push({ ...fbBeat, action: fbBeat.result.kind === 'crystal' ? 'walk' : fbBeat.action })
      stats.padded++
    }
    const long = words(text).filter((w) => !usedQuotes.has(w.text)).sort((a, b) => b.text.length - a.text.length)
    let k = 0
    while (beats.length < 4) {
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
  if (!Array.isArray(s.beats) || s.beats.length < 4 || s.beats.length > 7) errs.push(`битов ${s.beats?.length}`)
  for (const b of s.beats ?? []) {
    if (!b.quote || !text.includes(b.quote)) errs.push(`quote не подстрока: «${b.quote}»`)
    if (!ids.actions.includes(b.action)) errs.push(`action ${b.action}`)
    if (!ids.cameras.includes(b.camera)) errs.push(`camera ${b.camera}`)
    if (b.effect !== null && !ids.sceneEffects.includes(b.effect)) errs.push(`effect ${b.effect}`)
    const list = b.result?.kind === 'crystal' ? ['crystal'] : RESULT_LISTS[b.result?.kind]
    if (!list || !list.includes(b.result.id)) errs.push(`result ${b.result?.kind}:${b.result?.id}`)
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
