// Пять образцовых пар «запись → сценарий» из 09-demo-days. Разные по настроению.
// Общие поля дня (название, настроение, противоречие, палитра, песня, «почему») — как в демо-днях src/timeline/samples.
// Биты переписаны под план 13: 4–6 битов, у каждого ОДИН рисуемый главный предмет (hero_prop) из библиотеки,
// и result — именно этот предмет; место, человек из фразы, вид, вес, время суток и погода по ходу дня.
// story (план 15 § 1.1) — строки рассказа: подряд они пересказывают день от первого лица, только то, что есть в записи.
// emotion — что чувствует человечек; бит-чувство (kind feeling, hero_prop "") — без предмета, человечек играет эмоцию.
import type { Beat, DayScript } from '../types/script'
import day1 from '../timeline/samples/day1.json'
import day2 from '../timeline/samples/day2.json'
import day3 from '../timeline/samples/day3.json'

export interface Exemplar {
  text: string
  song: string
  script: DayScript
}

const kit = (id: string) => ({ kind: 'kit' as const, id })
const eff = (id: 'leaves' | 'snow' | 'rain' | 'steam' | 'frost' | 'sparkles') => ({ kind: 'effect' as const, id })

const base = (d: unknown) => {
  const s = d as DayScript
  return { title: s.title, mood: s.mood, contradiction: s.contradiction, time_of_day: s.time_of_day, weather: s.weather, place: s.place, palette_hint: s.palette_hint, song: s.song, why: s.why }
}

const day1Beats: Beat[] = [
  { quote: 'Гуляли по парку', story: 'Сначала мы гуляли по парку, где всё было в жёлтых листьях', hero_prop: 'лист', kind: 'place', place: 'парк', companion: null, result: kit('leaf'), action: 'pull', camera: 'wide', effect: null, weight: 2, act: 'look', emotion: 'calm' },
  { quote: 'Было холодно', story: 'Потом в парке стало холодно', hero_prop: 'термометр', kind: 'weather', place: null, companion: null, result: kit('thermometer'), action: 'shiver', camera: 'push_in', effect: null, weight: 2, emotion: null },
  { quote: 'мы пили какао', story: 'Но мы пили какао и долго разговаривали', hero_prop: 'какао', kind: 'person', place: 'парк', companion: { name: 'друг', role: 'друг' }, result: kit('cocoa'), action: 'carry', camera: 'orbit_quarter', effect: null, weight: 3, emotion: 'love' },
  { quote: 'Фонари зажглись', story: 'А фонари зажглись раньше, чем мы заметили', hero_prop: 'уличный фонарь', kind: 'thing', place: 'парк', companion: null, result: kit('lamp_post'), action: 'pull', camera: 'push_in', effect: 'day_to_night', weight: 2, emotion: 'surprised' },
  { quote: 'стемнело', story: 'Мы и не заметили, как уже стемнело', hero_prop: 'луна', kind: 'weather', place: null, companion: null, result: kit('moon'), action: 'sit', camera: 'hold', effect: null, weight: 1, emotion: 'calm' },
]

const day2Beats: Beat[] = [
  { quote: 'До дедлайна шесть часов', story: 'До дедлайна было всего шесть часов', hero_prop: 'будильник', kind: 'thing', place: 'рабочий стол', companion: null, result: kit('clock'), action: 'shake', camera: 'wide', effect: null, weight: 2, emotion: 'nervous' },
  { quote: 'Ноутбук горячий', story: 'Ноутбук был горячий, в комнате горела только лампа', hero_prop: 'ноутбук', kind: 'thing', place: 'рабочий стол', companion: null, result: kit('laptop'), action: 'carry', camera: 'push_in', effect: null, weight: 2, act: 'write', emotion: 'nervous' },
  { quote: 'кофе холодный', story: 'А кофе был уже совсем холодный', hero_prop: 'кофе', kind: 'thing', place: null, companion: null, result: kit('coffee'), action: 'pull', camera: 'hard_cut', effect: null, weight: 1, emotion: 'tired' },
  { quote: 'всё наконец заработало', story: 'И тут, в четыре утра, всё наконец заработало', hero_prop: '', kind: 'feeling', place: null, companion: null, result: kit('star'), action: 'shake', camera: 'orbit_quarter', effect: 'lamp_flicker', weight: 2, emotion: 'proud' },
  { quote: 'засмеялся вслух', story: 'Я засмеялся вслух в пустой квартире', hero_prop: '', kind: 'feeling', place: null, companion: null, result: kit('note'), action: 'cheer', camera: 'hold', effect: null, weight: 3, emotion: 'laugh' },
]

const day3Beats: Beat[] = [
  { quote: 'за окном всё белое', story: 'Утром я проснулся, а за окном всё было белое', hero_prop: 'сугроб', kind: 'weather', place: 'окно с подоконником', companion: null, result: kit('snowdrift'), action: 'pull', camera: 'wide', effect: null, weight: 2, emotion: 'surprised' },
  { quote: 'Заварил чай', story: 'Я никуда не пошёл и заварил чай', hero_prop: 'чай', kind: 'thing', place: 'кухонный стол', companion: null, result: kit('tea'), action: 'carry', camera: 'push_in', effect: null, weight: 2, emotion: 'calm' },
  { quote: 'падает снег', story: 'Потом сел у окна и смотрел, как падает снег', hero_prop: 'снежинка', kind: 'weather', place: 'окно с подоконником', companion: null, result: kit('snowflake'), action: 'sit', camera: 'orbit_quarter', effect: null, weight: 3, emotion: 'calm' },
  { quote: 'Очень тихо', story: 'И всё было очень тихо', hero_prop: '', kind: 'feeling', place: null, companion: null, result: kit('candle'), action: 'sit', camera: 'hold', effect: 'lamp_flicker', weight: 2, emotion: 'calm' },
]

const day4: DayScript = {
  title: 'День рождения у бабушки',
  mood: { warmth: 0.8, tension: 0.1, energy: 0.6, openness: 0.4 },
  contradiction: { a: 'все говорят одновременно', b: 'Я сидел в углу', staging: 'crowd_edges_alone_center' },
  time_of_day: 'evening',
  weather: 'clear',
  place: 'home',
  palette_hint: ['coral', 'amber', 'teal', 'cream'],
  song: { tempo: 'medium', energy: 0.6, estimated: true },
  beats: [
    { quote: 'Вся семья за одним столом', story: 'Вся семья была за одним столом, и все говорили одновременно', hero_prop: 'чайник', kind: 'person', place: 'кухонный стол', companion: { name: 'семья', role: 'семья' }, result: kit('teapot'), action: 'pull', camera: 'wide', effect: null, weight: 2, act: 'eat', emotion: 'joy' },
    { quote: 'Бабушка принесла торт', story: 'Потом бабушка принесла торт', hero_prop: 'торт', kind: 'person', place: 'кухонный стол', companion: { name: 'бабушка', role: 'бабушка' }, result: kit('cake'), action: 'carry', camera: 'orbit_quarter', effect: 'palette_shift', weight: 3, emotion: 'love' },
    { quote: 'свечами', story: 'А на торте были свечи', hero_prop: 'свеча', kind: 'thing', place: null, companion: null, result: kit('candle'), action: 'pull', camera: 'push_in', effect: 'lamp_flicker', weight: 1, emotion: 'joy' },
    { quote: 'Я сидел в углу', story: 'А я сидел в углу', hero_prop: '', kind: 'feeling', place: null, companion: null, result: kit('sofa'), action: 'sit', camera: 'hold', effect: null, weight: 2, emotion: 'lonely' },
    { quote: 'скучал по нему', story: 'И вдруг понял, что давно скучал по этому шуму', hero_prop: '', kind: 'feeling', place: null, companion: null, result: kit('heart'), action: 'shake', camera: 'push_in', effect: null, weight: 2, emotion: 'love' },
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
  contradiction: { a: 'Промок', b: 'домой идти не хотелось', staging: 'slow_walk_bright_light' },
  time_of_day: 'evening',
  weather: 'rain',
  place: 'street',
  palette_hint: ['slate_blue', 'grey_blue', 'navy', 'amber'],
  song: { tempo: 'slow', energy: 0.35, estimated: true },
  beats: [
    { quote: 'Автобус не пришёл', story: 'Автобус так и не пришёл, и я пошёл пешком', hero_prop: 'автобус', kind: 'place', place: 'остановка', companion: null, result: kit('bus'), action: 'shake', camera: 'wide', effect: null, weight: 2, act: 'look', emotion: null },
    { quote: 'Дождь', story: 'По дороге шёл дождь', hero_prop: 'зонт', kind: 'weather', place: null, companion: null, result: kit('umbrella'), action: 'shiver', camera: 'push_in', effect: 'palette_shift', weight: 2, emotion: null },
    { quote: 'в наушниках старая песня', story: 'А в наушниках была старая песня', hero_prop: 'наушники', kind: 'thing', place: null, companion: null, result: kit('headphones'), action: 'pull', camera: 'orbit_quarter', effect: null, weight: 2, emotion: 'calm' },
    { quote: 'фонари отражаются в лужах', story: 'Фонари отражались в лужах', hero_prop: 'лужа', kind: 'place', place: 'уличный фонарь', companion: null, result: kit('puddle'), action: 'pull', camera: 'push_in', effect: 'day_to_night', weight: 1, emotion: 'calm' },
    { quote: 'Промок', story: 'Я промок, но домой идти не хотелось', hero_prop: 'капля', kind: 'thing', place: null, companion: null, result: kit('drop'), action: 'shiver', camera: 'hold', effect: null, weight: 3, emotion: 'calm' },
  ],
  why: [
    'Текст: промок, но не хотелось домой → грусть и покой вместе, медленный шаг при ярком свете',
    'Фото: мокрый асфальт и огни → сине-серая палитра и один тёплый огонёк',
    'Песня: старая медленная песня → спокойный шаг и плавная камера',
  ],
}

/** День по порядку: время суток и погода бита идут по тексту (утро → вечер, дождь → солнце). */
const withDay = (beats: Beat[], times: DayScript['time_of_day'][], weathers: DayScript['weather'][]) =>
  beats.map((b, i) => ({ ...b, time_of_day: times[Math.min(i, times.length - 1)], weather: weathers[Math.min(i, weathers.length - 1)] }))

export const exemplars: Exemplar[] = [
  {
    text: 'Гуляли по парку, всё в жёлтых листьях. Было холодно, но мы пили какао и долго разговаривали. Фонари зажглись раньше, чем мы заметили, что стемнело.',
    song: 'не указана',
    script: { ...base(day1), beats: withDay(day1Beats, ['evening', 'evening', 'evening', 'night', 'night'], ['clear']) },
  },
  {
    text: 'До дедлайна шесть часов. Ноутбук горячий, кофе холодный, в комнате горит только лампа. В четыре утра всё наконец заработало, и я засмеялся вслух в пустой квартире.',
    song: 'не указана',
    script: { ...base(day2), beats: withDay(day2Beats, ['night', 'night', 'night', 'night', 'night'], ['clear']) },
  },
  {
    text: 'Проснулся, а за окном всё белое. Никуда не пошёл. Заварил чай, сел у окна и просто смотрел, как падает снег. Очень тихо.',
    song: 'не указана',
    script: { ...base(day3), beats: withDay(day3Beats, ['morning', 'morning', 'day', 'day'], ['snow']) },
  },
  {
    text: 'Вся семья за одним столом, все говорят одновременно. Бабушка принесла торт со свечами. Я сидел в углу и вдруг понял, что давно не слышал этот шум и скучал по нему.',
    song: 'не указана',
    script: { ...day4, beats: withDay(day4.beats, ['evening'], ['clear']) },
  },
  {
    text: 'Автобус не пришёл, пошёл пешком. Дождь, в наушниках старая песня, фонари отражаются в лужах. Промок, но домой идти не хотелось.',
    song: 'не указана',
    script: { ...day5, beats: withDay(day5.beats, ['evening', 'evening', 'evening', 'night', 'night'], ['rain']) },
  },
]
