// Пять образцовых пар «запись → сценарий» из 09-demo-days. Разные по настроению.
// Первые три совпадают с демо-днями в src/timeline/samples.
import type { DayScript } from '../types/script'
import { kitResult, toKit } from './results'
import day1 from '../timeline/samples/day1.json'
import day2 from '../timeline/samples/day2.json'
import day3 from '../timeline/samples/day3.json'

export interface Exemplar {
  text: string
  song: string
  script: DayScript
}

const day4: DayScript = {
  title: 'День рождения у бабушки',
  mood: { warmth: 0.8, tension: 0.1, energy: 0.6, openness: 0.4 },
  contradiction: { a: 'все говорят одновременно', b: 'я сидел в углу', staging: 'crowd_edges_alone_center' },
  time_of_day: 'evening',
  weather: 'clear',
  place: 'home',
  palette_hint: ['coral', 'amber', 'teal', 'cream'],
  song: { tempo: 'medium', energy: 0.6, estimated: true },
  beats: [
    { quote: 'Вся семья', action: 'pull', result: { kind: 'person', id: 'second_person' }, camera: 'wide', effect: null },
    { quote: 'за одним столом', action: 'pull', result: { kind: 'popup', id: 'cafe_table' }, camera: 'orbit_quarter', effect: 'palette_shift' },
    { quote: 'торт', action: 'carry', result: { kind: 'item', id: 'cake' }, camera: 'push_in', effect: null },
    { quote: 'свечами', action: 'pull', result: { kind: 'item', id: 'candle' }, camera: 'hard_cut', effect: 'lamp_flicker' },
    { quote: 'в углу', action: 'sit', result: { kind: 'popup', id: 'house' }, camera: 'hold', effect: null },
    { quote: 'этот шум', action: 'shake', result: { kind: 'effect', id: 'sparkles' }, camera: 'wide', effect: null },
  ],
  why: [
    'Текст: шумная семья и тихий угол → толпа по краям, человечек один в центре',
    'Фото: свечи и праздничный стол → коралловая и янтарная палитра',
    'Песня: средний темп → весёлый шаг и широкие облёты',
  ],
}

const day5: DayScript = {
  title: 'Дорога домой под дождём',
  mood: { warmth: 0.2, tension: -0.1, energy: -0.3, openness: 0.2 },
  contradiction: { a: 'промок', b: 'домой идти не хотелось', staging: 'slow_walk_bright_light' },
  time_of_day: 'evening',
  weather: 'rain',
  place: 'street',
  palette_hint: ['slate_blue', 'grey_blue', 'navy', 'amber'],
  song: { tempo: 'slow', energy: 0.35, estimated: true },
  beats: [
    { quote: 'Автобус не пришёл', action: 'shake', result: { kind: 'item', id: 'bus' }, camera: 'wide', effect: null },
    { quote: 'Дождь', action: 'shake', result: { kind: 'effect', id: 'rain' }, camera: 'push_in', effect: 'palette_shift' },
    { quote: 'в наушниках старая песня', action: 'pull', result: { kind: 'item', id: 'headphones' }, camera: 'orbit_quarter', effect: null },
    { quote: 'фонари отражаются в лужах', action: 'pull', result: { kind: 'popup', id: 'lamp_post' }, camera: 'push_in', effect: 'day_to_night' },
    { quote: 'Промок', action: 'shiver', result: { kind: 'item', id: 'drop' }, camera: 'hold', effect: null },
  ],
  why: [
    'Текст: промок, но не хотелось домой → грусть и покой вместе, медленный шаг при ярком свете',
    'Фото: мокрый асфальт и огни → сине-серая палитра и один тёплый огонёк',
    'Песня: старая медленная песня → спокойный шаг и плавная камера',
  ],
}

const raw: Exemplar[] = [
  {
    text: 'Гуляли по парку, всё в жёлтых листьях. Было холодно, но мы пили какао и долго разговаривали. Фонари зажглись раньше, чем мы заметили, что стемнело.',
    song: 'не указана',
    script: day1 as unknown as DayScript,
  },
  {
    text: 'До дедлайна шесть часов. Ноутбук горячий, кофе холодный, в комнате горит только лампа. В четыре утра всё наконец заработало, и я засмеялся вслух в пустой квартире.',
    song: 'не указана',
    script: day2 as unknown as DayScript,
  },
  {
    text: 'Проснулся, а за окном всё белое. Никуда не пошёл. Заварил чай, сел у окна и просто смотрел, как падает снег. Очень тихо.',
    song: 'не указана',
    script: day3 as unknown as DayScript,
  },
  {
    text: 'Вся семья за одним столом, все говорят одновременно. Бабушка принесла торт со свечами. Я сидел в углу и вдруг понял, что давно не слышал этот шум и скучал по нему.',
    song: 'не указана',
    script: day4,
  },
  {
    text: 'Автобус не пришёл, пошёл пешком. Дождь, в наушниках старая песня, фонари отражаются в лужах. Промок, но домой идти не хотелось.',
    song: 'не указана',
    script: day5,
  },
]

/**
 * Образцы в мире кита: прежние item/popup → kit (те же id), кристалл → kit crystal.
 * Так режиссёр видит, как выглядит хороший ответ с новыми kinds.
 */
export const exemplars: Exemplar[] = raw.map((e) => ({
  ...e,
  script: { ...e.script, beats: e.script.beats.map((b) => ({ ...b, result: b.result.kind === 'crystal' ? kitResult('crystal') : toKit(b.result) })) },
}))
