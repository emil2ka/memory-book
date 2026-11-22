// Мир вокруг стола: стена, окно с небом, полка-архив и вещи настроения дня.
// Сцена создаёт его один раз: new DeskWorld(scene); затем dress(script, seed) на каждый день и update(dt, time) каждый кадр.
import * as THREE from 'three'
import type { DayScript, TimeOfDay, Weather } from '../types/script'
import { DeskSet } from './DeskSet'
import { loadWorldModel, type WorldModel } from './loader'
import { WORLD, dayTags, type ItemDef } from './manifest'
import { Shelf3D, type ShelfDay } from './Shelf3D'
import { WindowSky } from './WindowSky'

export interface DeskWorldOptions {
  /** Тени от мира (стена принимает, полка и вещи отбрасывают). По умолчанию true. */
  shadows?: boolean
  /** Подменить список вещей (витрина). */
  items?: ItemDef[]
}

export class DeskWorld {
  readonly group = new THREE.Group()
  readonly shelf: Shelf3D
  readonly set: DeskSet
  /** Небо и погода за окном; имя window — как в API сцены. */
  readonly window: WindowSky
  /** Огоньки вещей: всегда в сцене, свободные — с яркостью 0. */
  readonly glowLights: THREE.PointLight[]
  wall: WorldModel | null = null
  windowModel: WorldModel | null = null
  /** Постоянные модели загружены (или их нет — тогда мир без них). */
  readonly ready: Promise<void>

  constructor(
    readonly scene: THREE.Scene,
    private opts: DeskWorldOptions = {},
  ) {
    this.group.name = 'desk_world'
    const shadows = opts.shadows ?? true
    this.shelf = new Shelf3D({ shadows })
    this.window = new WindowSky()
    // два огонька для вещей (свеча, банка) живут всегда, пока не нужны — с яркостью 0:
    // число ламп в сцене не меняется, шейдеры (и пиксельного слоя) не пересобираются
    this.glowLights = [0, 1].map((i) => {
      const l = new THREE.PointLight(0xffb060, 0, 5, 2)
      l.name = `world_glow_${i}`
      l.castShadow = false
      return l
    })
    this.set = new DeskSet((node) => this.node(node), { shadows, items: opts.items, lights: this.glowLights })
    this.group.add(this.shelf.group, this.set.group, this.window.light, this.window.light.target, ...this.glowLights)
    scene.add(this.group)
    this.ready = Promise.all([
      this.loadWall(shadows),
      this.loadWindow(shadows),
      this.shelf.load(),
      this.loadExtra('floor', shadows),
      this.loadExtra('desk_base', shadows),
    ]).then(() => undefined)
  }

  private async loadWall(shadows: boolean) {
    const m = await loadWorldModel(WORLD.room.wall.file, { shadows })
    if (!m) return
    // стена только принимает тени: иначе она закрывает лампу и контровой свет
    m.root.traverse((o) => (o.castShadow = false))
    if (WORLD.room.wall.at) m.root.position.set(...WORLD.room.wall.at)
    this.wall = m
    this.group.add(m.root)
  }

  private async loadWindow(shadows: boolean) {
    const m = await loadWorldModel(WORLD.room.window.file, { shadows })
    if (!m) return
    if (WORLD.room.window.at) m.root.position.set(...WORLD.room.window.at)
    this.window.attach(m.root)
    this.windowModel = m
    this.group.add(m.root)
  }

  /** Пол с ковриком и основание стола (ножки, фартук): необязательны — без файла мира просто нет. */
  floor: WorldModel | null = null
  deskBase: WorldModel | null = null
  private async loadExtra(id: 'floor' | 'desk_base', shadows: boolean) {
    const entry = WORLD.room[id]
    if (!entry) return
    const m = await loadWorldModel(entry.file, { shadows })
    if (!m) return
    // пол только принимает тени
    if (id === 'floor') m.root.traverse((o) => (o.castShadow = false))
    if (entry.at) m.root.position.set(...entry.at)
    if (id === 'floor') this.floor = m
    else this.deskBase = m
    this.group.add(m.root)
  }

  /** Узел из модели комнаты: "window/slot_sill_0", "shelf/slot_top_1". */
  node(path: string): THREE.Object3D | null {
    const [model, name] = path.split('/')
    const root = model === 'window' ? this.windowModel?.root : model === 'shelf' ? this.shelf.model?.root : model === 'wall' ? this.wall?.root : null
    return root?.getObjectByName(name) ?? null
  }

  /** Одеть мир под день: окно (время суток и погода) и 3–5 вещей настроения. Один день — всегда одна раскладка. */
  async dress(script: DayScript, seed: number) {
    const { tags, sides } = dayTags(script)
    // противоречие «холодно + уютно»: иней на стекле даже в ясный день
    const frost = script.weather === 'snow' ? 0.9 : sides?.some((s) => s.includes('cold')) || tags.has('cold') ? 0.8 : 0
    this.window.set(script.time_of_day, script.weather, { frost })
    await this.ready
    await this.set.dress(script, seed)
  }

  /** Время суток и погода за окном; fade — секунды перехода. */
  setWindow(time: TimeOfDay, weather: Weather, opts?: { frost?: number; fade?: number }) {
    this.window.set(time, weather, opts)
  }

  /** Фото дня в рамке на столе (если рамка выпала дню); null — заглушка модели. */
  setPhoto(image: TexImageSource | null) {
    this.set.setPicture('photo_image', image)
  }

  /** Дни на полке, старые первыми. */
  placeDays(days: ShelfDay[]) {
    return this.shelf.place(days)
  }

  update(dt: number, _time?: number) {
    this.window.update(dt)
    this.set.update(dt)
  }

  dispose() {
    this.set.clear()
    this.shelf.dispose()
    this.window.dispose()
    this.scene.remove(this.group)
  }
}

export { coverColorFor, spineColor } from './Shelf3D'
