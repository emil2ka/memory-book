// Проверки перед «Собрать» и цвет корешка по настроению. Чистые функции.
import type { Mood } from '../types/script'
import { PALETTE, css } from '../scene/palette'

/** Число предложений: куски текста с буквами, разделённые . ! ? … */
export function countSentences(text: string): number {
  return text
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter((s) => /\p{L}{2,}/u.test(s)).length
}

export type Need = 'text' | 'photos' | 'song'

export function missingParts(d: { text: string; photos: number; song: boolean }): Need[] {
  const out: Need[] = []
  if (countSentences(d.text) < 2) out.push('text')
  if (d.photos < 1) out.push('photos')
  if (!d.song) out.push('song')
  return out
}

/** Цвет корешка книги от настроения дня (цвета мастер-палитры). */
export function spineColor(m: Mood): string {
  if (m.tension > 0.4) return css(m.warmth > 0 ? PALETTE.brickDark : PALETTE.slateDark)
  if (m.energy < -0.4 && m.tension <= 0) return css(PALETTE.greyBlue)
  if (m.warmth > 0.5 && m.energy > 0.3) return css(PALETTE.coral)
  if (m.warmth > 0.3) return css(PALETTE.ochre)
  if (m.warmth < -0.2) return css(PALETTE.slate)
  if (m.openness > 0.3) return css(PALETTE.teal)
  return css(PALETTE.green)
}

/** Толщина корешка от длины записи, CSS-пиксели. */
export function spineWidth(textLength: number): number {
  return Math.round(Math.min(40, Math.max(18, 14 + textLength / 12)))
}

/** Самая длинная запись дня (план 15 § 1.5). */
export const MAX_TEXT = 3000
