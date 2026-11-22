import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Beat, DayScript, PhotoCard } from '../types/script'
import type { TimelineEvent } from '../types/timeline'
import { choreograph, computePace, OUTRO_SIT, keptBeats, MAX_BEATS_WITH_PHOTOS, TRAVEL_MAX, TRAVEL_MIN } from './choreograph'
import { exemplars } from '../director/exemplars'
import day1 from './samples/day1.json'
import day2 from './samples/day2.json'
import day3 from './samples/day3.json'

const samples = [day1, day2, day3] as unknown as DayScript[]
const texts = [1, 2, 3].map((n) => readFileSync(join(__dirname, 'samples', `day${n}.txt`), 'utf8'))

function withBeats(base: DayScript, n: number): DayScript {
  const beats: Beat[] = []
  for (let i = 0; i < n; i++) beats.push({ ...base.beats[i % base.beats.length] })
  return { ...base, beats }
}

const cameras = (events: TimelineEvent[]) => events.filter((e) => e.type === 'camera') as Extract<TimelineEvent, { type: 'camera' }>[]

describe('samples', () => {
  it('каждая цитата — точная подстрока текста', () => {
    samples.forEach((s, i) => {
      for (const b of s.beats) expect(texts[i].includes(b.quote), b.quote).toBe(true)
      expect(s.beats.length).toBeGreaterThanOrEqual(4)
      expect(s.beats.length).toBeLessThanOrEqual(7)
      expect(s.why).toHaveLength(3)
    })
  })
})

describe('choreograph', () => {
  it('детерминирован: тот же сценарий + seed → тот же таймлайн', () => {
    for (const s of samples) {
      const a = choreograph(s, { seed: 42 })
      const b = choreograph(s, { seed: 42 })
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    }
    const c = choreograph(samples[0], { seed: 7 })
    expect(JSON.stringify(c.events)).not.toBe(JSON.stringify(choreograph(samples[0], { seed: 42 }).events))
  })

  it('pace: спокойно ≈ 1.3, напряжённо ≈ 0.7', () => {
    expect(computePace(samples[0])).toBeGreaterThan(1.2)
    expect(computePace(samples[2])).toBeGreaterThan(1.2)
    expect(computePace(samples[1])).toBeLessThan(0.8)
  })

  const variants: [string, DayScript][] = []
  for (const s of samples) for (const n of [4, 7]) variants.push([`${s.title} × ${n}`, withBeats(s, n)])
  variants.push(['день 4 бита без противоречия, тихий', { ...withBeats(samples[1], 4), contradiction: null }])

  it.each(variants)('%s: 30–75 с, отсортировано, ничего не вылезает за конец', (_name, s) => {
    for (const seed of [1, 2, 3, 999]) {
      const tl = choreograph(s, { seed })
      expect(tl.duration).toBeGreaterThanOrEqual(30)
      expect(tl.duration).toBeLessThanOrEqual(75)
      for (let i = 1; i < tl.events.length; i++) expect(tl.events[i].t).toBeGreaterThanOrEqual(tl.events[i - 1].t)
      for (const e of tl.events) {
        expect(e.t).toBeGreaterThanOrEqual(0)
        expect(e.dur).toBeGreaterThan(0)
        expect(e.t + e.dur).toBeLessThanOrEqual(tl.duration + 1e-6)
      }
    }
  })

  it('maxDuration ограничивает длину', () => {
    const tl = choreograph(withBeats(samples[0], 7), { seed: 1, maxDuration: 55 })
    expect(tl.duration).toBeLessThanOrEqual(55)
    expect(choreograph(withBeats(samples[0], 7), { seed: 1 }).duration).toBeGreaterThan(55)
  })

  it.each(variants)('%s: правила монтажа', (_name, s) => {
    const tl = choreograph(s, { seed: 5 })
    const cams = cameras(tl.events)
    // вступление: wide → push_in
    expect(cams[0].shot).toBe('wide')
    expect(cams[1].shot).toBe('push_in')
    // первый бит — с общего плана
    expect(cams.find((c) => c.beat === 0)!.shot).toBe('wide')
    // нет двух push_in подряд
    for (let i = 1; i < cams.length; i++) expect(cams[i].shot === 'push_in' && cams[i - 1].shot === 'push_in').toBe(false)
    // последний план — отъезд
    expect(cams[cams.length - 1].shot).toBe('pull_out')
    // противоречие: hold 2–3 с и staging
    const staging = tl.events.filter((e) => e.type === 'staging')
    if (s.contradiction) {
      expect(staging).toHaveLength(1)
      const hold = cams.find((c) => c.t === staging[0].t && c.shot === 'hold')!
      expect(hold).toBeTruthy()
      expect(hold.dur).toBeGreaterThanOrEqual(3.5)
      expect(hold.dur).toBeLessThanOrEqual(4)
    } else expect(staging).toHaveLength(0)
    // вступление и финал
    const types = tl.events.map((e) => e.type)
    expect(types[0]).toBe('camera')
    expect(types).toContain('book_open')
    expect(tl.events.find((e) => e.type === 'actor_enter')!).toMatchObject({ actor: 'hero', beat: -1 })
    const last = tl.events.filter((e) => e.beat === -1 && e.t > 10).map((e) => e.type)
    expect(last).toEqual(expect.arrayContaining(['book_close', 'title_reveal', 'to_shelf']))
    expect(tl.events.find((e) => e.type === 'title_reveal')).toMatchObject({ title: s.title })
  })

  it('каждый бит: walk → (action) → lift → transform → реакция, в таком порядке', () => {
    const s = samples[0]
    const tl = choreograph(s, { seed: 3 })
    s.beats.forEach((b, i) => {
      const ev = tl.events.filter((e) => e.beat === i && e.type !== 'camera' && e.type !== 'scene_effect' && e.type !== 'actor_enter' && e.type !== 'staging' && e.type !== 'companion_enter' && e.type !== 'travel')
      // после превращения — крупный кадр: поза и цитата вместе, потом сценка сворачивается в марку;
      // первый бит — короткий подход без действия (первое слово ≤ 5 с)
      const firstBeat = i === tl.beats[0].beat
      expect(ev.map((e) => e.type)).toEqual(firstBeat ? ['actor_walk', 'word_lift', 'word_transform', 'actor_action', 'quote_caption', 'stamp'] : ['actor_walk', 'actor_action', 'word_lift', 'word_transform', 'actor_action', 'quote_caption', 'stamp'])
      expect(ev[0]).toMatchObject({ toQuote: b.quote })
      if (!firstBeat) expect(ev[1]).toMatchObject({ action: b.action })
      expect(ev[firstBeat ? 2 : 3]).toMatchObject({ quote: b.quote, result: b.result })
      if (b.effect) expect(tl.events.some((e) => e.type === 'scene_effect' && e.beat === i && e.effect === b.effect)).toBe(true)
    })
  })

  it('реакции по правилам: какао → drink, иней → shiver, искры → cheer, pop-up → sit', () => {
    const reaction = (s: DayScript, i: number, seed = 1) => {
      const acts = choreograph(s, { seed }).events.filter((e) => e.beat === i && e.type === 'actor_action')
      return (acts[acts.length - 1] as Extract<TimelineEvent, { type: 'actor_action' }>).action
    }
    expect(reaction(samples[0], 3)).toBe('drink') // какао
    expect(reaction(samples[2], 2)).toBe('shiver') // иней (действие sit)
    expect(reaction(samples[0], 2)).toBe('sit') // иней, но действие уже shiver — не повторяем
    expect(reaction(samples[0], 0)).toBe('sit') // дерево
    expect(reaction(samples[1], 4)).toBe('cheer') // искры
    expect(reaction(samples[1], 2)).toBe('drink') // кофе
  })

  it('person → actor_enter для second', () => {
    const tl = choreograph(samples[0], { seed: 1 })
    const enters = tl.events.filter((e) => e.type === 'actor_enter' && e.actor === 'second')
    expect(enters).toHaveLength(1)
    expect(enters[0].beat).toBe(4)
  })

  it('притягивает начала блоков к ударам в пределах ±0,4 с', () => {
    const s = samples[1]
    const bpm = 128
    const beatTimes = Array.from({ length: 200 }, (_, i) => 0.13 + (i * 60) / bpm)
    const tl = choreograph(s, { seed: 9, beatTimes })
    const plain = choreograph(s, { seed: 9 })
    // первый бит идёт сразу после входа без притяжения (первое слово ≤ 5 с)
    const first = tl.beats[0].beat
    const starts = cameras(tl.events).filter((c) => c.beat >= 0 && c.beat !== first).map((c) => c.t)
    const plainStarts = cameras(plain.events).filter((c) => c.beat >= 0 && c.beat !== first).map((c) => c.t)
    expect(starts.length).toBe(plainStarts.length)
    for (const t of starts) {
      const d = Math.min(...beatTimes.map((b) => Math.abs(b - t)))
      expect(d).toBeLessThan(0.002)
    }
    expect(tl.duration).toBeLessThanOrEqual(60)
    // без ударов ничего не притягивается
    expect(plainStarts.some((t) => Math.min(...beatTimes.map((b) => Math.abs(b - t))) > 0.01)).toBe(true)
  })

  it('удары далеко — блоки остаются на месте', () => {
    const s = samples[2]
    const far = [1000, 2000]
    expect(JSON.stringify(choreograph(s, { seed: 4, beatTimes: far }).events)).toBe(JSON.stringify(choreograph(s, { seed: 4 }).events))
  })
})

describe('финал и противоречие', () => {
  it('финал: sit (поклон) без camera внутри, затем book_close и pull_out, длина ≤ 75', () => {
    for (const s of samples)
      for (const photoCount of [0, 3]) {
        const tl = choreograph(s, { seed: 2, photoCount })
        expect(tl.duration).toBeLessThanOrEqual(75)
        const sit = tl.events.filter((e) => e.type === 'actor_action' && e.beat === -1).pop()!
        expect(sit.dur).toBeCloseTo(OUTRO_SIT, 5)
        const inside = tl.events.filter((e) => e.type === 'camera' && e.t > sit.t + 1e-6 && e.t < sit.t + sit.dur - 1e-6)
        expect(inside).toEqual([])
        const close = tl.events.find((e) => e.type === 'book_close')!
        const pull = tl.events.find((e) => e.type === 'camera' && e.shot === 'pull_out')!
        expect(close.t).toBeCloseTo(sit.t + OUTRO_SIT, 5)
        expect(pull.t).toBeCloseTo(sit.t + OUTRO_SIT, 5)
        expect(tl.events.find((e) => e.type === 'title_reveal')!.t).toBeCloseTo(sit.t + OUTRO_SIT + 1.4, 5)
        expect(tl.events.find((e) => e.type === 'to_shelf')!.t).toBeCloseTo(sit.t + OUTRO_SIT + 3.2, 5)
      }
  })

  it('противоречие длится 3.5–4 с', () => {
    for (const s of samples.filter((x) => x.contradiction)) {
      const st = choreograph(s, { seed: 2 }).events.find((e) => e.type === 'staging')!
      expect(st.dur).toBeGreaterThanOrEqual(3.5)
      expect(st.dur).toBeLessThanOrEqual(4)
    }
  })
})

describe('L7: полароид, облёт, камера', () => {
  const days = samples

  it('без фото — полароида нет', () => {
    for (const s of days) {
      const tl = choreograph(s, { seed: 3 })
      expect(tl.events.some((e) => e.type === 'photo_reveal' || e.type === 'photo_fan')).toBe(false)
    }
  })

  it('старый день без карточек: снимок 0 оживает в начале первого бита с местом (не первого), 3 с; остальные — веер', () => {
    for (const s of days) {
      for (const photoCount of [1, 3]) {
        const tl = choreograph(s, { seed: 3, photoCount })
        expect(tl.duration).toBeLessThanOrEqual(75)
        const rev = tl.events.filter((e) => e.type === 'photo_reveal') as Extract<TimelineEvent, { type: 'photo_reveal' }>[]
        expect(rev).toHaveLength(1)
        const r = rev[0]
        expect(r.photo).toBe(0)
        expect(r.dur).toBeCloseTo(3, 5)
        const win = tl.beats.find((w) => w.beat === r.beat)!
        expect(win.photo).toBe(0)
        expect(win.photo_card).toBeNull()
        expect(win).not.toBe(tl.beats[0])
        // снимок — в начале бита, превращение сразу после него
        expect(r.t).toBeCloseTo(win.start, 5)
        expect(win.transform).toBeCloseTo(r.t + r.dur, 5)
        const tr = tl.events.find((e) => e.type === 'word_transform' && e.beat === r.beat)!
        expect(tr.t).toBeCloseTo(win.transform, 5)
        // внутри снимка — ни камеры, ни шагов
        const inside = tl.events.filter((e) => e !== r && e.t > r.t + 1e-6 && e.t < r.t + r.dur - 1e-6)
        expect(inside.filter((e) => e.type === 'camera' || e.type === 'actor_walk' || e.type === 'word_lift')).toEqual([])
        expect(tl.beats.filter((w) => w.photo === null).every((w) => w.photo_card === null)).toBe(true)
        const fan = tl.events.filter((e) => e.type === 'photo_fan') as Extract<TimelineEvent, { type: 'photo_fan' }>[]
        if (photoCount > 1) {
          const sit = tl.events.filter((e) => e.type === 'actor_action' && e.beat === -1).pop()!
          expect(fan).toHaveLength(1)
          expect(fan[0].photos).toEqual([1, 2])
          expect(fan[0].from).toBe(1)
          expect(fan[0].t).toBeCloseTo(sit.t, 5)
        } else expect(fan).toHaveLength(0)
      }
    }
  })

  it('карточки снимков: пара по фразе — снимок оживает в её бите; без пары — свой бит kind photo; не больше 3; ≤ 50 с', () => {
    const card = (over: Partial<PhotoCard>): PhotoCard => ({
      caption: 'мы пьём какао в кофейне',
      place: { ru: 'кофейня', ref: 'cafe_table' },
      things: [{ ru: 'какао', ref: 'cocoa', where: 'table' }],
      people: [{ role: 'подруга', jacket: 'brick', scarf: 'cream', hair: 'brown', accessory: 'long_hair', action: 'sit' }],
      time_of_day: 'evening',
      weather: 'clear',
      palette: ['brown', 'amber'],
      mood: 'уютно',
      match: '',
      ...over,
    })
    const base = samples[0] // «Гуляли по парку…какао…Фонари»
    const cocoaIdx = base.beats.findIndex((b) => b.quote === 'какао')
    const cards = [
      card({ match: 'Было холодно, но мы пили какао и долго разговаривали.' }),
      card({ caption: 'лужа у фонаря вечером', place: { ru: 'улица', ref: 'lamp_post' }, things: [{ ru: 'лужа', ref: 'puddle', where: 'ground' }], people: [], match: '' }),
      card({ caption: 'кот на подоконнике', place: { ru: 'окно', ref: 'window_sill' }, things: [{ ru: 'кошка', ref: 'cat', where: 'ground' }], people: [], match: '' }),
      card({ caption: 'ещё одно фото', match: '' }),
    ]
    const tl = choreograph({ ...base, photo_cards: cards }, { seed: 2, photoCount: 4 })
    expect(tl.duration).toBeLessThanOrEqual(75)
    expect(tl.beats[0].transform).toBeLessThanOrEqual(5)
    expect(tl.beats[0].photo).toBeNull()
    const withPhoto = tl.beats.filter((w) => w.photo !== null)
    expect(withPhoto.length).toBeLessThanOrEqual(3)
    // снимок 0 — к фразе «какао» из его предложения
    const p0 = tl.beats.find((w) => w.photo === 0)!
    expect(p0.beat).toBe(cocoaIdx)
    expect(p0.photo_card?.match).toContain('какао')
    // снимок без пары — свой бит: цитата — подпись, вид photo, номер бита за пределами сценария
    const own = tl.beats.filter((w) => w.kind === 'photo')
    expect(own.length).toBeGreaterThan(0)
    for (const w of own) {
      expect(w.beat).toBeGreaterThanOrEqual(base.beats.length)
      expect(w.quote).toBe(w.photo_card!.caption)
      const tr = tl.events.find((e) => e.type === 'word_transform' && e.beat === w.beat) as Extract<TimelineEvent, { type: 'word_transform' }>
      expect(tr.quote).toBe(w.photo_card!.caption)
    }
    // лужа у фонаря встаёт после бита «Фонари» (ближайший по смыслу)
    const puddle = tl.beats.find((w) => w.photo === 1)
    if (puddle) {
      const lamp = tl.beats.find((w) => w.quote === 'Фонари')!
      expect(puddle.start).toBeGreaterThan(lamp.start)
    }
    // каждому снимку — один бит или веер, без повторов
    const fan = (tl.events.find((e) => e.type === 'photo_fan') as Extract<TimelineEvent, { type: 'photo_fan' }> | undefined)?.photos ?? []
    const all = [...withPhoto.map((w) => w.photo!), ...fan].sort()
    expect(all).toEqual([0, 1, 2, 3])
  })

  it('с фото, противоречием и 6 битами фильм укладывается в 75 с', () => {
    for (const e of exemplars) {
      const tl = choreograph(e.script, { seed: 1, photoCount: 3 })
      expect(tl.duration).toBeLessThanOrEqual(75)
    }
  })

  it('в каждом фильме есть облёт с targetQuote, не на первом бите', () => {
    for (const s of days)
      for (const seed of [1, 2, 3]) {
        const tl = choreograph(s, { seed, photoCount: 2 })
        const orbits = tl.events.filter((e) => e.type === 'camera' && e.shot === 'orbit_quarter') as Extract<TimelineEvent, { type: 'camera' }>[]
        expect(orbits.length).toBeGreaterThanOrEqual(1)
        expect(orbits.every((o) => o.targetQuote && s.beats.some((b) => b.quote === o.targetQuote))).toBe(true)
        expect(orbits.some((o) => o.beat === 0)).toBe(false)
      }
  })

  it('общий план в середине фильма — только у первого бита и у веера снимков', () => {
    for (const s of days) {
      const tl = choreograph(s, { seed: 5, photoCount: 2 })
      const mid = tl.events.filter((e) => e.type === 'camera' && e.shot === 'wide' && e.beat > 0) as Extract<TimelineEvent, { type: 'camera' }>[]
      for (const c of mid) expect(tl.events.some((e) => e.type === 'photo_fan' && Math.abs(e.t - c.t) < 1e-6)).toBe(true)
    }
  })
})

describe('отсев битов при фото', () => {
  const mk = (quote: string, result: Beat['result']): Beat => ({ quote, action: 'pull', result, camera: 'push_in', effect: null })
  const beats: Beat[] = [
    mk('парк', { kind: 'kit', id: 'tree' }),
    mk('листья', { kind: 'effect', id: 'leaves' }),
    mk('мы', { kind: 'person', id: 'second_person' }),
    mk('горячее какао', { kind: 'kit', id: 'cocoa' }),
    mk('чай', { kind: 'kit', id: 'tea' }),
    mk('снег', { kind: 'effect', id: 'snow' }),
    mk('фонари', { kind: 'kit', id: 'lamp_post' }),
    mk('гитара', { kind: 'kit', id: 'guitar' }),
    mk('автобус', { kind: 'kit', id: 'bus' }),
  ]

  it('без фото или при ≤ 5 битах — все', () => {
    expect(MAX_BEATS_WITH_PHOTOS).toBe(7)
    expect(keptBeats(beats, 0, [])).toHaveLength(beats.length)
    expect(keptBeats(beats.slice(0, 5), 3, [])).toHaveLength(5)
  })

  it('с фото — 7: сначала эффекты, защищённые остаются', () => {
    const k = keptBeats(beats, 2, [3])
    expect(k).toHaveLength(7)
    expect(k).not.toContain(1)
    expect(k).not.toContain(5)
    expect(k).toContain(2) // person
    expect(k).toContain(3) // облёт
  })

  it('потом повтор вида предмета, потом самое короткое слово', () => {
    const noFx = beats.filter((b) => b.result.kind !== 'effect').concat([mk('кофе', { kind: 'kit', id: 'coffee' }), mk('ноутбук горячий', { kind: 'kit', id: 'laptop' })])
    // напитки: cocoa, tea, coffee — один вид; уходит самый короткий из них
    const k = keptBeats(noFx, 1, [])
    expect(k).toHaveLength(7)
    expect(k.map((i) => noFx[i].quote)).not.toContain('чай')
  })

  it('в таймлайне не больше 7 битов, сценарий не трогается', () => {
    const day = { ...samples[0], beats: [...samples[0].beats] }
    const before = JSON.stringify(day.beats)
    const tl = choreograph(day, { seed: 1, photoCount: 3 })
    const used = new Set(tl.events.filter((e) => e.type === 'word_transform').map((e) => e.beat))
    expect(used.size).toBe(Math.min(MAX_BEATS_WITH_PHOTOS, day.beats.length))
    expect(JSON.stringify(day.beats)).toBe(before)
  })
})

describe('план 13: окна бита, вход, второй человечек', () => {
  const days = [...exemplars.map((e) => e.script), ...samples]
  it('вход 4 с без page_flip, наезд вместе с человечком; первое слово ≤ 5 с; окна по порядку', () => {
    for (const s of days)
      for (const photoCount of [0, 2]) {
        const tl = choreograph(s, { seed: 4, photoCount })
        expect(tl.events.some((e) => e.type === 'page_flip')).toBe(false)
        const enter = tl.events.find((e) => e.type === 'actor_enter' && e.beat === -1)!
        const push = tl.events.find((e) => e.type === 'camera' && e.beat === -1 && e.shot === 'push_in')!
        expect(push.t).toBeCloseTo(enter.t, 5)
        expect(enter.dur).toBeGreaterThanOrEqual(1.6)
        expect(tl.events.find((e) => e.type === 'book_open')!.dur).toBeGreaterThanOrEqual(1.2)
        expect(tl.beats[0].transform).toBeLessThanOrEqual(5)
        for (const w of tl.beats) {
          expect(w.start).toBeLessThan(w.transform)
          // бит-чувство: слово не превращается — эмоция с начала крупного кадра
          if (w.kind === 'feeling' && w.emotion) expect(w.transform).toBe(w.hold[0])
          else expect(w.transform).toBeLessThan(w.hold[0])
          expect(w.hold[1] - w.hold[0]).toBeGreaterThanOrEqual(2.2 - 1e-6)
          expect(w.end).toBe(w.hold[1])
        }
      }
  })

  it('companion_enter — не раньше transform + 0.3 с и до крупного кадра; hold ≥ 2.2 с даже в перегруженном дне', () => {
    const many = { ...samples[0], beats: [...samples[0].beats, ...samples[0].beats.map((b) => ({ ...b, quote: b.quote + ' ' }))].slice(0, 8) }
    for (const s of [...days, many]) {
      const tl = choreograph(s, { seed: 2, photoCount: 1, maxDuration: 45 })
      for (const e of tl.events) {
        if (e.type !== 'companion_enter') continue
        const w = tl.beats.find((x) => x.beat === e.beat)!
        expect(e.t).toBeGreaterThanOrEqual(w.transform + 0.3 - 1e-6)
        expect(e.t).toBeLessThan(w.hold[0])
      }
      for (const w of tl.beats) expect(w.hold[1] - w.hold[0]).toBeGreaterThanOrEqual(2.2 - 1e-6)
    }
  })
})
