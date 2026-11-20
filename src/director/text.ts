// Работа с текстом записи: нормализация, слова с позициями, поиск ближайшей цитаты.

/** Нижний регистр и «ё» → «е». Длина строки сохраняется, индексы совпадают с оригиналом. */
export function norm(s: string): string {
  let out = ''
  for (const ch of s) {
    const l = ch.toLowerCase()
    out += l === 'ё' ? 'е' : l.length === ch.length ? l : ch
  }
  return out
}

const LETTER = /[\p{L}\p{N}\-]/u
export const isLetter = (ch: string | undefined) => !!ch && LETTER.test(ch)

export interface Word {
  text: string
  start: number
  end: number
}

/** Слова текста с позициями (буквы, цифры и дефис). */
export function words(text: string): Word[] {
  const out: Word[] = []
  const re = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  return out
}

/**
 * Найти основу stem в нормализованном тексте: начало на границе слова;
 * короткая основа (≤ 3 букв) должна совпасть со словом целиком. Возвращает индекс или -1.
 */
export function findStem(normText: string, stem: string, from = 0): number {
  const s = norm(stem)
  let i = normText.indexOf(s, from)
  while (i >= 0) {
    const before = normText[i - 1]
    const after = normText[i + s.length]
    const startOk = !isLetter(before)
    const endOk = s.length > 3 || !isLetter(after)
    if (startOk && endOk) return i
    i = normText.indexOf(s, i + 1)
  }
  return -1
}

/** Расширить совпадение до границ слова — получится точная подстрока оригинала. */
export function expandToWord(text: string, start: number, end: number): { start: number; end: number } {
  let a = start
  let b = end
  while (a > 0 && isLetter(text[a - 1])) a--
  while (b < text.length && isLetter(text[b])) b++
  return { start: a, end: b }
}

function similarity(a: string, b: string): number {
  // Доля общего префикса — устойчиво к окончаниям («парк» ~ «парку»).
  if (a === b) return 1
  const n = Math.min(a.length, b.length)
  let p = 0
  while (p < n && a[p] === b[p]) p++
  if (p < 3) return 0
  return p / Math.max(a.length, b.length)
}

/**
 * Ближайшая точная подстрока текста для цитаты, которой в тексте нет.
 * Сравнивает слова цитаты со скользящим окном слов текста. Возвращает null, если похожего нет.
 */
export function nearestQuote(text: string, quote: string, minScore = 0.6): string | null {
  const q = words(norm(quote)).map((w) => w.text)
  if (q.length === 0) return null
  const tw = words(text)
  const tn = tw.map((w) => norm(w.text))
  let best: { score: number; i: number; len: number } | null = null
  for (const len of new Set([q.length, Math.max(1, q.length - 1), q.length + 1])) {
    for (let i = 0; i + len <= tw.length; i++) {
      let s = 0
      for (const qw of q) {
        let m = 0
        for (let j = i; j < i + len; j++) m = Math.max(m, similarity(qw, tn[j]))
        s += m
      }
      const score = (s / q.length) * (len === q.length ? 1 : 0.95)
      if (!best || score > best.score) best = { score, i, len }
    }
  }
  if (!best || best.score < minScore) return null
  return text.slice(tw[best.i].start, tw[best.i + best.len - 1].end)
}
