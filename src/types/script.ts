// КОНТРАКТ. Менять только с согласования: от него зависят director, timeline и scene.
import catalog from '../../assets/catalog.json'
import type { PaletteName } from '../scene/palette'

export type ActionId = keyof typeof catalog.actions
export type PopupId = keyof typeof catalog.popups
export type ItemId = keyof typeof catalog.items
export type EffectId = keyof typeof catalog.effects
export type PersonId = keyof typeof catalog.persons
export type CameraId = keyof typeof catalog.cameras
export type SceneEffectId = keyof typeof catalog.sceneEffects
export type StagingId = keyof typeof catalog.stagings
export type PlaceId = keyof typeof catalog.places
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog'
export type Tempo = 'slow' | 'medium' | 'fast'

/** Оси настроения, каждая от -1 до 1. */
export interface Mood {
  warmth: number
  tension: number
  energy: number
  openness: number
}

export type BeatResult =
  | { kind: 'popup'; id: PopupId }
  | { kind: 'item'; id: ItemId }
  | { kind: 'effect'; id: EffectId }
  | { kind: 'person'; id: PersonId }
  /** Запасной вариант: слова нет в каталоге, оно становится светящимся кубиком. */
  | { kind: 'crystal'; id: 'crystal' }
  /** Предмет из библиотеки кита (assets/kit/*.json): id из src/kit/library. Включает прежние item и popup с теми же id. */
  | { kind: 'kit'; id: string }
  /**
   * Слова нет в библиотеке — дорисовать (POST /api/make, клиент src/kit/make.ts → makeKit).
   * id = "make:" + имя в нижнем регистре (ключ кэша); name — именительный падеж; hint — как выглядит; tags — для образцов и запасного.
   */
  | { kind: 'make'; id: string; name: string; hint: string; tags: string[] }

/**
 * О чём фраза (план 13 § 2): место, вещь, человек, погода, чувство.
 * photo — свой бит снимка, которому не нашлось фразы (quote = подпись снимка, не кусок текста).
 */
export type BeatKind = 'place' | 'thing' | 'person' | 'weather' | 'feeling' | 'photo'
export const BEAT_KINDS: readonly BeatKind[] = ['place', 'thing', 'person', 'weather', 'feeling', 'photo']

// ---------- карточка снимка (роль фото, варианты А+Б) ----------

/** Где вещь со снимка стоит в диораме. */
export type PhotoWhere = 'hand' | 'table' | 'ground' | 'wall' | 'sky'
/** Вещь на голове человечка со снимка (= HeroAccessory, assets/kit/companions.json). */
export type PhotoAccessory = 'none' | 'cap' | 'bun' | 'headscarf' | 'kalpak' | 'glasses' | 'moustache' | 'long_hair'
/** Поза человечка со снимка (= SceneAction). */
export type PhotoAction = 'idle' | 'cheer' | 'drink' | 'carry' | 'sit' | 'shiver' | 'shake'

export interface PhotoPerson {
  /** Кто это по виду: подруга, друг, бабушка, ребёнок, мама… */
  role: string
  jacket: PaletteName
  scarf: PaletteName
  hair: PaletteName
  accessory: PhotoAccessory
  action: PhotoAction
}

/**
 * Карточка снимка: что Haiku увидела на фото дня, сразу словами 3D-библиотеки (POST /api/photo).
 * Из неё код собирает диораму (снимок оживает) и сценку бита, к которому снимок относится.
 * ref — id объёмного предмета библиотеки или "" (тогда ru — название).
 */
export interface PhotoCard {
  /** Подпись от первого лица, 4–8 слов: «мы с подругой пьём какао в кофейне». */
  caption: string
  place: { ru: string; ref: string }
  /** До 4 самых заметных вещей. */
  things: { ru: string; ref: string; where: PhotoWhere }[]
  /** До 3 человек — человечками в той же одежде. */
  people: PhotoPerson[]
  time_of_day: TimeOfDay
  weather: Weather
  palette: PaletteName[]
  /** 2–4 слова. */
  mood: string
  /** Предложение из текста дня, к которому относится снимок; "" — не нашлось. */
  match: string
}

/** Человек из фразы: имя (как в тексте, или роль, если имени нет) и кто это. */
export interface Companion {
  name: string
  /** Роль по-русски: «подруга», «бабушка», «преподаватель». */
  role: string
}

/** Важность фразы: 3 — главная фраза дня, её кадр держится дольше. */
export type BeatWeight = 1 | 2 | 3

export interface Beat {
  /** Точная подстрока текста пользователя. */
  quote: string
  action: ActionId
  result: BeatResult
  camera: CameraId
  effect: SceneEffectId | null
  // Поля плана 13. В старых сценариях (дни на полке) их нет: normalizeScript (src/director/beatFields)
  // заполняет их из result. В таймлайне (Timeline.beats) они есть всегда.
  /**
   * ОДНА вещь, которую можно нарисовать и по которой фразу узнают с первого взгляда, именительный падеж:
   * «какао», «зонт». Не чувство: «устал» → «подушка», «тепло» → «кружка с паром».
   */
  hero_prop?: string
  /** Где это происходит, если место важно: «кофейня», «остановка»; null — место не важно. */
  place?: string | null
  /** Человек из фразы; null — нет. */
  companion?: Companion | null
  kind?: BeatKind
  weight?: BeatWeight
  /** Время суток и погода в этой фразе: идут по дню (утро → вечер, дождь → солнце); свет фильма следует за ними. */
  time_of_day?: TimeOfDay
  weather?: Weather
  /** Индекс снимка дня, который относится к этой фразе (режиссёр по карточкам); null — нет. */
  photo?: number | null
  /**
   * Строка рассказа (план 15 § 1.1): 6–14 слов, от первого лица, в прошедшем времени, со связкой
   * («утром», «потом», «а вечером», «и тут»). Все строки подряд — связный пересказ дня; имена и факты — только из текста.
   * Нет (старый день) — хореограф строит её из предложения бита.
   */
  story?: string
  /**
   * Эмоция человечка в этом бите (id из src/director/emotions = HERO_ACTIONS): поза в крупном кадре.
   * Бит-чувство (kind "feeling" с emotion, без снимка) — без предмета: слово не превращается, человечек играет эмоцию,
   * строка рассказа её называет (одна мысль — один раз). null — эмоции нет.
   */
  emotion?: string | null
  /** Действие человечка в бите (id HERO_ACTIONS kind 'action': run, phone, eat, read…); null — нет. */
  act?: string | null
}

/** Бит со всеми полями плана 13 (после normalizeScript). */
export type FullBeat = Beat & Required<Pick<Beat, 'hero_prop' | 'place' | 'companion' | 'kind' | 'weight' | 'time_of_day' | 'weather'>>

export interface Contradiction {
  a: string
  b: string
  staging: StagingId
}

export interface SongInfo {
  tempo: Tempo
  /** 0..1 */
  energy: number
  /** true, если темп оценён по названию, а не измерен по файлу. */
  estimated: boolean
}

/** Сценарий дня: результат работы режиссёра. Хранится в script.json. */
export interface DayScript {
  title: string
  mood: Mood
  contradiction: Contradiction | null
  time_of_day: TimeOfDay
  weather: Weather
  place: PlaceId
  palette_hint: string[]
  song: SongInfo
  /** От 4 до 7 битов. */
  beats: Beat[]
  /** Ровно три строки: текст, фото, песня. */
  why: [string, string, string]
  /**
   * Карточки снимков дня по индексу фото (null — карточки нет: без сети или ошибка). Хранятся со сценарием,
   * чтобы день с полки собирался без ИИ.
   */
  photo_cards?: (PhotoCard | null)[]
}

// ---------- песня по записи и фото (план 14 § 2) ----------

/**
 * Песня, которую ИИ предлагает по тексту дня (и фото, если есть), когда человек свою не указал.
 * Только настоящие известные песни и только название (чужих файлов в сборке нет, правило 7).
 */
export interface SongSuggestion {
  title: string
  artist: string
  /** одна строка — почему эта песня */
  why: string
  /** 0..1 */
  tempo: number
  /** 0..1 */
  energy: number
  /** id ролика YouTube для встроенного плеера (проверен: существует, встраивается, название совпадает); нет — не играет. */
  yt?: string
}

/** Совет по песне дня (POST /api/song): 3 песни и одна строка, как день звучит. */
export interface SongAdvice {
  songs: SongSuggestion[]
  /** «тёплая кофейня вечером → что-то медленное и тёплое» */
  why: string
}

/** Что уходит режиссёру. */
export interface DirectorInput {
  text: string
  /** Фото как data URL (jpeg), уже уменьшенные до 768 px. */
  photos: string[]
  song: {
    title?: string
    artist?: string
    measuredTempoBpm?: number
    /** Известный темп песни (список песен), если файла нет. */
    bpm?: number
    /** Энергия песни 0..1 (анализ файла или список). */
    energy?: number
    /** О чём песня по настроению («вечер, тепло, неспешно») — тон рассказа под неё. */
    mood?: string
    /** Песню выбрали из предложенных ИИ (/api/song): строка «Песня» в «Почему так» — «предложил ИИ по записи и фото — why». */
    suggested?: { why: string; photos: boolean }
  } | null
  /** Карточки снимков (по индексу фото), если уже готовы: режиссёр читает их текстом вместо картинок. */
  photoCards?: (PhotoCard | null)[]
  /** Герой фильма (выбор «он / она»): род глаголов «я» в строках рассказа — «устал» / «устала». */
  hero?: 'boy' | 'girl'
}

export { catalog }
