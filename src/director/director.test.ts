import { describe, expect, it } from 'vitest'
import type { DayScript } from '../types/script'
import { choreograph } from '../timeline/choreograph'
import { exemplars } from './exemplars'
import { fallbackDirect } from './fallback'
import { directDay } from './index'
import { buildScriptSchema } from './schema'
import { SYSTEM_PROMPT } from './prompt'
import { MAX_MAKES, checkScript, fixQuote, fixResult, validateScript } from './validate'

const day1 = exemplars[0]

describe('exemplars', () => {
  it.each(exemplars.map((e) => [e.script.title, e] as const))('%s — валидный образец', (_t, e) => {
    expect(checkScript(e.script, e.text)).toEqual([])
    // не больше двух одинаковых действий подряд
    const a = e.script.beats.map((b) => b.action)
    for (let i = 2; i < a.length; i++) expect(a[i] === a[i - 1] && a[i] === a[i - 2]).toBe(false)
  })

  it('промпт стабилен и содержит каталог и примеры', () => {
    expect(SYSTEM_PROMPT).toContain('frost_edges_warm_center')
    expect(SYSTEM_PROMPT).toContain('Пример 5')
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(JSON.stringify(buildScriptSchema())).toContain('second_person')
  })
})

describe('validateScript', () => {
  it('чистый сценарий проходит без изменений', () => {
    const r = validateScript(JSON.parse(JSON.stringify(day1.script)), day1.text)
    expect(r.issues).toEqual([])
    expect(r.script).toEqual(day1.script)
  })

  it('цитата: точная → регистр → ближайшая → выкинуть', () => {
    expect(fixQuote(day1.text, 'какао')).toEqual({ quote: 'какао', fixed: false })
    expect(fixQuote(day1.text, 'Какао')).toEqual({ quote: 'какао', fixed: true })
    expect(fixQuote(day1.text, '«жёлтых листьях».')).toEqual({ quote: 'жёлтых листьях', fixed: true })
    expect(fixQuote(day1.text, 'желтые листья')?.quote).toBe('жёлтых листьях')
    expect(fixQuote(day1.text, 'парк')?.quote).toBe('парку')
    expect(fixQuote(day1.text, 'море и чайки')).toBeNull()
  })

  it('неизвестные id → синонимы → кристалл', () => {
    expect(fixResult({ kind: 'item', id: 'mug' }).result).toEqual({ kind: 'kit', id: 'cocoa' })
    expect(fixResult({ kind: 'popup', id: 'cocoa' }).result).toEqual({ kind: 'kit', id: 'cocoa' })
    expect(fixResult({ kind: 'item', id: 'снеговик' }).result).toEqual({ kind: 'kit', id: 'snowman' })
    expect(fixResult({ kind: 'item', id: 'zxqvbn' }).result).toEqual({ kind: 'kit', id: 'crystal' })
    expect(fixResult(null).result).toEqual({ kind: 'kit', id: 'crystal' })
    expect(fixResult({ kind: 'kit', id: 'nope' }, 'старая юрта').result).toEqual({ kind: 'kit', id: 'yurt' })
  })

  it('kit и make', () => {
    expect(fixResult({ kind: 'kit', id: 'yurt' })).toEqual({ result: { kind: 'kit', id: 'yurt' }, fixed: false })
    expect(fixResult({ kind: 'item', id: 'tea' })).toEqual({ result: { kind: 'kit', id: 'tea' }, fixed: false })
    // слово уже есть в библиотеке — дорисовывать не надо
    expect(fixResult({ kind: 'make', name: 'самовар', hint: '', tags: [] }).result).toEqual({ kind: 'kit', id: 'samovar' })
    expect(fixResult({ kind: 'make', name: 'швейная машинка', hint: '', tags: ['home'] }).result).toMatchObject({ kind: 'make', name: 'швейная машинка' })
    const m = fixResult({ kind: 'make', name: 'Самокат', hint: 'детский', tags: ['transport', 'нет-такого', 'CITY'] }).result
    expect(m).toEqual({ kind: 'make', id: 'make:самокат', name: 'Самокат', hint: 'детский', tags: ['transport', 'city'] })
    const text = 'Купили самокат, глобус, пылесос, утюг и фен.'
    const raw = {
      title: 'День новых вещей дома', mood: { warmth: 0.5, tension: 0, energy: 0.5, openness: 0.5 }, contradiction: null,
      time_of_day: 'day', weather: 'clear', place: 'home', palette_hint: ['cream', 'amber', 'teal'], song: { tempo: 'medium', energy: 0.5, estimated: true },
      beats: ['самокат', 'глобус', 'пылесос', 'утюг', 'фен'].map((w) => ({ quote: w, action: 'pull', result: { kind: 'make', name: w, hint: '', tags: ['home'] }, camera: 'wide', effect: null })),
      why: ['Текст: вещи → предметы', 'Фото: нет', 'Песня: нет'],
    }
    const r = validateScript(raw, text)
    expect(r.script.beats.filter((b) => b.result.kind === 'make')).toHaveLength(MAX_MAKES)
    expect(r.issues.some((i) => i.includes('лишняя дорисовка'))).toBe(true)
    expect(checkScript(r.script, text)).toEqual([])
  })

  it('чинит сломанный ответ до валидного сценария', () => {
    const raw = {
      title: 'Парк',
      mood: { warmth: 3, tension: -7, energy: 'x' },
      contradiction: { a: 'холодно', b: 'уютно', staging: 'frost' },
      time_of_day: 'dusk',
      weather: 'sunny',
      place: 'forest',
      palette_hint: ['amber', 'purple'],
      song: { tempo: 'very fast', energy: 2 },
      beats: [
        { quote: 'Какао', action: 'sip', result: { kind: 'item', id: 'mug' }, camera: 'close_up', effect: 'flicker' },
        { quote: 'единорог', action: 'pull', result: { kind: 'item', id: 'unicorn' }, camera: 'wide', effect: null },
      ],
      why: ['одна строка'],
    }
    const r = validateScript(raw, day1.text)
    expect(checkScript(r.script, day1.text)).toEqual([])
    expect(r.script.beats.length).toBeGreaterThanOrEqual(4)
    expect(r.script.beats.some((b) => b.quote === 'какао' && b.action === 'drink' && b.result.kind === 'kit' && b.result.id === 'cocoa' && b.camera === 'push_in' && b.effect === 'lamp_flicker')).toBe(true)
    expect(r.script.beats.some((b) => b.quote === 'единорог')).toBe(false)
    expect(r.script.mood.warmth).toBe(1)
    expect(r.script.mood.tension).toBe(-1)
    expect(r.script.contradiction?.staging).toBe('frost_edges_warm_center')
    expect(r.script.palette_hint).toEqual(['amber'])
    expect(r.script.song.energy).toBe(1)
    expect(r.script.why).toHaveLength(3)
    expect(r.stats.dropped).toBe(1)
    expect(r.issues.length).toBeGreaterThan(3)
  })

  it('больше 7 битов обрезает, название длиннее 7 слов обрезает', () => {
    const many = { ...day1.script, title: 'Очень длинное название этого дня в осеннем парке с какао', beats: [...day1.script.beats, ...day1.script.beats.map((b) => ({ ...b }))] }
    const text = day1.text
    const r = validateScript(many, text)
    expect(r.script.beats.length).toBeLessThanOrEqual(7)
    expect(r.script.title.split(' ').length).toBe(7)
    expect(checkScript(r.script, text)).toEqual([])
  })

  it('мусор на входе → всё равно валидный сценарий', () => {
    for (const raw of [null, 42, 'строка', [], { beats: 'нет' }]) {
      const r = validateScript(raw, day1.text)
      expect(checkScript(r.script, day1.text)).toEqual([])
    }
  })
})

describe('fallbackDirect', () => {
  const texts = [
    ...exemplars.map((e) => e.text),
    'Сегодня ничего не произошло.',
    'Привет',
    '!!!',
    'а',
    'Бүгін қар жауды. Анаммен бірге шай іштік, үйде жылы болды.',
    'Утром был дедлайн, я очень устал, но вечером мы с друзьями пошли в кафе и смеялись. Coffee was great.',
    'Весь день лил дождь, автобус опоздал, я промок и замёрз, но дома ждал горячий чай и кот.',
  ]
  it.each(texts.map((t) => [t.slice(0, 30), t]))('«%s…» → валидный сценарий 4–7 битов', (_n, t) => {
    const s = fallbackDirect({ text: t, photos: [], song: null })
    expect(checkScript(s, t)).toEqual([])
    const tl = choreograph(s, { seed: 1 })
    expect(tl.duration).toBeGreaterThanOrEqual(30)
    expect(tl.duration).toBeLessThanOrEqual(60)
  })

  it('берёт осмысленные слова и противоречие', () => {
    const s = fallbackDirect({ text: day1.text, photos: [], song: null })
    const ids = s.beats.map((b) => `${b.result.kind}:${b.result.id}`)
    expect(ids).toEqual(expect.arrayContaining(['kit:tree', 'effect:leaves', 'effect:frost', 'kit:cocoa', 'person:second_person']))
    expect(s.contradiction?.staging).toBe('frost_edges_warm_center')
    expect(s.place).toBe('park')
    expect(s.time_of_day).toBe('evening')
    expect(s.mood.warmth).toBeGreaterThan(0)
  })

  it('напряжённый день — напряжение, склейки', () => {
    const e = exemplars[1]
    const s = fallbackDirect({ text: e.text, photos: [], song: null })
    expect(s.mood.tension).toBeGreaterThan(0.3)
    expect(s.beats.some((b) => b.camera === 'hard_cut')).toBe(true)
    expect(s.contradiction?.staging).toBe('slow_walk_bright_light')
  })

  it('измеренный темп → song.estimated=false', () => {
    const s = fallbackDirect({ text: 'Мы танцевали всю ночь', photos: [], song: { title: 'x', measuredTempoBpm: 140 } })
    expect(s.song).toMatchObject({ tempo: 'fast', estimated: false })
  })

  it('детерминирован', () => {
    expect(fallbackDirect({ text: day1.text })).toEqual(fallbackDirect({ text: day1.text }))
  })
})

describe('directDay', () => {
  const input = { text: day1.text, photos: [], song: null }
  const okFetch = (body: unknown, delay = 0): typeof fetch =>
    (async () => {
      await new Promise((r) => setTimeout(r, delay))
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch

  it('успех → source llm', async () => {
    const r = await directDay(input, { fetchImpl: okFetch(day1.script) })
    expect(r.source).toBe('llm')
    expect(r.script).toEqual(day1.script)
  })

  it('ошибка сервера → fallback', async () => {
    const f = (async () => new Response(JSON.stringify({ error: 'refusal' }), { status: 502 })) as unknown as typeof fetch
    const r = await directDay(input, { fetchImpl: f })
    expect(r.source).toBe('fallback')
    expect(r.reason).toContain('refusal')
    expect(checkScript(r.script, input.text)).toEqual([])
  })

  it('сеть упала → fallback', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    const r = await directDay(input, { fetchImpl: f })
    expect(r.source).toBe('fallback')
  })

  it('таймаут → fallback, поздний ответ приходит в onLateScript', async () => {
    let late: DayScript | null = null
    const r = await directDay(input, { fetchImpl: okFetch(day1.script, 80), timeoutMs: 20, onLateScript: (s) => (late = s) })
    expect(r.source).toBe('fallback')
    expect(r.reason).toBe('таймаут')
    await new Promise((res) => setTimeout(res, 120))
    expect(late).toEqual(day1.script)
  })

  it('кривой ответ LLM чинится валидатором', async () => {
    const broken = { ...day1.script, beats: day1.script.beats.map((b) => ({ ...b, quote: b.quote.toUpperCase() })) }
    const r = await directDay(input, { fetchImpl: okFetch(broken) })
    expect(r.source).toBe('llm')
    expect(checkScript(r.script, input.text)).toEqual([])
    expect(r.issues!.length).toBeGreaterThan(0)
  })
})

describe('режиссёр знает библиотеку кита', () => {
  it('промпт и схема перечисляют предметы библиотеки', () => {
    expect(SYSTEM_PROMPT).toContain('yurt юрта*')
    expect(SYSTEM_PROMPT).toContain('kind="make"')
    expect(JSON.stringify(buildScriptSchema())).toContain('"samovar"')
  })

  it('запасной режиссёр берёт слова из библиотеки', () => {
    const s = fallbackDirect({ text: 'Вечером пили чай из самовара в юрте, ели баурсаки и слушали домбру.' })
    const got = s.beats.map((b) => `${b.result.kind}:${b.result.id}`)
    expect(got).toEqual(expect.arrayContaining(['kit:samovar', 'kit:yurt', 'kit:baursak', 'kit:dombra']))
  })

  it('образцы — только kit, effect, person', () => {
    for (const e of exemplars) for (const b of e.script.beats) expect(['kit', 'effect', 'person']).toContain(b.result.kind)
  })

  it('реакция по тегам предмета', () => {
    const tl = choreograph({ ...exemplars[0].script, beats: exemplars[0].script.beats.map((b) => b) }, { seed: 1 })
    expect(tl.events.length).toBeGreaterThan(0)
  })
})
