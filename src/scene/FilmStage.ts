import * as THREE from 'three'
import type { Mood } from '../types/script'
import type { ActorId, Stage, TimelineEvent } from '../types/timeline'
import type { CameraId } from '../types/script'
import { Book, PAGE_H, PAGE_W, SS, TEX_W } from './Book'
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
import { Sticker, prepareSticker, stickerCanvas } from './Sticker'
import { makeKit, pictureFor } from '../kit/make'
import type { KitPicture } from '../kit/svg'
import type { Timeline } from '../types/timeline'
import type { BeatResult } from '../types/script'
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
const WIDE = { pos: new THREE.Vector3(0, 8.6, 6.4), look: new THREE.Vector3(0, 0.3, 0.3) }

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
  private anim: Record<ActorId, { row: HeroRow; t0: number; loop: boolean; fps: number; dur: number }> = {
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
  private held: { obj: THREE.Object3D; height: number } | null = null
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
  }

  handle(e: TimelineEvent) {
    switch (e.type) {
      case 'book_open':
        return this.tween(e, (k) => this.book.setOpen(ease(k)))
      case 'book_close':
        this.hero.object.visible = false
        this.second.object.visible = false
        for (const o of this.spawned) o.visible = false
        for (const p of this.polaroids) p.visible = false
        this.closed = true
        return this.tween(e, (k) => this.book.setOpen(1 - ease(k)))
      case 'page_flip':
        return this.tween(e, (k) => (this.shake = Math.sin(k * Math.PI) * 0.02))
      case 'actor_enter': {
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
        if (e.actor === 'hero' && (e.action === 'cheer' || e.action === 'sit' || e.action === 'shiver')) this.dropHeld(e)
        if (this.bank) {
          const row = ACTION_ROW[e.action]
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
        const from = this.book.group.position.clone()
        const to = from.clone().add(new THREE.Vector3(0, 0.4, -1.2))
        return this.tween(e, (k) => this.book.group.position.lerpVectors(from, to, ease(k)))
      }
    }
  }

  update(time: number, _dt: number) {
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
        this.bank.setHeroFrame(this.actor(id), id, an.row, an.loop ? f % HERO_COLS : Math.min(f, HERO_COLS - 1))
      }
    }
    this.room.update(_dt)
    this.updateParticles(time)
    for (const b of this.bursts) b.update(time, this.closed)
    for (const o of this.facing) this.faceCamera(o)
    this.book.blinkCaret(Math.floor(performance.now() / 500) % 2 === 0)
    this.book.group.rotation.z = this.shake * Math.sin(time * 50)
    this.book.group.position.y = this.level * 0.03
    // закрытая книга лежит по центру стола, раскрытая — корешком по центру
    this.book.group.position.x = (-PAGE_W / 2) * (1 - this.book.openK)
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
    this.book.setOpen(1)
    this.camPos.set(0, 9.4, 1.9)
    this.camLook.set(0, 0.3, 0.25)
    this.applyCamera()
  }

  /** Книга закрыта, общий план. */
  idleView() {
    this.reset()
    this.book.setText('')
  }

  setDraftCaret(pos: number | null) {
    this.book.setCaret(pos)
  }

  setDraftText(text: string) {
    this.bookText = text
    this.book.setText(text)
  }

  /** Полароиды на правой странице. Остаются на время фильма; пустой массив убирает их. */
  setPhotos(images: (HTMLImageElement | HTMLCanvasElement)[]) {
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
    this.bursts = []
    this.facing = []
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
      f.fig.update(time, dt, f.walk, (f.dist / 0.6) * Math.PI * 2)
      if (f.id === 'hero') {
        this.focus.copy(p).add(new THREE.Vector3(0, 0.6, 0))
        this.followHeld(f.fig, f.yaw)
      }
    }
  }

  /** Предмет в руках: кружка — в правой руке, когда пьёт, остальное — перед грудью. */
  private followHeld(fig: Hero3D, yaw: number) {
    if (!this.held) return
    const o = this.held.obj
    o.visible = fig.object.visible && o.visible
    const drinking = this.anim.hero.row === 'drink'
    if (drinking) {
      // глоток: кружка у рта, перед лицом (в координатах головы: лицо смотрит на +Z)
      fig.head.localToWorld(o.position.set(1.5, 3.0, 9))
      o.position.y -= this.held.height * 0.5
    } else {
      fig.chest.getWorldPosition(o.position)
      o.position.y -= this.held.height * 0.5
    }
    o.rotation.set(0, yaw, 0)
  }

  /** Поставить предмет из рук на страницу перед человечком. */
  private dropHeld(e: { t: number }) {
    const held = this.held
    if (!held) return
    this.held = null
    const o = held.obj
    const from = o.position.clone()
    const to = from.clone()
    to.y = this.book.pageY
    this.tween({ t: e.t, dur: 0.25 }, (k) => o.position.lerpVectors(from, to, k * k))
  }

  /** Повернуть наклейку лицом к камере (только вокруг вертикали). */
  private faceCamera(o: THREE.Object3D) {
    const c = this.px.camera.position
    o.rotation.set(0, Math.atan2(c.x - o.position.x, c.z - o.position.z), 0)
  }

  private figure(id: ActorId) {
    return this.figures.find((f) => f.id === id)!
  }

  /** Заранее растрировать картинки-предметы дня, чтобы к своему биту они были готовы. */
  preload(timeline: Timeline) {
    void prepareSticker('crystal')
    for (const e of timeline.events) {
      if (e.type !== 'word_transform') continue
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
  private wordTransform3D(e: Extract<TimelineEvent, { type: 'word_transform' }>) {
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
    let pic = this.pictureForResult(e.result, e.quote)
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
        this.held = { obj, height }
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
        this.held = { obj, height }
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

  private play(id: ActorId, row: HeroRow, t0: number, loop: boolean, dur = 1) {
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
    const target = (targetQuote && this.quotePos(targetQuote)) || new THREE.Vector3(-PAGE_W / 2, this.book.pageY, 0)
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
