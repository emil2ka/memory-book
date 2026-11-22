import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { directDay } from '../director'
import { exemplars } from '../director/exemplars'
import { buildSongUser, handleSong, parseSongInput, resolveSongs, SONG_MODEL, SONG_SYSTEM } from '../../api/song'
import { SONG_LIST } from '../director/songList'
import { sanitizePhotoCard } from './scenePhoto'
import { closeSongDb, entryLanguage, fetchSongAdvice, sanitizeSongAdvice, songKey, suggestedSongWhy } from './sceneSong'

afterAll(() => closeSongDb())

const raw = {
  why: 'тёплая кофейня вечером → что-то медленное и тёплое',
  songs: [
    { title: '«Кешір»', artist: 'Ninety One', why: 'вечер с подругой', tempo: 0.4, energy: 1.7 },
    { title: 'Кешір', artist: 'Ninety One', why: 'повтор', tempo: 0.4, energy: 0.3 },
    { title: '', artist: 'Кто-то', why: 'без названия', tempo: 0.5, energy: 0.5 },
    { title: 'Звезда по имени Солнце', artist: 'Кино', why: 'дорога домой', tempo: '0.6', energy: -2 },
    { title: 'Here Comes the Sun', artist: 'The Beatles', why: 'солнце после дождя', tempo: 0.7, energy: 0.6 },
    { title: 'Лишняя', artist: 'Кто-то', why: 'четвёртая', tempo: 0.5, energy: 0.5 },
  ],
}

describe('совет по песне', () => {
  it('3 песни с названием и исполнителем, без кавычек и повторов; темп и энергия 0..1; нет песен — null', () => {
    const a = sanitizeSongAdvice(raw)!
    expect(a.songs.map((s) => s.title)).toEqual(['Кешір', 'Звезда по имени Солнце', 'Here Comes the Sun'])
    expect(a.songs[0].energy).toBe(1)
    expect(a.songs[1]).toMatchObject({ tempo: 0.6, energy: 0 })
    expect(a.why).toBe(raw.why)
    expect(sanitizeSongAdvice({ songs: [] })).toBeNull()
    expect(sanitizeSongAdvice(null)).toBeNull()
  })

  it('язык записи: казахский, русский, смешанный, английский', () => {
    expect(entryLanguage('Бүгін әжеммен бауырсақ пісірдік, көңілді болды')).toBe('kk')
    expect(entryLanguage('Утром проспал, бежал в универ, а вечером пили какао с подругой у окна. Әже.')).toBe('mixed')
    expect(entryLanguage('Утром проспал и бежал в универ')).toBe('ru')
    expect(entryLanguage('Rainy morning, coffee with a friend')).toBe('en')
  })

  it('запрос к Haiku: только claude-haiku-5-5; в промпте — не выдумывать; фото текстом; пустой ввод — 400', async () => {
    expect(SONG_MODEL).toBe('claude-haiku-5-5')
    expect(SONG_SYSTEM).toMatch(/НАСТОЯЩИЕ/)
    expect(SONG_SYSTEM).toMatch(/Никогда не выдумывай/)
    expect(SONG_SYSTEM).toMatch(/zvezda_solnce — Кино — Звезда по имени Солнце/)
    const card = sanitizePhotoCard({ caption: 'мы с подругой пьём какао', place: { ru: 'кофейня', ref: 'cafe_table' }, things: [], people: [], time_of_day: 'evening', weather: 'rain', palette: [], mood: 'уютно', match: '' })!
    const inp = parseSongInput({ day: 'Пили какао у окна', cards: [card, 'мусор'] })
    expect(inp.cards).toHaveLength(1)
    const u = buildSongUser(inp)
    expect(u).toMatch(/язык: русский/)
    expect(u).toMatch(/две песни с пометкой «на русском»/)
    expect(u).toMatch(/Фото 0: «мы с подругой пьём какао»/)
    expect(() => parseSongInput({ day: '  ', cards: [] })).toThrow()
    const r = await handleSong({ day: '' }, 'test-ip')
    expect(r.status).toBe(400)
  })

  it('выбор Haiku → песни только из проверенного списка; язык по записи; недостающие — свои по энергии', () => {
    const ru = resolveSongs({ why: 'w', songs: [{ id: 'kino_fake', why: 'x' }, { id: 'zvezda_solnce', why: 'дорога' }, { id: 'zvezda_solnce', why: 'повтор' }, { id: 'lovely_day', why: 'тепло' }] }, 'Утром шли в универ под дождём')!
    expect(ru.songs.map((s) => `${s.artist} — ${s.title}`).slice(0, 2)).toEqual(['Кино — Звезда по имени Солнце', 'Bill Withers — Lovely Day'])
    expect(ru.songs).toHaveLength(3)
    expect(ru.songs.filter((s) => ['ru', 'kz_ru'].includes(SONG_LIST.find((x) => x.title === s.title)!.lang)).length).toBeGreaterThanOrEqual(2)
    // казахская запись, а Haiku дала только мировые — последняя заменяется казахской, первые две остаются со своим «почему»
    const kk = resolveSongs({ why: 'w', songs: [{ id: 'happy', why: 'a' }, { id: 'yellow', why: 'b' }, { id: 'imagine', why: 'c' }] }, 'Бүгін әжеммен бауырсақ пісірдік, көңілді болды')!
    expect(kk.songs.filter((s) => SONG_LIST.find((x) => x.title === s.title)!.lang === 'kk')).toHaveLength(1)
    expect(kk.songs.map((s) => s.why).slice(0, 2)).toEqual(['a', 'b'])
    expect(resolveSongs({ songs: [{ id: 'nope' }] }, 'день')).toBeNull()
    expect(new Set(SONG_LIST.map((x) => x.id)).size).toBe(SONG_LIST.length)
  })

  it('клиент: сервер → кэш по тексту и фото; повтор — без сети; без сети и при ошибке — null', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(raw), { status: 200 }))
    const day = 'Вечером пили какао с подругой у окна'
    const a = await fetchSongAdvice(day, [], { fetchImpl: f as unknown as typeof fetch })
    expect(a?.songs).toHaveLength(3)
    await new Promise((r) => setTimeout(r, 20))
    const b = await fetchSongAdvice(day, [], { fetchImpl: f as unknown as typeof fetch })
    expect(b?.songs[0].title).toBe('Кешір')
    expect(f).toHaveBeenCalledTimes(1)
    expect(songKey(day, [])).not.toBe(songKey(day + '!', []))
    const down = vi.fn(async () => {
      throw new TypeError('network')
    })
    expect(await fetchSongAdvice('Другой день, другой текст', [], { fetchImpl: down as unknown as typeof fetch })).toBeNull()
    const bad = vi.fn(async () => new Response('{}', { status: 502 }))
    expect(await fetchSongAdvice('Третий день', [], { fetchImpl: bad as unknown as typeof fetch })).toBeNull()
    expect(await fetchSongAdvice('   ', [])).toBeNull()
  })
})

describe('«Почему так» — строка «Песня»', () => {
  const day1 = exemplars[0]
  const suggested = { why: 'тёплая кофейня вечером → что-то медленное и тёплое', photos: true }
  it('песня из предложенных ИИ: «Песня: предложил ИИ по записи и фото — why» и у режиссёра, и у запасного', async () => {
    expect(suggestedSongWhy({ why: 'x', photos: false })).toBe('Песня: предложил ИИ по записи — x')
    const ok = vi.fn(async () => new Response(JSON.stringify(day1.script), { status: 200 }))
    const song = { title: 'Кешір', artist: 'Ninety One', suggested }
    const r = await directDay({ text: day1.text, photos: [], song }, { fetchImpl: ok as unknown as typeof fetch })
    expect(r.source).toBe('llm')
    expect(r.script.why[2].startsWith(`Песня: предложил ИИ по записи и фото — ${suggested.why}`)).toBe(true)
    const down = vi.fn(async () => new Response('{}', { status: 502 }))
    const f = await directDay({ text: day1.text, photos: [], song }, { fetchImpl: down as unknown as typeof fetch })
    expect(f.source).toBe('fallback')
    expect(f.script.why[2].startsWith(`Песня: предложил ИИ по записи и фото — ${suggested.why}`)).toBe(true)
  })

  it('своя песня — строка как раньше', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(day1.script), { status: 200 }))
    const r = await directDay({ text: day1.text, photos: [], song: { title: 'Кешір', artist: 'Ninety One' } }, { fetchImpl: ok as unknown as typeof fetch })
    expect(r.script.why[2]).not.toMatch(/предложил ИИ/)
    // как фильм подстроился под песню
    const file = await directDay({ text: day1.text, photos: [], song: { title: 'трек', measuredTempoBpm: 72, energy: 0.3 } }, { fetchImpl: ok as unknown as typeof fetch })
    expect(file.script.why[2]).toBe('Песня: трек 72 bpm — медленная песня → спокойный шаг, тёплый свет, поворот дня — на подъёме песни')
    const yt = await directDay({ text: day1.text, photos: [], song: { title: 'Happy', artist: 'Pharrell Williams', bpm: 160, energy: 0.8 } }, { fetchImpl: ok as unknown as typeof fetch })
    expect(yt.script.why[2]).toBe('Песня: Pharrell Williams — Happy 160 bpm — бодрая песня → бегом, ярче, поворот — на смене фразы')
  })
})

describe('YouTube для песен списка (план 15 § 1.6)', () => {
  it('у проверенных песен есть yt (11 знаков); совет передаёт yt; по названию песня находится', async () => {
    const { findListedSong } = await import('../director/songList')
    const withYt = SONG_LIST.filter((x) => x.yt)
    expect(withYt.length).toBeGreaterThan(80)
    for (const x of withYt) expect(x.yt).toMatch(/^[\w-]{11}$/)
    const a = resolveSongs({ why: 'w', songs: [{ id: 'zvezda_solnce', why: 'дорога' }] }, 'Утром шли в универ')!
    expect(a.songs[0].yt).toBe(SONG_LIST.find((x) => x.id === 'zvezda_solnce')!.yt)
    expect(sanitizeSongAdvice({ songs: [{ title: 'A', artist: 'B', yt: 'bad id!' }] })!.songs[0].yt).toBeUndefined()
    expect(findListedSong('Кукушка', 'Кино')?.yt).toBeTruthy()
    expect(findListedSong('звезда по имени солнце')?.artist).toBe('Кино')
    expect(findListedSong('Нет такой песни')).toBeNull()
  })
})
