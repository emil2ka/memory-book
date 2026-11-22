import { describe, expect, it } from 'vitest'
import { KIT_LIMITS } from './format'
import { modelBounds, paletteName, partExtent, settleParts, validateKit } from './validate'

const cocoa = {
  id: 'cocoa',
  ru: 'какао',
  kk: 'какао',
  en: 'cocoa',
  stems: ['какао', 'cocoa'],
  tags: ['drink', 'warm'],
  hold: 'hand',
  fx: [{ kind: 'steam', at: [0, 10, 0] }],
  parts: [
    { s: 'cyl', p: [0, 4, 0], d: [7, 8, 7], c: 'cream', n: 'body' },
    { s: 'cyl', p: [0, 1.2, 0], d: [7.3, 1.6, 7.3], c: 'brick' },
    { s: 'cyl', p: [0, 7.9, 0], d: [6, 0.6, 6], c: 'brown' },
    { s: 'torus', p: [4.3, 4.4, 0], d: [4, 4.6, 1.4], c: 'cream' },
    { s: 'sph', p: [-1.2, 8.6, 0.6], d: [2.4, 1.4, 2.4], c: 'white' },
  ],
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

describe('validateKit', () => {
  it('пропускает образец какао и округляет до 0.5', () => {
    const r = validateKit(cocoa)
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    const m = r.model!
    expect(m.parts[1].d).toEqual([7.5, 1.5, 7.5])
    expect(m.parts[3].p).toEqual([4.5, 4.5, 0])
    for (const p of m.parts) for (const x of [...p.p, ...p.d]) expect(x * 2).toBe(Math.round(x * 2))
    expect(m.fx).toEqual([{ kind: 'steam', at: [0, 10, 0] }])
  })

  it('отбрасывает лишние поля и не мутирует вход', () => {
    const raw = { ...clone(cocoa), extra: 1, parts: cocoa.parts.map((p) => ({ ...p, junk: true })) }
    const before = JSON.stringify(raw)
    const r = validateKit(raw)
    expect(r.ok).toBe(true)
    expect(JSON.stringify(raw)).toBe(before)
    expect(Object.keys(r.model!)).not.toContain('extra')
    expect(Object.keys(r.model!.parts[0])).not.toContain('junk')
  })

  it('зажимает k в 3–24 и нормализует углы', () => {
    const m = clone(cocoa)
    ;(m.parts[0] as Record<string, unknown>).k = 40
    ;(m.parts[1] as Record<string, unknown>).k = 1
    ;(m.parts[2] as Record<string, unknown>).r = [370, -190, 0]
    const r = validateKit(m)
    expect(r.ok).toBe(true)
    expect(r.model!.parts[0].k).toBe(24)
    expect(r.model!.parts[1].k).toBe(3)
    expect(r.model!.parts[2].r).toEqual([10, 170, 0])
    expect(r.warnings.some((w) => w.includes('k'))).toBe(true)
  })

  it('чужие имена цветов: синонимы переводит, неизвестные — ошибка', () => {
    expect(paletteName('red')?.name).toBe('brick')
    expect(paletteName('brownDark')).toEqual({ name: 'brownDark', alias: false })
    expect(paletteName('brown_dark')?.name).toBe('brownDark')
    expect(paletteName('chartreuse')).toBeNull()
    const m = clone(cocoa)
    m.parts[0].c = 'red'
    expect(validateKit(m).model!.parts[0].c).toBe('brick')
    m.parts[0].c = 'chartreuse'
    const r = validateKit(m)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/parts\[0\]\.c/)
  })

  it('ставит предмет на землю', () => {
    const m = clone(cocoa)
    for (const p of m.parts) p.p[1] += 20
    m.fx[0].at[1] += 20
    const r = validateKit(m)
    expect(r.ok).toBe(true)
    expect(modelBounds(r.model!.parts).min[1]).toBe(0)
    expect(r.model!.fx![0].at![1]).toBe(10)
  })

  it('проверяет высоту по hold', () => {
    const tall = clone(cocoa)
    tall.parts[0].d = [7, 30, 7]
    tall.parts[0].p = [0, 15, 0]
    const r = validateKit(tall)
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toMatch(/высота .*hand/)
    tall.hold = 'ground'
    expect(validateKit(tall).ok).toBe(true)
  })

  it('мягкий режим: масштаб под hold и выброс пустых фигур', () => {
    const tall = clone(cocoa)
    for (const p of tall.parts) {
      p.p = p.p.map((x) => x * 3)
      p.d = p.d.map((x) => x * 3)
    }
    expect(validateKit(tall).ok).toBe(false)
    const r = validateKit(tall, { fit: true })
    expect(r.ok).toBe(true)
    const h = modelBounds(r.model!.parts).size[1]
    expect(h).toBeGreaterThanOrEqual(11)
    expect(h).toBeLessThanOrEqual(13.8)
    const zero = clone(cocoa)
    zero.parts[2].d = [0, 0, 0]
    expect(validateKit(zero).ok).toBe(false)
    const z = validateKit(zero, { fit: true })
    expect(z.ok).toBe(true)
    expect(z.model!.parts).toHaveLength(4)
  })

  it('пределы: число фигур, координаты, размеры', () => {
    const many = clone(cocoa)
    many.parts = Array.from({ length: KIT_LIMITS.maxParts + 1 }, () => clone(cocoa.parts[0]))
    expect(validateKit(many).errors.join()).toMatch(/не больше 48/)

    const far = clone(cocoa)
    far.parts[4].p = [KIT_LIMITS.maxCoord + 10, 8, 0]
    expect(validateKit(far).errors.join()).toMatch(/центр дальше/)

    const zero = clone(cocoa)
    zero.parts[2].d = [6, 0, 6]
    expect(validateKit(zero).errors.join()).toMatch(/больше 0/)

    const thin = clone(cocoa)
    thin.parts[2].d = [6, 0.3, 6]
    const r = validateKit(thin)
    expect(r.ok).toBe(true)
    expect(r.model!.parts[2].d[1]).toBe(0.5)
  })

  it('ошибки по форме входа', () => {
    expect(validateKit(null).ok).toBe(false)
    expect(validateKit([]).ok).toBe(false)
    const bad = { ...clone(cocoa), id: 'Кружка!', hold: 'pocket', parts: [{ s: 'blob', p: [0, 0, 0], d: [1, 1, 1], c: 'ink' }] }
    const r = validateKit(bad)
    expect(r.errors.join('\n')).toMatch(/id:/)
    expect(r.errors.join('\n')).toMatch(/hold:/)
    expect(r.errors.join('\n')).toMatch(/parts\[0\]\.s/)
  })

  it('короткие основы слов запрещены, пустые берутся из ru', () => {
    const m = clone(cocoa)
    m.stems = ['ка']
    expect(validateKit(m).errors.join()).toMatch(/короче 3/)
    m.stems = []
    expect(validateKit(m).model!.stems).toEqual(['какао'])
  })

  it('неизвестный fx выбрасывается с предупреждением', () => {
    const m = clone(cocoa) as Record<string, unknown>
    m.fx = [{ kind: 'explode' }, { kind: 'spin', part: 'nope' }]
    const r = validateKit(m)
    expect(r.ok).toBe(true)
    expect(r.model!.fx).toEqual([{ kind: 'spin', part: 'nope' }])
    expect(r.warnings.length).toBe(2)
  })

  it('висящий кусок ложится на опору', () => {
    const parts = [
      { s: 'cyl' as const, p: [0, 1, 0] as [number, number, number], d: [6, 2, 6] as [number, number, number], c: 'brown' as const },
      { s: 'sph' as const, p: [0, 9, 0] as [number, number, number], d: [8, 8, 8] as [number, number, number], c: 'teal' as const },
      { s: 'box' as const, p: [20, 9, 0] as [number, number, number], d: [2, 2, 2] as [number, number, number], c: 'ink' as const },
    ]
    expect(settleParts(parts)).toBe(1)
    expect(parts[1].p[1]).toBe(6)
    expect(parts[2].p[1]).toBe(9) // опоры под ним нет — не трогаем
  })

  it('габариты повёрнутой фигуры', () => {
    const e = partExtent({ p: [0, 0, 0], d: [10, 2, 2], r: [0, 0, 90] })
    expect(e.max[0]).toBeCloseTo(1)
    expect(e.max[1]).toBeCloseTo(5)
  })

  it('grip и scene: необязательные, сохраняются; detail проверяется по высоте 6–20', () => {
    const r = validateKit({ ...clone(cocoa), grip: [0, 4.2, 0], scene: 'hand' })
    expect(r.ok).toBe(true)
    expect(r.model!.grip).toEqual([0, 4, 0])
    expect(r.model!.scene).toBe('hand')
    const away = validateKit({ ...clone(cocoa), grip: [40, 4, 0] })
    expect(away.ok).toBe(true)
    expect(away.model!.grip).toBeUndefined()
    const ball = { id: 'ball', ru: 'мяч', stems: ['мяч'], tags: [], hold: 'ground', parts: [{ s: 'sph', p: [0, 4, 0], d: [8, 8, 8], c: 'brick' }] }
    expect(validateKit(ball).ok).toBe(false)
    expect(validateKit({ ...ball, scene: 'detail' }).ok).toBe(true)
    expect(validateKit({ ...ball, scene: 'boss' }).model?.scene).toBeUndefined()
  })
})
