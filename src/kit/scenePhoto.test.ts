import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { directDay } from '../director'
import { validateScript } from '../director/validate'
import { exemplars } from '../director/exemplars'
import { closePhotoDb, photoCardFor, photoCardText, photoHash, requestPhotoCard, sanitizePhotoCard } from './scenePhoto'
import { libraryScene } from './sceneClient'
import { matchPhotos, photoScore } from '../director/photos'
import { choreograph, withCard } from '../timeline/choreograph'

const raw = {
  caption: 'мы с подругой пьём какао в кофейне',
  place: { ru: 'кофейня у окна', ref: 'cafe_table' },
  things: [
    { ru: 'какао', ref: 'cocoa', where: 'table' },
    { ru: 'дождь', ref: 'no_such_thing', where: 'sky' },
    { ru: 'x', ref: '', where: 'nowhere' },
    { ru: 'a', ref: 'tea', where: 'hand' },
    { ru: 'b', ref: 'coffee', where: 'hand' },
  ],
  people: [{ role: 'подруга', jacket: 'brick', scarf: 'нет-такого', hair: 'brown', accessory: 'crown', action: 'dance' }],
  time_of_day: 'evening',
  weather: 'rain',
  palette: ['brown', 'purple', 'amber'],
  mood: 'уютно',
  match: 'пили какао у окна',
}

afterAll(() => closePhotoDb())

describe('карточка снимка', () => {
  it('ссылки — только 3D-библиотека, цвета — палитра, не больше 4 вещей; пустая карточка — null', () => {
    const c = sanitizePhotoCard(raw)!
    expect(c.place.ref).toBe('cafe_table')
    expect(c.things).toHaveLength(4)
    expect(c.things[1].ref).toBe('')
    expect(c.things[2].where).toBe('table')
    expect(c.people[0]).toMatchObject({ scarf: 'brick', accessory: 'none', action: 'idle' })
    expect(c.palette).toEqual(['brown', 'amber'])
    expect(sanitizePhotoCard({})).toBeNull()
    expect(photoCardText(c, 1)).toMatch(/Фото 1: «мы с подругой/)
  })

  it('запрос сразу при добавлении: сервер → кэш по хэшу снимка; повтор — без сети; без сети — null', async () => {
    const img = 'data:image/jpeg;base64,' + 'A'.repeat(500)
    const f = vi.fn(async () => new Response(JSON.stringify(raw), { status: 200 }))
    const a = await requestPhotoCard(img, 'день', { fetchImpl: f as unknown as typeof fetch })
    expect(a?.caption).toBe(raw.caption)
    expect(photoCardFor(img)?.place.ref).toBe('cafe_table')
    const b = await requestPhotoCard(img, 'день', { fetchImpl: f as unknown as typeof fetch })
    expect(b?.caption).toBe(raw.caption)
    expect(f).toHaveBeenCalledTimes(1)
    expect(photoHash(img)).toBe(photoHash(img))
    const down = vi.fn(async () => {
      throw new TypeError('network')
    })
    expect(await requestPhotoCard('data:image/jpeg;base64,BBBB', '', { fetchImpl: down as unknown as typeof fetch })).toBeNull()
  })

  it('сценка бита со снимком — место и вещь с карточки', () => {
    const card = sanitizePhotoCard(raw)!
    const s = libraryScene({ quote: 'пили какао', day: '', hero_prop: 'какао', place: 'кофейня', photo_card: card })!
    expect(s.objects.map((o) => `${o.role}:${o.ref}`)).toEqual(['hand:cocoa', 'stand:cafe_table'])
  })
})

describe('режиссёр и снимки', () => {
  const day1 = exemplars[0]
  it('photo в бите: только в пределах снимков дня, один бит на снимок (первому тоже можно)', () => {
    const beats = day1.script.beats.map((b, i) => ({ ...b, photo: i === 0 ? 0 : i === 2 ? 0 : i === 3 ? 0 : i === 4 ? 7 : null }))
    const r = validateScript({ ...day1.script, beats }, day1.text, { photos: 2 })
    const ph = r.script.beats.map((b) => b.photo ?? null)
    expect(ph[0]).toBe(0)
    expect(ph.filter((p) => p === 0)).toHaveLength(1)
    expect(ph).not.toContain(7)
  })

  it('снимок первого бита: без photo_reveal и без сдвига — первое слово на 4.8 с, окно со снимком и карточкой', () => {
    const yard = sanitizePhotoCard({ ...raw, caption: 'мы с братом слепили снеговика', place: { ru: 'двор', ref: '' }, things: [{ ru: 'снеговик', ref: 'snowman', where: 'ground' }], match: 'Гуляли по парку, всё в жёлтых листьях.' })!
    const script = { ...day1.script, beats: day1.script.beats.map((b, i) => (i === 0 ? { ...b, photo: 0 } : b)), photo_cards: [yard] }
    const tl = choreograph(script, { seed: 1, photoCount: 1 })
    const w = tl.beats[0]
    expect(w.photo).toBe(0)
    expect(w.photo_card?.caption).toBe(yard.caption)
    expect(w.transform).toBeCloseTo(4.8, 5)
    expect(tl.events.filter((e) => e.type === 'photo_reveal')).toHaveLength(0)
    expect(tl.events.some((e) => e.type === 'actor_walk' && e.beat === w.beat)).toBe(true)
  })

  it('directDay: все снимки с карточками — режиссёру текст без картинок; карточки — в сценарии; без сети — «Фото» по карточкам', async () => {
    const card = sanitizePhotoCard(raw)!
    let sent: { photos?: string[]; photoCards?: unknown[] } = {}
    const ok = vi.fn(async (_u: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(day1.script), { status: 200 })
    })
    const r = await directDay({ text: day1.text, photos: ['data:image/jpeg;base64,QQ=='], song: null, photoCards: [card] }, { fetchImpl: ok as unknown as typeof fetch })
    expect(sent.photos).toEqual([])
    expect(sent.photoCards).toHaveLength(1)
    expect(r.script.photo_cards?.[0]?.caption).toBe(card.caption)
    const down = vi.fn(async () => new Response('{}', { status: 502 }))
    const f = await directDay({ text: day1.text, photos: ['data:image/jpeg;base64,QQ=='], song: null, photoCards: [card] }, { fetchImpl: down as unknown as typeof fetch })
    expect(f.source).toBe('fallback')
    expect(f.script.photo_cards?.[0]).toBeTruthy()
    expect(f.script.why[1]).toMatch(/^Фото: на фото кофейня/)
  })
})

describe('привязка снимка к биту — по вещам и месту, match запасной', () => {
  const kitchen = sanitizePhotoCard({
    caption: 'бабушка угощает нас баурсаками',
    place: { ru: 'кухня', ref: 'kitchen_table' },
    things: [{ ru: 'баурсаки', ref: 'baursak', where: 'table' }, { ru: 'самовар', ref: 'samovar', where: 'table' }],
    people: [{ role: 'бабушка', jacket: 'plum', scarf: 'cream', hair: 'grey', accessory: 'headscarf', action: 'sit' }],
    time_of_day: 'evening',
    weather: 'clear',
    palette: ['amber'],
    mood: 'тепло',
    match: 'Вечером поехали к бабушке, она напекла баурсаков.',
  })!
  const text = 'Утром проспал и бежал в универ. На паре было скучно. Вечером поехали к бабушке, она напекла баурсаков.'
  const beat = (quote: string, id: string, hero_prop: string, place: string | null, companion: { name: string; role: string } | null = null) =>
    ({ quote, action: 'pull' as const, result: { kind: 'kit' as const, id }, camera: 'hold' as const, effect: null, hero_prop, place, companion, kind: 'thing' as const, weight: 2 as const, time_of_day: 'evening' as const, weather: 'clear' as const })
  const beats = [
    beat('бежал в универ', 'backpack', 'рюкзак', 'университет'),
    beat('На паре было скучно', 'book', 'книга', 'парта'),
    beat('поехали к бабушке', 'bus', 'автобус', 'остановка', { name: 'бабушка', role: 'бабушка' }),
    beat('напекла баурсаков', 'baursak', 'баурсаки', null),
  ]

  it('кухня с баурсаками — к «напекла баурсаков», а не к «поехали к бабушке» (оба в предложении match)', () => {
    expect(matchPhotos(beats, [kitchen], { skip: [0] }).get(3)).toBe(0)
    expect(matchPhotos(beats, [kitchen], { skip: [0] }).has(2)).toBe(false)
    expect(photoScore(beats[3], kitchen)).toBeGreaterThan(photoScore(beats[2], kitchen))
  })

  it('режиссёр не поставил photo — ставит код и хранит в сценарии; бит со снимком показывает место и вещь с фото', () => {
    const script = { ...exemplars[0].script, beats: beats.map((b) => ({ ...b })) }
    const r = validateScript(script, text, { photos: 1, cards: [kitchen] })
    expect(r.script.beats.find((b) => b.quote === 'напекла баурсаков')?.photo).toBe(0)
    const tl = choreograph({ ...r.script, photo_cards: [kitchen] }, { seed: 1, photoCount: 1 })
    const w = tl.beats.find((x) => x.photo === 0)!
    expect(w.quote).toBe('напекла баурсаков')
    expect(w.place).toBe('кухня')
    expect(w.hero_prop).toBe('баурсаки')
    // бит, где вещи с фото нет, получает вещь с фото
    const bus = withCard({ ...beats[2], photo: 0 }, kitchen)
    expect(bus.hero_prop).toBe('баурсаки')
    expect(bus.result).toEqual({ kind: 'kit', id: 'baursak' })
    expect(bus.place).toBe('кухня')
  })
})

describe('карточки от App с пустыми местами', () => {
  it('null в photoCards — directDay добирает карточку у клиента (идущий запрос), а не теряет её', async () => {
    const img = 'data:image/jpeg;base64,' + 'C'.repeat(300)
    const card = sanitizePhotoCard(raw)!
    let sent: { photoCards?: (unknown | null)[] } = {}
    const f = vi.fn(async (u: unknown, init?: RequestInit) => {
      if (String(u).includes('/api/photo')) return new Response(JSON.stringify(raw), { status: 200 })
      sent = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(exemplars[0].script), { status: 200 })
    })
    const r = await directDay({ text: exemplars[0].text, photos: [img], song: null, photoCards: [null] }, { fetchImpl: f as unknown as typeof fetch })
    expect(sent.photoCards?.[0]).toBeTruthy()
    expect(r.script.photo_cards?.[0]?.caption).toBe(card.caption)
  })
})
