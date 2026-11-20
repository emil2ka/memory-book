// КОНТРАКТ между хореографом (src/timeline) и сценой (src/scene).
// Хореограф превращает DayScript в список событий; проигрыватель по часам
// вызывает stage.handle(event) в момент event.t и stage.update(time) каждый кадр.
import type { ActionId, BeatResult, CameraId, Mood, SceneEffectId, StagingId } from './script'

export type ActorId = 'hero' | 'second'

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
  | (Base & { type: 'actor_action'; actor: ActorId; action: ActionId })
  | (Base & { type: 'word_lift'; quote: string })
  | (Base & { type: 'word_transform'; quote: string; result: BeatResult })
  | (Base & { type: 'camera'; shot: CameraId; targetQuote: string | null })
  | (Base & { type: 'scene_effect'; effect: SceneEffectId })
  | (Base & { type: 'staging'; staging: StagingId })
  | (Base & { type: 'title_reveal'; title: string })
  | (Base & { type: 'to_shelf' })

export interface Timeline {
  duration: number
  /** Отсортированы по t. */
  events: TimelineEvent[]
  mood: Mood
  /** Множитель скорости анимаций от настроения. */
  pace: number
  seed: number
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
