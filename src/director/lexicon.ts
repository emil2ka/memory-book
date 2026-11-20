// Словарь для запасного режиссёра и таблица синонимов для страховки.
// Ключи — начала слов (русский и казахский), сравнение по нижнему регистру, «ё» = «е».
import type { ActionId, BeatResult, CameraId, PlaceId, SceneEffectId, StagingId, TimeOfDay, Weather } from '../types/script'

export interface LexEntry {
  /** Начала слов. Короткие (≤ 3 букв) сравниваются целым словом. */
  stems: string[]
  result: BeatResult
  action?: ActionId
  effect?: SceneEffectId
  place?: PlaceId
  weather?: Weather
  time?: TimeOfDay
  /** Слово для названия в именительном падеже. */
  noun?: string
}

const popup = (id: string) => ({ kind: 'popup', id }) as BeatResult
const item = (id: string) => ({ kind: 'item', id }) as BeatResult
const effect = (id: string) => ({ kind: 'effect', id }) as BeatResult
const person = { kind: 'person', id: 'second_person' } as BeatResult

export const LEXICON: LexEntry[] = [
  { stems: ['парк', 'сквер', 'саябақ', 'лес', 'лесу', 'дерев', 'орман', 'ағаш'], result: popup('tree'), place: 'park', noun: 'парк' },
  { stems: ['скамей', 'скамейк', 'лавочк', 'лавк', 'орындық'], result: popup('bench'), noun: 'скамейка' },
  { stems: ['фонар', 'шам'], result: popup('lamp_post'), effect: 'day_to_night', place: 'street', noun: 'фонари' },
  { stems: ['дом', 'домой', 'дома', 'квартир', 'окн', 'окош', 'үй', 'үйге', 'үйде', 'терезе'], result: popup('house'), place: 'home', noun: 'дом' },
  { stems: ['офис', 'работ', 'стол', 'жұмыс', 'проект', 'дедлайн', 'отчёт', 'отчет', 'экзамен', 'урок', 'школ', 'универ', 'сабақ', 'мектеп'], result: popup('work_desk'), place: 'office', noun: 'работа' },
  { stems: ['кафе', 'кофейн', 'ресторан', 'столик', 'кафеде'], result: popup('cafe_table'), place: 'cafe', noun: 'кафе' },
  { stems: ['какао'], result: item('cocoa'), noun: 'какао' },
  { stems: ['кофе', 'капучино', 'латте', 'эспрессо'], result: item('coffee'), noun: 'кофе' },
  { stems: ['чай', 'чая', 'чаю', 'чаем', 'шай', 'шәй'], result: item('tea'), noun: 'чай' },
  { stems: ['лист', 'листв', 'жапырақ', 'осен', 'күз'], result: effect('leaves'), effect: 'palette_shift', noun: 'листья' },
  { stems: ['снег', 'снеж', 'сугроб', 'қар'], result: effect('snow'), weather: 'snow', noun: 'снег' },
  { stems: ['снежинк'], result: item('snowflake'), weather: 'snow', noun: 'снежинки' },
  { stems: ['дожд', 'ливен', 'ливн', 'лужах', 'лужи', 'луж', 'жаңбыр'], result: effect('rain'), weather: 'rain', noun: 'дождь' },
  { stems: ['промок', 'мокр', 'капл', 'слез', 'слёз'], result: item('drop'), noun: 'капли' },
  { stems: ['холод', 'мороз', 'замерз', 'мёрз', 'мерз', 'зяб', 'суық', 'аяз', 'иней'], result: effect('frost'), action: 'shiver', noun: 'холод' },
  { stems: ['пар', 'горяч', 'тёпл', 'тепл', 'жылы', 'ыстық'], result: effect('steam'), noun: 'тепло' },
  { stems: ['смея', 'смех', 'засмеял', 'рад', 'радост', 'счаст', 'ура', 'заработал', 'получил', 'победи', 'қуан', 'бақыт', 'күл'], result: effect('sparkles'), action: 'cheer', noun: 'радость' },
  { stems: ['солн', 'солнц', 'күн', 'күнн'], result: item('sun'), weather: 'clear', noun: 'солнце' },
  { stems: ['лун', 'луна', 'ай'], result: item('moon'), time: 'night', noun: 'луна' },
  { stems: ['звезд', 'звёзд', 'жұлдыз'], result: item('star'), time: 'night', noun: 'звёзды' },
  { stems: ['ламп', 'свет', 'жарық'], result: item('street_lamp'), effect: 'lamp_flicker', noun: 'свет' },
  { stems: ['ноутбук', 'компьют', 'код', 'кода', 'программ', 'комп'], result: item('laptop'), place: 'office', noun: 'ноутбук' },
  { stems: ['телефон', 'смартфон', 'звонил', 'позвонил', 'сообщен', 'телефонм'], result: item('phone'), noun: 'телефон' },
  { stems: ['книг', 'кітап', 'читал', 'роман'], result: item('book'), noun: 'книга' },
  { stems: ['торт', 'пирог', 'пирож', 'десерт'], result: item('cake'), noun: 'торт' },
  { stems: ['сердц', 'сердеч', 'люб', 'обним', 'жүрек', 'махаббат'], result: item('heart'), noun: 'сердце' },
  { stems: ['музык', 'песн', 'песен', 'пел', 'пела', 'мелоди', 'ән', 'әні', 'әнді'], result: item('note'), noun: 'песня' },
  { stems: ['зонт', 'зонтик', 'қолшатыр'], result: item('umbrella'), weather: 'rain', noun: 'зонт' },
  { stems: ['пицц'], result: item('pizza'), noun: 'пицца' },
  { stems: ['велосипед', 'велик', 'самокат'], result: item('bicycle'), place: 'street', noun: 'велосипед' },
  { stems: ['автобус', 'метро', 'трамва', 'троллейбус', 'остановк', 'аялдама'], result: item('bus'), place: 'street', noun: 'автобус' },
  { stems: ['машин', 'такси', 'көлік', 'дорог', 'жол'], result: item('car'), place: 'street', noun: 'дорога' },
  { stems: ['мяч', 'футбол', 'волейбол', 'баскетбол', 'доп'], result: item('ball'), place: 'nature', noun: 'мяч' },
  { stems: ['гитар', 'домбыр'], result: item('guitar'), noun: 'гитара' },
  { stems: ['наушник', 'плеер', 'құлаққап'], result: item('headphones'), noun: 'наушники' },
  { stems: ['подар', 'сыйлық', 'день рожд', 'туған күн'], result: item('gift'), noun: 'подарок' },
  { stems: ['свеч', 'шырақ'], result: item('candle'), effect: 'lamp_flicker', noun: 'свечи' },
  { stems: ['цвет', 'розы', 'тюльпан', 'букет', 'гүл'], result: item('flower'), noun: 'цветы' },
  { stems: ['собак', 'пёс', 'пес', 'щен', 'ит', 'күшік'], result: item('dog'), noun: 'собака' },
  { stems: ['кот', 'кошк', 'котён', 'котен', 'мысық'], result: item('cat'), noun: 'кот' },
  { stems: ['рюкзак', 'сумк', 'портфел', 'сөмке'], result: item('backpack'), noun: 'рюкзак' },
  { stems: ['час', 'часы', 'часов', 'часа', 'будильник', 'утра', 'минут', 'сағат', 'опозда'], result: item('clock'), noun: 'часы' },
  { stems: ['мы', 'нас', 'друг', 'друз', 'подруг', 'мама', 'мамой', 'папа', 'папой', 'брат', 'сестр', 'бабушк', 'дедушк', 'семья', 'семь', 'дос', 'достар', 'досым', 'анам', 'әке', 'әже', 'ата', 'апа', 'бәріміз', 'біз'], result: person, noun: 'мы' },
  { stems: ['горы', 'горах', 'озер', 'озёр', 'реки', 'реке', 'море', 'поле', 'природ', 'тау', 'көл', 'дала', 'теңіз'], result: popup('tree'), place: 'nature', noun: 'природа' },
  { stems: ['улиц', 'город', 'көше', 'қала'], result: popup('lamp_post'), place: 'street', noun: 'улица' },
]

/** Слова настроения: [начала слов, warmth, tension, energy, openness]. */
export const MOOD_WORDS: [string[], number, number, number, number][] = [
  [['уют', 'тепл', 'тёпл', 'жылы', 'хорош', 'приятн', 'мил'], 0.5, -0.3, 0, 0.2],
  [['рад', 'счаст', 'весел', 'смея', 'смех', 'засмеял', 'ура', 'қуан', 'бақыт', 'күл', 'люб'], 0.5, -0.1, 0.4, 0.4],
  [['доволен', 'довольн', 'получил', 'заработал', 'наконец', 'гордо'], 0.3, 0, 0.3, 0.2],
  [['какао', 'чай', 'шай', 'разговар', 'вместе', 'бірге', 'обнял', 'семья', 'бабушк', 'анам'], 0.6, -0.2, 0, 0.3],
  [['спокой', 'тихо', 'тиш', 'медлен', 'тыныш', 'неспеш'], 0.1, -0.5, -0.4, 0],
  [['холод', 'мороз', 'суық', 'аяз', 'промок', 'мокр'], -0.4, 0.1, -0.1, -0.1],
  [['устал', 'шаршадым', 'вымот', 'сонн', 'не выспал'], -0.2, 0.3, -0.5, -0.2],
  [['груст', 'печал', 'тоск', 'скуча', 'мұң', 'жаль', 'плак'], -0.4, 0.1, -0.4, -0.3],
  [['одинок', 'один', 'одна', 'пуст', 'жалғыз'], -0.4, 0.2, -0.3, -0.5],
  [['тревог', 'страш', 'нерв', 'дедлайн', 'опозда', 'паник', 'бесит', 'злюсь', 'зло', 'уайым', 'қорқ', 'стресс'], -0.3, 0.7, 0.4, -0.3],
  [['шум', 'громк', 'все говор', 'толп', 'праздн', 'танц', 'бегал', 'быстр', 'шулы', 'шумн'], 0.2, 0.2, 0.6, 0.4],
]

/** Пары противоположных сигналов → постановка противоречия. */
export const CONTRADICTION_RULES: { a: string[]; b: string[]; staging: StagingId; labelA: string; labelB: string }[] = [
  { a: ['холод', 'мороз', 'суық', 'аяз', 'зяб', 'мёрз', 'мерз'], b: ['уют', 'тепл', 'тёпл', 'какао', 'чай', 'жылы', 'шай'], staging: 'frost_edges_warm_center', labelA: 'холодно', labelB: 'уютно' },
  { a: ['шум', 'толп', 'все говор', 'праздн', 'семья', 'шулы'], b: ['одинок', 'в углу', 'один', 'скуча', 'жалғыз'], staging: 'crowd_edges_alone_center', labelA: 'шумно', labelB: 'одиноко' },
  { a: ['устал', 'дедлайн', 'вымот', 'не выспал', 'шаршадым', 'промок'], b: ['доволен', 'довольн', 'рад', 'смея', 'засмеял', 'заработал', 'наконец', 'не хотелось', 'қуан'], staging: 'slow_walk_bright_light', labelA: 'устал', labelB: 'доволен' },
  { a: ['груст', 'печал', 'мұң', 'тоск'], b: ['спокой', 'светл', 'тихо', 'тыныш', 'не хотелось'], staging: 'slow_walk_bright_light', labelA: 'грустно', labelB: 'спокойно' },
]

export const TIME_WORDS: [string[], TimeOfDay][] = [
  [['утр', 'проснул', 'завтрак', 'таң', 'рассвет'], 'morning'],
  [['вечер', 'стемн', 'закат', 'кеш', 'сумер'], 'evening'],
  [['ноч', 'полноч', 'түн', 'не спал'], 'night'],
  [['днём', 'днем', 'обед', 'полдень', 'түс'], 'day'],
]

// ---- Таблица синонимов для страховки (неизвестный id → id каталога) ----

export const ACTION_SYNONYMS: Record<string, ActionId> = {
  go: 'walk', run: 'walk', step: 'walk', move: 'walk', approach: 'walk',
  grab: 'pull', take: 'pull', lift: 'pull', pick: 'pull', extract: 'pull', tug: 'pull', draw: 'pull',
  scatter: 'shake', crumble: 'shake', throw: 'shake', toss: 'shake', spin: 'shake',
  hold: 'carry', bring: 'carry', hug: 'carry',
  sip: 'drink', eat: 'drink',
  rest: 'sit', sleep: 'sit', wait: 'sit', look: 'sit', watch: 'sit', think: 'sit',
  shake_cold: 'shiver', freeze: 'shiver', cold: 'shiver', tremble: 'shiver',
  jump: 'cheer', dance: 'cheer', laugh: 'cheer', celebrate: 'cheer', wave: 'cheer', clap: 'cheer',
}

export const CAMERA_SYNONYMS: Record<string, CameraId> = {
  close_up: 'push_in', closeup: 'push_in', zoom_in: 'push_in', zoom: 'push_in', dolly_in: 'push_in',
  zoom_out: 'pull_out', dolly_out: 'pull_out',
  orbit: 'orbit_quarter', pan: 'orbit_quarter', rotate: 'orbit_quarter',
  cut: 'hard_cut', jump_cut: 'hard_cut',
  static: 'hold', still: 'hold', locked: 'hold',
  establishing: 'wide', medium: 'wide', overview: 'wide',
}

export const SCENE_EFFECT_SYNONYMS: Record<string, SceneEffectId> = {
  color_shift: 'palette_shift', palette: 'palette_shift', tint: 'palette_shift',
  flicker: 'lamp_flicker', light_flicker: 'lamp_flicker',
  night: 'day_to_night', dusk: 'day_to_night', sunset: 'day_to_night',
  shake: 'page_shake', tremble: 'page_shake', camera_shake: 'page_shake',
}

export const STAGING_SYNONYMS: Record<string, StagingId> = {
  frost: 'frost_edges_warm_center', cold_warm: 'frost_edges_warm_center', warm_center: 'frost_edges_warm_center',
  crowd: 'crowd_edges_alone_center', alone: 'crowd_edges_alone_center', lonely: 'crowd_edges_alone_center',
  slow_walk: 'slow_walk_bright_light', bright: 'slow_walk_bright_light', tired_happy: 'slow_walk_bright_light',
}

/** Неизвестный id результата → результат каталога. */
export const RESULT_SYNONYMS: Record<string, BeatResult> = {
  mug: item('cocoa'), hot_chocolate: item('cocoa'), chocolate: item('cocoa'), cup: item('tea'), teacup: item('tea'),
  espresso: item('coffee'), latte: item('coffee'),
  leaves_fall: effect('leaves'), autumn: effect('leaves'), foliage: effect('leaves'),
  snowfall: effect('snow'), rainfall: effect('rain'), raindrop: item('drop'), water: item('drop'), puddle: item('drop'), tear: item('drop'),
  ice: effect('frost'), cold: effect('frost'), sparkle: effect('sparkles'), confetti: effect('sparkles'), joy: effect('sparkles'), fireworks: effect('sparkles'),
  smoke: effect('steam'), vapor: effect('steam'),
  lamp: item('street_lamp'), light: item('street_lamp'), lantern: popup('lamp_post'), streetlight: popup('lamp_post'),
  computer: item('laptop'), pc: item('laptop'), notebook: item('book'), letter: item('note'), music: item('note'), song: item('note'),
  smartphone: item('phone'), mobile: item('phone'),
  pie: item('cake'), dessert: item('cake'), birthday_cake: item('cake'),
  love: item('heart'), present: item('gift'), box: item('gift'),
  bike: item('bicycle'), taxi: item('car'), train: item('bus'), metro: item('bus'), tram: item('bus'),
  puppy: item('dog'), kitten: item('cat'), bag: item('backpack'), alarm: item('clock'), watch: item('clock'), time: item('clock'),
  rose: item('flower'), flowers: item('flower'), bouquet: item('flower'),
  table: popup('cafe_table'), desk: popup('work_desk'), office: popup('work_desk'), window: popup('house'), home: popup('house'), room: popup('house'), apartment: popup('house'),
  forest: popup('tree'), park: popup('tree'), trees: popup('tree'), seat: popup('bench'), chair: popup('bench'),
  friend: person, friends: person, family: person, person: person, mom: person, people: person, second: person, crowd: person,
  bench: popup('bench'),
  sunshine: item('sun'), night: item('moon'), stars: item('star'),
}
