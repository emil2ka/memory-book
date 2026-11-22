// КОНТРАКТ «сценки» (решение Эмиля 21.11: вместо 2D-наклеек — объёмные сценки).
// Каждое слово дня становится маленьким стендом вокруг человечка: предмет в руках,
// декорация за спиной и, если нужно, деталь рядом. Сценку составляет Haiku (POST /api/scene),
// по возможности из готовых предметов библиотеки кита; недостающие предметы она дорисовывает
// в формате кита. Расставляет, масштабирует и анимирует сцена (src/scene/FilmStage.ts).
import type { KitModel } from './format'

/** Что человечек делает в сценке. Подмножество поз Hero3D. */
export const SCENE_ACTIONS = ['idle', 'cheer', 'drink', 'carry', 'sit', 'shiver', 'shake'] as const
export type SceneAction = (typeof SCENE_ACTIONS)[number]

/**
 * Роль предмета в сценке; место по роли выбирает код:
 * - hand — в руке (одна рука; при carry — обе), 6–12 единиц;
 * - stand — декорация за спиной или сбоку, 25–60 единиц;
 * - detail — маленькая деталь на бумаге рядом, 6–20 единиц.
 */
export type SceneRole = 'hand' | 'stand' | 'detail'

/** Где стоит предмет относительно человечка (подсказка; код может сдвинуть, чтобы не было наложений). */
export type SceneSide = 'back' | 'left' | 'right' | 'front'

export interface SceneObject {
  role: SceneRole
  /** Название по-русски (для «Почему так» и отладки). */
  ru: string
  /** id предмета библиотеки кита — если подходящий есть. Иначе model. */
  ref?: string
  /** Дорисованный предмет, если ref нет. Проходит validateKit(fit) на сервере. */
  model?: KitModel
  side?: SceneSide
}

export interface KitScene {
  /** Цитата бита, для которой сценка (ключ кэша вместе с dayId или текстом дня). */
  quote: string
  action: SceneAction
  /** 1–3 предмета, не больше одного hand. */
  objects: SceneObject[]
  by?: 'claude' | 'fallback'
}

/** Запрос сценки: цитата бита и контекст дня (до 600 символов текста — чтобы сценка подходила дню). */
export interface SceneRequest {
  quote: string
  day: string
  /** Подсказка режиссёра: что получается из слова (id библиотеки или имя предмета). */
  hint?: string
}
