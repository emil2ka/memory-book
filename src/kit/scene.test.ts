import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { buildSceneUser, parseSceneInput, pickSceneExemplars, SCENE_SCHEMA } from '../../api/scene'
import { checkScene, ROLE_HEIGHT, SCENE_LIBRARY, sceneRef } from './sceneCheck'
import { closeSceneDb, dayHash, fallbackScene, forgetScenes, makeScene, normQuote, sanitizeScene, sceneFor } from './sceneClient'
import { modelBounds } from './validate'

const box = (h: number) => [{ s: 'box', p: [0, h / 2, 0], d: [6, h, 6], c: 'brick', k: 0, r: [0, 0, 0], glow: false }]
const height = (parts: { p: [number, number, number]; d: [number, number, number] }[]) => {
  const b = modelBounds(parts)
  return b.max[1] - b.min[1]
}

describe('проверка сценки', () => {
  it('ref из объёмной библиотеки принимается как есть', () => {
    const r = checkScene({ action: 'drink', objects: [{ role: 'hand', ru: 'какао', ref: 'cocoa', parts: [] }] }, 'какао')
    expect(r.scene?.objects[0]).toMatchObject({ role: 'hand', ref: 'cocoa' })
    expect(r.scene?.action).toBe('drink')
    expect(r.refs).toBe(1)
    // один предмет — не стенд: просим дополнить, но сценка годна
    expect(r.errors.join(' ')).toMatch(/нет stand/)
  })

  it('полный стенд без ошибок; дерево за спиной уходит вбок, поза с предметом в руке — не idle', () => {
    const r = checkScene(
      { action: 'idle', objects: [{ role: 'stand', ref: 'tree', side: 'back' }, { role: 'hand', ref: 'leaf' }, { role: 'detail', ref: 'cat', side: 'right' }] },
      'по парку',
    )
    expect(r.errors).toEqual([])
    expect(r.scene!.objects[0].side).toBe('left')
    expect(r.scene!.action).toBe('carry')
    const cocoa = checkScene({ action: 'idle', objects: [{ role: 'stand', ref: 'bench' }, { role: 'hand', ref: 'cocoa' }, { role: 'detail', ref: 'leaf' }] }, 'какао')
    expect(cocoa.scene!.action).toBe('drink')
    expect(cocoa.scene!.objects[0].side ?? 'back').toBe('back')
  })

  it('несуществующий ref без фигур выбрасывается с понятной ошибкой', () => {
    const r = checkScene({ action: 'idle', objects: [{ role: 'stand', ru: 'фонтан', ref: 'no_such_fountain', parts: [] }, { role: 'hand', ref: 'cocoa' }] }, 'фонтан')
    expect(r.scene?.objects.map((o) => o.ref)).toEqual(['cocoa'])
    expect(r.errors.join(' ')).toMatch(/no_such_fountain/)
  })

  it('дорисованный предмет масштабируется под высоту роли, k:0 и нулевой поворот убираются', () => {
    const r = checkScene({ action: 'idle', objects: [{ role: 'stand', ru: 'фонтан', en: 'fountain', parts: box(5) }] }, 'фонтан')
    const m = r.scene!.objects[0].model!
    expect(m.id).toMatch(/^sc_fountain/)
    expect(m.parts[0].k).toBeUndefined()
    expect(m.parts[0].r).toBeUndefined()
    const h = height(m.parts)
    expect(h).toBeGreaterThanOrEqual(ROLE_HEIGHT.stand[0])
    expect(h).toBeLessThanOrEqual(ROLE_HEIGHT.stand[1])
    expect(r.models).toBe(1)
    // одна коробка — слишком просто: ошибка для повтора, но предмет остаётся
    expect(r.errors.join(' ')).toMatch(/всего 1 фигур/)
  })

  it('плоский лист деталью не превращается в плиту: ширина ограничена', () => {
    const leaf = [{ s: 'box', p: [0, 0.5, 0], d: [12, 1, 8], c: 'yellow' }]
    const r = checkScene({ action: 'idle', objects: [{ role: 'detail', ru: 'лист', en: 'leaf', parts: leaf }] }, 'лист')
    const b = modelBounds(r.scene!.objects[0].model!.parts)
    expect(Math.max(b.size[0], b.size[2])).toBeLessThanOrEqual(24)
  })

  it('второй hand становится detail, поза «пьёт» без предмета в руке — idle', () => {
    const two = checkScene({ action: 'drink', objects: [{ role: 'hand', ref: 'cocoa' }, { role: 'hand', ref: 'tea' }] }, 'чай')
    expect(two.scene?.objects.map((o) => o.role)).toEqual(['hand', 'detail'])
    const none = checkScene({ action: 'drink', objects: [{ role: 'stand', ref: 'bench' }] }, 'скамейка')
    expect(none.scene?.action).toBe('idle')
  })

  it('пустой ответ — нет сценки', () => {
    expect(checkScene({ action: 'idle', objects: [] }, 'x').scene).toBeNull()
  })

  it('в схеме ref — только объёмные предметы библиотеки', () => {
    const refEnum = SCENE_SCHEMA.properties.objects.items.properties.ref.enum as readonly string[]
    expect(refEnum).toContain('cocoa')
    expect(refEnum.length).toBe(SCENE_LIBRARY.length + 1)
    for (const id of refEnum.slice(1)) expect(sceneRef(id)?.parts.length).toBeGreaterThan(0)
  })
})

describe('запрос на сервер', () => {
  it('разбор тела: цитата обязательна, день обрезается до 600', () => {
    expect(() => parseSceneInput({ quote: '  ' })).toThrow()
    const r = parseSceneInput({ quote: 'какао', day: 'а'.repeat(900), hint: 'cocoa' })
    expect(r.day.length).toBe(600)
    expect(r.hint).toBe('cocoa')
  })

  it('образцы — объёмные предметы, и в сообщении есть найденное по словам', () => {
    const req = { quote: 'Пили какао у окна', day: 'Пили какао у окна, шёл снег' }
    const ex = pickSceneExemplars(req)
    expect(ex.length).toBeGreaterThanOrEqual(3)
    expect(ex.every((m) => m.parts.length > 0)).toBe(true)
    expect(ex.some((m) => m.id === 'cocoa')).toBe(false)
    expect(buildSceneUser(req, ex)).toMatch(/cocoa \(какао\)/)
  })
})

describe('сценки на клиенте', () => {
  afterAll(() => closeSceneDb())

  it('ключи: цитата без регистра и пунктуации, хэш дня стабилен', () => {
    expect(normQuote('  Пили КАКАО, ёлки! ')).toBe('пили какао елки')
    expect(dayHash('день')).toBe(dayHash('день'))
    expect(dayHash('день')).not.toBe(dayHash('ночь'))
  })

  it('запасной вариант: слово из библиотеки — в руки или декорацией, ничего — кристалл', () => {
    const cocoa = fallbackScene({ quote: 'Пили какао', day: '' })
    expect(cocoa.objects[0]).toMatchObject({ role: 'hand', ref: 'cocoa' })
    expect(cocoa.action).toBe('drink')
    const tree = fallbackScene({ quote: 'Большое дерево', day: '' })
    expect(tree.objects[0]).toMatchObject({ role: 'stand', ref: 'tree' })
    const none = fallbackScene({ quote: 'зхщъ', day: '' })
    expect(none.objects[0].ref).toBe('crystal')
  })

  it('ответ сервера проверяется ещё раз: плоская картинка без фигур выбрасывается', () => {
    const s = sanitizeScene({ action: 'drink', objects: [{ role: 'hand', ref: 'cocoa' }, { role: 'detail', ref: 'no_such' }] }, 'какао')
    expect(s?.objects.length).toBe(1)
  })

  it('сервер → кэш → sceneFor; сеть упала — запасной вариант, без исключений', async () => {
    forgetScenes()
    const scene = { quote: 'Купил мороженое', action: 'idle', objects: [{ role: 'hand', ru: 'мороженое', ref: 'ice_cream' }], by: 'claude' }
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(scene), { status: 200 }))
    const req = { quote: 'Купил мороженое', day: 'Купил мороженое в парке' }
    const a = await makeScene(req, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(a.source).toBe('claude')
    expect(sceneFor('купил мороженое')?.objects[0].ref).toBe('ice_cream')
    await new Promise((r) => setTimeout(r, 20))
    const b = await makeScene(req, { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(b.source).toBe('cache')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const broken = vi.fn(async () => {
      throw new TypeError('network')
    })
    const c = await makeScene({ quote: 'Пили чай', day: 'другой день' }, { fetchImpl: broken as unknown as typeof fetch })
    expect(c.source).toBe('fallback')
    expect(c.scene.objects[0].ref).toBe('tea')
    const d = await makeScene({ quote: 'Пили чай', day: 'третий день' }, { fetchImpl: vi.fn(async () => new Response('{}', { status: 502 })) as unknown as typeof fetch })
    expect(d.source).toBe('fallback')
  })
})
