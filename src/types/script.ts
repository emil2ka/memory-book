// КОНТРАКТ. Менять только с согласования: от него зависят director, timeline и scene.
import catalog from '../../assets/catalog.json'

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

export interface Beat {
  /** Точная подстрока текста пользователя. */
  quote: string
  action: ActionId
  result: BeatResult
  camera: CameraId
  effect: SceneEffectId | null
}

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
}

/** Что уходит режиссёру. */
export interface DirectorInput {
  text: string
  /** Фото как data URL (jpeg), уже уменьшенные до 768 px. */
  photos: string[]
  song: { title?: string; artist?: string; measuredTempoBpm?: number } | null
}

export { catalog }
