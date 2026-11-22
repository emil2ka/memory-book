// Раскладка вещей настроения: 3–5 вещей дня по слотам у книги, на подоконнике и на полке.
import * as THREE from 'three'
import type { DayScript } from '../types/script'
import { hasWorldFile, loadWorldModel, preloadWorld, type WorldModel } from './loader'
import { WORLD, chooseItems, type ClipRole, type ItemDef, type Placement } from './manifest'

export interface PlacedItem {
  item: ItemDef
  slot: string
  model: WorldModel
  /** 0..1 — вещь появляется (масштаб от нуля). */
  appear: number
  /** Огонёк вещи и узел, за масштабом которого он следует. */
  glow?: { light: THREE.PointLight; node: THREE.Object3D; base: number }
}

/** Пропорции (ширина / высота) окна под картинку у моделей волны 2. */
const PICTURE_ASPECT: Record<string, number> = { photo_image: 1.08 / 1.48, phone_screen: 0.68 / 1.42 }

/** Узлы-слоты из моделей комнаты: "window/slot_sill_0" → Object3D. */
export type SlotResolver = (node: string) => THREE.Object3D | null

export class DeskSet {
  readonly group = new THREE.Group()
  placed: PlacedItem[] = []
  private token = 0
  private anchors = new Map<string, THREE.Object3D>()

  constructor(
    private resolve: SlotResolver,
    private opts: { shadows?: boolean; items?: ItemDef[]; lights?: THREE.PointLight[] } = {},
  ) {
    this.group.name = 'world_set'
  }

  /** Постоянный пул огоньков (свеча, банка): лампы не создаются заново, поэтому шейдеры не пересобираются. */
  private get pool() {
    return this.opts.lights ?? []
  }

  /** Точка слота: узел из модели комнаты или пустышка на столе. */
  anchor(slot: string): THREE.Object3D | null {
    const def = WORLD.slots[slot]
    if (!def) return null
    if (def.node) return this.resolve(def.node)
    let a = this.anchors.get(slot)
    if (!a) {
      a = new THREE.Object3D()
      a.name = `slot_${slot}`
      if (def.at) a.position.set(...def.at)
      this.group.add(a)
      this.anchors.set(slot, a)
    }
    return a
  }

  /** Что положить в этот день (без загрузки) — для витрины и тестов. */
  plan(script: DayScript, seed: number): Placement[] {
    // вещи без файла (ещё не сделаны) не выбираем
    const items = (this.opts.items ?? WORLD.items).filter((it) => hasWorldFile(it.file))
    // слоты, которых пока нет в комнате (окно или полка не загружены), не предлагаем
    const slots = Object.keys(WORLD.slots).filter((s) => this.anchor(s))
    return chooseItems(script, seed, items, slots)
  }

  /** Одеть стол под день. Старые вещи уходят сразу, новые грузятся и появляются. */
  async dress(script: DayScript, seed: number) {
    const token = ++this.token
    const plan = this.plan(script, seed)
    this.clear()
    await preloadWorld(plan.map((p) => p.item.file))
    if (token !== this.token) return
    for (const p of plan) {
      const anchor = this.anchor(p.slot)
      const model = await loadWorldModel(p.item.file, this.opts)
      if (token !== this.token) return
      if (!anchor || !model) continue
      // вещь ориентирована к зрителю; на столе — лёгкий поворот, чтобы не стояли строем
      const r = Math.sin(seed * 0.37 + p.slot.length * 1.7) * 0.35
      model.root.rotation.y = WORLD.slots[p.slot].surface === 'desk' ? r : 0
      anchor.add(model.root)
      const placed: PlacedItem = { item: p.item, slot: p.slot, model, appear: 0 }
      const l = p.item.light
      const node = l ? model.root.getObjectByName(l.node) : null
      const light = l && node ? this.pool.find((x) => !this.placed.some((q) => q.glow?.light === x)) : undefined
      if (l && node && light) {
        light.color.set(l.color)
        light.distance = l.distance
        light.decay = 2
        light.intensity = 0
        placed.glow = { light, node, base: l.intensity }
      }
      this.placed.push(placed)
      this.applyPictures(placed)
      this.play(placed, 'appear') || this.play(placed, 'idle')
    }
  }

  /** Сыграть клип вещи по роли. false — у вещи нет такого клипа. */
  play(p: PlacedItem, role: ClipRole): boolean {
    const name = p.item.clips?.[role]
    const clip = name ? p.model.clips.get(name) : undefined
    if (!clip) return false
    const action = p.model.mixer.clipAction(clip)
    action.reset()
    if (role === 'idle') {
      action.setLoop(THREE.LoopRepeat, Infinity)
    } else {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = role === 'appear'
      const done = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== action) return
        p.model.mixer.removeEventListener('finished', done)
        this.play(p, 'idle')
      }
      p.model.mixer.addEventListener('finished', done)
    }
    action.play()
    return true
  }

  /** Картинка на материале вещей (фото дня в рамке — "photo_image", экран телефона — "phone_screen"). */
  private pictures = new Map<string, THREE.Texture>()
  setPicture(material: string, image: TexImageSource | null) {
    this.pictures.get(material)?.dispose()
    this.pictures.delete(material)
    if (image) {
      // кадрировать по центру под пропорции окна рамки / экрана, чтобы фото не растягивалось
      const aspect = PICTURE_ASPECT[material]
      const src = image as CanvasImageSource & { width: number; height: number }
      let pic: TexImageSource = image
      if (aspect && src.width && src.height) {
        const c = document.createElement('canvas')
        c.height = 512
        c.width = Math.round(512 * aspect)
        const k = Math.max(c.width / src.width, c.height / src.height)
        const w = src.width * k
        const h = src.height * k
        c.getContext('2d')!.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h)
        pic = c
      }
      const tex = new THREE.Texture(pic as THREE.Texture['image'])
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      tex.needsUpdate = true
      this.pictures.set(material, tex)
    }
    for (const p of this.placed) this.applyPictures(p)
  }

  private applyPictures(p: PlacedItem) {
    for (const [name, tex] of this.pictures) {
      p.model.root.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mats.forEach((m, i) => {
          if (m.name !== name) return
          const own = (m.userData.own ? m : m.clone()) as THREE.MeshStandardMaterial
          own.userData.own = true
          own.map = tex
          own.color.set(0xffffff)
          if (name === 'phone_screen') {
            own.emissiveMap = tex
            own.emissive.set(0xffffff)
          }
          own.needsUpdate = true
          if (Array.isArray(mesh.material)) mesh.material[i] = own
          else mesh.material = own
        })
      })
    }
  }

  /** Событие сцены: сыграть event-клип у вещи (будильник звенит, телефон вибрирует). */
  trigger(itemId: string): boolean {
    const p = this.placed.find((x) => x.item.id === itemId)
    return p ? this.play(p, 'event') : false
  }

  update(dt: number) {
    for (const p of this.placed) {
      if (p.appear < 1) {
        p.appear = Math.min(1, p.appear + dt / 0.45)
        const k = p.appear
        // мягкое появление с лёгким перескоком
        const s = k < 1 ? 1 - Math.pow(1 - k, 3) + Math.sin(k * Math.PI) * 0.08 : 1
        p.model.root.scale.setScalar(s)
      }
      p.model.mixer.update(dt)
      if (p.glow) {
        p.glow.node.getWorldPosition(p.glow.light.position)
        p.glow.light.parent?.worldToLocal(p.glow.light.position)
        p.glow.light.intensity = p.glow.base * p.glow.node.scale.y * p.appear
      }
    }
  }

  clear() {
    for (const l of this.pool) l.intensity = 0
    for (const p of this.placed) {
      p.model.mixer.stopAllAction()
      p.model.root.parent?.remove(p.model.root)
    }
    this.placed = []
  }
}
