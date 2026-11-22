// Манифест мира стола: assets/models/world/world.json. Чистые функции — работают и в node (тесты).
import raw from '../../assets/models/world/world.json'
import type { DayScript } from '../types/script'
import { makeRng } from '../timeline/rng'

export type Vec3 = [number, number, number]

/** Роли клипов вещи: idle — зациклен всегда, appear — один раз при появлении, event — по команде сцены. */
export type ClipRole = 'idle' | 'appear' | 'event'

export interface RoomEntry {
  file: string
  /** Где стоит в комнате (координаты мира сцены). */
  at?: Vec3
  size: Vec3
}

export interface SlotDef {
  /** Точка на столе в координатах мира сцены… */
  at?: Vec3
  /** …или узел в модели комнаты: "window/slot_sill_0". */
  node?: string
  /** Сколько места: ширина, высота, глубина. */
  size: Vec3
  surface: 'desk' | 'sill' | 'shelf'
}

export interface ItemDef {
  id: string
  file: string
  ru: string
  /** Подходящие слоты в порядке предпочтения. */
  slots: string[]
  tags: string[]
  /** Вес при выборе, по умолчанию 1. */
  weight?: number
  /** Вещи одной группы (напитки) в один день не встречаются. */
  group?: string
  clips?: Partial<Record<ClipRole, string>>
  size: Vec3
  /** Живой огонёк: точечный свет у узла; яркость следует за масштабом узла (клип Flame / Twinkle). */
  light?: { node: string; color: string; intensity: number; distance: number }
}

export interface WorldManifest {
  version: number
  room: Record<'wall' | 'window' | 'shelf' | 'book_spine', RoomEntry> & Partial<Record<'floor' | 'desk_base', RoomEntry>>
  slots: Record<string, SlotDef>
  items: ItemDef[]
}

export const WORLD = raw as unknown as WorldManifest

/** Все теги, которые понимает выбор. */
export const TAGS = ['warm', 'cold', 'work', 'study', 'night', 'morning', 'rain', 'snow', 'holiday', 'music', 'nature', 'kz', 'home', 'calm', 'joy', 'tense'] as const

const PLACE_TAGS: Record<string, string[]> = {
  home: ['home', 'warm'],
  park: ['nature'],
  nature: ['nature'],
  forest: ['nature'],
  mountains: ['nature', 'kz', 'cold'],
  school: ['study'],
  university: ['study'],
  library: ['study'],
  office: ['work'],
  work: ['work'],
  cafe: ['warm'],
  city: ['work'],
  street: [],
  concert: ['music'],
  aul: ['kz', 'nature'],
  yurt: ['kz', 'warm'],
}

/** Слова в id результатов битов, которые добавляют тег дню. */
const WORD_TAGS: [RegExp, string][] = [
  [/tea|cocoa|coffee|kese|soup|blanket|scarf|fire|candle|sun/, 'warm'],
  [/snow|frost|ice|cold|winter|mitten/, 'cold'],
  [/rain|umbrella|puddle/, 'rain'],
  [/book|notebook|pencil|school|exam|lesson|study/, 'study'],
  [/laptop|work|office|desk|phone|meeting/, 'work'],
  [/music|song|guitar|dombra|headphone|cassette|piano|concert/, 'music'],
  [/tree|leaf|leaves|flower|park|forest|plant|mountain|bird|cat|dog/, 'nature'],
  [/yurt|dombra|kese|baursak|beshbarmak|samsa|tubeteika|alatau|kz/, 'kz'],
  [/gift|cake|balloon|star|holiday|garland|firework/, 'holiday'],
]

/** Теги дня из сценария: время, погода, место, настроение, противоречие и предметы битов. */
export function dayTags(script: DayScript): { tags: Set<string>; sides: [string[], string[]] | null } {
  const tags = new Set<string>()
  const t = script.time_of_day
  if (t === 'night' || t === 'evening') tags.add('night')
  if (t === 'morning') tags.add('morning')
  if (script.weather === 'rain') tags.add('rain')
  if (script.weather === 'snow') tags.add('snow').add('cold')
  for (const x of PLACE_TAGS[script.place] ?? []) tags.add(x)
  const m = script.mood
  if (m.warmth > 0.2) tags.add('warm')
  if (m.warmth < -0.2) tags.add('cold')
  if (m.tension > 0.3) tags.add('tense')
  if (m.energy > 0.4) tags.add('joy')
  if (m.energy < 0 && m.tension <= 0) tags.add('calm')
  for (const b of script.beats) {
    const r = b.result
    const words = [r.id, 'name' in r ? r.name : '', ...('tags' in r ? r.tags : [])].join(' ').toLowerCase()
    for (const [re, tag] of WORD_TAGS) if (re.test(words)) tags.add(tag)
  }
  // противоречивый день: вещи обоих настроений
  let sides: [string[], string[]] | null = null
  const c = script.contradiction
  if (c) {
    const st = c.staging.toLowerCase()
    const a: string[] = []
    const b: string[] = []
    if (/frost|cold|snow/.test(st)) a.push('cold')
    if (/warm/.test(st)) b.push('warm')
    if (/crowd|noise|loud/.test(st)) a.push('joy')
    if (/alone|empty|lonely/.test(st)) b.push('calm')
    if (/tired|slow/.test(st)) a.push('calm')
    if (/bright|happy|glad/.test(st)) b.push('joy')
    if (a.length && b.length) {
      sides = [a, b]
      for (const x of [...a, ...b]) tags.add(x)
    }
  }
  return { tags, sides }
}

/** Вещь помещается в слот (с запасом 0.3 по ширине и глубине; слот без описания — всегда). */
export function fits(it: ItemDef, slot: string, slots: Record<string, SlotDef> = WORLD.slots): boolean {
  const s = slots[slot]
  if (!s) return true
  const [w, h, d] = it.size
  return Math.min(w, d) <= Math.min(s.size[0], s.size[2]) + 0.3 && Math.max(w, d) <= Math.max(s.size[0], s.size[2]) + 0.3 && h <= s.size[1] + 0.3
}

const GENERIC = new Set(['warm', 'calm', 'home', 'joy', 'night', 'morning'])

export interface Placement {
  item: ItemDef
  slot: string
}

/**
 * Выбрать 3–5 вещей дня и разложить их по слотам. Один и тот же день (сценарий + seed) — всегда одна раскладка.
 * Противоречивый день берёт хотя бы по одной вещи с каждой стороны.
 */
export function chooseItems(script: DayScript, seed: number, items: ItemDef[] = WORLD.items, slots: string[] = Object.keys(WORLD.slots)): Placement[] {
  const rng = makeRng((seed >>> 0) ^ 0x51ed27)
  const { tags, sides } = dayTags(script)
  const free = new Set(slots)
  const want = Math.min(items.length, 3 + Math.floor(rng() * 3))
  const score = (it: ItemDef) => {
    // конкретные теги (снег, работа, музыка…) весят втрое больше общих (тепло, спокойно, дом)
    const hit = it.tags.filter((t) => tags.has(t)).reduce((s, t) => s + (GENERIC.has(t) ? 1 : 3), 0)
    // вещь без совпадений почти не выпадает, но не запрещена: стол не бывает пустым
    return (it.weight ?? 1) * (hit === 0 ? 0.15 : (1 + hit) * (1 + hit))
  }
  const out: Placement[] = []
  const pool = items.filter((it) => it.slots.some((s) => free.has(s) && fits(it, s)))
  const take = (it: ItemDef) => {
    const slot = it.slots.find((s) => free.has(s) && fits(it, s))
    pool.splice(pool.indexOf(it), 1)
    if (!slot) return
    if (it.group) for (const o of pool.filter((x) => x.group === it.group)) pool.splice(pool.indexOf(o), 1)
    free.delete(slot)
    out.push({ item: it, slot })
  }
  // противоречие: лучшая вещь каждой стороны — первой
  if (sides) {
    for (const side of sides) {
      const best = pool
        .filter((it) => it.tags.some((t) => side.includes(t)))
        .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0]
      if (best) take(best)
    }
  }
  while (out.length < want && pool.length) {
    const total = pool.reduce((s, it) => s + score(it), 0)
    let r = rng() * total
    let pick = pool[pool.length - 1]
    for (const it of pool) {
      r -= score(it)
      if (r <= 0) {
        pick = it
        break
      }
    }
    take(pick)
  }
  return out
}

/** Насыщенные цвета корешков: полка читается серией, а не стеной одного тёмного тона. */
export const SPINE_COLORS = ['brick_red', 'amber', 'teal', 'coral', 'navy', 'ochre', 'soft_green']

/**
 * Цвет книги-дня на полке (и обложки в фильме — тот же): насыщенный цвет из палитры дня,
 * какой из них — по id (у похожих палитр разные дни получают разные цвета); в палитре таких нет — по id из всех.
 */
export function spineColorName(paletteHint: string[] | undefined, id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const own = (paletteHint ?? []).filter((n) => SPINE_COLORS.includes(n))
  const pool = own.length ? own : SPINE_COLORS
  return pool[h % pool.length]
}
