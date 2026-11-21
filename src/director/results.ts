// Результаты битов в мире кита: предмет из библиотеки (kit) или дорисовка (make).
// Прежние item/popup — те же id в библиотеке, поэтому переводятся в kit без потерь.
import { KIT_LIBRARY, findByWord, kitById, makeKey } from '../kit/library'
import type { KitModel } from '../kit/format'
import type { BeatResult } from '../types/script'

export const kitResult = (id: string): BeatResult => ({ kind: 'kit', id })

/** Теги, которые режиссёр может дать дорисовке: все теги библиотеки. */
export const MAKE_TAGS: readonly string[] = [...new Set(KIT_LIBRARY.flatMap((m) => m.tags))].sort()

/** Дорисовка: имя в именительном падеже, подсказка до 240 знаков, до 6 тегов из библиотеки. */
export function makeResult(name: string, hint = '', tags: readonly string[] = []): BeatResult {
  const n = name.trim().slice(0, 60)
  return {
    kind: 'make',
    id: `make:${makeKey(n)}`,
    name: n,
    hint: hint.trim().slice(0, 240),
    tags: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => MAKE_TAGS.includes(t)))].slice(0, 6),
  }
}

/** item/popup → kit (те же id). Остальное без изменений. */
export function toKit(r: BeatResult): BeatResult {
  if ((r.kind === 'item' || r.kind === 'popup') && kitById(r.id)) return kitResult(r.id)
  return r
}

/** Предмет библиотеки для результата (kit, а также прежние item/popup), иначе null. */
export function kitOf(r: BeatResult): KitModel | null {
  if (r.kind === 'kit' || r.kind === 'item' || r.kind === 'popup') return kitById(r.id) ?? null
  return null
}

/** Предмет по словам цитаты: первое слово, которое есть в библиотеке. */
export function kitFromQuote(quote: string): KitModel | null {
  for (const w of quote.split(/[\s,.;:!?«»"()]+/)) {
    const m = findByWord(w)
    if (m) return m
  }
  return null
}

/** Теги результата: у kit — из библиотеки, у make — свои. Для реакции человечка и монтажа. */
export function resultTags(r: BeatResult): { tags: readonly string[]; hold?: KitModel['hold'] } {
  const m = kitOf(r)
  if (m) return { tags: m.tags, hold: m.hold }
  if (r.kind === 'make') return { tags: r.tags }
  return { tags: [] }
}
