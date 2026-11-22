import { describe, expect, it } from 'vitest'
import type { Beat, DayScript } from '../types/script'
import type { TimelineEvent } from '../types/timeline'
import { choreograph, TRAVEL_MAX, TRAVEL_MIN } from './choreograph'
import { exemplars } from '../director/exemplars'
import { validateScript } from '../director/validate'
import { fallbackDirect } from '../director/fallback'
import { authorGender, cleanStory, dropRepeats, fallbackStories, fillStories, genderize, inventedWords, sentenceOf } from '../director/story'
import { emotionOnly } from '../director/beatFields'
import { emotionFromText } from '../director/emotions'
import { sceneRequests } from '../kit/sceneClient'

type Travel = Extract<TimelineEvent, { type: 'travel' }>
const travels = (events: TimelineEvent[]) => events.filter((e): e is Travel => e.type === 'travel')

describe('переходы между битами (travel)', () => {
  it('между каждой парой соседних битов — дорога 1.5–2 с: hold[1] ≤ t, t + dur ≤ start следующего', () => {
    for (const e of exemplars)
      for (const photoCount of [0, 2]) {
        const tl = choreograph(e.script, { seed: 3, photoCount, beatTimes: Array.from({ length: 200 }, (_, i) => i * 0.47) })
        const tr = travels(tl.events)
        expect(tr).toHaveLength(tl.beats.length - 1)
        tr.forEach((t, k) => {
          const a = tl.beats[k]
          const b = tl.beats[k + 1]
          expect(t).toMatchObject({ from: a.beat, to: b.beat, beat: a.beat })
          expect(t.dur).toBeGreaterThanOrEqual(TRAVEL_MIN - 1e-9)
          expect(t.dur).toBeLessThanOrEqual(TRAVEL_MAX + 1e-9)
          expect(a.hold[1]).toBeLessThanOrEqual(t.t + 1e-6)
          expect(t.t + t.dur).toBeLessThanOrEqual(b.start + 1e-6)
        })
      }
  })

  it('быстрый день — бегом, спокойный — шагом', () => {
    const calm = exemplars[2].script
    const fast: DayScript = { ...calm, mood: { ...calm.mood, energy: 0.8 } }
    expect(new Set(travels(choreograph(calm, { seed: 1 }).events).map((t) => t.mode))).toEqual(new Set(['walk']))
    expect(new Set(travels(choreograph(fast, { seed: 1 }).events).map((t) => t.mode))).toEqual(new Set(['run']))
  })

  it('8 битов — фильм ≤ 75 с, и все 8 в нём', () => {
    const base = exemplars[0].script
    const text = 'Утром проспал и бежал в универ под дождём. На паре было скучно, я рисовал в тетради. В обед мы с Аминой ели самсу в столовой. Потом пошли в библиотеку и читали. Вечером поехали к бабушке, она напекла баурсаков. Пили чай с вареньем. Потом смотрели старые фотографии. Ночью падал снег, и я заснул счастливым.'
    const q = ['бежал в универ', 'рисовал в тетради', 'ели самсу', 'читали', 'напекла баурсаков', 'Пили чай', 'смотрели старые фотографии', 'падал снег']
    const props = ['рюкзак', 'книга', 'самса', 'книга', 'баурсаки', 'чай', 'фото', 'снежинка']
    const beats: Beat[] = q.map((quote, i) => ({ quote, action: 'pull', result: { kind: 'kit', id: 'crystal' }, camera: 'hold', effect: null, hero_prop: props[i] }))
    const r = validateScript({ ...base, beats }, text)
    expect(r.script.beats).toHaveLength(8)
    for (const seed of [1, 2, 3]) {
      const tl = choreograph(r.script, { seed, text })
      expect(tl.beats).toHaveLength(8)
      expect(tl.duration).toBeLessThanOrEqual(75)
    }
  })
})

describe('строки рассказа (story)', () => {
  const text = 'Утром проспал и бежал в универ. На паре было скучно. Вечером поехали к бабушке, она напекла баурсаков.'

  it('предложение бита; запасные строки — полное предложение со связкой по порядку', () => {
    expect(sentenceOf(text, 'напекла баурсаков')).toBe('Вечером поехали к бабушке, она напекла баурсаков')
    const fb = fallbackStories(
      [
        { quote: 'бежал в универ', time_of_day: 'morning' },
        { quote: 'На паре было скучно', time_of_day: 'morning' },
        { quote: 'поехали к бабушке', time_of_day: 'evening' },
        { quote: 'напекла баурсаков', time_of_day: 'evening' },
      ],
      text,
    )
    expect(fb[0]).toBe('Утром проспал и бежал в универ')
    expect(fb[1]).toBe('Потом на паре было скучно')
    // в предложении есть и следующий бит — только своя часть (одна мысль — один раз)
    expect(fb[2]).toBe('Вечером поехали к бабушке')
    // то же предложение второй раз — его часть с цитатой, со связкой
    expect(fb[3]).toMatch(/^А в конце .*напекла баурсаков$/)
    for (const s of fb) expect(s).not.toMatch(/^баурсаков|^Устал/)
  })

  it('строка режиссёра: обрывок, длинная или с чужим именем — заменяется предложением', () => {
    expect(cleanStory('Утром я проспал и бежал в универ', text)).toBe('Утром я проспал и бежал в универ')
    expect(cleanStory('Устал', text)).toBeNull()
    expect(cleanStory('Вечером мы с Аминой поехали к бабушке', text)).toBeNull()
    expect(cleanStory('Вечером мы с Аминой поехали к бабушке', text + ' Были с Аминой.')).toBeTruthy()
    expect(cleanStory('слово '.repeat(20), text)).toBeNull()
    const beats: Beat[] = [
      { quote: 'бежал в универ', action: 'walk', result: { kind: 'kit', id: 'backpack' }, camera: 'wide', effect: null, story: 'Утром я проспал и со всех ног бежал в универ' },
      { quote: 'напекла баурсаков', action: 'pull', result: { kind: 'kit', id: 'baursak' }, camera: 'hold', effect: null, story: 'баурсаков' },
    ]
    const r = fillStories(beats, text)
    expect(r.beats[0].story).toBe('Утром я проспал и со всех ног бежал в универ')
    expect(r.beats[1].story).toMatch(/напекла баурсаков/)
    expect(r.beats[1].story!.split(' ').length).toBeGreaterThan(3)
    expect(r.issues).toHaveLength(1)
  })

  it('validateScript и запасной режиссёр: у каждого бита есть story; в окне таймлайна — она же', () => {
    const e = exemplars[0]
    const r = validateScript(e.script, e.text)
    expect(r.script.beats.map((b) => b.story)).toEqual(e.script.beats.map((b) => b.story))
    const tl = choreograph(r.script, { seed: 1, text: e.text })
    expect(tl.beats.map((w) => w.story)).toEqual(tl.beats.map((w) => r.script.beats[w.beat].story))
    const fb = fallbackDirect({ text, photos: [], song: null })
    for (const b of fb.beats) expect(b.story && b.story.length > 5).toBe(true)
  })

  it('старый день без story: из предложения (если дан текст), без текста — цитата со связкой; снимок — подпись', () => {
    const e = exemplars[3]
    const old = { ...e.script, beats: e.script.beats.map(({ story: _s, ...b }) => b) }
    const withText = choreograph(old, { seed: 1, text: e.text })
    expect(withText.beats[0].story).toMatch(/вся семья за одним столом/i)
    for (const w of withText.beats) expect(w.story.length).toBeGreaterThan(w.quote.length)
    const noText = choreograph(old, { seed: 1 })
    for (const w of noText.beats) expect(w.story).toContain(w.quote.toLowerCase().slice(1))
    const card = { caption: 'кот на подоконнике', place: { ru: 'окно', ref: 'window_sill' }, things: [{ ru: 'кошка', ref: 'cat', where: 'ground' as const }], people: [], time_of_day: 'day' as const, weather: 'clear' as const, palette: [], mood: 'тихо', match: '' }
    const tl = choreograph({ ...e.script, photo_cards: [card] }, { seed: 1, photoCount: 1, text: e.text })
    const own = tl.beats.find((w) => w.kind === 'photo')
    if (own) expect(own.story).toBe('А на снимке — кот на подоконнике')
  })
})

describe('род героя и «не досочинять»', () => {
  it('genderize: «я» и предложение без подлежащего — по герою; «она напекла», «бабушка принесла», имена — не трогаем', () => {
    expect(genderize('После пар я встретилась с Айгерим', 'boy')).toBe('После пар я встретился с Айгерим')
    expect(genderize('Утром я проспал и бежал в универ', 'girl')).toBe('Утром я проспала и бежала в универ')
    expect(genderize('Проснулся, а за окном всё было белое', 'girl')).toBe('Проснулась, а за окном всё было белое')
    expect(genderize('Вечером мы поехали к бабушке, и она напекла баурсаков', 'boy')).toBe('Вечером мы поехали к бабушке, и она напекла баурсаков')
    expect(genderize('Потом бабушка принесла торт', 'boy')).toBe('Потом бабушка принесла торт')
    expect(genderize('Я промок, но домой идти не хотелось', 'girl')).toBe('Я промокла, но домой идти не хотелось')
    expect(genderize('Я никуда не пошёл и заварил чай', 'girl')).toBe('Я никуда не пошла и заварила чай')
    expect(genderize('Я сидела в углу и вдруг поняла, что скучала', 'boy')).toBe('Я сидел в углу и вдруг понял, что скучал')
    expect(genderize('Я был рад, что Амина пришла', 'girl')).toBe('Я была рада, что Амина пришла')
    expect(genderize('Я поставил на стол чашку', 'girl')).toBe('Я поставила на стол чашку')
    expect(genderize('Утром я проспал', undefined)).toBe('Утром я проспал')
  })

  it('досочинённое: действие или чувство, которого нет в записи, — строка заменяется предложением', () => {
    const text = 'Вечером поехали к бабушке, она напекла баурсаков. Пили чай.'
    expect(inventedWords('Вечером мы поехали к бабушке и долго разговаривали', text)).toEqual(['долго', 'разговаривали'])
    expect(cleanStory('Вечером мы поехали к бабушке и долго разговаривали', text)).toBeNull()
    expect(cleanStory('Потом мы пили чай, и я был доволен', text)).toBeNull()
    expect(cleanStory('А потом мы пили горячий чай', text)).toBe('А потом мы пили горячий чай')
    expect(cleanStory('Вечером мы поехали к бабушке, и она напекла баурсаков', text)).toBeTruthy()
    // со снимка — тоже факт
    const ref = `${text}\nмы с бабушкой у самовара`
    expect(cleanStory('А потом мы пили чай у самовара', text, { ref })).toBeTruthy()
    expect(cleanStory('А потом мы пили чай у самовара', text)).toBeTruthy()
    expect(cleanStory('А потом мы пили чай у самовара и пели песни', text, { ref })).toBeNull()
  })

  it('режиссёр и запасной — по герою: «встретилась» у мальчика → «встретился»; без сети «устал» → «устала»', () => {
    const text = 'После пар встретился с Айгерим. Устал, но было весело.'
    const beats: Beat[] = [
      { quote: 'встретился с Айгерим', action: 'walk', result: { kind: 'kit', id: 'backpack' }, camera: 'wide', effect: null, story: 'После пар я встретилась с Айгерим' },
      { quote: 'Устал', action: 'sit', result: { kind: 'kit', id: 'bed' }, camera: 'hold', effect: null },
    ]
    const boy = fillStories(beats, text, { hero: 'boy' })
    expect(boy.beats[0].story).toBe('После пар я встретился с Айгерим')
    const girl = fillStories(beats, text, { hero: 'girl' })
    expect(girl.beats[0].story).toBe('После пар я встретилась с Айгерим')
    expect(girl.beats[1].story).toMatch(/устала/)
    const fb = fallbackDirect({ text, photos: [], song: null, hero: 'girl' })
    expect(fb.beats.map((b) => b.story).join(' ')).not.toMatch(/\bвстретился\b|\bУстал\b|\bустал\b/)
  })

  it('образцовые строки сами проходят проверку (не досочинены)', () => {
    for (const e of exemplars) for (const b of e.script.beats) expect(cleanStory(b.story, e.text), b.story).toBe(b.story)
  })
})

describe('длинная запись: рассказ до конца дня', () => {
  const long = Array.from({ length: 16 }, (_, i) => `В ${i + 1}-й час я гулял по парку и видел деревья.`).join(' ') + ' Вечером пошёл снег, и я слепил снеговика.'

  it('запасной режиссёр берёт моменты по всей записи, последний — из конца', () => {
    const fb = fallbackDirect({ text: long, photos: [], song: null })
    const last = Math.max(...fb.beats.map((b) => long.indexOf(b.quote)))
    expect(last).toBeGreaterThan(long.length * 0.75)
  })

  it('режиссёр остановился в середине дня — код добавляет бит из конца записи', () => {
    const base = exemplars[0].script
    const beats: Beat[] = [
      { quote: 'гулял по парку', action: 'walk', result: { kind: 'kit', id: 'tree' }, camera: 'wide', effect: null, hero_prop: 'дерево', story: 'Сначала я гулял по парку' },
      { quote: 'видел деревья', action: 'pull', result: { kind: 'kit', id: 'tree' }, camera: 'hold', effect: null, hero_prop: 'скамейка' },
    ]
    const r = validateScript({ ...base, beats }, long)
    const pos = r.script.beats.map((b) => long.indexOf(b.quote))
    expect(Math.max(...pos)).toBeGreaterThan(long.length * 0.75)
    expect(r.issues.some((x) => x.startsWith('конец дня'))).toBe(true)
  })

  it('род: имя в другой форме («с Аминой») — имя; «бабушка напекла … и поставила» — не про героя', () => {
    expect(genderize('А потом Амина рассказала новость и показала видео', 'boy')).toBe('А потом Амина рассказала новость и показала видео')
    expect(genderize('А потом бабушка напекла баурсаков и поставила самовар', 'boy')).toBe('А потом бабушка напекла баурсаков и поставила самовар')
    expect(genderize('Потом схватил рюкзак, даже не позавтракал, и побежал', 'girl')).toBe('Потом схватила рюкзак, даже не позавтракала, и побежала')
  })
})

describe('эмоции и одна мысль — один раз (сторителлинг)', () => {
  const text = 'Сегодня мне было скучно, потом позвонила подруга и мы пошли гулять.'
  const base = exemplars[0].script
  const mk = (b: Partial<Beat> & { quote: string }): Beat => ({ action: 'pull', result: { kind: 'kit', id: 'crystal' }, camera: 'hold', effect: null, ...b })

  it('бит-чувство: без предмета и сценки — человечек играет эмоцию, рассказ её называет', () => {
    const raw = {
      ...base,
      beats: [
        mk({ quote: 'мне было скучно', kind: 'feeling', emotion: 'bored', hero_prop: 'книга', story: 'Сначала мне было очень скучно' }),
        mk({ quote: 'позвонила подруга', kind: 'person', emotion: 'joy', hero_prop: 'телефон', result: { kind: 'kit', id: 'phone' }, companion: { name: 'подруга', role: 'подруга' }, story: 'И тут позвонила подруга' }),
        mk({ quote: 'мы пошли гулять', kind: 'place', emotion: 'joy', hero_prop: 'дерево', result: { kind: 'kit', id: 'tree' }, place: 'парк', story: 'И мы пошли гулять' }),
      ],
    }
    const r = validateScript(raw, text, { hero: 'boy' })
    const b0 = r.script.beats[0]
    expect(b0).toMatchObject({ kind: 'feeling', emotion: 'bored', hero_prop: '' })
    const tl = choreograph(r.script, { seed: 1, text })
    const w0 = tl.beats[0]
    expect(w0.emotion).toBe('bored')
    const ev0 = tl.events.filter((e) => e.beat === w0.beat)
    expect(ev0.some((e) => e.type === 'word_lift' || e.type === 'word_transform' || e.type === 'stamp')).toBe(false)
    expect(ev0.find((e) => e.type === 'actor_action')).toMatchObject({ emotion: 'bored', action: 'sit' })
    // у бита со сценкой — поза с эмоцией
    const w1 = tl.beats[1]
    expect(w1.emotion).toBe('joy')
    expect(tl.events.find((e) => e.type === 'actor_action' && e.beat === w1.beat && e.t >= w1.hold[0] - 1e-6)).toMatchObject({ emotion: 'joy' })
    // сценку бит-чувство не просит
    expect(sceneRequests(tl, text).map((q) => q.quote)).not.toContain('мне было скучно')
  })

  it('мысль уже сказана рассказом прошлого бита — следующий бит уходит; та же эмоция подряд — тоже', () => {
    const t2 = 'Сегодня мне было скучно. Было очень скучно, скучно весь день. Потом позвонила подруга.'
    const beats = [
      mk({ quote: 'Сегодня мне было скучно', kind: 'feeling', emotion: 'bored', story: 'Сначала мне было очень скучно' }),
      mk({ quote: 'скучно весь день', kind: 'feeling', emotion: 'bored', story: 'Скучно было весь день' }),
      mk({ quote: 'позвонила подруга', kind: 'person', emotion: 'joy', story: 'И тут позвонила подруга' }),
    ]
    const r = dropRepeats(beats, 2, emotionOnly)
    expect(r.beats.map((b) => b.quote)).toEqual(['Сегодня мне было скучно', 'позвонила подруга'])
    const v = validateScript({ ...base, beats }, t2)
    expect(v.script.beats.filter((b) => b.emotion === 'bored')).toHaveLength(1)
  })

  it('запасной режиссёр: «скучно» — бит-чувство bored, без предмета', () => {
    const fb = fallbackDirect({ text, photos: [], song: null, hero: 'girl' })
    const bored = fb.beats.find((b) => b.emotion === 'bored')
    expect(bored).toBeTruthy()
    expect(bored!.kind).toBe('feeling')
    expect(bored!.hero_prop).toBe('')
    expect(emotionFromText('Я так устала')).toBe('tired')
    expect(emotionFromText('давно скучал по нему')).toBe('lonely')
    expect(emotionFromText('засмеялся вслух')).toBe('laugh')
  })
})

describe('запасная строка — только своя часть предложения', () => {
  it('«…позвонила подруга и мы пошли гулять» с двумя битами: каждая строка о своём', () => {
    const text = 'Сегодня мне было скучно, потом позвонила подруга и мы пошли гулять.'
    const fb = fallbackStories([{ quote: 'мне было скучно' }, { quote: 'позвонила подруга' }, { quote: 'мы пошли гулять' }], text)
    expect(fb[1]).toMatch(/позвонила подруга/)
    expect(fb[1]).not.toMatch(/гулять/)
    expect(fb[2]).toMatch(/пошли гулять/)
    expect(fb[0]).not.toMatch(/подруга/)
  })
})

describe('род автора важнее выбора героя; новые события не проходят', () => {
  const text = 'Сегодня мне было скучно, потом позвонила подруга и мы пошли гулять. Вечером мы смеялись в кафе, и я устала, но была счастлива.'
  it('автор пишет о себе в женском роде — строки не переделываются в мужской, даже если герой «мальчик»', () => {
    expect(authorGender(text)).toBe('girl')
    expect(authorGender('Утром я проспал и бежал в универ.')).toBe('boy')
    expect(authorGender('Вечером пошли к бабушке.')).toBeNull()
    expect(cleanStory('А вечером я устала, но была счастлива', text, { hero: 'boy' })).toBe('А вечером я устала, но была счастлива')
    const fb = fallbackStories([{ quote: 'я устала' }], text, 'boy')
    expect(fb[0]).toMatch(/устала/)
  })
  it('«и день изменился» — нового события в записи нет → строка заменяется', () => {
    expect(cleanStory('Потом мне позвонила подруга, и день изменился', text)).toBeNull()
    expect(cleanStory('Потом мне позвонила подруга', text)).toBe('Потом мне позвонила подруга')
  })
})

describe('род: подлежащее после глагола', () => {
  it('«Потом позвонила подруга» у мальчика — не «позвонил»', () => {
    expect(genderize('Потом позвонила подруга, и мы пошли гулять', 'boy')).toBe('Потом позвонила подруга, и мы пошли гулять')
    expect(genderize('Утром пришла мама', 'boy')).toBe('Утром пришла мама')
    expect(genderize('Потом позвонила подруге', 'boy')).toBe('Потом позвонил подруге')
  })
})

describe('живой сайт 22.11: снег, «еле шла», одинаковые строки', () => {
  const text = 'Утром шёл снег, я устала, но вечером мы смеялись с подругой.'
  it('«Утром шёл снег» у героини — не «шла снег»; «пошёл дождь», «пришёл папа» не трогаем; «пошёл в кино» — про автора', () => {
    expect(genderize('Утром шёл снег, я устала', 'girl')).toBe('Утром шёл снег, я устала')
    expect(genderize('Потом пошёл дождь', 'girl')).toBe('Потом пошёл дождь')
    expect(genderize('Вечером пришёл папа', 'girl')).toBe('Вечером пришёл папа')
    expect(genderize('Потом пошёл в кино', 'girl')).toBe('Потом пошла в кино')
    expect(genderize('Пришёл домой поздно', 'girl')).toBe('Пришла домой поздно')
    expect(cleanStory('Утром шёл снег, и я устала', text, { hero: 'girl' })).toBe('Утром шёл снег, и я устала')
  })
  it('«Потом весь день я устала и еле шла» — досочинено → строка заменяется', () => {
    expect(cleanStory('Потом весь день я устала и еле шла', text, { hero: 'girl' })).toBeNull()
    expect(cleanStory('Потом я очень устала', text, { hero: 'girl' })).toBe('Потом я очень устала')
  })
  it('одинаковая строка рассказа у двух битов подряд — второй бит уходит', () => {
    const mk = (quote: string, story: string): Beat => ({ quote, action: 'pull', result: { kind: 'kit', id: 'crystal' }, camera: 'hold', effect: null, story })
    const beats = [mk('шёл снег', 'Утром шёл снег'), mk('я устала', 'Потом я устала'), mk('мы смеялись', 'Но вечером мы смеялись с подругой'), mk('с подругой', 'Но вечером мы смеялись с подругой')]
    expect(dropRepeats(beats, 2).beats.map((b) => b.quote)).toEqual(['шёл снег', 'я устала', 'мы смеялись'])
    const v = validateScript({ ...exemplars[0].script, beats }, text, { hero: 'girl' })
    const lines = v.script.beats.map((b) => b.story)
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines.join(' ')).not.toMatch(/шла снег/)
  })
})

describe('живой сайт 22.11, повтор после замены строк', () => {
  it('два бита в одной части предложения — после запасных строк остаётся один; «и всё стало легче» — оценка, нельзя', () => {
    const text = 'Утром шёл снег, я устала, но вечером мы смеялись с подругой.'
    const mk = (quote: string, story: string): Beat => ({ quote, action: 'pull', result: { kind: 'kit', id: 'crystal' }, camera: 'hold', effect: null, story })
    const beats = [mk('шёл снег', 'Утром на улице шёл снег, и я вышла из дома'), mk('я устала', 'Весь день я работала и очень устала'), mk('вечером мы смеялись', 'А вечером мы смеялись до слёз'), mk('с подругой', 'И это было лучшее, что случилось со мной')]
    const v = validateScript({ ...exemplars[0].script, beats }, text, { hero: 'girl' })
    const lines = v.script.beats.map((b) => b.story!)
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines.filter((l) => /смеялись/.test(l))).toHaveLength(1)
    expect(cleanStory('А вечером мы смеялись, и всё стало легче', text)).toBeNull()
  })
})

describe('род: наречия на -ла', () => {
  it('«Сначала проснулся» у мальчика остаётся «Сначала», у девочки — «Сначала проснулась»', () => {
    expect(genderize('Сначала проснулся, а за окном всё белое', 'boy')).toBe('Сначала проснулся, а за окном всё белое')
    expect(genderize('Сначала проснулся, а за окном всё белое', 'girl')).toBe('Сначала проснулась, а за окном всё белое')
  })
})
