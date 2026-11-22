import * as THREE from 'three'
import type { Mood } from '../types/script'
import type { ActorId, Stage, TimelineEvent } from '../types/timeline'
import type { CameraId } from '../types/script'
import { Book, PAGE_H, PAGE_W, SS, TEX_H, TEX_W } from './Book'
import { PALETTE } from './palette'
import { HD, HERO3D, PixelStage, pixelTexture } from './PixelStage'
import { GIRL_ACCESSORY, GIRL_COLORS, Hero3D, SECOND_COLORS, type HeroAccessory, type HeroAction, type HeroColors } from '../actors/Hero3D'
import companionsData from '../../assets/kit/companions.json'
import { buildKit, kitBounds } from '../kit/build'
import { KIT_UNIT, type KitModel } from '../kit/format'
import { findByWord, kitById } from '../kit/library'
import { toonFor, toPixelLayer } from '../render/PixelLayer'
import { CRYSTAL, CubeSwarm, inkWord, letterPoints, objectPoints, rngFrom } from './WordMagic'
import { EffectBurst, type EffectKind } from './Particles3D'
import { Polaroid } from './Polaroid'
import { Crowd, frostEdges, warmPool } from './Staging'
import { sfx } from '../audio/sfx'
import { DeskWorld } from '../world/DeskWorld'
import { Person } from '../world/Person'
import { PenWriter } from '../write/pen'
import { glyphStrokes } from '../write/strokes'
import { coverColorFor, type ShelfDay } from '../world/Shelf3D'
import type { KitScene, SceneObject, SceneRequest } from '../kit/scene'
import { forgetScenes, makeScene, sceneFor, sceneRequests } from '../kit/sceneClient'
import { sceneRef } from '../kit/sceneCheck'
import { Sticker, prepareSticker, stickerCanvas } from './Sticker'
import { makeKit, pictureFor } from '../kit/make'
import type { KitPicture } from '../kit/svg'
import type { Timeline } from '../types/timeline'
import type { BeatResult, DayScript } from '../types/script'
import type { PaletteName } from './palette'
import { Room } from './Room'
import { loadModels } from './models'
import { QuoteCaption, StoryCaption, makeBaseDisc, makeFootprint, makeStampPaper } from './BeatShow'
import { HERO_ACTIONS, isHeroAction } from '../actors/heroActions'
import { colorsFromPhoto, type PhotoCard } from './PhotoDiorama'
import { SpriteActor, WORLD_PER_PX, placeholderHero, placeholderItem } from '../actors/SpriteActor'
import { EFFECT_COLS, HERO_COLS, type HeroRow, type SpriteBank } from '../actors/sprites'
import type { ActionId } from '../types/script'

interface Tween {
  t0: number
  dur: number
  fn: (k: number) => void
  done?: () => void
  finished?: boolean
}

/** 2D-наклейки вместо объёмных предметов (до перехода на сценки). */
const USE_STICKERS = false

/** Предмет из слова → вещь на столе, которая на него отзывается (если она стоит на столе в этот день). */
const DESK_ECHO: Record<string, string> = {
  clock: 'alarm_clock',
  alarm_clock: 'alarm_clock',
  phone: 'phone',
  dombra: 'dombra',
  guitar: 'dombra',
  note: 'dombra',
}

/** Цвета подсказки палитры (catalog.paletteColors) в мастер-палитре. */
const DAY_COLORS: Record<string, number> = {
  cream: PALETTE.cream,
  amber: PALETTE.amber,
  ochre: PALETTE.ochre,
  brick_red: PALETTE.brick,
  coral: PALETTE.coral,
  soft_green: PALETTE.greenSoft,
  teal: PALETTE.teal,
  slate_blue: PALETTE.slate,
  navy: PALETTE.navy,
  grey_blue: PALETTE.greyBlue,
  white: PALETTE.white,
  brown: PALETTE.brown,
}

/** Ряд анимации: ряды листа спрайтов + позы, которые есть только у объёмного человечка. */
type AnimRow = HeroRow | 'climb' | 'wave' | 'dangle' | HeroAction
/** Финал «Фотоальбом дня» выключен (Эмиль выбрал «Поклон», 22.11): снимков сценок нет. */
const ALBUM = false

const SPRITE_ROWS = new Set<string>(['idle', 'walk', 'pull', 'sit', 'shake', 'carry', 'drink', 'shiver', 'cheer'])
const spriteRow = (r: AnimRow): HeroRow => (SPRITE_ROWS.has(r) ? (r as HeroRow) : 'idle')

/** Какой ряд листа человечка показывать для действия. */
const ACTION_ROW: Record<ActionId, HeroRow> = {
  walk: 'walk',
  pull: 'pull',
  shake: 'shake',
  carry: 'carry',
  drink: 'drink',
  sit: 'sit',
  shiver: 'shiver',
  cheer: 'cheer',
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const ease = (k: number) => {
  const x = Math.min(1, Math.max(0, k))
  return x * x * (3 - 2 * x)
}
const clamp01 = (k: number) => Math.min(1, Math.max(0, k))

/** Предмет в руке и место — в росте человечка (34 ед.): игрушечный масштаб, чтобы читалось (план 13, § 2 ④). */
const SCENE_ROLE_H: Record<SceneObject['role'], [number, number]> = { hand: [16, 20], stand: [30, 44], detail: [7, 12] }
/** Вариант второго человечка (assets/kit/companions.json, mb-assets). */
export interface CompanionVariant {
  id: string
  ru: string
  match: string[]
  colors: HeroColors
  accessory: HeroAccessory
  scale: number
}
const COMPANIONS = (companionsData as unknown as { variants: CompanionVariant[] }).variants

/** Вариант по роли и имени из режиссёра: первый совпавший по основам; последний — запасной («друг»). */
export function pickCompanion(c: { name?: string; role?: string } | null | undefined): CompanionVariant {
  const text = `${c?.role ?? ''} ${c?.name ?? ''}`.toLowerCase().replace(/ё/g, 'е')
  const words = text.split(/[^\p{L}]+/u).filter(Boolean)
  for (const v of COMPANIONS) {
    for (const stem of v.match) {
      const end = stem.endsWith('$')
      const s = stem.replace(/\$$/, '')
      if (words.some((w) => (end ? w === s : w.startsWith(s)))) return v
    }
  }
  return COMPANIONS[COMPANIONS.length - 1]
}

/** Человек со снимка как вариант второго человечка: цвета его одежды, вещь на голове, ребёнок поменьше. */
export function photoVariant(p: PhotoCard['people'][number], beat: number): CompanionVariant {
  const kid = /ребён|ребен|малыш|младш|сын|доч|бала|кид|дети/i.test(p.role)
  return {
    id: `photo${beat}:${p.role}:${p.jacket}:${p.scarf}:${p.hair}:${p.accessory}`,
    ru: p.role,
    match: [],
    colors: colorsFromPhoto(p),
    accessory: p.accessory,
    scale: kid ? 0.78 : 1,
  }
}

/** Погода и небо: над головой, а не в руках (в руках их не узнают — ревизия библиотеки 22.11). */
// нота и термометр — символы, в руке их не узнают (ревизия mb-assets): тоже над головой
const SKY_IDS = new Set(['sun', 'moon', 'cloud', 'rain_cloud', 'lightning', 'rainbow', 'wind', 'snowflake', 'icicle', 'drop', 'note', 'thermometer'])
/** Поза под небом вместо «держит»: солнцу и радуге радуются, под тучей и ветром мёрзнут. */
const SKY_ACT: Record<string, HeroAction> = { sun: 'cheer', rainbow: 'cheer', moon: 'idle', cloud: 'shiver', rain_cloud: 'shiver', lightning: 'shiver', wind: 'shiver', snowflake: 'cheer', icicle: 'shiver', drop: 'idle', note: 'cheer', thermometer: 'shiver' }
/**
 * Круг ночного неба за луной с тремя звёздами — без него жёлтый серп читают как банан.
 * r — радиус в единицах кита; c — центр луны в тех же единицах (координаты группы предмета).
 */
function nightPatch(r: number, c: THREE.Vector3) {
  const g = new THREE.Group()
  const u = KIT_UNIT
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * u, 28), toonFor('navy', false))
  disc.position.set(c.x * u, c.y * u, c.z * u - 0.08)
  g.add(disc)
  for (const [x, y] of [
    [-0.55, 0.5],
    [0.6, 0.35],
    [0.35, -0.6],
  ]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.6 * u, 1.6 * u, 0.4 * u), toonFor('yellow', true))
    s.position.set((c.x + x * r) * u, (c.y + y * r) * u, c.z * u - 0.06)
    s.rotation.z = Math.PI / 4
    g.add(s)
  }
  toPixelLayer(g)
  return g
}

/** Высота предмета в небе в единицах кита (человечек — 34). */
const SKY_SCALE = 30
/** Строк пиксельного слоя на крупном кадре бита (обычно 130): человечек ~110 px вместо ~55. */
const BEAT_ROWS = 250
/** Марки дня — вдоль дальнего края разворота. */
const STAMP_Z = -PAGE_H / 2 + 0.46
const STAMP_SIZE = 0.86

/**
 * Окна битов: от превращения слова до момента, когда сценка уходит в марку.
 * Крупный кадр держится до следующего слова (минус проход), но не меньше 2.2 с и не дольше 4 с;
 * полароид и финал бит не перекрывает.
 */
export function beatWindows(timeline: Timeline) {
  const out = new Map<number, { t0: number; hold0: number; t1: number; quote: string }>()
  // хореограф уже дал окна (контракт плана 13) — берём их
  if (timeline.beats?.length) {
    for (const b of timeline.beats) out.set(b.beat, { t0: b.transform, hold0: b.hold[0], t1: b.end, quote: b.quote })
    return out
  }
  const ev = timeline.events
  const tr = ev.filter((e): e is Extract<TimelineEvent, { type: 'word_transform' }> => e.type === 'word_transform').sort((a, b) => a.t - b.t)
  const stops = ev.filter((e) => e.type === 'photo_reveal' || e.type === 'staging' || e.type === 'book_close').map((e) => e.t)
  tr.forEach((e, i) => {
    const hold0 = e.t + e.dur
    const next = tr[i + 1]
    const lift = next ? ev.find((x) => x.type === 'word_lift' && x.beat === next.beat)?.t ?? next.t - 0.6 : Infinity
    let t1 = Math.min(lift - 1.1, hold0 + 4)
    for (const s of stops) if (s > hold0 - 0.2 && s < t1 + 0.3) t1 = Math.min(t1, s - 0.3)
    t1 = Math.max(t1, hold0 + 2.2)
    out.set(e.beat, { t0: e.t, hold0, t1, quote: e.quote })
  })
  return out
}

/** Общий план: стол и книга целиком. */
/** Экран полки: полка с днями, окно и стол с закрытой книгой. */
// сзади-сверху за спиной человека: лица не видно, книга на столе видна, полка и окно в кадре
const SHELF_VIEW = { pos: new THREE.Vector3(-5.5, 11.0, 17.0), look: new THREE.Vector3(-2.6, 2.2, -2.0) }

/** Камера записи относительно глаз человека: выше и сзади, чтобы разворот целиком помещался в кадр. */
/** Кончик ручки над бумагой: прижат (пишет) и приподнят (переезжает между штрихами). */
const PEN_DOWN = 0.006
const PEN_LIFT = 0.05
/** Какую часть длины руки считаем досягаемой без наклона; сколько наклона передаётся взгляду. */
const ARM_REACH_K = 0.84
// голова подаётся вперёд вместе с руками почти целиком — иначе в кадр попадает срез рукава у плеча
const CAM_LEAN = 0.9
// камера чуть выше и впереди глаз (перед плечами), разворот помещается за счёт широкого угла
/** Бледная подсказка на пустой левой странице в записи. */
const WRITE_PLACEHOLDER = 'Каким был сегодняшний день?\nЧто ты видел, слышал, чувствовал — пиши здесь.'
const WRITE_EYE_OFFSET = new THREE.Vector3(0, 0.45, -0.25)
const WRITE_FOV = 1.5

/** Вход человека без узла eyes (запасной): камера сзади-справа, он идёт от неё к стулу — лица не видно. */
const INTRO_VIEW = { pos: new THREE.Vector3(19, 12.5, 24), look: new THREE.Vector3(3.0, 1.2, 4.5) }

/**
 * Вход от первого лица (решение Эмиля 22.11: со спины человек смотрится плохо — показываем его меньше).
 * Камера в глазах, тело спрятано. Взгляд тянется к столу и окну, чтобы кадр не мотало вместе с головой.
 */
// между полкой и окном на задней стене: справа и слева от комнаты стен нет — туда смотреть нельзя
const INTRO_LOOK = new THREE.Vector3(2.2, 3.0, -4.5)
/** Насколько взгляд тянется к INTRO_LOOK: на ходу и пока садится (при посадке голова крутится сильнее). */
const INTRO_PULL_WALK = 0.78
const INTRO_PULL_SIT = 0.85
/** Угол обзора из глаз шире обычного (обычный — как телеобъектив); на выезде сужается обратно. */
const INTRO_FOV = 1.6
/**
 * Выезд: середина взгляда — точка на задней стене (y — относительно высоты камеры над макушкой).
 * Взгляд остаётся на столе и окне, не задирается на пустую стену; голова уходит из кадра вниз, пока камера
 * поднимается, — тогда тело и включается.
 */
const INTRO_OUT_MID = new THREE.Vector3(0.2, -6, -4.5)
/** Опора кривой выезда над глазами: вверх быстрее, чем назад, — камера сначала выходит из головы через макушку. */
const INTRO_OUT_RISE = new THREE.Vector3(-0.8, 7, 0.5)
/** Сглаживание глаз, 1/с: позиция на ходу (лёгкая качка остаётся), при посадке, направление взгляда. */
const INTRO_POS_RATE = 7
const INTRO_SIT_RATE = 2.6
const INTRO_DIR_RATE = 3
/** Сел — камера за столько секунд выходит из головы вверх и назад через левое плечо на экран полки. */
const INTRO_OUT_DUR = 2.1
/** Тело включается, только когда камера дальше этого от головы (и голова не в кадре). */
const INTRO_HEAD_MARGIN = 0.6

const WIDE = HERO3D
  ? // объёмный мир: виден стол, стена, окно и полка
    { pos: new THREE.Vector3(0, 6.4, 9.6), look: new THREE.Vector3(0, 0.9, -0.9) }
  : { pos: new THREE.Vector3(0, 8.6, 6.4), look: new THREE.Vector3(0, 0.3, 0.3) }

/**
 * Сцена фильма. Получает события таймлайна и превращает их в движение.
 * Всё управляется временем фильма, поэтому пауза и перемотка вперёд работают сами.
 */
export class FilmStage implements Stage {
  readonly room = new Room()
  readonly book = new Book()
  readonly hero: SpriteActor
  readonly second: SpriteActor
  /** Текущая анимация каждого актёра: ряд листа, начало, зациклена ли. */
  private anim: Record<ActorId, { row: AnimRow; t0: number; loop: boolean; fps: number; dur: number }> = {
    hero: { row: 'idle', t0: 0, loop: true, fps: 6, dur: 1 },
    second: { row: 'idle', t0: 0, loop: true, fps: 6, dur: 1 },
  }
  private fps = 6
  private tweens: Tween[] = []
  private spawned: THREE.Object3D[] = []
  private billboards: SpriteActor[] = []
  private lifted = new Map<string, SpriteActor>()
  private camPos = WIDE.pos.clone()
  private camLook = WIDE.look.clone()
  private time = 0
  private bob = { hero: 0, second: 0 }
  private shake = 0
  private level = 0
  private polaroids: THREE.Mesh[] = []
  private particles: { a: SpriteActor; id: string; t0: number; x: number; z: number; phase: number }[] = []
  private rngState = 1
  private closed = false
  private bookText = ''
  /** Объёмные человечки в пиксельном слое; ими управляют те же события, что и спрайтами. */
  private figures: { id: ActorId; fig: Hero3D; yaw: number; walk: number; dist: number; last: THREE.Vector3 }[] = []
  /** Куда идёт актёр (слово) — к нему он поворачивается, когда тянет. */
  private goal: Record<ActorId, THREE.Vector3 | null> = { hero: null, second: null }
  private focus = new THREE.Vector3()
  /** Слова, оторванные от страницы (настоящие чернила). */
  private inkWords = new Map<string, THREE.Mesh>()
  /** Предмет в руках у человечка. */
  private held: { obj: THREE.Object3D; height: number; width: number; grip: THREE.Vector3 | null; raise?: boolean } | null = null
  /**
   * Откуда сцена берёт сценки (объёмный стенд вокруг человечка на каждое слово).
   * request — заказать заранее (пока открывается книга), get — готовая сценка или null.
   * Без поставщика или без готовой сценки бит идёт по-старому: один предмет из 3D-библиотеки.
   */
  sceneProvider: { request(req: SceneRequest): void; get(quote: string): KitScene | null } | null = null
  /** Поза человечка после превращения слова — из сценки (по номеру бита). */
  private sceneActs = new Map<number, HeroAction>()
  /** Следы уже стоящих сценок на развороте (x0, z0, x1, z1), чтобы новые не налезали. */
  private footprints: [number, number, number, number][] = []
  /** Декорации, уже стоящие на развороте (по ref или названию): одно место дня не строится дважды. */
  private stands = new Map<string, THREE.Object3D>()
  /** Мелочь на развороте (детали и положенные из рук вещи): старые тают, чтобы не было свалки. */
  private smalls: THREE.Object3D[] = []
  /** Объёмные эффекты (листья, снег, иней…) в пиксельном слое. */
  private bursts: EffectBurst[] = []
  /** Снимки дня: в режиме записи лежат на странице, в фильме заложены в книгу. */
  private photoImages: (HTMLImageElement | HTMLCanvasElement)[] = []
  private tucked: Polaroid[] = []
  /** Дорисованные Claude картинки по id результата («make:…»). */
  private made = new Map<string, KitPicture>()
  /**
   * Окна битов из таймлайна (план 13, § 1): t0 — слово превращается, hold0 — крупный кадр с цитатой,
   * t1 — сценка сворачивается в марку. Считаются в preload, переживают reset.
   */
  private beatWin = new Map<number, { t0: number; hold0: number; t1: number; quote: string }>()
  /** Крупный кадр бита: рамка сценки (человечек + предметы) и сторона, с которой смотрит камера. */
  private beatCam: { t0: number; t1: number; center: THREE.Vector3; size: THREE.Vector3; side: number } | null = null
  private caption: QuoteCaption | null = null
  /** Сколько марок уже на полях разворота. */
  private stamps = 0
  /** Биты, где второй человечек приходит через companion_enter (план 13). */
  private companionBeats = new Set<number>()
  /** Таймлайн с окнами битов (план 13): сценки запрошены для всех битов. */
  private hasContract = false
  /** Фразы со снимком (план 14, роль фото): номер снимка дня и карточка Haiku, что на нём. */
  private photoBeats = new Map<number, { photo: number; card: PhotoCard | null }>()
  /**
   * Путь дня (план 15, § 1.3): у каждого бита своя точка на развороте, человечек идёт от сценки к сценке
   * по «карте дня», за ним остаются следы, прожитая сценка остаётся маркой на своём месте пути.
   */
  private route = new Map<number, THREE.Vector3>()
  /** Сторона места относительно человечка в бите: −1 слева, 1 справа (в сторону пути). */
  private standDir = new Map<number, number>()
  /** Дороги между битами: из события travel или из промежутка между окнами битов. */
  private travels: { t: number; dur: number; from: number; to: number; mode: 'walk' | 'run' }[] = []
  private travelInto = new Set<number>()
  private hasTravelEvents = false
  private travelCam: { t0: number; t1: number; dir: number } | null = null
  /** Рассказ слева сверху: строка каждого бита и когда она начинает писаться. */
  private storyLines: { beat: number; text: string; t0: number; t1: number }[] = []
  /** Снимки сценок для фотоальбома дня: кадр в середине окна бита. */
  private shots = new Map<number, HTMLCanvasElement>()
  /** 1 — в этом кадре подписи спрятаны, 2 — следующий кадр снимаем. */
  private shotStage = 0
  private shotBeat = -1
  private albumDone = new Set<number>()
  /** «Поклон»: предметы всех сценок дня (в их размере) и люди дня — выходят в ряд в финале. */
  private curtain: { o: THREE.Object3D; s: number; sky: boolean }[] = []
  private cast = new Map<string, CompanionVariant>()
  private bowFigs: Hero3D[] = []
  /** Где лежат снимки альбома — финальная камера берёт их в кадр. */
  private album: THREE.Vector3[] = []
  private story: StoryCaption | null = null

  /** Люди со снимка бита, кроме «меня» (подпись от первого лица и людей двое+ — первый из них я). */
  private photoPeople(beat: number): PhotoCard['people'] {
    const card = this.photoBeats.get(beat)?.card
    const ppl = card?.people ?? []
    const me = /(^|[^\p{L}])(мы|я|меня|нас|біз|мен)([^\p{L}]|$)/iu.test(card?.caption ?? '')
    return me && ppl.length >= 2 ? ppl.slice(1) : ppl
  }

  /**
   * Снимок первой фразы проявляется прямо во вступлении (там нет 3 с на вытягивание):
   * пока человечек вылезает из щели, полароид сам выезжает из книги, встаёт у дальнего края над первой фразой
   * и проявляется — к превращению первого слова из него уже можно «оживать».
   */
  private introPhoto(t0: number) {
    if (!this.figures.length) return
    const first = [...this.beatWin.entries()].sort((a, b) => a[1].t0 - b[1].t0)[0]
    const pb = first ? this.photoBeats.get(first[0]) : undefined
    const pol = pb ? this.tucked[pb.photo] : undefined
    if (!first || !pol) return
    const o = pol.object
    const at = this.quotePos(first[1].quote)
    const x = Math.max(-PAGE_W + pol.width / 2, Math.min(PAGE_W - pol.width / 2, at?.x ?? -PAGE_W / 2))
    const zFar = -PAGE_H / 2
    const p0 = (o.userData.tuckPos as THREE.Vector3 | undefined)?.clone() ?? o.position.clone()
    const q0 = (o.userData.tuckQ as THREE.Quaternion | undefined)?.clone() ?? o.quaternion.clone()
    const p1 = new THREE.Vector3(x, pol.height / 2 - this.book.group.position.y, zFar - 0.16)
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0))
    const dur = Math.max(1.2, first[1].t0 - t0 - 0.4)
    this.tween({ t: t0, dur: dur * 0.45 }, (k) => {
      const a = ease(k)
      o.position.lerpVectors(p0, p1, a)
      o.position.y += Math.sin(a * Math.PI) * 0.4
      o.quaternion.slerpQuaternions(q0, q1, a)
    })
    this.tween({ t: t0 + dur * 0.35, dur: dur * 0.65 }, (k) => pol.setDevelop(ease(k)))
    this.soundAt(t0, () => sfx.slide(0.4))
    this.soundAt(t0 + dur * 0.9, () => sfx.chime())
  }

  /** Точки на самом снимке полароида — оттуда вылетают кубики, когда фото оживает. */
  private photoPoints(i: number, n: number, rand: () => number): THREE.Vector3[] {
    const pol = this.tucked[i]
    const photo = pol?.object.children[1] as THREE.Mesh | undefined
    if (!photo) return []
    photo.updateMatrixWorld(true)
    const side = (photo.geometry as THREE.PlaneGeometry).parameters.width
    return Array.from({ length: n }, () => new THREE.Vector3((rand() - 0.5) * side, (rand() - 0.5) * side, 0.02).applyMatrix4(photo.matrixWorld))
  }
  private heights = new Map<string, number>()
  /** Наклейки на странице — всегда повёрнуты к камере. */
  private facing: THREE.Object3D[] = []
  /** Комната вокруг стола: стена, окно, полка-архив, вещи настроения. */
  readonly world: DeskWorld | null = null
  /** Человек за столом (мальчик или девочка); лицо в кадр не попадает. */
  person: Person | null = null
  /** Режим записи: камера из глаз человека, ручка идёт за курсором. */
  private writeMode = false
  private lastTypeAt = -1e9
  private penTarget = new THREE.Vector3()
  private penReady = false
  /** Ручка пишет каждую букву по штрихам шрифта; чернила проступают под кончиком (src/write). */
  private writer = new PenWriter((ch) => glyphStrokes(ch, this.book.fontFamily))
  /** Режим записи открыт (даже если человек ещё не загрузился — тогда буквы пишутся «невидимой ручкой»). */
  private inkMode = false
  private penWasDown = false
  /** Наклон к дальней строке: на сколько руки (мировые координаты) подались вперёд. */
  private lean = new THREE.Vector3()
  private armsBase: THREE.Vector3 | null = null
  private armReach = 0
  /** Человек играет разовое движение (вход, открывает книгу, кладёт фото) — не перебивать. */
  private personBusy = false
  private introDone = false
  /** Книга открывается руками человека в начале записи: 0..1, null — не открывается. */
  private bookOpening: number | null = null
  private photoCount = 0
  /** Время с начала входа человека без узла eyes (камера переезжает со входа на главный экран); null — не идёт. */
  private introCam: number | null = null
  /**
   * Вход от первого лица: eyes — камера в глазах, пока он идёт и садится; out — выходит из головы на экран полки.
   * pos, fwd — сглаженные глаза и взгляд; pull — тяга взгляда к INTRO_LOOK; body — тело уже включено.
   */
  private intro: {
    phase: 'eyes' | 'out'
    t: number
    pos: THREE.Vector3
    fwd: THREE.Vector3
    pull: number
    ready: boolean
    body: boolean
    from: { pos: THREE.Vector3; c1: THREE.Vector3; c2: THREE.Vector3; d0: THREE.Vector3; dm: THREE.Vector3; d1: THREE.Vector3 } | null
  } | null = null
  private frustum = new THREE.Frustum()
  private eyesCam = new THREE.Vector3()
  /** id дня, который сейчас играет: его корешок прячется на полке, пока книга на столе. */
  private dayId: string | null = null
  /** Экран полки: книги откликаются на наведение. */
  private shelfMode = false
  private hoverId: string | null = null
  private bookHover = false
  private bookLift = 0
  private pulled = new Map<string, number>()
  private ray = new THREE.Raycaster()
  /** Книга летит на полку — сцена не двигает её сама. */
  private shelving = false
  /** Палитра, время суток и погода дня: из сценария (палитра — из фото дня). */
  private day: Pick<DayScript, 'palette_hint' | 'time_of_day' | 'weather'> | null = null
  /** Фильм идёт в реальном времени (не перемотка) — только тогда звучат звуки действий. */
  private live = false
  private stepCount = -1
  /** Поворот, который сцена задаёт человечку сама (полароид), или null. */
  private faceYaw: Record<ActorId, number | null> = { hero: null, second: null }

  constructor(
    readonly px: PixelStage,
    private bank: SpriteBank | null = null,
  ) {
    this.hero = bank ? bank.makeHero('hero') : new SpriteActor(placeholderHero(), 24, 32)
    this.second = bank ? bank.makeHero('second') : new SpriteActor(placeholderHero(), 24, 32)
    px.scene.add(this.room.group, this.book.group, this.hero.object, this.second.object)
    if (HERO3D) {
      // сценки на слова: Haiku собирает стенд (POST /api/scene), пока открывается книга
      this.sceneProvider = { request: (req) => void makeScene(req), get: (q) => sceneFor(q) }
      this.world = new DeskWorld(px.scene)
      this.usePerson('boy')
      for (const id of ['hero', 'second'] as const) {
        const fig = new Hero3D(id === 'hero' ? undefined : SECOND_COLORS)
        px.scene.add(fig.object)
        this.actor(id).mesh.visible = false
        this.figures.push({ id, fig, yaw: 0, walk: 0, dist: 0, last: new THREE.Vector3() })
      }
      px.pixel?.attachLights(px.scene)
      if (px.pixel) px.pixel.focus = this.focus
    }
    this.applyCamera()
    this.reset()
    // модели подменяют коробки, когда загрузятся; без них сцена работает на заглушках
    this.modelsReady = loadModels()
      .then((m) => {
        this.room.useModels(m.lamp, m.cassette, m.desk)
        this.book.useModel(m.book)
      })
      .catch((err) => console.warn('3D-модели не загрузились, остаются заглушки', err))
  }

  /** Модели стола, книги, комнаты и человек за столом загрузились (экран загрузки ждёт этого). */
  private modelsReady: Promise<void> = Promise.resolve()
  whenReady(): Promise<void> {
    return Promise.all([this.modelsReady, this.world?.ready, this.person?.ready]).then(() => undefined, () => undefined)
  }

  // ---------- Stage ----------

  prepare(input: { text: string; mood: Mood; seed: number }) {
    this.reset()
    this.rngState = (input.seed >>> 0) || 1
    this.bookText = input.text
    this.book.setText(input.text)
    this.setMood(input.mood)
    if (this.figures.length) this.tuckPhotos()
    // фильм идёт внутри книги: человек за столом закрывал бы её на общих планах
    this.person?.setVisible(false)
  }

  handle(e: TimelineEvent) {
    // дорога между битами (план 15, § 1.3); тип приходит из таймлайна mb-logic
    const ev = e as unknown as { type: string; t: number; dur: number; from?: number; to?: number; mode?: string }
    if (ev.type === 'travel') {
      if (this.figures.length && typeof ev.from === 'number' && typeof ev.to === 'number')
        this.travel3D({ t: ev.t, dur: ev.dur, from: ev.from, to: ev.to, mode: ev.mode === 'run' ? 'run' : 'walk' })
      return
    }
    switch (e.type) {
      case 'book_open':
        this.introPhoto(e.t + e.dur)
        return this.tween(e, (k) => this.book.setOpen(ease(k)))
      case 'book_close':
        if (this.figures.length) return this.closeBook3D(e)
        this.hero.object.visible = false
        this.second.object.visible = false
        for (const o of this.spawned) o.visible = false
        for (const p of this.polaroids) p.visible = false
        this.closed = true
        return this.tween(e, (k) => this.book.setOpen(1 - ease(k)))
      case 'page_flip':
        this.soundAt(e.t, () => sfx.flip())
        return this.tween(e, (k) => (this.shake = Math.sin(k * Math.PI) * 0.02))
      case 'actor_enter': {
        // второй появляется через companion_enter своего бита
        if (e.actor === 'second' && this.companionBeats.has(e.beat)) return
        if (this.figures.length) return this.enter3D(e)
        const a = this.actor(e.actor)
        a.object.visible = true
        const side = e.actor === 'hero' ? -1 : 1
        const from = new THREE.Vector3(0, this.book.pageY, -PAGE_H / 2 + 0.3)
        const to = new THREE.Vector3(side * 0.6, this.book.pageY, -PAGE_H / 2 + 0.9)
        return this.tween(e, (k) => a.object.position.lerpVectors(from, to, ease(k)))
      }
      case 'actor_walk': {
        // второй человечек стоит рядом с главным, пока идёт его бит (companion_enter), — старые проходы не уводят его
        if (e.actor === 'second' && this.companionBeats.has(e.beat)) return
        const a = this.actor(e.actor)
        // путь дня: главный идёт к точке своего бита на карте; если к ней ведёт дорога — он уже там
        const spot = e.actor === 'hero' && this.figures.length ? this.route.get(e.beat) : undefined
        if (spot && this.travelInto.has(e.beat)) return
        const target = spot ?? this.quotePos(e.toQuote)
        if (!target) return
        if (e.actor === 'hero') this.dropHeld(e)
        this.goal[e.actor] = target.clone()
        const from = a.object.position.clone()
        // встать чуть ниже слова, чтобы не закрывать его
        const to = spot ? spot.clone() : target.clone().add(new THREE.Vector3(e.actor === 'hero' ? -0.35 : 0.45, 0, 0.32))
        this.bob[e.actor] = this.bank ? 0 : 1
        const walking = this.play(e.actor, 'walk', e.t, true)
        a.mesh.scale.x = to.x < from.x ? -1 : 1
        return this.tween(e, (k) => a.object.position.lerpVectors(from, to, k), () => {
          this.bob[e.actor] = 0
          // действие, начавшееся в тот же момент, уже сменило анимацию — не затирать его
          if (this.anim[e.actor] === walking) this.play(e.actor, 'idle', e.t + e.dur, true)
        })
      }
      case 'actor_action': {
        const a = this.actor(e.actor)
        const sceneAct = e.actor === 'hero' ? this.sceneActs.get(e.beat) : undefined
        // эмоция бита (план 15): человечек сам играет «скучно», «грустно», «танцевали» — важнее позы сценки
        // действие бита (act: телефон, гуляет) важнее эмоции, эмоция — важнее позы каталога
        const ev = e as { emotion?: string; act?: string }
        const pick = [ev.act, ev.emotion].find((x): x is string => !!x && isHeroAction(x))
        const emotion = e.actor === 'hero' && this.figures.length && pick ? HERO_ACTIONS.find((h) => h.id === pick)! : null
        if (emotion) {
          this.dropHeld(e)
          // бит-чувство без сценки: крупный кадр на самого человечка на всё окно бита
          const fw = this.beatWin.get(e.beat)
          if (!this.sceneActs.has(e.beat) && fw) {
            this.beatCamOnly({ t: e.t, dur: e.dur, beat: e.beat })
            // и у чувства в альбоме свой снимок — сам человечек в этой эмоции
            const beat = e.beat
            this.tween({ t: fw.t1, dur: 0.001 }, () => {
              const shot = this.shots.get(beat)
              const st = this.route.get(beat)
              if (ALBUM && shot && st && !this.albumDone.has(beat)) {
                this.albumDone.add(beat)
                this.albumPhoto(beat, shot, new THREE.Vector3(st.x, this.book.pageY, st.z - 0.1), this.stamps++, fw.quote)
              }
            })
          }
        }
        if (e.actor === 'hero' && !sceneAct && !emotion && (e.action === 'cheer' || e.action === 'sit' || e.action === 'shiver')) this.dropHeld(e)
        if (this.figures.length && e.actor === 'hero' && e.beat === -1 && e.action === 'sit') return this.finale3D(e)
        if (this.bank) {
          // после превращения слова поза — из сценки (ест мороженое, держит шарики, сидит за ноутбуком)
          const row: AnimRow = emotion?.id ?? (sceneAct as HeroRow | undefined) ?? ACTION_ROW[e.action]
          const acting = this.play(e.actor, row, e.t, emotion ? emotion.loop : row !== 'sit', emotion ? Math.max(e.dur, emotion.dur) : e.dur)
          // прыжок радости нарисован в самих кадрах, двигать спрайт не нужно
          const hop = 0
          const wobble = 0
          return this.tween(
            e,
            (k) => {
              a.mesh.position.y = Math.round((Math.abs(Math.sin(k * Math.PI * 3)) * hop) / WORLD_PER_PX) * WORLD_PER_PX
              a.mesh.rotation.z = Math.sin(k * Math.PI * 10) * wobble
            },
            () => {
              a.mesh.position.y = 0
              a.mesh.rotation.z = 0
              if (row !== 'sit' && this.anim[e.actor] === acting) this.play(e.actor, 'idle', e.t + e.dur, true)
            },
          )
        }
        // ЗАГЛУШКА анимаций: наклон и подпрыгивание вместо кадров листа
        const amp = e.action === 'pull' || e.action === 'shake' ? 0.35 : e.action === 'cheer' ? 0.2 : 0.1
        return this.tween(
          e,
          (k) => {
            a.mesh.rotation.z = Math.sin(k * Math.PI * (e.action === 'shake' ? 6 : 2)) * amp
            a.mesh.position.y = e.action === 'cheer' ? Math.abs(Math.sin(k * Math.PI * 3)) * 0.25 : 0
            if (e.action === 'sit') a.mesh.scale.y = 1 - 0.3 * ease(k)
          },
          () => {
            a.mesh.rotation.z = 0
            a.mesh.position.y = 0
          },
        )
      }
      case 'word_lift': {
        if (this.figures.length) return this.wordLift3D(e)
        const boxes = this.book.wordsForQuote(e.quote)
        const at = this.book.wordWorldPosition(boxes)
        if (!at) return
        this.book.hideWords(boxes)
        const canvas = this.book.wordCanvas(boxes)
        // буквы того же размера, что и на странице
        const word = new SpriteActor(canvas, canvas.width, canvas.height, PAGE_W / TEX_W / SS)
        word.object.position.copy(at)
        this.addBillboard(word)
        this.lifted.set(e.quote, word)
        return this.tween(e, (k) => (word.mesh.position.y = ease(k) * 0.55))
      }
      case 'word_transform': {
        if (this.figures.length) return this.wordTransform3D(e)
        const word = this.lifted.get(e.quote)
        const at = word?.object.position.clone() ?? this.quotePos(e.quote)
        if (!at) return
        const made = this.makeResult(e.result.kind, e.result.id)
        if (e.result.kind === 'effect') this.spawnEffect(e.result.id, at, e.t + e.dur / 2)
        made.object.position.copy(at)
        made.mesh.position.y = 0.7
        made.mesh.scale.setScalar(0.001)
        this.addBillboard(made)
        return this.tween(e, (k) => {
          // первая половина: слово дрожит и сжимается; вторая: предмет вырастает и опускается
          if (word) {
            const a = clamp01(k * 2)
            word.mesh.scale.setScalar(Math.max(0.001, 1 - a))
            word.mesh.rotation.z = Math.sin(a * 40) * 0.2
            word.object.visible = a < 1
          }
          const b = clamp01(k * 2 - 1)
          made.mesh.scale.setScalar(Math.max(0.001, ease(b) * (1 + 0.3 * Math.sin(b * Math.PI))))
          made.mesh.position.y = 0.7 * (1 - ease(b))
        })
      }
      case 'camera':
        return this.cameraShot(e, e.shot, e.targetQuote)
      case 'scene_effect': {
        if (e.effect === 'lamp_flicker') {
          const base = this.room.lamp.intensity
          return this.tween(e, (k) => (this.room.lamp.intensity = base * (0.6 + 0.4 * Math.abs(Math.sin(k * 37)))), () => (this.room.lamp.intensity = base))
        }
        if (e.effect === 'page_shake') return this.tween(e, (k) => (this.shake = Math.sin(k * Math.PI) * 0.04))
        if (e.effect === 'day_to_night') {
          const from = this.room.ambient.color.clone()
          const to = new THREE.Color(PALETTE.navy)
          return this.tween(e, (k) => this.room.ambient.color.lerpColors(from, to, ease(k)))
        }
        if (e.effect === 'palette_shift') {
          const from = this.room.lamp.color.clone()
          const to = new THREE.Color(PALETTE.amber)
          return this.tween(e, (k) => this.room.lamp.color.lerpColors(from, to, ease(k)))
        }
        return
      }
      case 'staging': {
        if (this.figures.length) return this.staging3D(e)
        // иней по краям страницы, тёплый свет лампы в центре
        if (e.staging === 'frost_edges_warm_center') this.spawnEffect('frost', new THREE.Vector3(0, this.book.pageY, 0), e.t)
        const rim0 = this.room.rim.intensity
        const lamp0 = this.room.lamp.intensity
        return this.tween(e, (k) => {
          const a = Math.sin(clamp01(k) * Math.PI)
          this.room.rim.intensity = rim0 + a * 1.2
          this.room.rim.color.set(PALETTE.ice)
          this.room.lamp.intensity = lamp0 * (1 + a * 0.6)
        })
      }
      case 'companion_enter':
        return this.companionEnter(e)
      case 'quote_caption':
        // цитату и марку сцена ведёт сама по окнам битов (beatWindows): так они верны и при перемотке
        return
      case 'stamp': {
        // своей дороги в таймлайне нет — человечек идёт к следующей сценке в промежутке между битами
        if (this.hasTravelEvents || !this.figures.length) return
        const tr = this.travels.find((x) => x.from === e.beat)
        if (tr) this.travel3D(tr)
        return
      }
      case 'photo_reveal':
        return this.photoReveal(e)
      case 'photo_fan':
        return this.photoFan(e)
      case 'title_reveal':
        return this.tween(e, (k) => this.book.setTitle(e.title, k > 0.15 ? 1 : 0))
      case 'to_shelf': {
        if (this.world && this.toShelf3D(e)) return
        const from = this.book.group.position.clone()
        const to = from.clone().add(new THREE.Vector3(0, 0.4, -1.2))
        return this.tween(e, (k) => this.book.group.position.lerpVectors(from, to, ease(k)))
      }
    }
  }

  update(time: number, _dt: number) {
    this.live = _dt > 0 && _dt < 0.25 && time - this.time < 0.3
    this.time = time
    this.updateShots(time)
    for (const tw of this.tweens) {
      if (tw.finished || time < tw.t0) continue
      const k = tw.dur <= 0 ? 1 : clamp01((time - tw.t0) / tw.dur)
      tw.fn(k)
      if (k >= 1) {
        tw.finished = true
        tw.done?.()
      }
    }
    this.tweens = this.tweens.filter((t) => !t.finished)

    // шаг: подпрыгивание по целым пикселям
    for (const id of ['hero', 'second'] as const) {
      const a = this.actor(id)
      if (this.bob[id]) a.mesh.position.y = Math.round(Math.abs(Math.sin(time * 9)) * 2) * WORLD_PER_PX
    }
    if (this.bank) {
      for (const id of ['hero', 'second'] as const) {
        const an = this.anim[id]
        const f = Math.max(0, Math.floor((time - an.t0) * an.fps))
        this.bank.setHeroFrame(this.actor(id), id, spriteRow(an.row), an.loop ? f % HERO_COLS : Math.min(f, HERO_COLS - 1))
      }
    }
    this.room.update(_dt)
    this.updateParticles(time)
    for (const b of this.bursts) b.update(time, this.closed)
    for (const o of this.facing) this.faceCamera(o)
    this.book.blinkCaret(Math.floor(performance.now() / 500) % 2 === 0)
    this.world?.update(_dt, time)
    this.updatePerson(_dt)
    if (this.world) {
      // книга под курсором выезжает с полки; остальные стоят ровно
      const step = Math.min(1, (_dt || 1 / 60) * 10)
      for (const d of this.world.shelf.days) {
        const want = this.shelfMode && d.id === this.hoverId ? 0.55 : 0
        const was = this.pulled.get(d.id) ?? 0
        if (Math.abs(want - was) < 0.001 && want === 0) continue
        const k = was + (want - was) * step
        this.pulled.set(d.id, k)
        this.world.shelf.pull(d.id, k)
      }
    }
    // закрытая книга на экране полки чуть приподнимается под курсором — её можно открыть
    this.bookLift += ((this.shelfMode && this.bookHover ? 0.16 : 0) - this.bookLift) * Math.min(1, (_dt || 1 / 60) * 10)
    if (!this.shelving) {
      this.book.group.rotation.z = this.shake * Math.sin(time * 50)
      this.book.group.position.y = this.level * 0.03 + this.bookLift
    }
    // закрытая книга лежит по центру стола, раскрытая — корешком по центру
    if (!this.shelving) this.book.group.position.x = (-PAGE_W / 2) * (1 - this.book.openK)
    if (this.figures.length && !this.writeMode && !this.shelfMode) {
      this.applyBeatCamera(time)
      this.applyTravelCamera(time)
    }
    this.applyCamera()
    this.placeCaption(time)
    this.placeStory(time)
    this.updateWaiting()
    this.hero.faceCamera(this.px.camera)
    this.second.faceCamera(this.px.camera)
    this.updateFigures(time, _dt)
    for (const b of this.billboards) b.faceCamera(this.px.camera)
  }

  /** Режиссёр думает: живое ожидание в виде записи (см. World.setWaiting). */
  setWaiting(on: boolean) {
    this.waiting = on && this.writeMode
    const h = this.hero.object
    if (!this.figures.length) return
    if (!this.waiting) {
      if (this.writeMode) h.visible = false
      this.faceYaw.hero = null
      return
    }
    // человечек выглядывает из щели между страницами и смотрит на того, кто пишет
    h.visible = true
    this.faceYaw.hero = 0
    this.play('hero', 'wave', this.time, true, 1.2)
  }

  private waiting = false

  /** Выглядывание из щели: вверх-вниз, иногда машет. Только пока ждём режиссёра. */
  private updateWaiting() {
    if (!this.waiting || !this.figures.length) return
    // выглядывает только из раскрытой книги
    this.hero.object.visible = this.book.openK > 0.9
    const s = performance.now() / 1000
    const peek = 0.5 + 0.5 * Math.sin(s * 1.4)
    // дальний край щели: рука с ручкой его не закрывает
    this.hero.object.position.set(0.02, this.book.pageY - 1.05 + 0.62 * ease(peek), -1.25)
    const row = peek > 0.85 && Math.sin(s * 0.7) > 0 ? 'wave' : 'climb'
    if (this.anim.hero.row !== row) this.play('hero', row, this.time, true, row === 'wave' ? 1.2 : 0.8)
  }

  setAudioLevel(level: number, _beat: boolean) {
    this.level = level
  }

  // ---------- режим записи и полка ----------

  /** Книга раскрыта, камера сверху на разворот, сцена очищена. */
  writeView() {
    this.reset()
    this.inkMode = true
    this.writer.reset(this.bookText)
    this.book.setPlaceholder(WRITE_PLACEHOLDER)
    this.book.setOpen(1)
    this.camPos.set(0, 9.4, 1.9)
    this.camLook.set(0, 0.3, 0.25)
    const eyes = this.person?.model ? this.person.eyesWorld() : null
    if (eyes) {
      // из глаз человека, чуть выше и сзади — чтобы весь разворот и рука с ручкой были в кадре.
      // Глаза — как сидя: если он ещё шёл (клик на входе), камера сразу там, где окажется голова
      this.camPos.copy(this.person!.seatedEyes() ?? eyes.pos).add(WRITE_EYE_OFFSET)
      this.eyesCam.copy(this.camPos)
      this.camLook.set(0, this.book.pageY, 0.05)
      this.setFirstPerson(true)
      this.writeMode = true
      this.px.fovScale = WRITE_FOV
      this.px.fit()
      this.penReady = false
      this.introDone = true
      // садится ровно (если ещё шёл) и открывает книгу руками
      this.person!.playChair('Push_In')
      if (this.person!.has('Open_Book')) {
        this.book.setOpen(0)
        this.bookOpening = 0
        this.personOnce('Open_Book')
      }
    }
    this.applyCamera()
  }

  /** Книга закрыта, общий план. */
  idleView() {
    // фильм могли пропустить: книга дня не долетела — её корешок снова на полке
    this.dayId = null
    this.book.setCoverColor(null)
    this.reset()
    this.book.setText('')
    if (this.world) {
      // экран полки: полка с днями, лампа, окно и закрытая книга на столе
      this.camPos.copy(SHELF_VIEW.pos)
      this.camLook.copy(SHELF_VIEW.look)
      this.applyCamera()
      this.shelfMode = true
      if (!this.introDone) void this.personIntro()
    }
  }

  /** Открыли сайт: человек входит, отодвигает стул и садится за стол. Один раз за загрузку. */
  private async personIntro() {
    const p = this.person
    if (!p) return
    await p.ready
    if (this.introDone || !this.shelfMode || !p.has('Walk_In')) return
    this.introDone = true
    if (p.eyes) {
      // от первого лица: тело и руки спрятаны, камера ставится в глаза в updatePerson
      p.setHidden(true)
      this.px.setFovScale(INTRO_FOV)
      this.intro = { phase: 'eyes', t: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(), pull: INTRO_PULL_WALK, ready: false, body: false, from: null }
    } else {
      this.introCam = 0
      this.camPos.copy(INTRO_VIEW.pos)
      this.camLook.copy(INTRO_VIEW.look)
    }
    this.introPlay(p, 0)
  }

  /**
   * Клипы входа с момента s (секунды от начала входа): Walk_In, потом Sit_Down (стул отодвигается);
   * сел — стул задвинут, камера выходит из глаз. s > 0 — новый человек продолжает вход старого.
   */
  private introPlay(p: Person, s: number) {
    this.personBusy = true
    const walk = p.clipDuration('Walk_In')
    const sit = (from: number) => {
      if (this.person !== p) return
      p.playChair('Pull_Out', from)
      this.personClip = 'Sit_Down'
      p.play('Sit_Down', {
        fade: from > 0 ? 0 : 0.15,
        from,
        onDone: () => {
          if (this.person !== p || this.personClip !== 'Sit_Down') return
          p.playChair('Push_In')
          this.personBusy = false
          if (this.intro?.phase === 'eyes') this.introOut()
        },
      })
    }
    if (s < walk) {
      this.personClip = 'Walk_In'
      p.play('Walk_In', {
        fade: 0,
        from: s,
        onDone: () => {
          if (this.person === p && this.personClip === 'Walk_In') sit(0)
        },
      })
    } else sit(s - walk)
  }

  /** Сколько секунд вход уже идёт (по клипу на человеке) — чтобы новый человек продолжил с того же места. */
  private introClock(p: Person) {
    if (this.personClip === 'Walk_In') return p.clipTime()
    if (this.personClip === 'Sit_Down') return p.clipDuration('Walk_In') + p.clipTime()
    return null
  }

  /** Сел: камера выходит из головы вверх, через левое плечо и назад — на экран полки. */
  private introOut() {
    const it = this.intro
    if (!it) return
    const pos = this.camPos.clone()
    // сначала вверх над макушкой и чуть влево (через плечо), потом назад к виду полки
    const c1 = pos.clone().add(INTRO_OUT_RISE)
    const c2 = SHELF_VIEW.pos.clone().add(new THREE.Vector3(2.2, -0.6, -6.5))
    // взгляд: со стола → на заднюю стену → на вид полки. Кривая Безье по направлениям проходит через
    // середину dmid при k = 0.5, поэтому её опорная точка — 2·dmid − (d0 + d1)/2
    const d0 = this.camLook.clone().sub(pos).normalize()
    const d1 = SHELF_VIEW.look.clone().sub(SHELF_VIEW.pos).normalize()
    const mid = new THREE.Vector3(INTRO_OUT_MID.x, c1.y + INTRO_OUT_MID.y, INTRO_OUT_MID.z).sub(c1).normalize()
    const dm = mid.multiplyScalar(2).addScaledVector(d0.clone().add(d1), -0.5)
    it.phase = 'out'
    it.t = 0
    it.from = { pos, c1, c2, d0, dm, d1 }
  }

  /** Кончить вход: тело снова видно, обычный угол обзора (запись ставит свой сама). */
  private introEnd() {
    if (!this.intro) return
    this.intro = null
    this.person?.setHidden(false)
    if (!this.writeMode) this.px.setFovScale(1)
  }

  /** Шаг камеры входа от первого лица (после p.update — глаза уже в позе этого кадра). */
  private updateIntro(p: Person, step: number) {
    const it = this.intro!
    if (!this.shelfMode || this.writeMode) return this.introEnd()
    if (it.phase === 'eyes') {
      const e = p.eyesWorld()
      if (!e) return this.introOut()
      // узел eyes смотрит вдоль −Z (как камера)
      const fwd = e.dir.negate()
      const sitting = this.personClip === 'Sit_Down'
      if (!it.ready) {
        it.pos.copy(e.pos)
        it.fwd.copy(fwd)
        it.ready = true
      } else {
        it.pos.lerp(e.pos, 1 - Math.exp(-step * (sitting ? INTRO_SIT_RATE : INTRO_POS_RATE)))
        it.fwd.lerp(fwd, 1 - Math.exp(-step * INTRO_DIR_RATE)).normalize()
      }
      it.pull += ((sitting ? INTRO_PULL_SIT : INTRO_PULL_WALK) - it.pull) * (1 - Math.exp(-step * 2))
      const toLook = INTRO_LOOK.clone().sub(it.pos).normalize()
      const view = it.fwd.clone().lerp(toLook, it.pull).normalize()
      this.camPos.copy(it.pos)
      this.camLook.copy(it.pos).addScaledVector(view, 10)
      return
    }
    const f = it.from!
    it.t += step
    const k = ease(it.t / INTRO_OUT_DUR)
    // кубическая кривая Безье: глаза → над макушкой → за плечом → вид полки
    const u = 1 - k
    this.camPos
      .copy(f.pos)
      .multiplyScalar(u * u * u)
      .addScaledVector(f.c1, 3 * u * u * k)
      .addScaledVector(f.c2, 3 * u * k * k)
      .addScaledVector(SHELF_VIEW.pos, k * k * k)
    // взгляд — квадратичная кривая по направлениям: стол → задняя стена → вид полки
    const dir = f.d0
      .clone()
      .multiplyScalar(u * u)
      .addScaledVector(f.dm, 2 * u * k)
      .addScaledVector(f.d1, k * k)
      .normalize()
    if (k >= 1) this.camLook.copy(SHELF_VIEW.look)
    else this.camLook.copy(this.camPos).addScaledVector(dir, 10)
    // угол обзора сужается в первой половине выезда
    this.px.setFovScale(INTRO_FOV + (1 - INTRO_FOV) * ease(it.t / (INTRO_OUT_DUR * 0.6)))
    if (!it.body) {
      // тело включается, только когда камера вне головы, а голова и руки (кисти, локти, плечи) не в кадре —
      // иначе волосы или руки «выпрыгнут» в кадр
      const head = p.headBox()
      const inside = head ? head.clone().expandByScalar(INTRO_HEAD_MARGIN).containsPoint(this.camPos) : false
      let seen = false
      if (head && !inside) {
        const cam = this.px.camera
        cam.position.copy(this.camPos)
        cam.lookAt(this.camLook)
        cam.updateMatrixWorld()
        this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
        const hand = new THREE.Vector3()
        seen =
          (this.frustum.intersectsBox(head) && p.headInView(this.frustum)) ||
          [p.handL, p.handR, p.forearmL, p.forearmR, p.upperarmL, p.upperarmR].some((h) => !!h && this.frustum.containsPoint(h.getWorldPosition(hand)))
      }
      if ((!inside && !seen) || k >= 1) {
        p.setHidden(false)
        it.body = true
      }
    }
    if (k >= 1) this.introEnd()
  }

  /** Вид из глаз: Person прячет голову, волосы и шею. */
  private setFirstPerson(on: boolean) {
    this.person?.setFirstPerson(on)
  }

  /** Человек сел и ничего разового не делает (вход, открывает книгу, кладёт фото). */
  get personSettled() {
    return !!this.person?.model && !this.personBusy && !this.intro
  }

  /** Кто пишет: мальчик или девочка. Меняет человека за столом (скелет и движения у них общие). */
  setPersonKind(kind: 'boy' | 'girl') {
    this.dressHero(kind)
    if (this.person?.kind === kind) return
    this.usePerson(kind)
  }

  /** Герой фильма — тот же, кто пишет: девочке свои волосы и цвета (план 15, выбор «мальчик / девочка»). */
  private heroKind: 'boy' | 'girl' = 'boy'
  private dressHero(kind: 'boy' | 'girl') {
    const f = this.figures.find((x) => x.id === 'hero')
    if (!f || this.heroKind === kind) return
    this.heroKind = kind
    const old = f.fig
    const fig = kind === 'girl' ? new Hero3D(GIRL_COLORS, toonFor, GIRL_ACCESSORY) : new Hero3D()
    fig.object.position.copy(old.object.position)
    fig.object.rotation.copy(old.object.rotation)
    fig.object.visible = old.object.visible
    this.px.scene.remove(old.object)
    this.px.scene.add(fig.object)
    f.fig = fig
  }

  private usePerson(kind: 'boy' | 'girl') {
    const old = this.person
    if (old) this.px.scene.remove(old.root)
    // сменили человека посреди входа от первого лица: новый спрятан и продолжает вход с того же места
    // (камера остаётся в глазах); на выезде — спрятан, пока камера не выйдет из его головы
    const it = this.intro
    const resume = it?.phase === 'eyes' && old?.model ? this.introClock(old) : null
    const switchedAt = this.time
    const person = new Person(kind, { shadows: true })
    if (it && !it.body) person.setHidden(true)
    this.person = person
    this.armsBase = null
    this.armReach = 0
    this.lean.set(0, 0, 0)
    this.personClip = ''
    this.px.scene.add(person.root)
    void person.ready.then(() => {
      if (this.person !== person) return
      if (this.intro?.phase === 'eyes' && resume !== null && person.eyes && person.has('Walk_In')) {
        // пока грузился, вход шёл бы дальше — продолжаем с учётом этого времени
        this.introPlay(person, resume + Math.max(0, this.time - switchedAt))
        return
      }
      if (this.intro?.phase === 'eyes') this.introOut()
      // до входа человек ждёт за кадром, в начале прохода; без клипа входа — сразу сидит
      if (!this.introDone && person.has('Walk_In')) {
        person.pose('Walk_In', 0)
        this.personClip = 'Walk_In'
        this.personBusy = true
      } else {
        person.play('Sit_Idle', { fade: 0 })
        this.personBusy = false
      }
      if (this.writeMode) this.setFirstPerson(true)
    })
  }

  /** Разовое движение человека; потом он снова сидит или пишет. */
  private personOnce(clip: string) {
    const p = this.person
    if (!p?.has(clip)) return
    this.personBusy = true
    this.personClip = clip
    p.play(clip, {
      fade: 0.2,
      onDone: () => {
        if (this.personClip === clip) this.personBusy = false
      },
    })
  }

  /** День на полке под точкой экрана (ndc −1..1) или null. Работает только на экране полки. */
  pickShelf(ndcX: number, ndcY: number): string | null {
    if (!this.world || !this.shelfMode) return null
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.px.camera)
    let best: { id: string; d: number } | null = null
    for (const day of this.world.shelf.days) {
      const root = this.world.shelf.bookOf(day.id)
      if (!root || !root.visible) continue
      const hit = this.ray.intersectObject(root, true)[0]
      if (hit && (!best || hit.distance < best.d)) best = { id: day.id, d: hit.distance }
    }
    return best?.id ?? null
  }

  /**
   * Человек за столом. В записи: пока печатают — пишет (кончик ручки идёт за курсором),
   * перестали — рука замирает над строкой; вне записи — просто сидит.
   */
  private updatePerson(dt: number) {
    // чернила под ручкой идут и без человека (не загрузился) — буквы всё равно выводятся
    if (this.inkMode && this.writer.active && this.writer.update(dt || 1 / 60)) this.book.setInk(this.writer.ink())
    const p = this.person
    if (!p?.model) return
    const typing = this.writeMode && (this.writer.active || performance.now() - this.lastTypeAt < 700)
    const want = typing ? 'Write' : 'Sit_Idle'
    if (!this.personBusy && this.personClip !== want && p.has(want)) {
      p.play(want, { fade: 0.3 })
      this.personClip = want
    }
    p.update(dt || 1 / 60)
    // вход от первого лица: камера в глазах, потом выходит на экран полки
    if (this.intro) this.updateIntro(p, Math.min(0.1, dt || 1 / 60))
    // вход без узла eyes: камера смотрит, как он идёт, и пока он садится — переезжает на главный экран
    if (this.introCam !== null && this.shelfMode) {
      this.introCam += dt || 1 / 60
      const k = ease((this.introCam - 2.6) / 2.2)
      this.camPos.lerpVectors(INTRO_VIEW.pos, SHELF_VIEW.pos, k)
      this.camLook.lerpVectors(INTRO_VIEW.look, SHELF_VIEW.look, k)
      if (k >= 1) this.introCam = null
    } else if (!this.shelfMode) this.introCam = null
    // запись: камера движется вместе с глазами, когда он наклоняется к книге
    if (this.writeMode) {
      const eyes = p.eyesWorld()
      if (eyes) {
        // книгу открывают руки fp_arms, а тело в клипе Open_Book наклоняется к ней: камера за этим наклоном
        // влетала в поднимающуюся обложку и под ладонь. Пока книга открывается, камера ждёт там, где глаза сидя
        const hold = this.personBusy && this.personClip === 'Open_Book' ? p.seatedEyes() : null
        const want = (hold ?? eyes.pos).add(WRITE_EYE_OFFSET)
        if (this.eyesCam.lengthSq() === 0) this.eyesCam.copy(want)
        else this.eyesCam.lerp(want, Math.min(1, (dt || 1 / 60) * 6))
        // тянется к дальней строке — взгляд немного наклоняется следом
        // только вперёд-назад: боковой сдвиг камеры раскачивает весь разворот
        this.camPos.copy(this.eyesCam)
        this.camPos.z += this.lean.z * CAM_LEAN
      }
    } else this.eyesCam.set(0, 0, 0)
    // обложка открывается вместе с руками: с 0.3 по 1.3 с клипа Open_Book
    if (this.bookOpening !== null) {
      this.bookOpening += dt || 1 / 60
      const k = ease((this.bookOpening - 0.3) / 1.0)
      this.book.setOpen(k)
      if (k >= 1) this.bookOpening = null
    }
    // кости руки — из рук для вида из глаз (fp_arms), когда тело скрыто; Person отдаёт нужные сам
    const bones = [p.forearmR, p.upperarmR].filter((b): b is THREE.Object3D => !!b)
    if (!this.writeMode || this.personBusy || !p.penTip || bones.length < 2) return
    // цель — кончик ручки на штрихе буквы, которую он сейчас выводит (src/write/pen.ts);
    // ручке нечего писать — она над курсором; пустая страница — ждёт на левой странице под подсказкой, ближе к её правому краю
    const step = dt || 1 / 60
    const pen = this.writer.active ? this.writer.pen() : null
    const at = pen ? this.book.charOrigin(pen.index) : null
    let goal: THREE.Vector3
    let down = false
    if (pen && at) {
      goal = this.book.group.localToWorld(this.book.texToLocal(at.page, at.x + pen.x * at.size, at.y + pen.y * at.size))
      down = pen.down
      goal.y += down ? PEN_DOWN : PEN_LIFT
    } else {
      const caret = this.bookText.trim() ? this.book.caretLocal() : null
      goal = caret
        ? this.book.group.localToWorld(caret)
        : this.book.group.localToWorld(this.book.texToLocal(0, TEX_W * 0.8, Math.min(TEX_H - 14, (this.book.placeholderEnd() ?? TEX_H * 0.5) + 46)))
      // ждём режиссёра: ручка постукивает по бумаге, как когда думаешь
      goal.y += typing ? PEN_LIFT : this.waiting ? 0.03 + 0.11 * Math.abs(Math.sin(performance.now() / 260)) : 0.12
    }
    if (down && !this.penWasDown) sfx.scratch(0.09)
    this.penWasDown = down
    if (!this.penReady) {
      this.penTarget.copy(goal)
      this.penReady = true
    } else if (down) this.penTarget.copy(goal)
    else this.penTarget.lerp(goal, Math.min(1, step * (pen ? 30 : 8)))
    // наклон: верх страницы дальше, чем достаёт рука от плеча, — руки подаются вперёд, как когда человек тянется к строке
    const armsRoot = p.firstPerson && p.arms ? p.arms.root : null
    if (armsRoot?.parent && p.handR) {
      if (!this.armsBase) this.armsBase = armsRoot.position.clone()
      const w = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
      if (!this.armReach) this.armReach = (w(bones[1]).distanceTo(w(bones[0])) + w(bones[0]).distanceTo(w(p.handR)) + w(p.handR).distanceTo(w(p.penTip))) * ARM_REACH_K
      const shoulder = w(bones[1]).sub(this.lean)
      const to = this.penTarget.clone().sub(shoulder)
      to.y = 0
      const need = Math.hypot(to.length(), this.penTarget.y - shoulder.y) - this.armReach
      const want = need > 0 ? to.normalize().multiplyScalar(need) : new THREE.Vector3()
      this.lean.lerp(want, Math.min(1, step * 12))
      const q = armsRoot.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
      const sc = armsRoot.parent.getWorldScale(new THREE.Vector3())
      armsRoot.position.copy(this.armsBase).add(this.lean.clone().applyQuaternion(q).divide(sc))
    }
    // CCD: предплечье и плечо поворачиваются так, чтобы кончик ручки пришёл в цель
    p.root.updateMatrixWorld(true)
    const tip = new THREE.Vector3()
    const jp = new THREE.Vector3()
    const qw = new THREE.Quaternion()
    const qp = new THREE.Quaternion()
    // кисть доводит последние миллиметры: сначала крупно плечо и предплечье, в конце — немного кисть
    const chain = p.handR ? [p.handR, ...bones] : bones
    for (let it = 0; it < 12; it++) {
      for (const j of it < 8 ? bones : chain) {
        p.penTip.getWorldPosition(tip)
        j.getWorldPosition(jp)
        const a = tip.sub(jp).normalize()
        const b = this.penTarget.clone().sub(jp).normalize()
        const d = new THREE.Quaternion().setFromUnitVectors(a, b)
        // кисть поворачиваем чуть-чуть, иначе ручка ляжет под странным углом
        if (j === p.handR) d.slerp(new THREE.Quaternion(), 0.65)
        j.getWorldQuaternion(qw)
        j.parent!.getWorldQuaternion(qp)
        j.quaternion.copy(qp.invert().multiply(d.multiply(qw)))
        j.updateMatrixWorld(true)
      }
    }
  }

  private personClip = ''

  /** Закрытая книга на столе под точкой экрана (только на экране полки). */
  pickBook(ndcX: number, ndcY: number): boolean {
    if (!this.shelfMode || !this.book.group.visible) return false
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.px.camera)
    return this.ray.intersectObject(this.book.group, true).length > 0
  }

  /** Подсветить закрытую книгу на столе: она чуть приподнимается. */
  setBookHover(on: boolean) {
    this.bookHover = on
  }

  /** Подсветить книгу на полке: она выезжает к зрителю. null — убрать. */
  setShelfHover(id: string | null) {
    this.hoverId = id
  }

  setDraftCaret(pos: number | null) {
    this.book.setCaret(pos)
  }

  setDraftText(text: string) {
    if (text !== this.bookText) this.lastTypeAt = performance.now()
    this.bookText = text
    // в записи новые буквы пишет ручка; вне записи текст появляется сразу
    if (this.inkMode) {
      this.writer.setText(text)
      this.writer.update(0)
      this.book.setInk(this.writer.ink(), false)
    } else this.writer.reset(text)
    this.book.setText(text)
  }

  /** Полароиды на правой странице. Остаются на время фильма; пустой массив убирает их. */
  setPhotos(images: (HTMLImageElement | HTMLCanvasElement)[]) {
    // в записи человек кладёт каждое новое фото рукой
    if (this.writeMode && images.length > this.photoCount && !this.personBusy) this.personOnce('Place_Photo')
    this.photoCount = images.length
    this.photoImages = images.slice(0, 5)
    for (const p of this.polaroids) this.book.group.remove(p)
    this.polaroids = []
    this.book.textOnRightPage = images.length === 0
    const n = Math.min(images.length, 5)
    const cols = n <= 1 ? 1 : 2
    const size = n <= 1 ? 1.9 : n <= 4 ? 1.25 : 1.05
    images.slice(0, 5).forEach((img, i) => {
      // фото уменьшается до пиксельной сетки страницы
      const side = Math.round((size / PAGE_W) * TEX_W)
      const c = document.createElement('canvas')
      c.width = side
      c.height = side + 6
      const g = c.getContext('2d')!
      g.imageSmoothingEnabled = true
      g.fillStyle = '#fbf6ea'
      g.fillRect(0, 0, c.width, c.height)
      const w = (img as HTMLImageElement).naturalWidth || img.width
      const h = (img as HTMLImageElement).naturalHeight || img.height
      const crop = Math.min(w, h)
      g.drawImage(img, (w - crop) / 2, (h - crop) / 2, crop, crop, 2, 2, side - 4, side - 4)
      const geo = new THREE.PlaneGeometry(size, (size * c.height) / c.width)
      geo.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: pixelTexture(c, HD) }))
      const col = i % cols
      const row = Math.floor(i / cols)
      const rows = Math.ceil(n / cols)
      const x = PAGE_W / 2 + (cols === 1 ? 0 : (col - 0.5) * (size + 0.18))
      const z = (row - (rows - 1) / 2) * (size + 0.22)
      mesh.position.set(x, this.book.surfaceY + 0.005 + i * 0.002, z)
      mesh.rotation.y = ((i * 37) % 11 - 5) * 0.025
      this.book.group.add(mesh)
      this.polaroids.push(mesh)
    })
    this.book.setText(this.bookText)
  }

  /** Прямоугольники страниц в пикселях холста. */
  pageRectsPx(): { left: Rect; right: Rect } {
    this.px.camera.updateMatrixWorld()
    const rect = (page: 0 | 1): Rect => {
      const pts = this.book.pageCorners(page).map((v) => v.project(this.px.camera))
      const cw = this.px.renderer.domElement.width
      const ch = this.px.renderer.domElement.height
      const xs = pts.map((p) => ((p.x + 1) / 2) * cw)
      const ys = pts.map((p) => ((1 - p.y) / 2) * ch)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    return { left: rect(0), right: rect(1) }
  }

  // ---------- внутреннее ----------

  private reset() {
    this.tweens = []
    this.travelCam = null
    for (const o of this.spawned) this.px.scene.remove(o)
    this.spawned = []
    this.billboards = []
    this.particles = []
    this.closed = false
    this.lifted.clear()
    this.book.group.position.set(0, 0, 0)
    this.book.setOpen(0)
    this.book.setCaret(null)
    this.book.setTitle('', 0)
    this.play('hero', 'idle', 0, true)
    this.play('second', 'idle', 0, true)
    for (const a of [this.hero, this.second]) {
      a.object.visible = false
      a.mesh.scale.set(1, 1, 1)
      a.mesh.rotation.z = 0
      a.mesh.position.y = 0
    }
    for (const p of this.polaroids) p.visible = true
    for (const p of this.tucked) this.book.group.remove(p.object)
    this.tucked = []
    this.faceYaw = { hero: null, second: null }
    for (const f of this.figures) {
      f.fig.reset()
      f.dist = 0
      f.walk = 0
    }
    this.goal = { hero: null, second: null }
    this.inkWords.clear()
    this.held = null
    this.sceneActs.clear()
    this.beatCam = null
    this.stamps = 0
    this.waiting = false
    if (this.px.pixel) this.px.pixel.minRows = 130
    this.caption?.place(this.px.camera, 0)
    this.footprints = []
    this.stands.clear()
    this.smalls = []
    this.bursts = []
    this.facing = []
    this.shelving = false
    this.writeMode = false
    this.inkMode = false
    if (this.px.fovScale !== 1) {
      this.px.fovScale = 1
      this.px.fit()
    }
    if (this.armsBase && this.person?.arms) this.person.arms.root.position.copy(this.armsBase)
    this.lean.set(0, 0, 0)
    this.writer.reset(this.bookText)
    this.book.setInk(null, false)
    this.book.setPlaceholder(null, false)
    this.bookOpening = null
    this.setFirstPerson(false)
    this.person?.setVisible(true)
    // вход от первого лица прерван (открыли книгу или день с полки) — тело снова видно
    this.introEnd()
    this.introCam = null
    this.shelfMode = false
    this.hoverId = null
    this.bookHover = false
    this.book.group.visible = true
    this.book.group.quaternion.identity()
    if (this.world) {
      for (const d of this.world.shelf.days) {
        const b = this.world.shelf.bookOf(d.id)
        // книга дня лежит на столе — на полке её место пустое
        if (b) b.visible = d.id !== this.dayId
      }
    }
    this.bob = { hero: 0, second: 0 }
    this.shake = 0
    this.camPos.copy(WIDE.pos)
    this.camLook.copy(WIDE.look)
    this.time = 0
  }

  private rand() {
    // детерминированный генератор: один и тот же день выглядит одинаково
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0
    return this.rngState / 4294967296
  }

  /** Частицы эффекта: падающие — по всему развороту, остальные — у слова или по краям страницы. */
  private spawnEffect(id: string, at: THREE.Vector3 | THREE.Object3D, t0: number) {
    if (this.figures.length) {
      const b = new EffectBurst(id as EffectKind, at, t0, { w: PAGE_W * 0.95, h: PAGE_H * 0.46, y: this.book.pageY }, rngFrom(`${id}:${t0}`))
      this.px.scene.add(b.mesh)
      this.spawned.push(b.mesh)
      this.bursts.push(b)
      return
    }
    if (!this.bank || !(at instanceof THREE.Vector3)) return
    const falling = id === 'leaves' || id === 'snow' || id === 'rain'
    const n = falling ? 16 : id === 'frost' ? 8 : id === 'sparkles' ? 8 : 3
    for (let i = 0; i < n; i++) {
      const a = this.bank.makeEffect(id)
      if (!a) return
      let x = at.x + (this.rand() - 0.5) * 1.2
      let z = at.z + (this.rand() - 0.5) * 0.6
      if (falling) {
        x = (this.rand() * 2 - 1) * PAGE_W * 0.95
        z = (this.rand() - 0.5) * PAGE_H * 0.9
      } else if (id === 'frost') {
        // по периметру разворота
        const side = i % 4
        const k = this.rand() * 2 - 1
        x = side < 2 ? k * PAGE_W * 0.95 : (side === 2 ? -1 : 1) * PAGE_W * 0.95
        z = side < 2 ? (side === 0 ? -1 : 1) * PAGE_H * 0.46 : k * PAGE_H * 0.46
      }
      // иней на листе растёт из правого нижнего угла: на левой половине отражаем
      if (id === 'frost' && x < 0) a.mesh.scale.x = -1
      a.object.visible = false
      this.addBillboard(a)
      this.particles.push({ a, id, t0, x, z, phase: this.rand() })
    }
  }

  private updateParticles(time: number) {
    if (!this.bank) return
    const y0 = this.book.pageY
    for (const p of this.particles) {
      const age = time - p.t0
      p.a.object.visible = age >= 0 && !this.closed
      if (age < 0 || this.closed) continue
      let frame = 0
      let y = 0
      if (p.id === 'frost') {
        frame = Math.floor(Math.min(1, Math.max(0, age * 0.6 - p.phase * 0.5)) * (EFFECT_COLS - 0.01))
      } else if (p.id === 'steam' || p.id === 'sparkles') {
        const k = (age * 0.9 + p.phase) % 1
        frame = Math.floor(k * EFFECT_COLS)
        y = p.id === 'steam' ? 0.45 + k * 0.5 : 0.2 + p.phase * 0.6
      } else {
        // падение: 70% пути в воздухе, потом кадры приземления на странице
        const k = (age * (p.id === 'rain' ? 0.9 : 0.35) + p.phase) % 1
        frame = Math.floor(k * EFFECT_COLS)
        y = Math.max(0, 1 - k / 0.7) * 2.2
      }
      this.bank.setEffectFrame(p.a, p.id, frame)
      p.a.object.position.set(p.x, y0 + Math.round(y / WORLD_PER_PX) * WORLD_PER_PX, p.z)
    }
  }

  /**
   * Объёмные человечки повторяют положение спрайтов: позу берут из текущего действия,
   * шаг — из скорости и пройденного пути, поворот — по ходу, к слову или к камере.
   */
  private updateFigures(time: number, dt: number) {
    for (const f of this.bowFigs) f.update(time, dt)
    const cam = this.px.camera.position
    for (const f of this.figures) {
      const a = this.actor(f.id)
      const o = f.fig.object
      o.visible = a.object.visible
      const an = this.anim[f.id]
      f.fig.play(an.row as HeroAction, an.t0, an.dur)
      const p = a.object.position
      const dx = p.x - f.last.x
      const dz = p.z - f.last.z
      const step = Math.hypot(dx, dz)
      if (step > 0.5) f.fig.resetScarf()
      else f.dist += step
      const speed = dt > 0 ? step / dt : 0
      const moving = dt > 0 ? speed > 0.08 : an.row === 'walk'
      const walkTarget = dt > 0 ? Math.min(1, speed / 0.45) : an.row === 'walk' ? 1 : 0
      f.walk += (walkTarget - f.walk) * (dt > 0 ? Math.min(1, dt * 12) : 1)
      let target: number
      const goal = this.goal[f.id]
      const forced = this.faceYaw[f.id]
      if (forced !== null && !(moving && an.row === 'walk')) target = forced
      else if (moving && step > 1e-4 && step < 0.5) target = Math.atan2(dx, dz)
      else if (an.row === 'pull' && goal) target = goal.x >= p.x ? Math.PI / 2 : -Math.PI / 2
      else if (an.row === 'sit') target = Math.atan2(cam.x - p.x, cam.z - p.z) + (f.id === 'hero' ? 0.8 : -0.8)
      else target = Math.atan2(cam.x - p.x, cam.z - p.z) * (an.row === 'idle' ? 0.6 : 0.85)
      let d = target - f.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      f.yaw += d * (dt > 0 ? Math.min(1, dt * 9) : 1)
      o.position.copy(p)
      o.rotation.y = f.yaw
      f.last.copy(p)
      const phase = (f.dist / 0.6) * Math.PI * 2
      f.fig.update(time, dt, f.walk, phase)
      // шаги по бумаге: щелчок на каждом касании ноги
      if (f.id === 'hero') {
        const n = Math.floor(phase / Math.PI)
        if (n !== this.stepCount && this.stepCount >= 0 && this.live && f.walk > 0.5 && o.visible) sfx.step()
        this.stepCount = n
      }
      if (f.id === 'hero') {
        this.focus.copy(p).add(new THREE.Vector3(0, 0.6, 0))
        this.followHeld(f.fig, f.yaw)
      }
    }
  }

  /** Предмет в руках: кружка — в правой руке, когда пьёт, остальное — перед грудью. */
  private followHeld(fig: Hero3D, yaw: number) {
    fig.raiseR += ((this.held?.raise ? 1 : 0) - fig.raiseR) * 0.2
    if (!this.held) return
    const h = this.held
    const o = h.obj
    o.visible = fig.object.visible && o.visible
    const row = this.anim.hero.row
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0))
    // зонт всегда над головой куполом вверх: перед собой он висит вниз, как юбка
    if (row === 'carry' && !h.raise) {
      // двумя руками перед собой
      fig.chest.getWorldPosition(o.position)
      // ниже груди: крупный предмет не закрывает лицо
      o.position.y -= h.height * 0.78
      o.position.add(new THREE.Vector3(0, 0, 0.12).applyQuaternion(q))
    } else {
      // в правой руке: ладонь — в точке хвата предмета (по умолчанию треть высоты от низа)
      fig.hand.R.getWorldPosition(o.position)
      const grip = h.grip ? h.grip.clone().multiplyScalar(KIT_UNIT) : new THREE.Vector3(0, h.height * 0.33, 0)
      o.position.sub(grip.applyQuaternion(q))
      // у рта предмет чуть в сторону от лица, чтобы лицо было видно
      if (row === 'drink' || row === 'shake') o.position.add(new THREE.Vector3(h.width * 0.45 + 0.06, 0, 0).applyQuaternion(q))
    }
    o.quaternion.copy(q)
  }

  /** Поставить предмет из рук на страницу перед человечком. */
  private dropHeld(e: { t: number }) {
    const held = this.held
    if (!held) return
    this.held = null
    const o = held.obj
    this.addSmall(o, e.t + 0.3)
    const from = o.position.clone()
    const to = from.clone()
    to.y = this.book.pageY
    this.tween({ t: e.t, dur: 0.25 }, (k) => o.position.lerpVectors(from, to, k * k))
  }

  /** Звук в момент t фильма — только при обычном просмотре, при перемотке молчит. */
  private soundAt(t: number, play: () => void) {
    this.tween({ t, dur: 0.001 }, () => {
      if (this.live && Math.abs(this.time - t) < 0.3) play()
    })
  }

  /** Повернуть наклейку лицом к камере (только вокруг вертикали). */
  private faceCamera(o: THREE.Object3D) {
    const c = this.px.camera.position
    o.rotation.set(0, Math.atan2(c.x - o.position.x, c.z - o.position.z), 0)
  }

  private figure(id: ActorId) {
    return this.figures.find((f) => f.id === id)!
  }

  /** Выход: человечек выбирается из щели между страницами, перепрыгивает на страницу и машет. */
  private enter3D(e: Extract<TimelineEvent, { type: 'actor_enter' }>) {
    const a = this.actor(e.actor)
    a.object.visible = true
    const side = e.actor === 'hero' ? -1 : 1
    const y = this.book.pageY
    const gap = new THREE.Vector3(0, y - 1.25, e.actor === 'hero' ? 0.35 : 0.1)
    const edge = new THREE.Vector3(side * 0.08, y, gap.z)
    const land = new THREE.Vector3(side * 0.55, y, gap.z + 0.1)
    const D = e.dur
    const at = (k: number) => e.t + k * D
    this.faceYaw[e.actor] = 0
    this.play(e.actor, 'climb', e.t, true, 0.62 * D)
    this.tween({ t: e.t, dur: 0.55 * D }, (k) => {
      // подтягивается рывками
      const pull = ease(k) + 0.04 * Math.sin(k * Math.PI * 6) * (1 - k)
      a.object.position.lerpVectors(gap, edge, pull)
    })
    this.tween({ t: at(0.55), dur: 0.2 * D }, (k) => {
      a.object.position.lerpVectors(edge, land, ease(k))
      a.object.position.y += Math.sin(k * Math.PI) * 0.18
    })
    this.tween({ t: at(0.62), dur: 0.001 }, () => this.play(e.actor, 'wave', at(0.62), true, 0.38 * D))
    this.tween({ t: at(0.999), dur: 0.001 }, () => {
      this.play(e.actor, 'idle', at(1), true)
      this.faceYaw[e.actor] = null
    })
  }

  /** Финал: человечек садится на край правой страницы лицом к камере и болтает ногами. */
  private finale3D(e: Extract<TimelineEvent, { type: 'actor_action' }>) {
    if (!ALBUM && (this.curtain.length || this.cast.size)) return this.curtainCall(e)
    const a = this.hero.object
    const from = a.position.clone()
    const x = Math.min(PAGE_W - 0.45, Math.max(0.7, from.x))
    const to = new THREE.Vector3(x, this.book.pageY, PAGE_H / 2 - 0.14)
    const walk = Math.min(1.1, Math.max(0.45, from.distanceTo(to) / 1.6))
    this.goal.hero = null
    this.play('hero', 'walk', e.t, true, walk)
    this.tween({ t: e.t, dur: walk }, (k) => a.position.lerpVectors(from, to, ease(k)))
    this.tween({ t: e.t + walk, dur: 0.001 }, () => {
      this.faceYaw.hero = 0
      this.play('hero', 'dangle', e.t + walk, true, 4)
    })
    // камера: спереди на край страницы, где он сидит (на этом отрезке хореограф камеру не ставит)
    const cam0 = this.camPos.clone()
    const look0 = this.camLook.clone()
    // есть марки дня — камера выше и шире: весь разворот, марки в ряд на дальнем краю — карта дня (план 13, § 1.5)
    const map = this.stamps > 0
    // фотоальбом дня: камера почти сверху и ровно на снимки, человечек сидит у ближнего края
    let camTo = map ? new THREE.Vector3(0.2, this.book.pageY + 5.4, 3.9) : to.clone().add(new THREE.Vector3(0.2, 0.9, 2.5))
    let lookTo = map ? new THREE.Vector3(0, this.book.pageY, 0.25) : to.clone().add(new THREE.Vector3(0, 0.3, -0.25))
    if (this.album.length) {
      const box = new THREE.Box3()
      for (const p of this.album) box.expandByPoint(p)
      box.expandByPoint(to)
      box.expandByScalar(0.55)
      const c = box.getCenter(new THREE.Vector3())
      const sz = box.getSize(new THREE.Vector3())
      const cam = this.px.camera
      const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
      const h = Math.max(sz.x / (2 * tan * Math.max(0.5, cam.aspect)), sz.z / (2 * tan)) * 1.05
      lookTo = new THREE.Vector3(c.x, this.book.pageY, c.z)
      camTo = lookTo.clone().add(new THREE.Vector3(0, h * 0.93, h * 0.38))
    }
    this.tween({ t: e.t, dur: e.dur }, (k) => {
      const a = ease(k / Math.min(1, (walk + 0.4) / e.dur))
      this.camPos.lerpVectors(cam0, camTo, a)
      this.camLook.lerpVectors(look0, lookTo, a)
    })
  }

  /**
   * Книга закрывается: человечек машет и ныряет обратно в книгу, наклейки складываются
   * в страницу, как в книжке-раскладушке, снимки уезжают обратно внутрь.
   */
  private closeBook3D(e: Extract<TimelineEvent, { type: 'book_close' }>) {
    this.dropHeld(e)
    const heroObj = this.hero.object
    const secondObj = this.second.object
    const h0 = heroObj.position.clone()
    const s0 = secondObj.position.clone()
    this.play('hero', 'wave', e.t, true, e.dur)
    this.faceYaw.hero = 0
    const items = this.spawned.filter((o) => o.visible && !(o as THREE.InstancedMesh).isInstancedMesh)
    const scales = items.map((o) => o.scale.clone())
    const pols = this.tucked.map((p) => ({ o: p.object, p0: p.object.position.clone(), q0: p.object.quaternion.clone(), p1: p.object.userData.tuckPos as THREE.Vector3, q1: p.object.userData.tuckQ as THREE.Quaternion }))
    this.tween(e, (k) => {
      // наклейки и слова складываются
      const f = 1 - ease((k - 0.05) / 0.4)
      items.forEach((o, i) => {
        o.scale.set(scales[i].x, Math.max(0.001, scales[i].y * f), scales[i].z)
        if (f <= 0.001) o.visible = false
      })
      // листья, снег и иней гаснут, когда страницы сходятся
      if (k > 0.3) this.closed = true
      // человечки ныряют в книгу
      const dive = ease((k - 0.2) / 0.3)
      heroObj.position.copy(h0).setY(h0.y - 1.3 * dive)
      secondObj.position.copy(s0).setY(s0.y - 1.3 * dive)
      if (dive >= 1) {
        heroObj.visible = false
        secondObj.visible = false
      }
      // снимки возвращаются в книгу
      const back = ease(k / 0.7)
      for (const p of pols) {
        if (!p.p1) continue
        p.o.position.lerpVectors(p.p0, p.p1, back)
        p.o.quaternion.slerpQuaternions(p.q0, p.q1, back)
      }
      this.book.setOpen(1 - ease(k))
    }, () => {
      this.closed = true
      for (const o of this.spawned) o.visible = false
      for (const p of this.polaroids) p.visible = false
    })
    this.soundAt(e.t + e.dur * 0.95, () => sfx.thump())
  }

  /**
   * Противоречие: два состояния в одном кадре. Камера на это время — у сцены:
   * сверху на человечка, чтобы видеть и центр, и края разворота.
   */
  private staging3D(e: Extract<TimelineEvent, { type: 'staging' }>) {
    const fig = this.figure('hero')
    const hero = this.hero.object.position.clone()
    const y = this.book.pageY + 0.004
    const rand = rngFrom(`${e.staging}:${e.t}`)
    const add = (o: THREE.Object3D) => {
      this.px.scene.add(o)
      this.spawned.push(o)
      return o
    }
    const lamp0 = this.room.lamp.intensity
    const lampC = this.room.lamp.color.clone()
    const rim0 = this.room.rim.intensity
    // камера: сверху на человечка, края разворота в кадре
    const cam0 = this.camPos.clone()
    const look0 = this.camLook.clone()
    const high = e.staging === 'crowd_edges_alone_center'
    const side = e.staging === 'slow_walk_bright_light'
    const camTo = hero.clone().add(side ? new THREE.Vector3(1.9, 1.35, 2.3) : new THREE.Vector3(0.25, high ? 4.4 : 3.3, high ? 3.6 : 3.2))
    const lookTo = hero.clone().add(new THREE.Vector3(0, 0.25, 0))
    const hold = e.dur + 1.2
    this.tween({ t: e.t, dur: hold }, (k) => {
      const a = ease(k / 0.25)
      this.camPos.lerpVectors(cam0, camTo, a)
      this.camLook.lerpVectors(look0, lookTo, a)
    })
    // свет держится чуть дольше самого отрезка, потом возвращается
    const fade = (k: number) => Math.min(ease(k / 0.2), 1 - ease((k - 0.75) / 0.25))

    if (e.staging === 'frost_edges_warm_center') {
      // холодно, но уютно: иней ползёт с краёв, в центре тёплое пятно лампы
      this.spawnEffect('frost', new THREE.Vector3(0, this.book.pageY, 0), e.t)
      const frost = add(frostEdges(PAGE_W * 2, PAGE_H, rand)) as THREE.Mesh
      frost.position.set(0, y, 0)
      const pool = add(warmPool(1.1)) as THREE.Mesh
      pool.position.set(hero.x, y + 0.001, hero.z)
      this.tween({ t: e.t, dur: hold + 4 }, (k) => {
        const u = k * (hold + 4)
        ;(frost.material as THREE.MeshBasicMaterial).opacity = ease(u / 1.6) * (u > hold ? 0.75 : 1)
        ;(pool.material as THREE.MeshBasicMaterial).opacity = ease(u / 0.8) * (1 - ease((u - hold) / 4))
        this.room.lamp.intensity = lamp0 * (1 + 0.5 * fade(u / hold))
        this.room.rim.intensity = rim0 + 1.1 * fade(u / hold)
        this.room.rim.color.set(PALETTE.ice)
      })
      return
    }

    if (e.staging === 'crowd_edges_alone_center') {
      // шумно, но одиноко: толпа силуэтов по краям, человечек сидит один в пустом круге света
      // толпа силуэтов читалась как рой непонятных столбиков (отзыв Эмиля 22.11) — остаётся один человечек в круге света
      const crowd = new Crowd(new THREE.Vector3(hero.x, this.book.pageY, hero.z), { x0: -PAGE_W * 0.97, x1: PAGE_W * 0.97, z0: -PAGE_H * 0.48, z1: PAGE_H * 0.48 }, rand)
      crowd.mesh.visible = false
      const pool = add(warmPool(0.85, 'rgba(236, 240, 255,')) as THREE.Mesh
      pool.position.set(hero.x, y + 0.001, hero.z)
      this.play('hero', 'sit', e.t + 0.3, false, 1.5)
      this.tween({ t: e.t, dur: hold }, (k) => {
        const u = k * hold
        crowd.update(Math.min(1, u / 1.0) * (1 - ease((u - e.dur) / 1.0)), e.t + u)
        ;(pool.material as THREE.MeshBasicMaterial).opacity = fade(k)
        this.room.lamp.intensity = lamp0 * (1 - 0.45 * fade(k))
        crowd.mesh.visible = false
      }, () => (crowd.mesh.visible = false))
      return
    }

    // устал, но доволен: медленный усталый шаг при ярком тёплом свете
    const from = hero.clone()
    const to = hero.clone().add(new THREE.Vector3(hero.x < 0 ? 0.7 : -0.7, 0, 0.15))
    const pool = add(warmPool(1.6, 'rgba(255, 214, 120,')) as THREE.Mesh
    pool.position.set((from.x + to.x) / 2, y + 0.001, hero.z)
    this.play('hero', 'walk', e.t, true, e.dur)
    this.tween(e, (k) => this.hero.object.position.lerpVectors(from, to, k), () => this.play('hero', 'idle', e.t + e.dur, true))
    this.tween({ t: e.t, dur: hold }, (k) => {
      fig.fig.tired = fade(k)
      ;(pool.material as THREE.MeshBasicMaterial).opacity = fade(k)
      this.room.lamp.intensity = lamp0 * (1 + 0.8 * fade(k))
      this.room.lamp.color.copy(lampC).lerp(new THREE.Color(PALETTE.yellow), fade(k))
    }, () => {
      fig.fig.tired = 0
      this.room.lamp.color.copy(lampC)
    })
  }

  /**
   * Книга дня встаёт на своё место на полке: взлетает со стола, разворачивается корешком
   * наружу и въезжает в ячейку; камера смотрит на полку. false — места на полке нет.
   */
  private toShelf3D(e: Extract<TimelineEvent, { type: 'to_shelf' }>): boolean {
    const spine = this.dayId ? this.world?.shelf.bookOf(this.dayId) : null
    if (!spine) return false
    spine.visible = false
    const g = this.book.group
    const center = new THREE.Box3().setFromObject(spine).getCenter(new THREE.Vector3())
    const slotQ = spine.getWorldQuaternion(new THREE.Quaternion())
    // закрытая книга: x — от корешка к обрезу, y — толщина, z — длина; на полке корешок смотрит на +z
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0))
    const q1 = slotQ.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(basis))
    const p1 = center.clone().sub(new THREE.Vector3(PAGE_W / 2, 0.2, 0).applyQuaternion(q1))
    let p0: THREE.Vector3 | null = null
    let q0: THREE.Quaternion | null = null
    const cam0 = this.camPos.clone()
    const look0 = this.camLook.clone()
    // слева от места за столом: камера не проходит через голову человека
    const camTo = center.clone().add(new THREE.Vector3(-1.5, 1.6, 9.5))
    const lookTo = center.clone().add(new THREE.Vector3(0, 1.1, 0))
    this.tween(
      e,
      (k) => {
        if (!p0) {
          this.shelving = true
          p0 = g.position.clone()
          q0 = g.quaternion.clone()
        }
        const a = ease(k)
        g.position.lerpVectors(p0, p1, a)
        g.position.y += Math.sin(a * Math.PI) * 1.6
        g.quaternion.slerpQuaternions(q0!, q1, ease(k * 1.4))
        this.camPos.lerpVectors(cam0, camTo, ease(k * 1.3))
        this.camLook.lerpVectors(look0, lookTo, ease(k * 1.3))
      },
      () => {
        g.visible = false
        spine.visible = true
        this.soundAt(e.t + e.dur, () => sfx.thump())
      },
    )
    return true
  }

  /** Заранее растрировать картинки-предметы дня, чтобы к своему биту они были готовы. */
  preload(timeline: Timeline, dayText?: string) {
    void prepareSticker('crystal')
    // сценки прошлого дня с той же цитатой не должны попасть в этот (кэш на диске их вернёт, если день тот же)
    if (this.sceneProvider) forgetScenes()
    this.beatWin = beatWindows(timeline)
    this.hasContract = !!timeline.beats?.length
    this.beatTod = new Map((timeline.beats ?? []).filter((b) => b.time_of_day).map((b) => [b.beat, b.time_of_day]))
    this.photoBeats = new Map()
    for (const b of timeline.beats ?? []) {
      const x = b as typeof b & { photo?: number | null; photo_card?: PhotoCard | null }
      if (typeof x.photo === 'number') this.photoBeats.set(b.beat, { photo: x.photo, card: x.photo_card ?? null })
    }
    this.companionBeats = new Set(timeline.events.filter((e) => e.type === 'companion_enter').map((e) => e.beat))
    this.planRoute(timeline, dayText ?? this.bookText)
    // текст ЭТОГО дня (bookText ещё прошлый: prepare идёт после preload)
    const day = (dayText ?? this.bookText).trim().slice(0, 600)
    if (this.sceneProvider && timeline.beats?.length) {
      // контракт плана 13: главный предмет, место и человек бита идут сценографу; первый бит — быстрый путь
      for (const r of sceneRequests(timeline, day)) this.sceneProvider.request(r)
    }
    for (const e of timeline.events) {
      if (e.type !== 'word_transform') continue
      if (this.sceneProvider && !timeline.beats?.length && e.result.kind !== 'effect' && e.result.kind !== 'person') {
        const r = e.result as { id?: string; name?: string }
        this.sceneProvider.request({ quote: e.quote, day, hint: r.name ?? r.id })
      }
      const r = e.result as { kind: string; id?: string; name?: string; hint?: string; tags?: string[] }
      if (r.kind === 'make' && r.id && !this.made.has(r.id)) {
        // дорисовка идёт, пока открывается книга; не успеет к биту — встанет похожий предмет
        const key = r.id
        void makeKit({ name: r.name ?? '', hint: r.hint ?? '', tags: r.tags ?? [] }).then((res) => {
          this.made.set(key, res.model)
          return prepareSticker(res.model.id)
        })
        continue
      }
      const pic = this.pictureForResult(e.result, e.quote)
      if (pic) void prepareSticker(pic.id)
    }
  }

  /** Картинка для результата бита: по id, дорисованная, по слову из цитаты. */
  private pictureForResult(result: BeatResult, quote: string): KitPicture | null {
    if (result.kind === 'effect' || result.kind === 'person') return null
    const r = result as { kind: string; id?: string }
    if (r.kind === 'make') return (r.id && this.made.get(r.id)) || null
    const byId = r.id ? pictureFor(r.id) : null
    if (byId) return byId
    for (const w of quote.split(/\s+/)) {
      const m = findByWord(w)
      const p = m && pictureFor(m.id)
      if (p) return p
    }
    return null
  }

  /** Рост предмета в мире: как у объёмной модели с тем же id, иначе по тому, как его держат. */
  private heightFor(id: string, hold: string): number {
    let h = this.heights.get(id)
    if (h === undefined) {
      const k = kitById(id)
      const units = k && k.parts.length ? kitBounds(k).max.y : hold === 'hand' ? 9 : hold === 'both' ? 14 : 36
      h = Math.max(4, units) * KIT_UNIT
      this.heights.set(id, h)
    }
    return h
  }

  /**
   * Снимки закладываются в книгу: в фильме они спрятаны под правой страницей,
   * у дальнего края торчат только белые нижние поля.
   */
  private tuckPhotos() {
    // первое фото дня — ещё и в рамке на столе (если рамка выпала дню)
    this.world?.setPhoto((this.photoImages[0] as TexImageSource | undefined) ?? null)
    for (const p of this.polaroids) p.visible = false
    for (const p of this.tucked) this.book.group.remove(p.object)
    this.tucked = this.photoImages.map((img, i) => {
      const pol = new Polaroid(img as HTMLCanvasElement, i === 0 ? 1.5 : 1.1)
      const o = pol.object
      // лицом вверх, нижнее поле к дальнему краю страницы
      o.rotation.set(-Math.PI / 2, 0, Math.PI)
      const out = i === 0 ? 0.2 : 0.09
      const x = i === 0 ? PAGE_W * 0.5 : PAGE_W * (0.12 + 0.2 * i)
      o.position.set(x, this.book.surfaceY - 0.045 - i * 0.004, -PAGE_H / 2 - out + pol.height / 2)
      if (i > 0) o.rotation.z += (i % 2 ? 0.12 : -0.1)
      pol.setDevelop(0)
      o.userData.tuckPos = o.position.clone()
      o.userData.tuckQ = o.quaternion.clone()
      this.book.group.add(o)
      return pol
    })
  }

  /** Человечек вытягивает снимок из книги, тот встаёт задником и проявляется; камера — у сцены. */
  private photoReveal(e: Extract<TimelineEvent, { type: 'photo_reveal' }>) {
    const pol = this.tucked[e.photo]
    if (!pol || !this.figures.length) return
    const spot = this.route.get(e.beat)
    if (spot) return this.photoRevealAtSpot(e, pol, spot)
    const o = pol.object
    const D = e.dur
    const zFar = -PAGE_H / 2
    const px = o.position.x
    const y = this.book.pageY
    const heroObj = this.hero.object
    const startHero = heroObj.position.clone()
    const pullAt = new THREE.Vector3(px - 0.05, y, zFar + 0.42)
    const sitAt = new THREE.Vector3(px + 0.05, y, zFar + 1.05)
    const tuckedPos = o.position.clone()
    const tuckedQ = o.quaternion.clone()
    const outPos = new THREE.Vector3(px, tuckedPos.y, zFar - 0.06 - pol.height / 2)
    const standPos = new THREE.Vector3(px, pol.height / 2 - this.book.group.position.y, zFar - 0.16)
    const standQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0))
    const at = (a: number) => e.t + a * D
    // человечек: поставить кружку, подойти, тянуть, отойти, встряхнуть, сесть смотреть
    this.dropHeld(e)
    this.goal.hero = null
    this.tween({ t: at(0), dur: 0.14 * D }, (k) => heroObj.position.lerpVectors(startHero, pullAt, ease(k)))
    this.play('hero', 'walk', at(0), true, 0.14 * D)
    this.tween({ t: at(0.14), dur: 0.001 }, () => {
      this.faceYaw.hero = Math.PI
      this.play('hero', 'pull', at(0.14), true, 0.36 * D)
    })
    this.tween({ t: at(0.5), dur: 0.1 * D }, (k) => heroObj.position.lerpVectors(pullAt, sitAt.clone().setZ(zFar + 0.62), ease(k)))
    this.tween({ t: at(0.5), dur: 0.001 }, () => this.play('hero', 'cheer', at(0.5), true, 0.1 * D))
    this.tween({ t: at(0.6), dur: 0.001 }, () => this.play('hero', 'shake', at(0.6), true, 0.14 * D))
    this.tween({ t: at(0.74), dur: 0.08 * D }, (k) => heroObj.position.lerpVectors(sitAt.clone().setZ(zFar + 0.62), sitAt, ease(k)))
    this.tween({ t: at(0.74), dur: 0.001 }, () => this.play('hero', 'walk', at(0.74), true, 0.08 * D))
    this.tween({ t: at(0.82), dur: 0.001 }, () => this.play('hero', 'sit', at(0.82), false, 0.18 * D))
    this.tween({ t: at(0.999), dur: 0.001 }, () => (this.faceYaw.hero = null))
    // снимок: выезжает рывками в такт рывкам человечка, встаёт, его трясут, он проявляется
    this.tween({ t: at(0.14), dur: 0.36 * D }, (u) => {
      const v = clamp01((u - 0.2) / 0.64) * 3
      const step = Math.min(3, Math.floor(v) + ease(Math.min(1, (v % 1) * 2)))
      o.position.lerpVectors(tuckedPos, outPos, step / 3)
    })
    this.tween({ t: at(0.5), dur: 0.1 * D }, (k) => {
      const a = ease(k)
      o.quaternion.slerpQuaternions(tuckedQ, standQ, a)
      o.position.lerpVectors(outPos, standPos, a)
      o.position.y += Math.sin(a * Math.PI) * 0.35
    })
    this.tween({ t: at(0.6), dur: 0.14 * D }, (k) => {
      const w = Math.sin(k * Math.PI * 9) * (1 - k)
      o.quaternion.copy(standQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(w * 0.05, 0, w * 0.07)))
    })
    this.tween({ t: at(0.6), dur: 0.32 * D }, (k) => pol.setDevelop(ease(k)))
    for (const v of [0.2, 0.413, 0.627]) this.soundAt(at(0.14) + v * 0.36 * D, () => sfx.slide(0.3))
    this.soundAt(at(0.6), () => sfx.shake(7, 0.13))
    this.soundAt(at(0.9), () => sfx.chime())
    // камера: сбоку на рывки, отъезд на вставший снимок, через плечо — въезд в снимок
    const cam0 = this.camPos.clone()
    const look0 = this.camLook.clone()
    const sideP = new THREE.Vector3(px + 2.3, y + 1.3, zFar + 2.5)
    const sideL = new THREE.Vector3(px - 0.2, y + 0.45, zFar + 0.1)
    const backP = new THREE.Vector3(px + 0.9, y + 1.6, zFar + 4.2)
    const backL = new THREE.Vector3(px, y + 0.7, zFar - 0.2)
    const photoC = new THREE.Vector3(px, standPos.y + 0.15, standPos.z)
    const shoulder0 = sitAt.clone().add(new THREE.Vector3(1.0, 1.7, 3.1))
    const shoulder1 = sitAt.clone().add(new THREE.Vector3(0.7, 1.4, 2.3))
    this.tween(e, (k) => {
      if (k < 0.5) {
        const a = ease(k / 0.12)
        this.camPos.lerpVectors(cam0, sideP, a)
        this.camLook.lerpVectors(look0, sideL, a)
      } else if (k < 0.8) {
        const a = ease((k - 0.5) / 0.15)
        this.camPos.lerpVectors(sideP, backP, a)
        this.camLook.lerpVectors(sideL, backL, a)
      } else {
        const a = ease((k - 0.8) / 0.2)
        this.camPos.lerpVectors(shoulder0, shoulder1, a)
        this.camLook.lerpVectors(sitAt.clone().add(new THREE.Vector3(0, 0.6, -0.4)), photoC, ease((k - 0.8) / 0.12))
      }
    })
  }

  /**
   * Снимок на пути дня (план 15): человечек пришёл на место бита, снимок вылетает из книги и ложится за ним,
   * человечек тянет его — снимок встаёт задником рывками, его трясут, он проявляется, из него оживёт сценка.
   */
  private photoRevealAtSpot(e: Extract<TimelineEvent, { type: 'photo_reveal' }>, pol: Polaroid, spot: THREE.Vector3) {
    const o = pol.object
    const D = e.dur
    const y = this.book.pageY
    const at = (a: number) => e.t + a * D
    const gy = this.book.group.position.y
    const tuckedPos = o.position.clone()
    const tuckedQ = o.quaternion.clone()
    // локальные координаты группы книги (раскрытая книга стоит в начале координат по x и z)
    const flatPos = new THREE.Vector3(spot.x, this.book.surfaceY + 0.02 - gy, spot.z - 0.62)
    const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI))
    const standPos = new THREE.Vector3(spot.x, pol.height / 2 - gy + 0.02, spot.z - 0.62)
    const standQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0))
    const heroObj = this.hero.object
    this.dropHeld(e)
    this.goal.hero = null
    // снимок вылетает из книги и ложится за человечком
    this.tween({ t: at(0), dur: 0.16 * D }, (k) => {
      const a = ease(k)
      o.position.lerpVectors(tuckedPos, flatPos, a)
      o.position.y += Math.sin(a * Math.PI) * 0.7
      o.quaternion.slerpQuaternions(tuckedQ, flatQ, a)
    })
    this.soundAt(at(0), () => sfx.slide(0.4))
    // человечек поворачивается и тянет: снимок встаёт тремя рывками
    this.tween({ t: at(0.12), dur: 0.001 }, () => {
      heroObj.position.copy(spot)
      this.faceYaw.hero = Math.PI
      this.play('hero', 'pull', at(0.12), true, 0.4 * D)
    })
    this.tween({ t: at(0.18), dur: 0.36 * D }, (u) => {
      const v = clamp01((u - 0.1) / 0.8) * 3
      const step = Math.min(3, Math.floor(v) + ease(Math.min(1, (v % 1) * 2)))
      const a = step / 3
      o.quaternion.slerpQuaternions(flatQ, standQ, a)
      o.position.lerpVectors(flatPos, standPos, a)
    })
    for (const v of [0.2, 0.47, 0.73]) this.soundAt(at(0.18) + v * 0.36 * D, () => sfx.slide(0.3))
    this.tween({ t: at(0.58), dur: 0.14 * D }, (k) => {
      const w = Math.sin(k * Math.PI * 9) * (1 - k)
      o.quaternion.copy(standQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(w * 0.05, 0, w * 0.07)))
    })
    this.tween({ t: at(0.58), dur: 0.001 }, () => this.play('hero', 'shake', at(0.58), true, 0.14 * D))
    this.tween({ t: at(0.58), dur: 0.32 * D }, (k) => pol.setDevelop(ease(k)))
    this.soundAt(at(0.58), () => sfx.shake(7, 0.13))
    // проявился — человечек оборачивается к зрителю и радуется
    this.tween({ t: at(0.78), dur: 0.001 }, () => {
      this.faceYaw.hero = null
      this.play('hero', 'cheer', at(0.78), true, 0.2 * D)
    })
    this.soundAt(at(0.9), () => sfx.chime())
    // камера спереди: человечек и снимок за ним в одном кадре
    const cam0 = this.camPos.clone()
    const look0 = this.camLook.clone()
    const sd = this.standDir.get(e.beat) ?? 1
    const look = new THREE.Vector3(spot.x, y + 0.62, spot.z - 0.3)
    const pos = look.clone().add(new THREE.Vector3(-sd * 0.9, 1.25, 3.3))
    this.tween(e, (k) => {
      const a = ease(clamp01(k / 0.25))
      this.camPos.lerpVectors(cam0, pos, a)
      this.camLook.lerpVectors(look0, look, a)
      // медленный наезд на проявляющийся снимок
      if (k > 0.25) this.camPos.lerp(look, 0.12 * ease((k - 0.25) / 0.75))
    })
  }

  /** Остальные снимки выезжают из книги веером, встают задником и проявляются быстрее. */
  private photoFan(e: Extract<TimelineEvent, { type: 'photo_fan' }>) {
    const xs = [-0.85, 3.15, -2.45, 4.45]
    const zFar = -PAGE_H / 2
    // снимки без своей фразы (контракт плана 14: photos); у старых таймлайнов — все начиная с from
    const list = (e as { photos?: number[] }).photos
    const fan = list ? list.map((i) => this.tucked[i]).filter((p): p is Polaroid => !!p) : this.tucked.slice(e.from)
    fan.forEach((pol, j) => {
      const o = pol.object
      const t0 = e.t + j * 0.35
      const p0 = o.position.clone()
      const q0 = o.quaternion.clone()
      const x = xs[j % xs.length]
      const p1 = new THREE.Vector3(x, pol.height / 2 - this.book.group.position.y, zFar - 0.25 - (j % 2) * 0.12)
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, -x * 0.05, (j % 2 ? 1 : -1) * 0.04))
      this.tween({ t: t0, dur: 0.9 }, (k) => {
        const a = ease(k)
        o.position.lerpVectors(p0, p1, a)
        o.position.y += Math.sin(a * Math.PI) * 0.4
        o.quaternion.slerpQuaternions(q0, q1, a)
      })
      this.tween({ t: t0 + 0.5, dur: 1.2 }, (k) => pol.setDevelop(ease(k)))
      this.soundAt(t0, () => sfx.slide(0.35))
    })
  }

  /** Предмет для результата бита: из библиотеки по id, по слову, иначе кристалл. */
  private kitFor(result: BeatResult, quote: string): KitModel | null {
    if (result.kind === 'effect' || result.kind === 'person') return null
    const id = (result as { id?: string }).id
    const m = (id && kitById(id)) || quote.split(/\s+/).map((w) => findByWord(w)).find(Boolean) || null
    // у предметов, которые есть только картинкой, объёмных фигур нет — тогда объёмный кристалл
    return m && m.parts.length ? m : CRYSTAL
  }

  /** Слово отклеивается от страницы настоящими чернилами и летит человечку в руки. */
  private wordLift3D(e: Extract<TimelineEvent, { type: 'word_lift' }>) {
    const boxes = this.book.wordsForQuote(e.quote)
    if (!boxes.length) return
    const canvas = this.book.wordCanvas(boxes)
    const rect = this.book.wordCanvasRect(boxes, canvas)
    if (!rect) return
    this.book.hideWords(boxes)
    const word = inkWord(canvas, rect.w, rect.h)
    const start = this.book.group.localToWorld(rect.center.clone())
    start.y += 0.004
    word.position.copy(start)
    word.rotation.set(-Math.PI / 2, 0, 0)
    this.px.scene.add(word)
    this.spawned.push(word)
    this.inkWords.set(e.quote, word)
    this.play('hero', 'carry', e.t, true, e.dur)
    this.soundAt(e.t, () => sfx.peel(Math.min(0.6, e.dur)))
    const fig = this.figure('hero').fig
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    const up = new THREE.Quaternion()
    const target = new THREE.Vector3()
    const fit = Math.min(1, 0.62 / rect.w)
    return this.tween(e, (k) => {
      fig.chest.getWorldPosition(target)
      const peel = ease(clamp01(k / 0.45))
      const fly = ease(clamp01((k - 0.3) / 0.7))
      word.position.lerpVectors(start, target, fly)
      word.position.y += Math.sin(peel * Math.PI) * 0.18 * (1 - fly)
      const cam = this.px.camera.position
      up.setFromEuler(new THREE.Euler(0, Math.atan2(cam.x - word.position.x, cam.z - word.position.z), 0))
      word.quaternion.slerpQuaternions(flat, up, peel)
      // тянется, как резинка, и уменьшается до размера в руках
      const s = 1 + (fit - 1) * fly
      word.scale.set(s * (1 + 0.28 * Math.sin(peel * Math.PI)), s * (1 - 0.1 * Math.sin(peel * Math.PI)), 1)
    })
  }

  /** Буквы рассыпаются на пиксельные кубики, кубики собираются в предмет. */
  private wordTransform3D(e: Extract<TimelineEvent, { type: 'word_transform' }>): void {
    const kind = e.result.kind
    this.beatLight(e.beat, e.t)
    // по контракту плана 13 сценка есть у каждого бита (у дождя — зонт); раньше — только у предметов
    const scene = this.hasContract || (kind !== 'effect' && kind !== 'person' && kind !== 'crystal') ? this.sceneProvider?.get(e.quote) ?? null : null
    if (scene && scene.objects.length) {
      // погода бита идёт поверх сценки: дождь над зонтом, снег над санками
      if (kind === 'effect') this.spawnEffect((e.result as { id: string }).id, this.hero.object.position.clone(), e.t + e.dur / 2)
      return this.sceneTransform(e, scene)
    }
    // без сценки (человек, эффект, кристалл) бит всё равно получает крупный кадр с цитатой
    this.beatCamOnly(e)
    const word = this.inkWords.get(e.quote) ?? null
    const rand = rngFrom(`${e.quote}:${e.t}`)
    const model = this.kitFor(e.result, e.quote)
    const fig = this.figure('hero').fig
    // откуда летят кубики: из букв слова (или от груди, если слова нет на странице)
    let from: THREE.Vector3[]
    if (word) {
      word.updateMatrixWorld(true)
      const g = word.geometry as THREE.PlaneGeometry
      from = letterPoints(word.userData.canvas, g.parameters.width, g.parameters.height).map((v) => new THREE.Vector3(v.x, v.y, 0).applyMatrix4(word.matrixWorld))
    } else {
      const c = fig.chest.getWorldPosition(new THREE.Vector3())
      from = Array.from({ length: 60 }, () => c.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.3)))
    }
    if (!from.length) from = [fig.chest.getWorldPosition(new THREE.Vector3())]

    let to: { p: THREE.Vector3; c: PaletteName | THREE.Color }[]
    let obj: THREE.Object3D | null = null
    // картинка: из библиотеки, дорисованная или кристалл, если не успела
    // решение 21.11: предметы в фильме объёмные (сценки и 3D-библиотека), наклейки — только если включены
    let pic = USE_STICKERS ? this.pictureForResult(e.result, e.quote) : null
    if (!pic && model && (e.result as { kind: string }).kind === 'make') pic = pictureFor('crystal')
    if (pic && !stickerCanvas(pic.id)) pic = stickerCanvas('crystal') ? pictureFor('crystal') : null
    const art = pic ? stickerCanvas(pic.id) : null
    if (pic && art) {
      // картинка-наклейка: кубики прилетают в её пиксели
      const height = this.heightFor(pic.id, pic.hold)
      const st = new Sticker(art, height)
      obj = st.object
      if (pic.hold === 'ground') {
        const at = this.quotePos(e.quote) ?? fig.object.position
        obj.position.set(at.x + 0.5, this.book.pageY, at.z - 0.3)
        this.facing.push(obj)
      } else {
        fig.chest.getWorldPosition(obj.position)
        obj.position.y -= height / 2
        this.held = { obj, height, width: height * 0.6, grip: null }
        // в руках тень от самого человечка закрывала бы картинку
        st.mesh.receiveShadow = false
      }
      obj.visible = false
      this.px.scene.add(obj)
      this.spawned.push(obj)
      this.faceCamera(obj)
      to = st.points(from.length, rand)
      // пар над кружкой, искры у подарка — над верхним краем картинки
      for (const fx of pic.fx ?? []) {
        const kind = fx.kind === 'steam' || fx.kind === 'smoke' ? 'steam' : fx.kind === 'sparkle' || fx.kind === 'glow' ? 'sparkles' : null
        if (!kind) continue
        const anchor = new THREE.Object3D()
        anchor.position.set(0, height * 0.92, 0)
        obj.add(anchor)
        this.spawnEffect(kind, anchor, e.t + e.dur * 0.85)
      }
    } else if (model) {
      obj = buildKit(model, toonFor)
      toPixelLayer(obj)
      const height = (kitBounds(model).max.y || 10) * KIT_UNIT
      if (model.hold === 'ground') {
        const at = this.quotePos(e.quote) ?? fig.object.position
        obj.position.set(at.x + 0.5, this.book.pageY, at.z - 0.3)
        obj.rotation.y = (rand() - 0.5) * 0.5
      } else {
        fig.chest.getWorldPosition(obj.position)
        obj.position.y -= height / 2
        this.held = { obj, height, width: height * 0.6, grip: null }
      }
      obj.visible = false
      this.px.scene.add(obj)
      this.spawned.push(obj)
      to = objectPoints(obj, from.length, rand)
      // живые подсказки предмета: пар над кружкой, искры у подарка
      for (const fx of model.fx ?? []) {
        const kind = fx.kind === 'steam' || fx.kind === 'smoke' ? 'steam' : fx.kind === 'sparkle' || fx.kind === 'glow' ? 'sparkles' : null
        if (!kind) continue
        const anchor = new THREE.Object3D()
        anchor.position.set(...(fx.at ?? [0, 10, 0]))
        obj.children[0].add(anchor)
        this.spawnEffect(kind, anchor, e.t + e.dur * 0.85)
      }
    } else {
      // эффект или второй человечек: кубики разлетаются и гаснут
      const colors: PaletteName[] =
        e.result.kind === 'person' ? ['ochre', 'green', 'skin'] : ({ leaves: ['amber', 'ochre', 'brick'], snow: ['white', 'frost'], rain: ['greyBlue', 'ice'], steam: ['white', 'cream'], frost: ['ice', 'frost'], sparkles: ['yellow', 'amber'] } as Record<string, PaletteName[]>)[e.result.id] ?? ['yellow']
      const c = from[0].clone()
      to = from.map((p) => ({ p: p.clone().add(new THREE.Vector3(rand() - 0.5, rand() * 0.8, rand() - 0.5).multiplyScalar(1.4)), c: colors[Math.floor(rand() * colors.length)] }))
      if (e.result.kind === 'effect') this.spawnEffect(e.result.id, c, e.t + e.dur / 2)
    }
    this.soundAt(e.t, () => sfx.cubes(e.dur * 0.7))
    // вещь на столе отзывается на слово: будильник звенит на «часах», телефон вибрирует, домбра звучит
    const deskEcho = DESK_ECHO[(e.result as { id?: string }).id ?? '']
    if (deskEcho && this.world) this.soundAt(e.t + e.dur * 0.75, () => void this.world!.set.trigger(deskEcho))
    if (obj) this.soundAt(e.t + e.dur * 0.72, () => sfx.pop())
    if (e.result.kind === 'effect' && (e.result.id === 'sparkles' || e.result.id === 'snow')) this.soundAt(e.t + e.dur * 0.5, () => sfx.sparkle())
    const swarm = new CubeSwarm(from, to, 1.4 * KIT_UNIT, rand)
    this.px.scene.add(swarm.mesh)
    this.spawned.push(swarm.mesh)
    return this.tween(
      e,
      (k) => {
        if (word) {
          word.visible = k < 0.1
          word.rotation.z = Math.sin(k * 90) * 0.06
        }
        swarm.update(k)
        if (obj) {
          const pop = ease(clamp01((k - 0.7) / 0.3))
          obj.visible = k > 0.7
          obj.scale.setScalar(k > 0.7 ? 0.85 + 0.15 * pop + 0.1 * Math.sin(pop * Math.PI) : 0.001)
        }
      },
      () => (swarm.mesh.visible = false),
    )
  }

  /**
   * Сценка: буквы рассыпаются на кубики и собираются в несколько предметов сразу —
   * декорация встаёт за человечком, деталь рядом, предмет прыгает в руку. Поза — из сценки.
   */
  private sceneTransform(e: Extract<TimelineEvent, { type: 'word_transform' }>, scene: KitScene): void {
    const word = this.inkWords.get(e.quote) ?? null
    const rand = rngFrom(`${e.quote}:${e.t}:scene`)
    const fig = this.figure('hero').fig
    // на пути дня сценка строится в точке бита, даже если человечек ещё подходит к ней
    const H = this.route.get(e.beat)?.clone() ?? this.hero.object.position.clone()
    const y = this.book.pageY
    // откуда летят кубики
    let from: THREE.Vector3[] = []
    if (word) {
      word.updateMatrixWorld(true)
      const g = word.geometry as THREE.PlaneGeometry
      from = letterPoints(word.userData.canvas, g.parameters.width, g.parameters.height).map((v) => new THREE.Vector3(v.x, v.y, 0).applyMatrix4(word.matrixWorld))
    }
    // фраза со снимком: фото оживает — кубики вылетают из самого полароида (план 14, вариант А)
    const pb = this.photoBeats.get(e.beat)
    if (pb) {
      const pts = this.photoPoints(pb.photo, 110, rand)
      if (pts.length) from = pts
      // снимок «вздыхает»: проявляется до конца и чуть подаётся вперёд, когда из него выходит сценка
      const pol = this.tucked[pb.photo]
      if (pol) {
        const s0 = pol.object.scale.x
        this.tween({ t: e.t - 0.15, dur: 0.7 }, (k) => {
          pol.setDevelop(1)
          pol.object.scale.setScalar(s0 * (1 + 0.07 * Math.sin(clamp01(k) * Math.PI)))
        })
        this.soundAt(e.t, () => sfx.sparkle())
      }
    }
    if (from.length < 20) {
      const c = fig.chest.getWorldPosition(new THREE.Vector3())
      from = from.concat(Array.from({ length: 60 }, () => c.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.3))))
    }
    // каждый бит — на чистой странице: прошлые сценки уже ушли в марки
    const ROLE_H = SCENE_ROLE_H
    this.footprints = []
    this.stands.clear()
    const placed: { obj: THREE.Object3D; role: SceneObject['role']; appear: number }[] = []
    let hasHand = false
    // главный предмет есть в руках — детали не нужны; нет — первая деталь и есть главный предмет (кучка листьев)
    const handGiven = scene.objects.some((o) => o.role === 'hand' && (o.ref || o.model))
    let promoted = false
    let skyAct: HeroAction | null = null
    let groundAct: HeroAction | null = null
    // главный предмет идёт раньше места: так место-двойник отсеется
    const usedIds = new Set<string>()
    const objects = [...scene.objects].sort((a, b) => (a.role === 'stand' ? 1 : 0) - (b.role === 'stand' ? 1 : 0))
    for (const so0 of objects.slice(0, 3)) {
      // мелкие детали мельчат кадр — в сценке только главный предмет и место (план 13, § 2 ②)
      if (so0.role === 'detail' && (handGiven || promoted)) continue
      let hero = so0.role === 'detail'
      if (hero) promoted = true
      // главная деталь стоит перед человечком на бумаге, крупно, со стороны камеры
      let so: SceneObject = hero ? { ...so0, side: e.beat % 2 ? 'right' : 'left' } : so0
      // только объёмные предметы: у некоторых id есть двойник-картинка без фигур
      const lib = so.ref ? sceneRef(so.ref) ?? kitById(so.ref) : undefined
      const model = lib && lib.parts.length ? lib : so.model
      if (!model || !model.parts?.length) continue
      // большая вещь, которая стоит на земле (фонарь, ёлка), в руках выходит крошечной — ставим её рядом местом
      if (so.role === 'hand' && model.hold === 'ground' && !SKY_IDS.has(model.id)) {
        if (kitBounds(model).getSize(new THREE.Vector3()).y > 24) so = { ...so, role: 'stand' }
        else {
          // небольшая вещь «на земле» (сугроб, поезд, рюкзак) в руках — непонятный ком: ставим её на бумагу перед человечком
          so = { ...so, role: 'detail', side: e.beat % 2 ? 'right' : 'left' }
          hero = true
          promoted = true
        }
        groundAct = 'wave'
      }
      if (so.role === 'hand' && hasHand) continue
      // то же место дня уже стоит (весь день за рабочим столом) — второй стол не строим
      const standKey = so.ref ?? so.ru
      if (so.role === 'stand' && this.stands.has(standKey)) continue
      // место — тот же предмет, что и главный (снеговик и в руках, и сзади) — второй раз не ставим
      if (so.role === 'stand' && usedIds.has(model.id)) continue
      usedIds.add(model.id)
      const obj = buildKit(model, toonFor)
      toPixelLayer(obj)
      // размер по роли: предмет в руке не больше головы, декорация не меньше человечка наполовину
      const box = kitBounds(model)
      const size = box.getSize(new THREE.Vector3())
      // у рта кружка поменьше, иначе закрывает лицо; в руках перед собой — крупно
      const [lo, hi] = hero ? [14, 18] : so.role === 'hand' && scene.action === 'drink' ? [12, 15] : ROLE_H[so.role]
      // плоское место (озеро, бассейн, ковёр) меряем шириной, а не высотой — иначе его раздует во всю страницу
      const flat = size.y < 0.45 * Math.max(size.x, size.z)
      const span = flat ? Math.max(size.x, size.z) : size.y
      // высокое и тонкое место (фонарь, дерево) выше человечка, иначе тонкий столбик не читается
      const thin = so.role === 'stand' && size.y > 2.2 * Math.max(size.x, size.z)
      // плоское место (озеро, сугроб) — не шире полутора человечков, иначе за спиной встаёт белый ком на всю страницу
      const [flo, fhi] = flat ? (so.role === 'stand' ? [32, 44] : [18, 26]) : thin ? [46, 58] : [lo, hi]
      const k = span > fhi ? fhi / span : span < flo ? flo / span : 1
      obj.scale.setScalar(k)
      const hgt = size.y * k * KIT_UNIT
      const wid = Math.max(size.x, size.z) * k * KIT_UNIT
      // погоду в руках не узнают (ревизия mb-assets): туча, луна, солнце висят над человечком
      const sky = so.role === 'hand' && SKY_IDS.has(model.id)
      if (sky) {
        hasHand = true
        const s = SKY_SCALE / Math.max(size.y, size.x) / k
        obj.scale.multiplyScalar(Math.max(1, s))
        obj.position.set(H.x + (e.beat % 2 ? -0.32 : 0.32), y + 1.3, H.z - 0.05)
        skyAct = SKY_ACT[model.id] ?? 'idle'
        // луна без неба — «жёлтый банан»: за ней круг ночного неба с парой звёзд
        if (model.id === 'moon') obj.add(nightPatch(Math.max(size.x, size.y) * 0.78, box.getCenter(new THREE.Vector3())))
      } else if (so.role === 'hand') {
        hasHand = true
        const grip = (model as { grip?: [number, number, number] }).grip
        // зонт держат над головой
        this.held = { obj, height: hgt, width: wid, grip: grip ? new THREE.Vector3(...grip).multiplyScalar(k) : null, raise: model.id === 'umbrella' }
        fig.chest.getWorldPosition(obj.position)
      } else {
        // место — всегда сбоку от человечка, со стороны, противоположной камере бита:
        // за спиной оно сливается с ним в одно пятно (план 13, § 4.1)
        const sd = this.standDir.get(e.beat)
        const side = so.role === 'stand' ? (sd ? (sd < 0 ? 'left' : 'right') : e.beat % 2 ? 'left' : 'right') : so.side ?? (rand() < 0.5 ? 'right' : 'left')
        const dx = side === 'left' ? -1 : side === 'right' ? 1 : 0
        const dz = side === 'back' ? -1 : side === 'front' ? 1 : 0
        const gap = so.role === 'stand' ? 0.42 : 0.3
        const at = new THREE.Vector3(H.x + dx * (gap + wid / 2), y, H.z + dz * (gap + (size.z * k * KIT_UNIT) / 2))
        if (so.role === 'stand') at.z -= 0.2
        if (hero) at.z += 0.22
        this.placeFree(at, wid, size.z * k * KIT_UNIT)
        obj.position.copy(at)
        // декорация повёрнута к камере лицом, деталь — чуть наискосок
        const cam = this.px.camera.position
        obj.rotation.y = Math.atan2(cam.x - at.x, cam.z - at.z) * (so.role === 'stand' ? 0.6 : 0.3) + (rand() - 0.5) * 0.2
      }
      obj.visible = false
      this.px.scene.add(obj)
      this.spawned.push(obj)
      if (so.role === 'stand') this.stands.set(standKey, obj)
      // сначала главный предмет в руках (самый громкий «чпок»), потом место: взгляд идёт за порядком
      placed.push({ obj, role: so.role, appear: so.role === 'hand' || hero ? 0.45 : 0.62 })
      // живые подсказки предмета
      for (const fx of model.fx ?? []) {
        const kind = fx.kind === 'steam' || fx.kind === 'smoke' ? 'steam' : fx.kind === 'sparkle' || fx.kind === 'glow' ? 'sparkles' : null
        if (!kind) continue
        const anchor = new THREE.Object3D()
        anchor.position.set(...(fx.at ?? [0, 10, 0]))
        obj.children[0].add(anchor)
        this.spawnEffect(kind, anchor, e.t + e.dur * 0.85)
      }
    }
    if (!placed.length) {
      // сценка пустая (предметы не собрались) — обычный путь: один предмет
      return this.wordTransform3D({ ...e, result: { kind: 'crystal', id: 'crystal' } })
    }
    // предмет-погода ушёл в небо — поза с пустыми руками (радуется солнцу, мёрзнет под тучей)
    const emptyAct = skyAct ?? (this.held ? null : groundAct)
    let act: HeroAction = emptyAct && ['drink', 'carry', 'shake'].includes(scene.action) ? emptyAct : (scene.action as HeroAction)
    // с предметом в руках просто стоять нельзя — его не видно у бедра: лёгкое машут над головой, крупное держат перед собой
    const held = this.held
    if (act === 'idle' && held && placed.some((p) => p.obj === held.obj)) act = held.height < 0.6 ? 'shake' : 'carry'
    this.sceneActs.set(e.beat, act as HeroAction)
    // в бите со снимком хореограф позу не шлёт (человечек уже у снимка) — встаёт и делает позу сценки сам
    if (pb) {
      const t1 = e.t + e.dur * 0.75
      this.tween({ t: t1, dur: 0.001 }, () => {
        this.faceYaw.hero = null
        this.play('hero', act as HeroRow, t1, act !== 'sit', 2.5)
      })
    }
    // кубики делятся между предметами по их величине
    placed.forEach((p) => p.obj.updateMatrixWorld(true))
    const to: { p: THREE.Vector3; c: PaletteName | THREE.Color }[] = []
    const weights = placed.map((p) => (p.role === 'stand' ? 3 : p.role === 'detail' ? 1 : 1.5))
    const wsum = weights.reduce((a, b) => a + b, 0)
    placed.forEach((p, i) => {
      const n = Math.max(8, Math.round((from.length * weights[i]) / wsum))
      to.push(...objectPoints(p.obj, n, rand))
    })
    while (from.length < to.length) from.push(from[Math.floor(rand() * from.length)].clone())
    const swarm = new CubeSwarm(from, to, 1.4 * KIT_UNIT, rand)
    this.px.scene.add(swarm.mesh)
    this.spawned.push(swarm.mesh)
    this.soundAt(e.t, () => sfx.cubes(e.dur * 0.7))
    placed.forEach((p) => this.soundAt(e.t + e.dur * p.appear, () => sfx.pop()))
    const base = placed.map((p) => p.obj.scale.x)
    this.tween(
      e,
      (k) => {
        if (word) {
          word.visible = k < 0.1
          word.rotation.z = Math.sin(k * 90) * 0.06
        }
        swarm.update(k)
        placed.forEach((p, i) => {
          const a = clamp01((k - p.appear) / (1 - p.appear))
          p.obj.visible = k > p.appear
          p.obj.scale.setScalar(base[i] * (k > p.appear ? 0.85 + 0.15 * ease(a) + 0.1 * Math.sin(ease(a) * Math.PI) : 0.001))
        })
      },
      () => (swarm.mesh.visible = false),
    )
    // после появления: при перемотке твины идут в порядке добавления, марка должна быть последней
    const pol = pb ? this.tucked[pb.photo]?.object : undefined
    this.showBeat(e, placed.map((p) => p.obj), H, pol ? [pol] : [])
    // снимок своё отыграл — вместе с маркой ложится обратно в книгу, следующему снимку сцена свободна
    if (pol) {
      const win = this.beatWin.get(e.beat)
      const p1 = pol.userData.tuckPos as THREE.Vector3 | undefined
      const q1 = pol.userData.tuckQ as THREE.Quaternion | undefined
      if (win && p1 && q1) {
        let from: { p: THREE.Vector3; q: THREE.Quaternion } | null = null
        this.tween({ t: win.t1, dur: 0.7 }, (k) => {
          from ??= { p: pol.position.clone(), q: pol.quaternion.clone() }
          const a = ease(k)
          pol.position.lerpVectors(from.p, p1, a)
          pol.position.y += Math.sin(a * Math.PI) * 0.3
          pol.quaternion.slerpQuaternions(from.q, q1, a)
        })
        this.soundAt(win.t1, () => sfx.slide(0.3))
      }
    }
    // люди со снимка: второй человечек в их одежде; если хореограф не дал companion_enter — зовём сами
    const people = this.photoPeople(e.beat)
    if (people.length && !this.companionBeats.has(e.beat)) {
      const p = people[0]
      // старые проходы второго в этом бите больше не уводят его от главного
      this.companionBeats.add(e.beat)
      this.companionEnter({ type: 'companion_enter', t: e.t + Math.min(0.9, e.dur * 0.7), dur: 0.6, beat: e.beat, companion: { name: '', role: p.role } })
    }
  }

  /**
   * Показ бита (план 13, § 1): крупный кадр по рамке сценки, подложка под ней,
   * а в конце окна бита сценка уменьшается и улетает маркой на дальний край разворота.
   */
  private showBeat(e: { t: number; dur: number; beat: number }, objs: THREE.Object3D[], H: THREE.Vector3, frameAlso: THREE.Object3D[] = []) {
    const y = this.book.pageY
    const box = new THREE.Box3(new THREE.Vector3(H.x - 0.32, y, H.z - 0.3), new THREE.Vector3(H.x + 0.32, y + 1.25, H.z + 0.3))
    // в кадр ещё и то, что не уходит в марку (снимок, из которого ожила сценка)
    for (const o of [...objs, ...frameAlso]) {
      o.updateMatrixWorld(true)
      box.union(new THREE.Box3().setFromObject(o))
    }
    // зонт поднимется над головой уже после постройки — рамка кадра сразу с запасом сверху
    // (купол может чуть уйти за край — лучше, чем мелкий человечек)
    if (this.held?.raise && objs.includes(this.held.obj)) box.max.y = Math.max(box.max.y, y + 1.1 + this.held.height * 0.7)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const win = this.beatWin.get(e.beat) ?? { t0: e.t, hold0: e.t + e.dur, t1: e.t + e.dur + 2.8, quote: '' }
    const sd = this.standDir.get(e.beat)
    this.beatCam = { t0: win.t0 - 0.25, t1: win.t1, center, size, side: sd ? -sd : e.beat % 2 ? 1 : -1 }

    // подложка: строки текста под сценкой гаснут, силуэты читаются на ровной бумаге
    const disc = makeBaseDisc()
    const r = Math.max(size.x, size.z) + 0.8
    disc.scale.set(r, r * 0.8, 1)
    disc.position.set(center.x, y + 0.02, center.z + 0.05)
    this.px.scene.add(disc)
    this.spawned.push(disc)
    const dm = disc.material as THREE.MeshBasicMaterial
    this.tween({ t: win.t0, dur: 0.5 }, (k) => (dm.opacity = ease(k)))
    this.tween({ t: win.t1, dur: 0.6 }, (k) => (dm.opacity = 1 - ease(k)), () => (disc.visible = false))

    // марка: сценка уменьшается и улетает на поле, бумага марки появляется под ней
    const slot = this.stamps++
    const sx = -PAGE_W + 0.6 + (slot % 6) * ((2 * PAGE_W - 1.2) / 5)
    // на пути дня марка остаётся там, где сценка была прожита: разворот становится картой дня
    const station = this.route.get(e.beat)
    const to = station ? new THREE.Vector3(station.x, y + 0.022, station.z - 0.1) : new THREE.Vector3(sx, y + 0.022, STAMP_Z + (slot >= 6 ? 0.75 : 0))
    const fit = (STAMP_SIZE * 0.62) / Math.max(size.x, size.z, size.y * 0.75, 0.2)
    // рамки марок по кругу: красная, синяя, зелёная, горчичная
    const paper = makeStampPaper(['#c4553f', '#3f6aa8', '#4f8a5b', '#d39a2c'][slot % 4])
    paper.position.copy(to)
    paper.rotation.z = (slot % 2 ? 1 : -1) * 0.06
    paper.scale.setScalar(0.001)
    paper.visible = false
    this.px.scene.add(paper)
    this.spawned.push(paper)
    let start: { p: THREE.Vector3; s: number }[] | null = null
    // фотоальбом дня (план 15, вариант А): сценка уходит в снимок своего же кадра, снимок ложится на её место пути
    let pol: Polaroid | null = null
    this.soundAt(win.t1 + 0.55, () => sfx.pop())
    this.tween(
      { t: win.t1, dur: 0.8 },
      (k) => {
        if (!start) {
          // из рук предмет тоже уходит в марку
          if (this.held && objs.includes(this.held.obj)) this.held = null
          start = objs.map((o) => ({ p: o.position.clone(), s: o.scale.x }))
          const shot = this.shots.get(e.beat)
          if (ALBUM && shot && station) pol = this.albumPhoto(e.beat, shot, to, slot, win.quote)
          // «Поклон»: предметы сценки уходят в страницу, а в финале выходят все вместе (Эмиль, вариант C)
          if (!ALBUM) this.curtain.push(...objs.map((o, i) => ({ o, s: start![i].s, sky: start![i].p.y > y + 0.8 })))
        }
        const a = ease(k)
        objs.forEach((o, i) => {
          const s0 = start![i]
          if (!ALBUM) {
            // сценка тонет в странице: уменьшается и опускается на своём месте
            o.position.copy(s0.p)
            o.position.y -= 0.25 * a
            o.scale.setScalar(Math.max(0.001, s0.s * (1 - a)))
            o.visible = a < 0.98
            return
          }
          if (pol) {
            // предметы ныряют в снимок и исчезают
            o.position.lerpVectors(s0.p, to, a)
            o.position.y += Math.sin(a * Math.PI) * 0.35
            o.scale.setScalar(Math.max(0.001, s0.s * (1 - a)))
            o.visible = a < 0.98
            return
          }
          // относительное место предмета в сценке сохраняется, только в масштабе марки
          const rel = s0.p.clone().sub(center).multiplyScalar(fit)
          rel.y = s0.p.y - y
          const dest = to.clone().add(new THREE.Vector3(rel.x, rel.y * fit + 0.004, rel.z))
          o.position.lerpVectors(s0.p, dest, a)
          o.position.y += Math.sin(a * Math.PI) * 0.6
          o.scale.setScalar(s0.s * (1 + (fit - 1) * a))
          o.visible = true
        })
        if (pol || !ALBUM) return
        paper.visible = k > 0.55
        paper.scale.setScalar(STAMP_SIZE * ease(clamp01((k - 0.55) / 0.45)) || 0.001)
      },
    )
  }

  /**
   * Финал «Поклон» (вариант C, Эмиль 22.11): все вещи и люди дня выходят на разворот в ряд в своём размере,
   * человечек проходит вдоль ряда и машет, каждый кланяется, когда он рядом. Потом книга закрывается и всё складывается.
   */
  private curtainCall(e: Extract<TimelineEvent, { type: 'actor_action' }>) {
    const y = this.book.pageY
    const D = e.dur
    type Entry = { o: THREE.Object3D; s: number; w: number; sky: boolean; fig?: Hero3D }
    const size = (o: THREE.Object3D, sc: number) => {
      const prev = o.scale.x
      o.scale.setScalar(sc)
      o.updateMatrixWorld(true)
      const b = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
      o.scale.setScalar(prev)
      return Math.min(1.5, Math.max(0.3, b.x))
    }
    const ground: Entry[] = []
    const sky: Entry[] = []
    for (const it of this.curtain) (it.sky ? sky : ground).push({ o: it.o, s: it.s, w: size(it.o, it.s), sky: it.sky })
    // люди дня — между вещами, равномерно
    const people = [...this.cast.values()].map((v): Entry => {
      const fig = new Hero3D(v.colors, toonFor, v.accessory)
      fig.object.scale.setScalar(v.scale)
      fig.object.visible = false
      this.px.scene.add(fig.object)
      this.spawned.push(fig.object)
      this.bowFigs.push(fig)
      return { o: fig.object, s: v.scale, w: 0.5, sky: false, fig }
    })
    people.forEach((p, j) => ground.splice(Math.round(((j + 1) * ground.length) / (people.length + 1)) + j, 0, p))
    const gap = 0.16
    const total = ground.reduce((a, g) => a + g.w, 0) + gap * Math.max(0, ground.length - 1)
    const k = Math.min(1, (PAGE_W * 2 - 0.9) / Math.max(0.1, total))
    const z = 0.45
    let x = (-total * k) / 2
    const appear0 = e.t + 0.2
    const step = Math.min(0.14, 1.2 / Math.max(1, ground.length + sky.length))
    const xs: number[] = []
    ground.forEach((g, i) => {
      const cx = x + (g.w * k) / 2
      x += g.w * k + gap * k
      xs.push(cx)
      const sc = g.s * k
      const ti = appear0 + i * step
      g.o.position.set(cx, y, z)
      g.o.rotation.set(0, (g.fig ? 0 : -0.15 * Math.sign(cx)) , 0)
      g.o.scale.setScalar(0.001)
      this.tween({ t: ti, dur: 0.5 }, (u) => {
        g.o.visible = true
        g.o.position.set(cx, y - 0.25 * (1 - ease(u)), z)
        g.o.scale.setScalar(Math.max(0.001, sc * (ease(u) + 0.15 * Math.sin(u * Math.PI))))
      })
      this.soundAt(ti + 0.1, () => sfx.pop())
      if (g.fig) g.fig.play('idle', ti, 1)
    })
    sky.forEach((g, i) => {
      const cx = (i - (sky.length - 1) / 2) * 1.3
      const sc = g.s * Math.min(1, k * 1.2)
      const ti = appear0 + (ground.length + i) * step
      this.tween({ t: ti, dur: 0.5 }, (u) => {
        g.o.visible = true
        g.o.position.set(cx, y + 1.35 + 0.1 * Math.sin(u * Math.PI), z - 0.5)
        g.o.scale.setScalar(Math.max(0.001, sc * ease(u)))
      })
    })
    // человечек выходит к левому краю ряда и идёт вдоль него, машет; каждый кланяется, когда он рядом
    const a = this.hero.object
    const from = a.position.clone()
    const x0 = (xs[0] ?? -1) - 0.35
    // в конце прохода человечек остаётся в кадре, перед последним в ряду
    const x1 = (xs[xs.length - 1] ?? 1) - 0.1
    const front = z + 0.75
    const walkStart = appear0 + ground.length * step + 0.2
    const walkDur = Math.max(1.6, Math.min(3.6, D - (walkStart - e.t) - 1.0))
    this.goal.hero = null
    this.play('hero', 'walk', e.t, true, walkStart - e.t)
    this.tween({ t: e.t, dur: Math.max(0.3, walkStart - e.t) }, (u) => a.position.lerpVectors(from, new THREE.Vector3(x0, y, front), ease(u)))
    this.tween({ t: walkStart, dur: 0.001 }, () => this.play('hero', 'wave', walkStart, true, walkDur))
    this.tween({ t: walkStart, dur: walkDur }, (u) => {
      a.position.set(x0 + (x1 - x0) * u, y, front)
    })
    ground.forEach((g, i) => {
      const pass = walkStart + walkDur * ((xs[i] - x0) / Math.max(0.1, x1 - x0))
      if (g.fig) {
        g.fig.play('wave', pass - 0.2, 1.6)
        this.tween({ t: pass + 1.4, dur: 0.001 }, () => g.fig!.play('joy', pass + 1.4, 2))
        return
      }
      // поклон вещи: приседает и выпрямляется
      const sc = g.s * k
      this.tween({ t: pass - 0.1, dur: 0.6 }, (u) => {
        const b = Math.sin(u * Math.PI)
        g.o.scale.set(sc * (1 + 0.08 * b), sc * (1 - 0.18 * b), sc * (1 + 0.08 * b))
        g.o.rotation.x = 0.25 * b
      })
    })
    this.tween({ t: walkStart + walkDur, dur: 0.001 }, () => {
      this.faceYaw.hero = 0
      this.play('hero', 'cheer', walkStart + walkDur, true, 2)
    })
    this.soundAt(walkStart + walkDur, () => sfx.chime())
    // камера спереди на весь ряд
    const cam0 = this.camPos.clone()
    const look0 = this.camLook.clone()
    const cam = this.px.camera
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const width = Math.max(2.5, x1 - x0 + 1.0)
    const dist = Math.max(width / (2 * tan * Math.max(0.5, cam.aspect)), 1.8 / (2 * tan)) * 0.92
    // ряд — в середине кадра, взгляд чуть сверху
    const lookTo = new THREE.Vector3((x0 + x1) / 2, y + 0.5, z + 0.2)
    const camTo = lookTo.clone().add(new THREE.Vector3(0, dist * 0.3, dist * 0.95))
    this.tween({ t: e.t, dur: D }, (u) => {
      const q = ease(u / Math.min(1, 0.9 / Math.max(0.5, D)))
      this.camPos.lerpVectors(cam0, camTo, q)
      this.camLook.lerpVectors(look0, lookTo, q)
    })
  }

  /** Снимок сценки для альбома: падает на место бита лицом вверх и проявляется, под ним строка рассказа. */
  private albumPhoto(beat: number, shot: HTMLCanvasElement, at: THREE.Vector3, slot: number, quote: string): Polaroid {
    const text = this.storyLines.find((l) => l.beat === beat)?.text ?? quote
    const pol = new Polaroid(shot, 0.82, text)
    pol.setDevelop(0)
    const o = pol.object
    const tilt = (slot % 2 ? 1 : -1) * (0.05 + (slot % 3) * 0.03)
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, tilt))
    const up = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, tilt * 2))
    const y = this.book.pageY
    const p1 = new THREE.Vector3(at.x, y + 0.016, at.z)
    const p0 = p1.clone().add(new THREE.Vector3(0, 0.9, 0.2))
    o.position.copy(p0)
    o.quaternion.copy(up)
    o.scale.setScalar(0.7)
    this.px.scene.add(o)
    this.spawned.push(o)
    this.album.push(p1.clone())
    this.tween({ t: this.time, dur: 0.7 }, (k) => {
      const a = ease(k)
      o.position.lerpVectors(p0, p1, a)
      o.position.y += Math.sin(a * Math.PI) * 0.15
      o.quaternion.slerpQuaternions(up, flat, a)
      o.scale.setScalar(0.7 + 0.3 * a)
    })
    this.tween({ t: this.time + 0.3, dur: 1.6 }, (k) => pol.setDevelop(ease(k)))
    this.soundAt(this.time + 0.6, () => sfx.slide(0.25))
    return pol
  }

  /** Кадр сценки для её снимка: квадрат из середины последнего кадра (подписи на этот кадр спрятаны). */
  private captureShot(beat: number) {
    const src = this.px.renderer.domElement
    const W = src.width
    const H = src.height
    if (!W || !H) return
    const side = Math.round(Math.min(W, H) * 0.7)
    const c = document.createElement('canvas')
    c.width = c.height = 512
    c.getContext('2d')!.drawImage(src, Math.round(W / 2 - side / 2), Math.round(H * 0.46 - side / 2), side, side, 0, 0, 512, 512)
    this.shots.set(beat, c)
  }

  /**
   * Человек из фразы (план 13, § 2 ②): второй человечек подбегает и встаёт рядом, со стороны, где нет места,
   * делает ту же позу; в конце бита ныряет обратно в страницу вместе с маркой.
   */
  private companionEnter(e: Extract<TimelineEvent, { type: 'companion_enter' }>) {
    if (!this.figures.length) return
    const a = this.second.object
    const H = this.route.get(e.beat)?.clone() ?? this.hero.object.position.clone()
    const sdc = this.standDir.get(e.beat)
    const side = sdc ? -sdc : e.beat % 2 ? 1 : -1
    // человек со снимка — в своей одежде с фото; иначе бабушка в платке, подруга с пучком — по роли из режиссёра
    const fromPhoto = this.photoPeople(e.beat)[0]
    const variant = fromPhoto ? photoVariant(fromPhoto, e.beat) : pickCompanion(e.companion)
    this.dressSecond(variant)
    this.cast.set(variant.id, variant)
    const to = new THREE.Vector3(H.x + side * 0.72, this.book.pageY, H.z - 0.08)
    const from = to.clone().add(new THREE.Vector3(side * 0.6, 0, -0.35))
    const win = this.beatWin.get(e.beat)
    this.tween({ t: e.t, dur: 0.001 }, () => {
      a.visible = true
      this.faceYaw.second = null
      this.play('second', 'walk', e.t, true, 0.55)
    })
    this.tween(
      { t: e.t, dur: 0.55 },
      (k) => {
        a.position.lerpVectors(from, to, ease(k))
        a.position.y += Math.sin(k * Math.PI) * 0.08
      },
      () => {
        this.faceYaw.second = 0
        // та же поза, что у главного: пьют какао вместе, радуются вместе
        const row = this.anim.hero.row
        this.play('second', row === 'walk' ? 'idle' : row, e.t + 0.55, true, e.dur)
      },
    )
    this.soundAt(e.t + 0.4, () => sfx.pop())
    if (win) {
      // ныряет в страницу, как человечек в финале
      let y0 = 0
      this.tween(
        { t: win.t1, dur: 0.45 },
        (k) => {
          if (k > 0 && !y0) y0 = a.position.y || this.book.pageY
          a.position.y = y0 - 1.2 * ease(k)
        },
        () => {
          a.visible = false
          a.position.y = this.book.pageY
          this.faceYaw.second = null
        },
      )
    }
  }

  /** Переодеть второго человечка: та же фигура Hero3D, цвета, вещь на голове и рост из companions.json. */
  private dressSecond(v: CompanionVariant) {
    const f = this.figures.find((x) => x.id === 'second')
    if (!f || this.secondLook === v.id) return
    this.secondLook = v.id
    const old = f.fig
    const fig = new Hero3D(v.colors, toonFor, v.accessory)
    fig.object.scale.setScalar(v.scale)
    fig.object.position.copy(old.object.position)
    fig.object.rotation.copy(old.object.rotation)
    this.px.scene.remove(old.object)
    this.px.scene.add(fig.object)
    f.fig = fig
  }

  /** Какой вариант второго человечка сейчас надет. */
  private secondLook = ''

  /** Крупный кадр бита без сценки: рамка — человечек (второй добавится сам, если подойдёт). */
  /**
   * Карта дня (план 15, § 1.3): точки битов змейкой по развороту — дальний ряд слева направо,
   * ближний справа налево; дороги между ними и строки рассказа слева сверху.
   */
  private planRoute(timeline: Timeline, dayText: string) {
    this.route.clear()
    this.standDir.clear()
    this.travels = []
    this.travelInto.clear()
    this.storyLines = []
    this.shots.clear()
    this.albumDone.clear()
    this.album = []
    this.curtain = []
    this.cast.clear()
    this.bowFigs = []
    this.shotStage = 0
    this.travelCam = null
    const beats = [...(timeline.beats ?? [])].sort((a, b) => a.start - b.start)
    this.hasTravelEvents = timeline.events.some((e) => (e as { type: string }).type === 'travel')
    if (!beats.length) return
    const y = this.book.pageY
    const n = beats.length
    // точки битов — ровная сетка 1.3 × 1.3, чтобы снимки альбома не наползали друг на друга:
    // от места, где человечек спрыгнул на страницу, вправо по ближнему ряду, потом по дальнему влево
    const SPOTS: [number, number][] = [[-0.55, 0.55], [0.75, 0.55], [2.05, 0.55], [2.05, -0.75], [0.75, -0.75], [-0.55, -0.75], [-1.85, -0.75], [-1.85, 0.55]]
    beats.forEach((b, i) => {
      const [x, z] = SPOTS[Math.min(i, SPOTS.length - 1)]
      this.route.set(b.beat, new THREE.Vector3(x, y, z))
    })
    // место ставится в сторону пути: так оно не наезжает на марку прошлой сценки
    beats.forEach((b, i) => {
      const cur = this.route.get(b.beat)!
      const prev = i > 0 ? this.route.get(beats[i - 1].beat)! : null
      const next = i < n - 1 ? this.route.get(beats[i + 1].beat)! : null
      const dx = prev && Math.abs(cur.x - prev.x) > 0.2 ? cur.x - prev.x : next && Math.abs(next.x - cur.x) > 0.2 ? next.x - cur.x : cur.x < 0 ? 1 : -1
      this.standDir.set(b.beat, Math.sign(dx) || 1)
    })
    if (this.hasTravelEvents) {
      for (const e of timeline.events) {
        const x = e as unknown as { type: string; t: number; dur: number; from: number; to: number; mode?: string }
        if (x.type !== 'travel') continue
        this.travels.push({ t: x.t, dur: x.dur, from: x.from, to: x.to, mode: x.mode === 'run' ? 'run' : 'walk' })
        this.travelInto.add(x.to)
      }
    } else {
      for (let i = 1; i < n; i++) {
        const a = this.beatWin.get(beats[i - 1].beat)
        const b = this.beatWin.get(beats[i].beat)
        if (!a || !b) continue
        const t = a.t1 + 0.15
        const dur = Math.max(0.7, b.t0 - 0.2 - t)
        this.travels.push({ t, dur, from: beats[i - 1].beat, to: beats[i].beat, mode: dur < 1.1 ? 'run' : 'walk' })
        this.travelInto.add(beats[i].beat)
      }
    }
    // рассказ: строка режиссёра (story) или полное предложение из записи, где стоит цитата бита
    const sentences = dayText.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean)
    for (const b of beats) {
      const w = this.beatWin.get(b.beat)
      if (!w) continue
      const own = ((b as { story?: string }).story ?? '').trim()
      const q = b.quote.toLowerCase()
      const text = own || sentences.find((x) => x.toLowerCase().includes(q)) || b.quote
      const last = this.storyLines[this.storyLines.length - 1]
      // та же фраза у двух битов — строка не повторяется, а остаётся дольше
      if (last && last.text === text) {
        last.t1 = w.t1 + 0.8
        continue
      }
      const tin = this.travels.find((t) => t.to === b.beat)
      this.storyLines.push({ beat: b.beat, text, t0: tin ? tin.t + 0.1 : w.t0 - 0.6, t1: w.t1 + 0.8 })
    }
  }

  /** Дорога: человечек уходит из прожитой сценки к следующей, за ним остаются следы, свет меняется на ходу. */
  private travel3D(tr: { t: number; dur: number; from: number; to: number; mode: 'walk' | 'run' }) {
    const to = this.route.get(tr.to)
    if (!to) return
    const a = this.hero.object
    const y = this.book.pageY
    this.beatLight(tr.to, tr.t)
    this.goal.hero = null
    this.faceYaw.hero = null
    this.play('hero', 'walk', tr.t, true, tr.dur)
    const start = this.route.get(tr.from) ?? a.position.clone()
    const d = to.clone().sub(start)
    d.y = 0
    const len = d.length()
    if (len < 0.05) return
    const dirN = d.clone().normalize()
    const side = new THREE.Vector3(-dirN.z, 0, dirN.x)
    const bend = (u: number) => Math.sin(u * Math.PI) * Math.min(0.12, len * 0.08)
    // следы по той же дуге, что и шаги
    const prints = Math.max(3, Math.floor(len / 0.15))
    for (let i = 1; i < prints; i++) {
      const k = i / prints
      const fp = makeFootprint()
      fp.position.copy(start).addScaledVector(dirN, len * k).addScaledVector(side, bend(k) + (i % 2 ? 0.04 : -0.04))
      fp.position.y = y + 0.006
      fp.rotation.y = Math.atan2(dirN.x, dirN.z)
      fp.visible = false
      this.px.scene.add(fp)
      this.spawned.push(fp)
      this.tween({ t: tr.t + tr.dur * Math.min(1, k * 1.05), dur: 0.001 }, () => (fp.visible = true))
    }
    const win = this.beatWin.get(tr.to)
    const hold = this.photoBeats.has(tr.to) || !win ? tr.t + tr.dur : Math.max(tr.t + tr.dur, win.t0 + 0.3)
    this.travelCam = { t0: tr.t, t1: hold, dir: Math.sign(d.x) || 1 }
    let from: THREE.Vector3 | null = null
    this.tween(
      { t: tr.t, dur: tr.dur },
      (k) => {
        from ??= a.position.clone()
        // короткий разгон и торможение, в середине ровный шаг
        const u = k < 0.2 ? (k * k) / 0.4 : k > 0.8 ? 1 - ((1 - k) * (1 - k)) / 0.4 : (k - 0.1) / 0.8
        a.position.lerpVectors(from, to, u)
        a.position.addScaledVector(side, bend(u))
      },
      () => this.play('hero', 'idle', tr.t + tr.dur, true),
    )
  }

  /** Камера в дороге ведёт человечка сбоку-спереди, с запасом кадра туда, куда он идёт. */
  private applyTravelCamera(time: number) {
    const tc = this.travelCam
    if (!tc) return
    if (time > tc.t1 + 0.7) {
      this.travelCam = null
      return
    }
    let w = time < tc.t0 ? 0 : time < tc.t0 + 0.45 ? ease((time - tc.t0) / 0.45) : time < tc.t1 ? 1 : 1 - ease((time - tc.t1) / 0.7)
    // крупный кадр новой сценки уже пошёл — дорожная камера уступает ему
    const b = this.beatCam
    if (b && b.t0 > tc.t0 && time > b.t0) w *= 1 - ease(clamp01((time - b.t0) / 0.7))
    if (w <= 0) return
    const H = this.hero.object.position
    const y = this.book.pageY
    const cam = this.px.camera
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const size = new THREE.Vector3(2.1, 1.45, 0.9)
    const distH = (size.y * 1.12) / 0.62 / (2 * tan)
    const distW = size.x / (0.85 * Math.max(0.3, cam.aspect)) / (2 * tan)
    const dist = Math.max(distH, distW)
    const yaw = tc.dir * 0.24
    const pitch = 0.42
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    const look = new THREE.Vector3(H.x + tc.dir * 0.32, y + 0.5, H.z)
    const pos = look.clone().addScaledVector(dir, dist)
    pos.y = Math.max(pos.y, y + 0.55)
    this.camPos.lerp(pos, w)
    this.camLook.lerp(look, w)
    this.focus.copy(H)
    const pixel = this.px.pixel
    if (pixel) pixel.minRows = Math.max(pixel.minRows, 130 + (BEAT_ROWS - 130) * w)
  }

  /** Снять кадр каждой сценки в середине её крупного плана: кадр без подписей, потом снимок. */
  private updateShots(time: number) {
    if (!ALBUM || !this.figures.length || this.writeMode || this.shelfMode) return
    if (this.shotStage === 1) {
      // прошлый кадр отрисован без подписей — снимаем
      this.captureShot(this.shotBeat)
      this.shotStage = 0
      return
    }
    for (const [beat, w] of this.beatWin) {
      if (this.shots.has(beat)) continue
      const at = w.hold0 + 0.6 * (w.t1 - w.hold0)
      if (time >= at && time < w.t1) {
        this.shotBeat = beat
        this.shotStage = 1
        return
      }
    }
  }

  /** Рассказ слева сверху: строка бита пишется словами, прошлая бледнеет над ней. */
  private placeStory(time: number) {
    if (!this.figures.length) return
    if (!this.story) {
      this.story = new StoryCaption()
      this.px.scene.add(this.story.mesh)
    }
    const lines = this.storyLines
    if (!lines.length || this.writeMode || this.shelfMode || this.shotStage === 1) return this.story.place(this.px.camera, 0)
    let idx = -1
    for (let i = 0; i < lines.length; i++) if (time >= lines[i].t0) idx = i
    if (idx < 0) return this.story.place(this.px.camera, 0)
    const cur = lines[idx]
    const end = lines[lines.length - 1].t1 + 0.6
    const k = Math.min(clamp01((time - lines[0].t0) / 0.4), 1 - clamp01((time - end) / 0.5))
    const typeDur = Math.min(1.8, 0.35 + cur.text.length * 0.035)
    this.story.set(idx > 0 ? lines[idx - 1].text : '', cur.text, cur.text.length * clamp01((time - cur.t0) / typeDur))
    this.story.place(this.px.camera, ease(k))
  }

  private beatCamOnly(e: { t: number; dur: number; beat: number }) {
    const H = this.route.get(e.beat) ?? this.hero.object.position
    const y = this.book.pageY
    const win = this.beatWin.get(e.beat) ?? { t0: e.t, hold0: e.t + e.dur, t1: e.t + e.dur + 2.8, quote: '' }
    const center = new THREE.Vector3(H.x, y + 0.7, H.z)
    this.beatCam = { t0: win.t0 - 0.25, t1: win.t1, center, size: new THREE.Vector3(1.3, 1.4, 0.8), side: e.beat % 2 ? 1 : -1 }
  }

  /**
   * Крупный кадр бита поверх камеры хореографа: рамка сценки занимает ~62 % высоты кадра,
   * вид три четверти спереди-сверху, никогда не ниже страницы. Плюс плотнее пиксельный слой.
   */
  private applyBeatCamera(time: number) {
    const b = this.beatCam
    const pixel = this.px.pixel
    if (!b || time > b.t1 + 0.7) {
      if (b) this.beatCam = null
      if (pixel) pixel.minRows = 130
      return
    }
    const w = time < b.t0 ? 0 : time < b.t0 + 0.7 ? ease((time - b.t0) / 0.7) : time < b.t1 ? 1 : 1 - ease((time - b.t1) / 0.7)
    if (pixel) pixel.minRows = 130 + (BEAT_ROWS - 130) * w
    if (w <= 0) return
    const cam = this.px.camera
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    // второй человечек рядом (фраза про человека) — тоже в рамке, а не обрезан краем кадра
    const two = this.second.object
    if (two.visible && two.position.distanceTo(b.center) < 3.2) {
      const box = new THREE.Box3().setFromCenterAndSize(b.center, b.size)
      box.union(new THREE.Box3(two.position.clone().add(new THREE.Vector3(-0.32, 0, -0.3)), two.position.clone().add(new THREE.Vector3(0.32, 1.25, 0.3))))
      box.getCenter(b.center)
      box.getSize(b.size)
    }
    // место под цитатой внизу: сценка чуть выше центра кадра. По высоте — 62 % кадра,
    // по ширине — до 85 % (на телефоне упираемся в ширину, иначе сценка мелкая)
    const distH = (b.size.y * 1.12) / 0.62 / (2 * tan)
    const distW = b.size.x / (0.85 * Math.max(0.3, cam.aspect)) / (2 * tan)
    const dist = Math.max(distH, distW) + b.size.z * 0.5
    const yaw = b.side * 0.3
    const pitch = 0.4
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    const look = b.center.clone().add(new THREE.Vector3(0, -b.size.y * 0.12, 0))
    const pos = look.clone().addScaledVector(dir, dist)
    pos.y = Math.max(pos.y, this.book.pageY + 0.55)
    this.camPos.lerp(pos, w)
    this.camLook.lerp(look, w)
    this.focus.copy(b.center)
  }

  /** Цитата бита внизу кадра: от крупного кадра до ухода сценки в марку. */
  private placeCaption(time: number) {
    if (!this.figures.length) return
    let win: { hold0: number; t1: number; quote: string } | null = null
    for (const [beat, w] of this.beatWin) {
      if (!(time > w.hold0 - 0.4 && time < w.t1 + 0.5)) continue
      // рассказ сверху уже говорит эти слова — цитата внизу была бы повтором (план 15: без повторов)
      const story = this.storyLines.find((s) => s.beat === beat)?.text.toLowerCase() ?? ''
      win = story && w.quote && story.includes(w.quote.toLowerCase()) ? null : w
    }
    if (!win && !this.caption) return
    if (!this.caption) {
      this.caption = new QuoteCaption()
      this.px.scene.add(this.caption.mesh)
    }
    if (!win || this.writeMode || this.shelfMode || this.shotStage === 1) return this.caption.place(this.px.camera, 0)
    this.caption.setText(win.quote)
    const k = Math.min(clamp01((time - (win.hold0 - 0.4)) / 0.35), 1 - clamp01((time - win.t1) / 0.5))
    this.caption.place(this.px.camera, ease(k))
  }

  /** Добавить мелочь на разворот; если её больше пяти — самая старая тает. */
  private addSmall(o: THREE.Object3D, t: number) {
    this.smalls.push(o)
    if (this.smalls.length <= 5) return
    const old = this.smalls.shift()!
    const s0 = old.scale.x
    this.tween({ t, dur: 0.5 }, (k) => {
      old.scale.setScalar(Math.max(0.001, s0 * (1 - ease(k))))
      if (k >= 1) old.visible = false
    })
  }

  /** Сдвинуть точку вдоль x, чтобы след (ширина w, глубина d) не налез на уже стоящие сценки и остался на развороте. */
  private placeFree(at: THREE.Vector3, w: number, d: number) {
    const over = (x: number) => this.footprints.some(([x0, z0, x1, z1]) => x + w / 2 > x0 && x - w / 2 < x1 && at.z + d / 2 > z0 && at.z - d / 2 < z1)
    const lim = PAGE_W - w / 2 - 0.1
    let x = at.x
    for (let i = 0; i < 12 && over(x); i++) x = at.x + (i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2) * (w * 0.6 + 0.2)
    at.x = Math.max(-lim, Math.min(lim, x))
    at.z = Math.max(-PAGE_H / 2 + d / 2, Math.min(PAGE_H / 2 - 0.2, at.z))
    this.footprints.push([at.x - w / 2, at.z - d / 2, at.x + w / 2, at.z + d / 2])
  }

  private play(id: ActorId, row: AnimRow, t0: number, loop: boolean, dur = 1) {
    const an = { row, t0, loop, fps: row === 'walk' ? this.fps + 4 : this.fps, dur }
    this.anim[id] = an
    return an
  }

  private setMood(m: Mood) {
    // частота кадров анимаций от настроения: тихо 4, спокойно 6, радостно 10, напряжённо 12
    this.fps = m.tension > 0.3 ? 12 : m.energy > 0.4 ? 10 : m.energy < -0.5 && m.tension < 0 ? 4 : 6
    // тепло ↔ холод меняет цвет лампы и фона; напряжение приглушает общий свет
    const warm = (m.warmth + 1) / 2
    this.room.lamp.color.set(PALETTE.ice).lerp(new THREE.Color(PALETTE.yellow), warm)
    this.room.ambient.color.set(PALETTE.slateDark).lerp(new THREE.Color(PALETTE.mauve), warm)
    this.room.ambient.intensity = 0.9 - 0.35 * Math.max(0, m.tension)
    this.room.rim.color.set(PALETTE.greyBlue)
    this.room.rim.intensity = 0.7
    this.room.lamp.intensity = 60
    this.applyDay()
    const r = this.room
    this.baseLight = { lamp: r.lamp.intensity, amb: r.ambient.intensity, rim: r.rim.intensity, tod: this.day?.time_of_day ?? 'evening' }
  }

  /** Свет дня после applyDay: от него свет бита считается по времени суток фразы. */
  private baseLight: { lamp: number; amb: number; rim: number; tod: string } | null = null
  /** Время суток каждой фразы (timeline.beats): утро → вечер по ходу дня. */
  private beatTod = new Map<number, string>()

  /**
   * Свет бита (план 13, § 4.5): фраза про утро светлее и холоднее, про ночь — темнее, лампа ярче.
   * Плавно за 1.2 с с начала превращения; если время суток как у дня — ничего не меняется.
   */
  private beatLight(beat: number, t: number) {
    const b = this.baseLight
    const tod = this.beatTod.get(beat)
    if (!b || !tod) return
    const F: Record<string, [number, number, number]> = { morning: [1.15, 0.75, 1.5], day: [1.3, 0.65, 1.6], evening: [0.9, 1.1, 1], night: [0.55, 1.2, 0.7] }
    const f = F[tod]
    const f0 = F[b.tod] ?? [1, 1, 1]
    if (!f) return
    const r = this.room
    let from: [number, number, number] | null = null
    const to: [number, number, number] = [(b.amb * f[0]) / f0[0], (b.lamp * f[1]) / f0[1], (b.rim * f[2]) / f0[2]]
    this.tween({ t, dur: 1.2 }, (k) => {
      from ??= [r.ambient.intensity, r.lamp.intensity, r.rim.intensity]
      const a = ease(k)
      r.ambient.intensity = from[0] + (to[0] - from[0]) * a
      r.lamp.intensity = from[1] + (to[1] - from[1]) * a
      r.rim.intensity = from[2] + (to[2] - from[2]) * a
    })
  }

  /** Запомнить палитру, время суток и погоду дня; применяются при подготовке фильма. */
  dress(script: DayScript, seed = 1, dayId: string | null = null) {
    this.day = { palette_hint: script.palette_hint ?? [], time_of_day: script.time_of_day, weather: script.weather }
    void this.world?.dress(script, seed)
    this.dayId = dayId
    // обложка книги дня — того же цвета, что её корешок на полке
    if (this.world) this.book.setCoverColor(coverColorFor(script, dayId ?? ''))
  }

  /** Какой день играет (id из хранилища) — для его места на полке. */
  setDayId(id: string | null) {
    this.dayId = id
  }

  /** Дни на полке, старые первыми. */
  setShelf(days: ShelfDay[]) {
    void this.world?.placeDays(days)
  }

  /**
   * Палитра из фото красит свет: самый тёплый цвет — лампу, самый холодный — контровой свет
   * из окна, среднее — рассеянный. Время суток меняет силу света, погода — осадки на развороте.
   */
  private applyDay() {
    const d = this.day
    if (!d) return
    const lamp = this.room.lamp
    const rim = this.room.rim
    const amb = this.room.ambient
    const cols = d.palette_hint.map((n) => DAY_COLORS[n]).filter((c): c is number => c !== undefined).map((c) => new THREE.Color(c))
    if (cols.length) {
      const byWarmth = [...cols].sort((a, b) => b.r - b.b - (a.r - a.b))
      const avg = cols.reduce((acc, c) => acc.add(c), new THREE.Color(0, 0, 0)).multiplyScalar(1 / cols.length)
      lamp.color.lerp(byWarmth[0], 0.4)
      rim.color.lerp(byWarmth[byWarmth.length - 1], 0.55)
      amb.color.lerp(avg, 0.35)
    }
    switch (d.time_of_day) {
      case 'morning':
        amb.intensity *= 1.15
        lamp.intensity *= 0.75
        rim.intensity *= 1.5
        rim.color.lerp(new THREE.Color(PALETTE.frost), 0.3)
        break
      case 'day':
        amb.intensity *= 1.3
        lamp.intensity *= 0.65
        rim.intensity *= 1.6
        break
      case 'evening':
        lamp.intensity *= 1.1
        amb.intensity *= 0.9
        amb.color.lerp(new THREE.Color(PALETTE.mauve), 0.2)
        break
      case 'night':
        lamp.intensity *= 1.2
        amb.intensity *= 0.55
        amb.color.lerp(new THREE.Color(PALETTE.navy), 0.4)
        rim.intensity *= 0.7
        break
    }
    // погода дня: дождь или снег тихо идут над разворотом с первых секунд
    if (this.figures.length && (d.weather === 'rain' || d.weather === 'snow')) this.spawnEffect(d.weather, new THREE.Vector3(0, this.book.pageY, 0), 3.2)
  }

  private actor(id: ActorId) {
    return id === 'hero' ? this.hero : this.second
  }

  private quotePos(quote: string) {
    return this.book.wordWorldPosition(this.book.wordsForQuote(quote))
  }

  private tween(e: { t: number; dur: number }, fn: (k: number) => void, done?: () => void) {
    this.tweens.push({ t0: e.t, dur: e.dur, fn, done })
  }

  private addBillboard(a: SpriteActor) {
    this.px.scene.add(a.object)
    this.spawned.push(a.object)
    this.billboards.push(a)
  }

  /** ЗАГЛУШКА результата: цветной квадрат с первыми буквами id. Настоящие спрайты придут из assets/sprites. */
  private makeResult(kind: string, id: string): SpriteActor {
    const color =
      kind === 'popup' ? PALETTE.green : kind === 'effect' ? PALETTE.ice : kind === 'person' ? PALETTE.coral : kind === 'crystal' ? PALETTE.frost : PALETTE.amber
    if (kind === 'person') return new SpriteActor(placeholderItem('', PALETTE.paper), 1, 1)
    if (kind === 'effect' && this.bank) return new SpriteActor(placeholderItem('', PALETTE.paper), 1, 1)
    const real = kind === 'item' ? this.bank?.makeItem(id) : kind === 'popup' ? this.bank?.makePopup(id) : null
    if (real) return real
    const size = kind === 'popup' ? 32 : 16
    const c = placeholderItem(id, color)
    return new SpriteActor(c, size, size)
  }

  private cameraShot(e: { t: number; dur: number }, shot: CameraId, targetQuote: string | null) {
    // без слова: у объёмного человечка — щель между страницами, откуда он выходит
    const target =
      (targetQuote && this.quotePos(targetQuote)) ||
      (this.figures.length ? new THREE.Vector3(-0.7, this.book.pageY, 0.35) : new THREE.Vector3(-PAGE_W / 2, this.book.pageY, 0))
    const fromPos = this.camPos.clone()
    const fromLook = this.camLook.clone()
    const fig = this.figures.length > 0
    // объёмный человечек: камера ниже и сбоку, чтобы было видно, что он объёмный
    if (fig && shot === 'orbit_quarter' && targetQuote) {
      // облёт вокруг человечка у слова: дуга на четверть круга
      const c = target.clone().add(new THREE.Vector3(-0.25, 0, 0.25))
      const r = 3.2
      const a0 = -0.55
      const a1 = 0.95
      const look = c.clone().add(new THREE.Vector3(0, 0.5, 0))
      return this.tween(e, (k) => {
        const lead = ease(clamp01(k / 0.25))
        const a = a0 + (a1 - a0) * ease(k)
        const on = new THREE.Vector3(c.x + Math.sin(a) * r, c.y + 1.3 + 0.25 * Math.sin(k * Math.PI), c.z + Math.cos(a) * r)
        this.camPos.lerpVectors(fromPos, on, lead)
        this.camLook.lerpVectors(fromLook, look, lead)
      })
    }
    if (fig && shot === 'hold') {
      // «стоп» для объёмного человечка: камера не уезжает, но мягко держит его в кадре
      const hero = this.hero.object.position
      const offset = fromPos.clone().sub(fromLook)
      if (offset.length() > 6) return
      const look = fromLook.clone()
      let last = e.t
      return this.tween(e, (k) => {
        const now = e.t + k * e.dur
        const dt = Math.max(0, now - last)
        last = now
        const want = hero.clone().add(new THREE.Vector3(0, 0.5, 0))
        look.lerp(want, dt > 0 ? Math.min(1, dt * 2.5) : 0)
        this.camLook.copy(look)
        this.camPos.copy(look).add(offset)
      })
    }
    let toPos: THREE.Vector3
    let toLook: THREE.Vector3
    switch (shot) {
      case 'wide':
      case 'pull_out':
        toPos = WIDE.pos.clone()
        toLook = WIDE.look.clone()
        break
      case 'push_in':
      case 'hard_cut':
        if (fig) {
          // средний план на уровне человечка, чуть сбоку
          toLook = target.clone().add(new THREE.Vector3(-0.15, 0.5, 0.1))
          toPos = target.clone().add(new THREE.Vector3(0.55, 1.55, 3.0))
        } else {
          // в кадре слово и человечек рядом с ним целиком, с запасом над головой
          toLook = target.clone().add(new THREE.Vector3(-0.1, 0.65, 0))
          toPos = target.clone().add(new THREE.Vector3(-0.1, 3.4, 3.3))
        }
        break
      case 'orbit_quarter':
        toLook = new THREE.Vector3(0, 0.4, 0)
        toPos = new THREE.Vector3(5.2, 5.2, 4.6)
        break
      case 'hold':
      default:
        toPos = fromPos.clone()
        toLook = fromLook.clone()
    }
    const cut = shot === 'hard_cut'
    this.tween(e, (k) => {
      const a = cut ? 1 : ease(k)
      this.camPos.lerpVectors(fromPos, toPos, a)
      this.camLook.lerpVectors(fromLook, toLook, a)
    })
  }

  private applyCamera() {
    // в фильме камера не уходит ниже раскрытой страницы: торец книги и пол в кадре — шум (план 13, § 4.1)
    if (this.figures.length && !this.writeMode && !this.shelfMode && !this.shelving && this.book.openK > 0.5) {
      this.camPos.y = Math.max(this.camPos.y, this.book.pageY + 0.45)
    }
    this.px.camera.position.copy(this.camPos)
    this.px.camera.lookAt(this.camLook)
  }
}
