import * as THREE from 'three'
import type { Mood } from '../types/script'
import type { ActorId, Stage, TimelineEvent } from '../types/timeline'
import type { CameraId } from '../types/script'
import { Book, PAGE_H, PAGE_W, TEX_W } from './Book'
import { PALETTE } from './palette'
import { PIXEL_H, PIXEL_W, PixelStage, pixelTexture } from './PixelStage'
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

const ease = (k: number) => k * k * (3 - 2 * k)
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
  private anim: Record<ActorId, { row: HeroRow; t0: number; loop: boolean; fps: number }> = {
    hero: { row: 'idle', t0: 0, loop: true, fps: 6 },
    second: { row: 'idle', t0: 0, loop: true, fps: 6 },
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

  constructor(
    readonly px: PixelStage,
    private bank: SpriteBank | null = null,
  ) {
    this.hero = bank ? bank.makeHero('hero') : new SpriteActor(placeholderHero(), 24, 32)
    this.second = bank ? bank.makeHero('second') : new SpriteActor(placeholderHero(), 24, 32)
    px.scene.add(this.room.group, this.book.group, this.hero.object, this.second.object)
    this.applyCamera()
    this.reset()
    // модели подменяют коробки, когда загрузятся; без них сцена работает на заглушках
    loadModels()
      .then((m) => {
        this.room.useModels(m.lamp, m.cassette)
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
        const from = a.object.position.clone()
        // встать чуть ниже слова, чтобы не закрывать его
        const to = target.clone().add(new THREE.Vector3(e.actor === 'hero' ? -0.35 : 0.45, 0, 0.32))
        this.bob[e.actor] = this.bank ? 0 : 1
        this.play(e.actor, 'walk', e.t, true)
        a.mesh.scale.x = to.x < from.x ? -1 : 1
        return this.tween(e, (k) => a.object.position.lerpVectors(from, to, k), () => {
          this.bob[e.actor] = 0
          this.play(e.actor, 'idle', e.t + e.dur, true)
        })
      }
      case 'actor_action': {
        const a = this.actor(e.actor)
        if (this.bank) {
          const row = ACTION_ROW[e.action]
          this.play(e.actor, row, e.t, row !== 'sit')
          const hop = e.action === 'cheer' ? 0.2 : 0
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
              if (row !== 'sit') this.play(e.actor, 'idle', e.t + e.dur, true)
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
        const boxes = this.book.wordsForQuote(e.quote)
        const at = this.book.wordWorldPosition(boxes)
        if (!at) return
        this.book.hideWords(boxes)
        const canvas = this.book.wordCanvas(boxes)
        // буквы того же размера, что и на странице
        const word = new SpriteActor(canvas, canvas.width, canvas.height, PAGE_W / TEX_W)
        word.object.position.copy(at)
        this.addBillboard(word)
        this.lifted.set(e.quote, word)
        return this.tween(e, (k) => (word.mesh.position.y = ease(k) * 0.55))
      }
      case 'word_transform': {
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
    this.book.blinkCaret(Math.floor(performance.now() / 500) % 2 === 0)
    this.book.group.rotation.z = this.shake * Math.sin(time * 50)
    this.book.group.position.y = this.level * 0.03
    // закрытая книга лежит по центру стола, раскрытая — корешком по центру
    this.book.group.position.x = (-PAGE_W / 2) * (1 - this.book.openK)
    this.applyCamera()
    this.hero.faceCamera(this.px.camera)
    this.second.faceCamera(this.px.camera)
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
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: pixelTexture(c) }))
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

  /** Прямоугольники страниц в пикселях внутреннего холста 480×270. */
  pageRectsPx(): { left: Rect; right: Rect } {
    this.px.camera.updateMatrixWorld()
    const rect = (page: 0 | 1): Rect => {
      const pts = this.book.pageCorners(page).map((v) => v.project(this.px.camera))
      const xs = pts.map((p) => ((p.x + 1) / 2) * PIXEL_W)
      const ys = pts.map((p) => ((1 - p.y) / 2) * PIXEL_H)
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
  private spawnEffect(id: string, at: THREE.Vector3, t0: number) {
    if (!this.bank) return
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

  private play(id: ActorId, row: HeroRow, t0: number, loop: boolean) {
    this.anim[id] = { row, t0, loop, fps: row === 'walk' ? this.fps + 4 : this.fps }
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
        toLook = target.clone().add(new THREE.Vector3(0, 0.3, 0))
        toPos = target.clone().add(new THREE.Vector3(0, 3.1, 3.0))
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
