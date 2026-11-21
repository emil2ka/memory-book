// Запасной режиссёр без сети: словарь «ключевые слова → предметы» и настроение по словам.
// Для любого непустого текста возвращает валидный DayScript с 4–7 битами.
import { tempoToCategory } from '../audio/tempo'
import type { ActionId, Beat, CameraId, Contradiction, DayScript, DirectorInput, Mood, PlaceId, SceneEffectId, TimeOfDay, Weather } from '../types/script'
import { CONTRADICTION_RULES, LEXICON, MOOD_WORDS, TIME_WORDS, type LexEntry } from './lexicon'
import { expandToWord, findStem, norm, words } from './text'
import { findByWord } from '../kit/library'
import { kitResult, toKit } from './results'

const clamp = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v))
const round2 = (v: number) => Math.round(v * 100) / 100

interface Hit {
  entry: LexEntry
  quote: string
  start: number
}

function lexHits(text: string): Hit[] {
  const nt = norm(text)
  const hits: Hit[] = []
  const taken: [number, number][] = []
  for (const entry of LEXICON) {
    for (const stem of entry.stems) {
      let from = 0
      for (;;) {
        const i = findStem(nt, stem, from)
        if (i < 0) break
        from = i + 1
        const { start, end } = expandToWord(text, i, i + norm(stem).length)
        if (taken.some(([a, b]) => start < b && end > a)) continue
        taken.push([start, end])
        hits.push({ entry, quote: text.slice(start, end), start })
      }
    }
  }
  // слова, которых нет в словаре, но есть в библиотеке кита (юрта, самовар, тюльпан…)
  for (const w of words(text)) {
    if (taken.some(([a, b]) => w.start < b && w.start + w.text.length > a)) continue
    const m = findByWord(w.text)
    if (!m || m.id === 'crystal') continue
    taken.push([w.start, w.start + w.text.length])
    hits.push({ entry: { stems: [], result: kitResult(m.id), noun: m.ru }, quote: w.text, start: w.start })
  }
  return hits.sort((a, b) => a.start - b.start)
}

const has = (nt: string, stems: string[]) => stems.some((s) => findStem(nt, s) >= 0)

export function moodFromText(text: string): Mood {
  const nt = norm(text)
  const m = { warmth: 0, tension: 0, energy: 0, openness: 0 }
  let n = 0
  for (const [stems, w, t, e, o] of MOOD_WORDS) {
    if (has(nt, stems)) {
      m.warmth += w; m.tension += t; m.energy += e; m.openness += o
      n++
    }
  }
  const k = n > 1 ? 1 / Math.sqrt(n) : 1
  return {
    warmth: round2(clamp(m.warmth * k)),
    tension: round2(clamp(m.tension * k)),
    energy: round2(clamp(m.energy * k)),
    openness: round2(clamp(m.openness * k)),
  }
}

export function contradictionFromText(text: string): Contradiction | null {
  const nt = norm(text)
  for (const r of CONTRADICTION_RULES) if (has(nt, r.a) && has(nt, r.b)) return { a: r.labelA, b: r.labelB, staging: r.staging }
  return null
}

function timeFromText(nt: string): TimeOfDay {
  for (const [stems, t] of TIME_WORDS) if (has(nt, stems)) return t
  return 'day'
}

function paletteFromMood(m: Mood, weather: Weather): string[] {
  if (weather === 'snow') return ['white', 'grey_blue', 'slate_blue', 'amber']
  if (weather === 'rain') return ['slate_blue', 'grey_blue', 'navy', 'amber']
  if (m.tension > 0.35) return ['navy', 'slate_blue', 'grey_blue', 'coral']
  if (m.warmth > 0.3 && m.energy > 0.2) return ['amber', 'coral', 'teal', 'cream']
  if (m.warmth > 0.2) return ['amber', 'ochre', 'soft_green', 'brown']
  if (m.energy < -0.3) return ['white', 'grey_blue', 'slate_blue', 'amber']
  return ['cream', 'ochre', 'soft_green', 'slate_blue']
}

const TITLE_TIME: Record<TimeOfDay, string> = { morning: 'Утро', day: 'День', evening: 'Вечер', night: 'Ночь' }

function makeTitle(time: TimeOfDay, nouns: string[]): string {
  const uniq = [...new Set(nouns)].slice(0, 2)
  if (uniq.length === 2) return `${TITLE_TIME[time]}: ${uniq[0]} и ${uniq[1]}`
  if (uniq.length === 1) return `${TITLE_TIME[time]} и ${uniq[0]}`
  return `${TITLE_TIME[time]} этого дня`
}

function defaultAction(h: Hit): ActionId {
  if (h.entry.action) return h.entry.action
  switch (h.entry.result.kind) {
    case 'effect': return 'shake'
    case 'item': return 'pull'
    default: return 'pull'
  }
}

/** Не больше двух одинаковых действий подряд. */
export function varyActions(beats: Beat[]): void {
  const alt: Record<ActionId, ActionId> = { pull: 'carry', carry: 'pull', shake: 'pull', walk: 'pull', drink: 'pull', sit: 'pull', shiver: 'pull', cheer: 'pull' }
  for (let i = 2; i < beats.length; i++) {
    if (beats[i].action === beats[i - 1].action && beats[i].action === beats[i - 2].action) {
      beats[i] = { ...beats[i], action: beats[i].result.kind === 'effect' && beats[i].action !== 'shake' ? 'shake' : alt[beats[i].action] }
    }
  }
}

function cameraPlan(mood: Mood, n: number): CameraId[] {
  const tense = mood.tension > 0.3
  const quiet = mood.energy < -0.3 && mood.tension < 0
  const cycle: CameraId[] = tense ? ['hard_cut', 'push_in', 'hard_cut', 'wide'] : quiet ? ['hold', 'wide', 'hold', 'push_in'] : ['push_in', 'orbit_quarter', 'push_in', 'wide']
  return Array.from({ length: n }, (_, i) => (i === 0 ? 'wide' : cycle[(i - 1) % cycle.length]))
}

export function fallbackDirect(input: Pick<DirectorInput, 'text'> & Partial<DirectorInput>): DayScript {
  const text = input.text ?? ''
  const nt = norm(text)
  const mood = moodFromText(text)
  const contradiction = contradictionFromText(text)

  // 1. Слова из словаря, разные результаты, в порядке текста.
  const hits = lexHits(text)
  const chosen: Hit[] = []
  const seen = new Set<string>()
  for (const h of hits) {
    const r = toKit(h.entry.result)
    const key = `${r.kind}:${r.id}`
    if (seen.has(key)) continue
    seen.add(key)
    chosen.push(h)
    if (chosen.length === 7) break
  }

  const beats: Beat[] = chosen.map((h) => ({ quote: h.quote, action: defaultAction(h), result: toKit(h.entry.result), camera: 'wide', effect: null }))

  // 2. Добрать до 4 битов самыми длинными словами (кристаллы памяти).
  if (beats.length < 4) {
    const used = new Set(beats.map((b) => b.quote))
    const long = words(text).filter((w) => w.text.length >= 3 && !used.has(w.text)).sort((a, b) => b.text.length - a.text.length || a.start - b.start)
    const pool = long.length ? long : words(text)
    let k = 0
    while (beats.length < 4) {
      const w = pool[k % Math.max(1, pool.length)]
      const quote = w ? w.text : text.trim() || text
      beats.push({ quote, action: beats.length % 2 ? 'walk' : 'sit', result: kitResult('crystal'), camera: 'wide', effect: null })
      k++
    }
    // в порядке появления в тексте
    beats.sort((a, b) => text.indexOf(a.quote) - text.indexOf(b.quote))
  }
  varyActions(beats)

  // 3. Камера и эффекты.
  const cams = cameraPlan(mood, beats.length)
  let paletteShiftUsed = false
  beats.forEach((b, i) => {
    b.camera = cams[i]
    const entry = chosen.find((h) => h.quote === b.quote)?.entry
    let eff: SceneEffectId | null = entry?.effect ?? null
    if (eff === 'palette_shift') {
      if (paletteShiftUsed) eff = null
      paletteShiftUsed = true
    }
    if (eff === 'lamp_flicker' && mood.tension < 0.2 && entry?.result.kind !== 'item') eff = null
    if (!eff && mood.tension > 0.5 && i === 0) eff = 'page_shake'
    b.effect = eff
  })

  // 4. Сцена.
  let weather: Weather = 'clear'
  let place: PlaceId = 'home'
  let placeSet = false
  let time = timeFromText(nt)
  for (const h of chosen) {
    if (h.entry.weather && weather === 'clear') weather = h.entry.weather
    if (h.entry.place && !placeSet) { place = h.entry.place; placeSet = true }
    if (h.entry.time && time === 'day') time = h.entry.time
  }
  if (!placeSet && has(nt, ['улиц', 'пешком', 'шёл', 'шел'])) place = 'street'

  const nouns = chosen.map((h) => h.entry.noun).filter((n): n is string => !!n && n !== 'мы')
  const measured = input.song?.measuredTempoBpm
  const energy = round2(clamp(0.5 + mood.energy * 0.4, 0, 1))
  const song = measured
    ? { tempo: tempoToCategory(measured), energy, estimated: false }
    : { tempo: mood.energy > 0.3 || mood.tension > 0.5 ? ('fast' as const) : mood.energy < -0.2 ? ('slow' as const) : ('medium' as const), energy, estimated: true }

  const photos = input.photos?.length ?? 0
  const why: [string, string, string] = [
    contradiction
      ? `Текст: ${contradiction.a} и ${contradiction.b} вместе → два света в одном кадре`
      : `Текст: слова «${beats.slice(0, 2).map((b) => b.quote).join('», «')}» → предметы на странице`,
    photos ? `Фото: ${photos} шт. → палитра дня по фото` : 'Фото: нет фото → палитра по настроению текста',
    measured ? `Песня: ${Math.round(measured)} bpm → ${song.tempo === 'fast' ? 'быстрый' : song.tempo === 'slow' ? 'медленный' : 'ровный'} шаг` : `Песня: темп оценён по настроению → ${song.tempo === 'fast' ? 'быстрый' : song.tempo === 'slow' ? 'медленный' : 'ровный'} шаг`,
  ]

  return {
    title: makeTitle(time, nouns),
    mood,
    contradiction,
    time_of_day: time,
    weather,
    place,
    palette_hint: paletteFromMood(mood, weather),
    song,
    beats,
    why,
  }
}
