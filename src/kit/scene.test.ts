import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { buildSceneUser, parseSceneInput, pickSceneExemplars, SCENE_SCHEMA } from '../../api/scene'
import { checkScene, ROLE_HEIGHT, SCENE_LIBRARY, sceneRef } from './sceneCheck'
import { closeSceneDb, dayHash, fallbackScene, forgetScenes, makeScene, normQuote, sanitizeScene, sceneFor } from './sceneClient'
import { modelBounds } from './validate'
import { dayAround, SCENE_DAY_MAX } from './scene'

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
    // главный предмет без места — годная сценка; место названо, а stand нет — просим дополнить
    expect(r.errors).toEqual([])
    const want = checkScene({ action: 'drink', objects: [{ role: 'hand', ru: 'какао', ref: 'cocoa' }] }, 'какао в кофейне', { place: 'кофейня', hero_prop: 'какао' })
    expect(want.errors.join(' ')).toMatch(/нет stand/)
  })

  it('план 13: главный предмет + место сбоку, деталь и место без запроса убираются, поза с предметом — не idle', () => {
    const r = checkScene(
      { action: 'idle', objects: [{ role: 'stand', ref: 'tree', side: 'back' }, { role: 'hand', ref: 'leaf' }, { role: 'detail', ref: 'cat', side: 'right' }] },
      'по парку',
      { place: 'парк', hero_prop: 'лист' },
    )
    expect(r.errors).toEqual([])
    expect(r.scene!.objects.map((o) => o.role)).toEqual(['stand', 'hand'])
    expect(r.scene!.objects[0].side).toBe('left')
    expect(r.scene!.action).toBe('carry')
    // место не названо — stand не нужен
    const cocoa = checkScene({ action: 'idle', objects: [{ role: 'stand', ref: 'bench' }, { role: 'hand', ref: 'cocoa' }, { role: 'detail', ref: 'leaf' }] }, 'какао', { place: null, hero_prop: 'какао' })
    expect(cocoa.scene!.action).toBe('drink')
    expect(cocoa.scene!.objects.map((o) => o.ref)).toEqual(['cocoa'])
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

  it('плоский лист в руке не превращается в плиту: ширина ограничена', () => {
    const leaf = [{ s: 'box', p: [0, 0.5, 0], d: [12, 1, 8], c: 'yellow' }]
    const r = checkScene({ action: 'idle', objects: [{ role: 'hand', ru: 'лист', en: 'leaf', parts: leaf }] }, 'лист')
    const b = modelBounds(r.scene!.objects[0].model!.parts)
    expect(Math.max(b.size[0], b.size[2])).toBeLessThanOrEqual(16)
  })

  it('второй hand убирается (в руке один главный предмет), поза «пьёт» без предмета в руке — idle', () => {
    const two = checkScene({ action: 'drink', objects: [{ role: 'hand', ref: 'cocoa' }, { role: 'hand', ref: 'tea' }] }, 'чай')
    expect(two.scene?.objects.map((o) => o.role)).toEqual(['hand'])
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
  it('разбор тела: цитата обязательна, день обрезается до окна сценографа', () => {
    expect(() => parseSceneInput({ quote: '  ' })).toThrow()
    const r = parseSceneInput({ quote: 'какао', day: 'а'.repeat(4000), hint: 'cocoa' })
    expect(r.day.length).toBe(SCENE_DAY_MAX + 2)
    expect(r.hint).toBe('cocoa')
  })

  it('длинная запись: бит из конца получает окно текста вокруг своей цитаты', () => {
    const long = 'Утром было обычное утро. '.repeat(80) + 'А вечером мы пили какао у окна.'
    const w = dayAround(long, 'пили какао')
    expect(w.length).toBeLessThanOrEqual(SCENE_DAY_MAX + 2)
    expect(w).toContain('пили какао')
    expect(dayAround('короткий день', 'день')).toBe('короткий день')
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

  it('план 13: главный предмет и место из библиотеки — без сети; дорисованное мастером — второй раз мгновенно', async () => {
    forgetScenes()
    const never = vi.fn(async () => new Response('{}', { status: 500 }))
    const lib = await makeScene({ quote: 'пили какао в кофейне', day: 'д1', hero_prop: 'какао', place: 'кофейня' }, { fetchImpl: never as unknown as typeof fetch })
    expect(lib.source).toBe('library')
    expect(lib.scene.objects.map((o) => `${o.role}:${o.ref}`)).toEqual(['hand:cocoa', 'stand:cafe_counter'])
    expect(never).not.toHaveBeenCalled()
    // дирижабля в библиотеке нет — сервер прислал дорисованный предмет
    const scooter = { quote: 'видел дирижабль', action: 'carry', objects: [{ role: 'hand', ru: 'дирижабль', model: { id: 'mk_dirizhabl', ru: 'дирижабль', stems: [], tags: ['made'], hold: 'hand', parts: box(10).concat(box(4).map((p) => ({ ...p, p: [4, 2, 0] as [number, number, number] }))) } }] }
    const drawn = vi.fn(async () => new Response(JSON.stringify(scooter), { status: 200 }))
    const a = await makeScene({ quote: 'видел дирижабль', day: 'д2', hero_prop: 'дирижабль' }, { fetchImpl: drawn as unknown as typeof fetch })
    expect(a.source).toBe('claude')
    await new Promise((r) => setTimeout(r, 30))
    const b = await makeScene({ quote: 'снова дирижабль', day: 'д3', hero_prop: 'дирижабль' }, { fetchImpl: never as unknown as typeof fetch })
    expect(b.source).toBe('library')
    expect(b.scene.objects[0].model?.parts.length).toBeGreaterThan(0)
    expect(never).not.toHaveBeenCalled()
  })
})
