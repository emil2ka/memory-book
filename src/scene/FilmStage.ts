import * as THREE from 'three'
import type { Mood } from '../types/script'
import type { ActorId, Stage, TimelineEvent } from '../types/timeline'
import type { CameraId } from '../types/script'
import { Book, PAGE_H, PAGE_W, SS, TEX_H, TEX_W } from './Book'
import { PALETTE } from './palette'
import { HD, HERO3D, PixelStage, pixelTexture } from './PixelStage'
import { Hero3D, SECOND_COLORS, type HeroAction } from '../actors/Hero3D'
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
import { forgetScenes, makeScene, sceneFor } from '../kit/sceneClient'
import { sceneRef } from '../kit/sceneCheck'
import { Sticker, prepareSticker, stickerCanvas } from './Sticker'
import { makeKit, pictureFor } from '../kit/make'
import type { KitPicture } from '../kit/svg'
import type { Timeline } from '../types/timeline'
import type { BeatResult, DayScript } from '../types/script'
import type { PaletteName } from './palette'
import { Room } from './Room'
import { loadModels } from './models'
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
type AnimRow = HeroRow | 'climb' | 'wave' | 'dangle'
const spriteRow = (r: AnimRow): HeroRow => (r === 'climb' || r === 'wave' || r === 'dangle' ? 'idle' : r)

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
    loadModels()
      .then((m) => {
        this.room.useModels(m.lamp, m.cassette, m.desk)
        this.book.useModel(m.book)
      })
      .catch((err) => console.warn('3D-модели не загрузились, остаются заглушки', err))
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
    switch (e.type) {
      case 'book_open':
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
        if (this.figures.length) return this.enter3D(e)
        const a = this.actor(e.actor)
        a.object.visible = true
        const side = e.actor === 'hero' ? -1 : 1
        const from = new THREE.Vector3(0, this.book.pageY, -PAGE_H / 2 + 0.3)
        const to = new THREE.Vector3(side * 0.6, this.book.pageY, -PAGE_H / 2 + 0.9)
        return this.tween(e, (k) => a.object.position.lerpVectors(from, to, ease(k)))
      }
      case 'actor_walk': {
        const a = this.actor(e.actor)
        const target = this.quotePos(e.toQuote)
        if (!target) return
        if (e.actor === 'hero') this.dropHeld(e)
        this.goal[e.actor] = target.clone()
        const from = a.object.position.clone()
        // встать чуть ниже слова, чтобы не закрывать его
        const to = target.clone().add(new THREE.Vector3(e.actor === 'hero' ? -0.35 : 0.45, 0, 0.32))
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
        if (e.actor === 'hero' && !sceneAct && (e.action === 'cheer' || e.action === 'sit' || e.action === 'shiver')) this.dropHeld(e)
        if (this.figures.length && e.actor === 'hero' && e.beat === -1 && e.action === 'sit') return this.finale3D(e)
        if (this.bank) {
          // после превращения слова поза — из сценки (ест мороженое, держит шарики, сидит за ноутбуком)
          const row: HeroRow = (sceneAct as HeroRow | undefined) ?? ACTION_ROW[e.action]
          const acting = this.play(e.actor, row, e.t, row !== 'sit', e.dur)
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
    this.applyCamera()
    this.hero.faceCamera(this.px.camera)
    this.second.faceCamera(this.px.camera)
    this.updateFigures(time, _dt)
    for (const b of this.billboards) b.faceCamera(this.px.camera)
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
    if (this.person?.kind === kind) return
    this.usePerson(kind)
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
      goal.y += typing ? PEN_LIFT : 0.12
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
    if (row === 'carry') {
      // двумя руками перед собой
      fig.chest.getWorldPosition(o.position)
      o.position.y -= h.height * 0.5
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
    const camTo = to.clone().add(new THREE.Vector3(0.2, 0.9, 2.5))
    const lookTo = to.clone().add(new THREE.Vector3(0, 0.3, -0.25))
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
      const crowd = new Crowd(new THREE.Vector3(hero.x, this.book.pageY, hero.z), { x0: -PAGE_W * 0.97, x1: PAGE_W * 0.97, z0: -PAGE_H * 0.48, z1: PAGE_H * 0.48 }, rand)
      add(crowd.mesh)
      const pool = add(warmPool(0.85, 'rgba(236, 240, 255,')) as THREE.Mesh
      pool.position.set(hero.x, y + 0.001, hero.z)
      this.play('hero', 'sit', e.t + 0.3, false, 1.5)
      this.tween({ t: e.t, dur: hold }, (k) => {
        const u = k * hold
        crowd.update(Math.min(1, u / 1.0) * (1 - ease((u - e.dur) / 1.0)), e.t + u)
        ;(pool.material as THREE.MeshBasicMaterial).opacity = fade(k)
        this.room.lamp.intensity = lamp0 * (1 - 0.45 * fade(k))
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
    for (const e of timeline.events) {
      if (e.type !== 'word_transform') continue
      if (this.sceneProvider && e.result.kind !== 'effect' && e.result.kind !== 'person') {
        const r = e.result as { id?: string; name?: string }
        // текст ЭТОГО дня (bookText ещё прошлый: prepare идёт после preload)
        this.sceneProvider.request({ quote: e.quote, day: (dayText ?? this.bookText).trim().slice(0, 600), hint: r.name ?? r.id })
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

  /** Остальные снимки выезжают из книги веером, встают задником и проявляются быстрее. */
  private photoFan(e: Extract<TimelineEvent, { type: 'photo_fan' }>) {
    const xs = [-0.85, 3.15, -2.45, 4.45]
    const zFar = -PAGE_H / 2
    this.tucked.slice(e.from).forEach((pol, j) => {
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
    const scene = kind !== 'effect' && kind !== 'person' && kind !== 'crystal' ? this.sceneProvider?.get(e.quote) ?? null : null
    if (scene && scene.objects.length) return this.sceneTransform(e, scene)
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
    const H = this.hero.object.position.clone()
    const y = this.book.pageY
    // откуда летят кубики
    let from: THREE.Vector3[] = []
    if (word) {
      word.updateMatrixWorld(true)
      const g = word.geometry as THREE.PlaneGeometry
      from = letterPoints(word.userData.canvas, g.parameters.width, g.parameters.height).map((v) => new THREE.Vector3(v.x, v.y, 0).applyMatrix4(word.matrixWorld))
    }
    if (from.length < 20) {
      const c = fig.chest.getWorldPosition(new THREE.Vector3())
      from = from.concat(Array.from({ length: 60 }, () => c.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.3))))
    }
    // место должно читаться как место: декорация не ниже человечка; вещь в руке — заметная, но не больше головы
    const ROLE_H: Record<SceneObject['role'], [number, number]> = { hand: [9, 14], stand: [34, 60], detail: [7, 18] }
    const placed: { obj: THREE.Object3D; role: SceneObject['role']; appear: number }[] = []
    let hasHand = false
    for (const so of scene.objects.slice(0, 3)) {
      // только объёмные предметы: у некоторых id есть двойник-картинка без фигур
      const lib = so.ref ? sceneRef(so.ref) ?? kitById(so.ref) : undefined
      const model = lib && lib.parts.length ? lib : so.model
      if (!model || !model.parts?.length) continue
      if (so.role === 'hand' && hasHand) continue
      // то же место дня уже стоит (весь день за рабочим столом) — второй стол не строим
      const standKey = so.ref ?? so.ru
      if (so.role === 'stand' && this.stands.has(standKey)) continue
      const obj = buildKit(model, toonFor)
      toPixelLayer(obj)
      // размер по роли: предмет в руке не больше головы, декорация не меньше человечка наполовину
      const box = kitBounds(model)
      const size = box.getSize(new THREE.Vector3())
      const [lo, hi] = ROLE_H[so.role]
      const k = size.y > hi ? hi / size.y : size.y < lo ? lo / size.y : 1
      obj.scale.setScalar(k)
      const hgt = size.y * k * KIT_UNIT
      const wid = Math.max(size.x, size.z) * k * KIT_UNIT
      if (so.role === 'hand') {
        hasHand = true
        const grip = (model as { grip?: [number, number, number] }).grip
        // зонт держат над головой
        this.held = { obj, height: hgt, width: wid, grip: grip ? new THREE.Vector3(...grip).multiplyScalar(k) : null, raise: model.id === 'umbrella' }
        fig.chest.getWorldPosition(obj.position)
      } else {
        // высокие и узкие декорации (дерево, фонарь) — сбоку, иначе крона торчит над головой, как шапка
        const tall = so.role === 'stand' && size.y > Math.max(size.x, size.z) * 1.5
        const side = tall && (so.side ?? 'back') === 'back' ? (rand() < 0.5 ? 'left' : 'right') : so.side ?? (so.role === 'stand' ? 'back' : rand() < 0.5 ? 'right' : 'left')
        const dx = side === 'left' ? -1 : side === 'right' ? 1 : 0
        const dz = side === 'back' ? -1 : side === 'front' ? 1 : 0
        const gap = so.role === 'stand' ? 0.42 : 0.3
        const at = new THREE.Vector3(H.x + dx * (gap + wid / 2), y, H.z + dz * (gap + (size.z * k * KIT_UNIT) / 2))
        if (so.role === 'stand' && side === 'back') at.x += (rand() - 0.5) * 0.3
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
      if (so.role === 'detail') this.addSmall(obj, e.t + e.dur)
      placed.push({ obj, role: so.role, appear: so.role === 'stand' ? 0.5 : so.role === 'detail' ? 0.62 : 0.74 })
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
    this.sceneActs.set(e.beat, scene.action as HeroAction)
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
    return this.tween(
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
    this.px.camera.position.copy(this.camPos)
    this.px.camera.lookAt(this.camLook)
  }
}
