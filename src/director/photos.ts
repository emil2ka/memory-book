// Какой бит дня — про какой снимок (роль фото, план 14). Главный признак — вещи и место: у бита главный предмет
// или место совпадает с вещами и местом карточки (баурсаки на фото → «напекла баурсаков», а не «поехали к бабушке»).
// Предложение card.match — только запасной признак. Общее для режиссёра (validate) и хореографа (planPhotos).
import type { Beat, PhotoCard } from '../types/script'

const stems = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/ё/g, 'е')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3)
      .map((w) => w.slice(0, Math.max(4, w.length - 2))),
  )
/** Сколько общих основ слов у двух текстов. */
export const overlap = (a: string, b: string) => {
  const A = stems(a)
  let n = 0
  for (const w of stems(b)) if (A.has(w)) n++
  return n
}
export const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * Насколько бит про этот снимок:
 * +4 предмет бита — та же вещь библиотеки, что на фото (result.id среди ref карточки);
 * +2 за каждое совпадение главного предмета или места бита с вещами и местом фото (по словам);
 * +1 за совпадение слов цитаты с вещами и местом фото;
 * +1 человек бита совпадает с человеком на фото (роль);
 * +1 цитата входит в предложение card.match (запасной признак).
 */
export function photoScore(b: Pick<Beat, 'quote' | 'result' | 'hero_prop' | 'place' | 'companion'>, card: PhotoCard): number {
  let sc = 0
  const refs = new Set([card.place.ref, ...card.things.map((t) => t.ref)].filter(Boolean))
  if (b.result.kind === 'kit' && refs.has(b.result.id)) sc += 4
  const cardWords = [card.place.ru, ...card.things.map((t) => t.ru)].join(' ')
  sc += 2 * overlap(`${b.hero_prop ?? ''} ${b.place ?? ''}`, cardWords)
  sc += overlap(b.quote, cardWords)
  if (b.companion && card.people.some((p) => overlap(p.role, `${b.companion!.role} ${b.companion!.name}`) > 0)) sc += 1
  if (card.match && normText(card.match).includes(normText(b.quote))) sc += 1
  return sc
}

/**
 * Пары «бит → снимок» жадно по убыванию оценки: каждый бит и снимок — не больше одного раза, оценка ≥ 1.
 * skip — номера битов, которым снимок не положен (первый бит: там первое слово ≤ 5 с); taken — уже занятые.
 */
export function matchPhotos(
  beats: readonly Pick<Beat, 'quote' | 'result' | 'hero_prop' | 'place' | 'companion'>[],
  cards: readonly (PhotoCard | null)[],
  opts: { candidates?: readonly number[]; skip?: readonly number[]; takenBeats?: readonly number[]; takenPhotos?: readonly number[]; max?: number } = {},
): Map<number, number> {
  const cand = (opts.candidates ?? beats.map((_, i) => i)).filter((i) => !opts.skip?.includes(i) && !opts.takenBeats?.includes(i))
  const pairs: { i: number; p: number; sc: number }[] = []
  cards.forEach((card, p) => {
    if (!card || opts.takenPhotos?.includes(p)) return
    for (const i of cand) {
      const sc = photoScore(beats[i], card)
      if (sc >= 1) pairs.push({ i, p, sc })
    }
  })
  // выше оценка — раньше; при равной — снимок с меньшим номером и бит раньше по тексту
  pairs.sort((a, b) => b.sc - a.sc || a.p - b.p || a.i - b.i)
  const out = new Map<number, number>()
  const usedP = new Set<number>()
  for (const x of pairs) {
    if (out.size >= (opts.max ?? Infinity)) break
    if (out.has(x.i) || usedP.has(x.p)) continue
    out.set(x.i, x.p)
    usedP.add(x.p)
  }
  return out
}
