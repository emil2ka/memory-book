import { describe, expect, it } from 'vitest'
import { PenWriter, buildTrack, letterDuration } from './pen'
import { orderStrokes, simplify, strokeLength, thin, traceSkeleton, type Glyph, type Pt } from './strokes'

/** Рисует бинарную картинку из строк: '#' — чернила. */
function grid(rows: string[]) {
  const h = rows.length + 2
  const w = Math.max(...rows.map((r) => r.length)) + 2
  const img = new Uint8Array(w * h)
  rows.forEach((r, y) => [...r].forEach((c, x) => (img[(y + 1) * w + x + 1] = c === '#' ? 1 : 0)))
  return { img, w, h }
}

const thick = (rows: string[]) => rows.flatMap((r) => [r.replace(/#/g, '###').replace(/\./g, '...')].flatMap((x) => [x, x, x]))

describe('штрихи буквы', () => {
  it('толстая горизонтальная черта → один штрих слева направо', () => {
    const { img, w, h } = grid(thick(['..........', '.########.', '..........']))
    thin(img, w, h)
    const s = traceSkeleton(img, w, h)
    expect(s.length).toBe(1)
    const o = orderStrokes(s, -100)
    expect(o[0][0][0]).toBeLessThan(o[0][o[0].length - 1][0])
  })

  it('толстое кольцо → один замкнутый штрих', () => {
    const rows: string[] = []
    for (let y = 0; y < 30; y++) {
      let r = ''
      for (let x = 0; x < 30; x++) {
        const d = Math.hypot(x - 14.5, y - 14.5)
        r += d > 8 && d < 12 ? '#' : '.'
      }
      rows.push(r)
    }
    const { img, w, h } = grid(rows)
    thin(img, w, h)
    const s = traceSkeleton(img, w, h)
    expect(s.length).toBe(1)
    expect(strokeLength(s[0])).toBeGreaterThan(50)
  })

  it('буква «Т»: перекладина и ножка, не больше трёх штрихов', () => {
    const { img, w, h } = grid(thick(['#########', '....#....', '....#....', '....#....', '....#....']))
    thin(img, w, h)
    const s = traceSkeleton(img, w, h, 3)
    expect(s.length).toBeGreaterThanOrEqual(2)
    expect(s.length).toBeLessThanOrEqual(3)
  })

  it('точка над буквой пишется последней', () => {
    const stem: Pt[] = [[0.1, -0.45], [0.1, 0]]
    const dot: Pt[] = [[0.08, -0.75], [0.12, -0.72]]
    const o = orderStrokes([dot, stem], -0.45)
    expect(o[0]).toBe(stem)
    expect(o[1]).toBe(dot)
  })

  it('упрощение сохраняет концы', () => {
    const line: Pt[] = Array.from({ length: 20 }, (_, i) => [i, 0])
    expect(simplify(line, 0.5)).toEqual([[0, 0], [19, 0]])
  })
})

const G: Glyph = { strokes: [[[0, -0.5], [0, 0]], [[0, -0.25], [0.3, -0.25]]], width: 0.08 }
const glyphOf = (ch: string) => (ch.trim() ? G : null)

describe('ручка пишет', () => {
  it('путь: касание, штрих, отрыв, переезд, второй штрих', () => {
    const { track, total } = buildTrack(G)
    expect(track[0].down).toBe(false)
    expect(track.some((p) => p.down)).toBe(true)
    expect(total).toBeGreaterThan(0.5)
    expect(letterDuration(total)).toBeGreaterThanOrEqual(0.1)
  })

  it('напечатанная буква сначала скрыта, потом проявляется и дописывается', () => {
    const w = new PenWriter(glyphOf)
    w.setText('а')
    expect(w.active).toBe(true)
    w.update(0)
    const start = w.ink()!
    expect(start.upTo).toBe(0)
    expect(start.partial!.pts.length).toBe(0)
    w.update(0.08)
    expect(w.ink()!.partial!.pts.length).toBeGreaterThan(0)
    expect(w.pen()).not.toBeNull()
    w.update(1)
    expect(w.ink()).toBeNull()
    expect(w.active).toBe(false)
  })

  it('вставка длинного куска и правка в середине появляются сразу', () => {
    const w = new PenWriter(glyphOf)
    w.setText('привет, мир')
    expect(w.active).toBe(false)
    w.setText('привет')
    w.setText('при-вет')
    expect(w.active).toBe(false)
  })

  it('стёртая с конца буква уходит из очереди', () => {
    const w = new PenWriter(glyphOf)
    w.setText('аб')
    w.update(0)
    w.setText('а')
    w.update(5)
    expect(w.active).toBe(false)
  })

  it('пробелы не пишутся, буквы после них — да', () => {
    const w = new PenWriter(glyphOf)
    w.reset('аа')
    w.setText('аа б')
    w.update(0)
    expect(w.ink()!.upTo).toBe(3)
  })

  it('быстрая печать: очередь догоняется ускорением', () => {
    const w = new PenWriter(glyphOf)
    let t = ''
    for (const ch of 'абвгдеж') {
      t += ch
      w.setText(t)
      w.update(0.05)
    }
    // одна буква обычно пишется дольше 0,1 с; при отставании — быстрее
    w.update(0.5)
    expect(w.active).toBe(false)
  })
})
