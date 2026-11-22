// КОНТРАКТ «сценки» (решение Эмиля 21.11: вместо 2D-наклеек — объёмные сценки).
// Каждое слово дня становится маленьким стендом вокруг человечка: предмет в руках,
// декорация за спиной и, если нужно, деталь рядом. Сценку составляет Haiku (POST /api/scene),
// по возможности из готовых предметов библиотеки кита; недостающие предметы она дорисовывает
// в формате кита. Расставляет, масштабирует и анимирует сцена (src/scene/FilmStage.ts).
import type { Companion, PhotoCard } from '../types/script'
import type { KitModel } from './format'

/** Что человечек делает в сценке. Подмножество поз Hero3D. */
export const SCENE_ACTIONS = ['idle', 'cheer', 'drink', 'carry', 'sit', 'shiver', 'shake'] as const
export type SceneAction = (typeof SCENE_ACTIONS)[number]

/**
 * Роль предмета в сценке; место по роли выбирает код:
 * - hand — главный предмет фразы, в руке (одна рука; при carry — обе), 6–12 единиц;
 * - stand — место, сбоку (side left/right), 25–60 единиц; только если у бита есть place;
 * - detail — больше не выдаётся (план 13: деталь мельчит кадр); тип оставлен для старых кэшей.
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

/** Сколько текста дня видит сценограф (план 15 § 1.5: запись до 3000 знаков). */
export const SCENE_DAY_MAX = 1500

/**
 * Контекст дня для сценки: весь текст, если он не длиннее n, иначе — окно n символов вокруг цитаты
 * (по границам слов), чтобы у бита из конца длинной записи был свой контекст.
 */
export function dayAround(day: string, quote: string, n = SCENE_DAY_MAX): string {
  const d = day.trim()
  if (d.length <= n) return d
  const at = Math.max(0, quote ? d.indexOf(quote) : 0)
  let a = Math.max(0, Math.min(d.length - n, at + Math.floor(quote.length / 2) - Math.floor(n / 2)))
  let b = Math.min(d.length, a + n)
  if (a > 0) a = d.indexOf(' ', a) + 1 || a
  if (b < d.length) b = d.lastIndexOf(' ', b) > a ? d.lastIndexOf(' ', b) : b
  return `${a > 0 ? '…' : ''}${d.slice(a, b).trim()}${b < d.length ? '…' : ''}`
}

/** Запрос сценки: цитата бита и контекст дня (до SCENE_DAY_MAX символов вокруг цитаты — чтобы сценка подходила дню). */
export interface SceneRequest {
  quote: string
  day: string
  /** Подсказка режиссёра: что получается из слова (id библиотеки или имя предмета). */
  hint?: string
  // Поля бита плана 13 (из Timeline.beats): сценограф строит «главный предмет + место».
  /** Главный предмет фразы — он в руках или прямо перед человечком. */
  hero_prop?: string
  /** Место, если важно, — один стенд сбоку; null — места нет. */
  place?: string | null
  /** Человек из фразы. Его играет второй человечек сцены — сценограф людей не рисует. */
  companion?: Companion | null
  /** Быстрый путь (первый бит): только библиотека, без ИИ — сценка нужна через ~5 с после старта. */
  fast?: boolean
  /** Карточка снимка бита (роль фото): место и вещи сценки — с фото, чтобы сценка совпала со снимком. */
  photo_card?: PhotoCard | null
}
