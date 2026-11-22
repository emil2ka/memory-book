// КОНТРАКТ между хореографом (src/timeline) и сценой (src/scene).
// Хореограф превращает DayScript в список событий; проигрыватель по часам
// вызывает stage.handle(event) в момент event.t и stage.update(time) каждый кадр.
import type { ActionId, BeatKind, BeatResult, BeatWeight, CameraId, Companion, Mood, PhotoCard, SceneEffectId, StagingId, TimeOfDay, Weather } from './script'

export type ActorId = 'hero' | 'second'
/** Эмоция или действие человечка из HERO_ACTIONS (src/actors/heroActions.ts): bored, joy, tired… */
export type HeroActionId = string

/**
 * Окно бита в фильме (план 13 § 1): камера едет к фразе → слово превращается → крупный кадр с цитатой
 * 2–3 с → сценка сворачивается в марку. Все времена — секунды от старта фильма, по возрастанию.
 */
export interface BeatWindow {
  /** Номер бита в сценарии (как Base.beat у событий). */
  beat: number
  quote: string
  /** Камера начинает ехать к фразе (начало блока бита). */
  start: number
  /** Слово превращается: из кубиков собирается главный предмет (= word_transform.t). */
  transform: number
  /** Крупный кадр: поза человечка и полоска с цитатой (= quote_caption), [начало, конец]. */
  hold: [number, number]
  /** Сценка сворачивается в марку (= stamp.t, равно hold[1]). */
  end: number
  /** Поля бита плана 13 — всегда заполнены. */
  hero_prop: string
  place: string | null
  companion: Companion | null
  kind: BeatKind
  weight: BeatWeight
  /** Время суток и погода этой фразы (по ходу дня) — для света бита. */
  time_of_day: TimeOfDay
  weather: Weather
  /**
   * Снимок бита (индекс фото дня) и его карточка; null — бит без снимка. Бит со снимком: [start, transform] —
   * photo_reveal 3 с (полароид проявляется), потом из снимка кубиками собирается сценка (word_transform),
   * hold как обычно. Карточки нет (старый день, без сети) — photo есть, photo_card null.
   */
  photo: number | null
  photo_card: PhotoCard | null
  /**
   * Строка рассказа (план 15 § 1.1): голос книги слева сверху, пишется, когда сценка начинается (start).
   * 6–14 слов, от первого лица, в прошедшем времени, со связкой («утром», «потом», «а вечером»);
   * все строки подряд — связный пересказ дня. Всегда непустая (старый день, без сети — из предложения бита).
   */
  story: string
  /**
   * Эмоция человечка в бите (id HERO_ACTIONS): поза крупного кадра — то же actor_action.action на hold.
   * Бит-чувство (kind 'feeling' + emotion): сценки нет — нет word_lift, word_transform и stamp, нет запроса сценки;
   * на hold человечек играет эмоцию (actor_action), рассказ её называет. undefined — эмоции нет (старый день).
   */
  emotion?: string
  /** Действие человечка в бите (id HERO_ACTIONS kind 'action': phone, eat, read…): что он делает в крупном кадре. */
  act?: string
}

interface Base {
  /** Время начала, секунды от старта фильма. */
  t: number
  /** Длительность, секунды. */
  dur: number
  /** Номер бита сценария или -1 для вступления и финала. */
  beat: number
}

export type TimelineEvent =
  | (Base & { type: 'book_open' })
  | (Base & { type: 'book_close' })
  | (Base & { type: 'page_flip' })
  | (Base & { type: 'actor_enter'; actor: ActorId })
  | (Base & { type: 'actor_walk'; actor: ActorId; toQuote: string })
  /**
   * action — поза каталога (pull, carry, sit, cheer…), её умеет старая сцена. emotion — эмоция / действие человечка
   * из HERO_ACTIONS (bored, joy, tired…), если есть: новая сцена играет её вместо action (action — запасная поза).
   */
  | (Base & { type: 'actor_action'; actor: ActorId; action: ActionId; emotion?: HeroActionId; act?: HeroActionId })
  | (Base & { type: 'word_lift'; quote: string })
  | (Base & { type: 'word_transform'; quote: string; result: BeatResult })
  | (Base & { type: 'camera'; shot: CameraId; targetQuote: string | null })
  | (Base & { type: 'scene_effect'; effect: SceneEffectId })
  | (Base & { type: 'staging'; staging: StagingId })
  | (Base & { type: 'title_reveal'; title: string })
  /**
   * Снимок бита (роль фото): в начале бита со снимком (beat — его номер, = BeatWindow.start), 3 с —
   * полароид выходит из книги и проявляется; сразу за ним word_transform этого бита (кубики летят из снимка).
   * Камерой на этом отрезке управляет сцена — событий camera внутри нет. Не больше 3 снимков с битами.
   */
  | (Base & { type: 'photo_reveal'; photo: number })
  /**
   * Снимки без бита выезжают веером в финале (beat −1), пока человечек сидит. photos — их индексы;
   * from — наименьший из них (для старого кода: «начиная с from»).
   */
  | (Base & { type: 'photo_fan'; from: number; photos: number[] })
  | (Base & { type: 'to_shelf' })
  /** Крупный кадр бита: рукописная полоска с цитатой внизу кадра на [t, t + dur] (= BeatWindow.hold). */
  | (Base & { type: 'quote_caption'; quote: string })
  /**
   * Рядом с человечком появляется второй (человек из фразы): после главного предмета и места.
   * Свой в каждом бите с companion; прежний actor_enter 'second' остаётся только для первого бита-человека.
   */
  | (Base & { type: 'companion_enter'; companion: Companion })
  /** Сценка бита сворачивается в марку и улетает на поле страницы; dur — само сворачивание. */
  | (Base & { type: 'stamp'; quote: string })
  /**
   * Дорога между битами (план 15 § 1.3): человечек уходит из сценки from и идёт (run — бежит, день быстрый)
   * к сценке to; dur 1.5–2 с. Лежит между окнами: hold[1] бита from ≤ t и t + dur ≤ start бита to.
   * beat = from. Камера ведёт человечка; свет меняется к времени суток бита to на ходу.
   */
  | (Base & { type: 'travel'; from: number; to: number; mode: 'walk' | 'run' })

export interface Timeline {
  duration: number
  /** Отсортированы по t. */
  events: TimelineEvent[]
  /** Окна битов, попавших в фильм, по порядку (план 13). */
  beats: BeatWindow[]
  mood: Mood
  /** Множитель скорости анимаций от настроения. */
  pace: number
  seed: number
  /** Бит-поворот дня (номер бита): с песней он стоит на её подъёме или на границе 8-тактовой фразы. */
  turn?: number
}

/** Реализует сцена. */
export interface Stage {
  /** Подготовить день: текст на странице, настроение, сброс состояния. */
  prepare(input: { text: string; mood: Mood; seed: number }): void
  /** Начало события. */
  handle(event: TimelineEvent): void
  /** Каждый кадр; time — секунды от старта фильма. */
  update(time: number, dt: number): void
  /** Уровень звука 0..1 и признак удара — для пульса страниц. */
  setAudioLevel?(level: number, beat: boolean): void
}
