import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { closeKitDb, fallbackKit, loadMadeKits, makeKey, makeKit } from './make'
import { findByWord } from './library'

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + '<rect x="10" y="10" width="20" height="20" fill="#3b8483" stroke="#1b1410" stroke-width="2.5"/>'.repeat(6) + '</svg>'
// слово, которого в библиотеке точно не будет (самокат mb-assets уже перенесли в библиотеку)
const scooter = {
  id: 'airship',
  ru: 'дирижабль',
  kk: 'дирижабль',
  en: 'airship',
  stems: ['дирижабл'],
  tags: ['transport', 'city', 'summer'],
  hold: 'both',
  svg,
  by: 'claude',
}

const ok = (json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }))

afterAll(() => closeKitDb())

describe('makeKit', () => {
  it('слово из библиотеки — без сети', async () => {
    const f = ok({})
    const r = await makeKit({ name: 'какао' }, { fetchImpl: f as unknown as typeof fetch })
    expect(r.source).toBe('library')
    expect(r.model.id).toBe('cocoa')
    expect(f).not.toHaveBeenCalled()
  })

  it('новое слово — Claude, потом кэш; слово находится в тексте', async () => {
    const f = ok(scooter)
    const r1 = await makeKit({ name: 'Дирижабль', hint: 'серебристый', tags: ['transport'] }, { fetchImpl: f as unknown as typeof fetch })
    expect(r1.source).toBe('claude')
    expect(r1.model.by).toBe('claude')
    expect(f).toHaveBeenCalledTimes(1)
    const r2 = await makeKit({ name: 'дирижабль' }, { fetchImpl: f as unknown as typeof fetch })
    expect(r2.source).toBe('cache') // зарегистрирован в поиске
    expect(findByWord('дирижабле')?.id).toBe('airship')
    expect(f).toHaveBeenCalledTimes(1)
    expect((await loadMadeKits()).map((m) => m.id)).toContain('airship')
  })

  it('два одинаковых запроса — один вызов', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ...scooter, id: 'trampoline', ru: 'батут', stems: ['батут'] }), { status: 200 }))
    const [a, b] = await Promise.all([makeKit({ name: 'батут' }, { fetchImpl: f as unknown as typeof fetch }), makeKit({ name: 'батут' }, { fetchImpl: f as unknown as typeof fetch })])
    expect(a.model.id).toBe('trampoline')
    expect(b.model.id).toBe('trampoline')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('кривой ответ или ошибка → похожий по тегам или кристалл', async () => {
    const bad = ok({ id: 'x', svg: '<svg/>' })
    const r = await makeKit({ name: 'пылесос', tags: ['drink', 'warm'] }, { fetchImpl: bad as unknown as typeof fetch })
    expect(r.source).toBe('similar')
    expect(r.reason).toBe('invalid')
    expect(r.model.tags).toEqual(expect.arrayContaining(['drink', 'warm']))

    const err = vi.fn(async () => new Response(JSON.stringify({ error: 'timeout' }), { status: 504 }))
    const r2 = await makeKit({ name: 'утюг', tags: [] }, { fetchImpl: err as unknown as typeof fetch })
    expect(r2.source).toBe('crystal')
    expect(r2.reason).toBe('timeout')
    expect(r2.model.id).toBe('crystal')

    const boom = vi.fn(async () => {
      throw new TypeError('network')
    })
    expect((await makeKit({ name: 'фен' }, { fetchImpl: boom as unknown as typeof fetch })).source).toBe('crystal')
  })

  it('составное название не дробится по словам', async () => {
    const f = ok({ ...scooter, id: 'sewing_machine', ru: 'швейная машинка', stems: ['швейн'] })
    const r = await makeKit({ name: 'швейная машинка', tags: ['home'] }, { fetchImpl: f as unknown as typeof fetch })
    expect(r.source).toBe('claude')
    expect(r.model.id).toBe('sewing_machine')
    expect((await makeKit({ name: 'горы Алатау' }, { fetchImpl: f as unknown as typeof fetch })).model.id).toBe('alatau')
  })

  it('ключ кэша и запасной', () => {
    expect(makeKey('  Стиральная   МАШИНА ')).toBe('стиральная машина')
    expect(fallbackKit([]).model.id).toBe('crystal')
    expect(fallbackKit([]).model.svg).toContain('<svg')
  })
})
