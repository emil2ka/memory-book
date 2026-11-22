// Только для разработки: снимки фильма покадрово и проверочные снимки.
// Подключается из main.tsx под import.meta.env.DEV. Кадры сохраняются через /__snap
// (tools/snapshot-plugin.ts) в assets/_raw/snaps/.
import { sampleDays } from '../timeline/samples'
import type { Timeline } from '../types/timeline'
import { registerSvg } from '../scene/Sticker'

type W = typeof window & {
  world: {
    playDay: (text: string, script: unknown, opts: { seed?: number; photoCount?: number }) => {
      pause(): void
      seek(t: number): void
      tick(): void
      advanceTo(t: number): void
      timeline: Timeline
    }
    setDraftPhotos(images: HTMLCanvasElement[]): void
    film: { update(t: number, dt: number): void; anim: { hero: { row: string } } }
    px: {
      renderer: { domElement: HTMLCanvasElement; render(s: unknown, c: unknown): void }
      scene: unknown
      camera: unknown
      pixel: { render(r: unknown, s: unknown, c: unknown): void } | null
      fit(): void
    }
  }
}

const w = window as W

/** Нарисовать кадр сразу, не дожидаясь requestAnimationFrame (во фоновой вкладке он стоит). */
const frame = async () => {
  const px = w.world.px as typeof w.world.px & { fit(): void; renderer: { domElement: HTMLCanvasElement } }
  // в скрытой панели ResizeObserver не срабатывает: подгоняем холст сами
  if (px.renderer.domElement.width < 64) px.fit()
  if (px.pixel) px.pixel.render(px.renderer, px.scene, px.camera)
  else px.renderer.render(px.scene, px.camera)
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function save(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
  await fetch(`/__snap?name=${name}`, { method: 'POST', body: blob })
}

/** Простые картинки вместо фото — только для проверки, в сдачу не идут. */
export function testPhotos(): HTMLCanvasElement[] {
  const mk = (sky: string[], ground: string[], trees: string[], seed: number) => {
    const c = document.createElement('canvas')
    c.width = 900
    c.height = 700
    const g = c.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 0, 700)
    gr.addColorStop(0, sky[0])
    gr.addColorStop(0.6, sky[1])
    gr.addColorStop(0.61, ground[0])
    gr.addColorStop(1, ground[1])
    g.fillStyle = gr
    g.fillRect(0, 0, 900, 700)
    let s = seed
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < 9; i++) {
      const x = r() * 900
      const y = 330 + r() * 90
      g.fillStyle = '#4b3524'
      g.fillRect(x - 8, y, 16, 140)
      g.fillStyle = trees[i % trees.length]
      g.beginPath()
      g.arc(x, y, 60 + r() * 70, 0, 7)
      g.fill()
    }
    return c
  }
  return [
    mk(['#9fb6c9', '#e9d8b8'], ['#b8913f', '#6e5a2e'], ['#e3a33a', '#d0702f', '#c9953d'], 7),
    mk(['#38406a', '#e08a5a'], ['#3a3a3a', '#1e1e1e'], ['#c9953d', '#7a4a2a'], 11),
    mk(['#cfd8de', '#f0e6d2'], ['#8fa868', '#55784a'], ['#55784a', '#8fa868'], 3),
  ]
}

/**
 * Проиграть демо-день и снять кадры в моменты times (секунды фильма) реальной камерой фильма.
 * Время идёт шагами 1/24 с, поэтому физика шарфа и шаги такие же, как при просмотре.
 */
export async function filmSheet(day: number, times: number[], name: string, patch?: (tl: Timeline) => void, cols = 3, Wd = 640, photoCount = 0) {
  const d = sampleDays[day]
  document.querySelectorAll<HTMLElement>('.shelf, [class*=shelf]').forEach((e) => (e.style.display = 'none'))
  const p = w.world.playDay(d.text, d.script, { seed: 7, photoCount })
  p.pause()
  if (patch) patch(p.timeline)
  const f = w.world.film
  const realTick = p.tick.bind(p)
  p.tick = () => {}
  // картинки и сценки готовятся асинхронно (сценки — из кэша или от Haiku)
  await sleep((window as unknown as { __sceneWait?: number }).__sceneWait ?? 400)
  const H = (Wd * 9) / 16
  const sheet = document.createElement('canvas')
  sheet.width = Wd * cols
  sheet.height = H * Math.ceil(times.length / cols)
  const g = sheet.getContext('2d')!
  const c = w.world.px.renderer.domElement
  p.seek(0)
  let t = 0
  for (let i = 0; i < times.length; i++) {
    while (t < times[i]) {
      t = Math.min(times[i], t + 1 / 24)
      p.advanceTo(t)
      f.update(t, 1 / 24)
    }
    await frame()
    g.drawImage(c, 0, 0, c.width, c.height, (i % cols) * Wd, Math.floor(i / cols) * H, Wd, H)
    g.fillStyle = '#fff'
    g.font = '22px sans-serif'
    g.fillText(`${times[i]} ${f.anim.hero.row}`, (i % cols) * Wd + 8, Math.floor(i / cols) * H + 26)
  }
  p.tick = realTick
  await save(sheet, name)
  return 'ok'
}

/** Видео-кадры отрезка [a, b] с шагом 1/fps в assets/_raw/snaps/v_0000.png… */
export async function filmFrames(day: number, ranges: [number, number][], patch?: (tl: Timeline) => void, fps = 24, Wd = 960, photoCount = 0) {
  const d = sampleDays[day]
  const p = w.world.playDay(d.text, d.script, { seed: 7, photoCount })
  p.pause()
  if (patch) patch(p.timeline)
  const f = w.world.film
  const realTick = p.tick.bind(p)
  p.tick = () => {}
  const c = w.world.px.renderer.domElement
  const small = document.createElement('canvas')
  small.width = Wd
  small.height = (Wd * 9) / 16
  const g = small.getContext('2d')!
  let n = 0
  for (const [a, b] of ranges) {
    p.seek(0)
    for (let t = 0; t < a; t += 1 / fps) {
      p.advanceTo(t)
      f.update(t, 1 / fps)
    }
    for (let t = a; t <= b; t += 1 / fps) {
      p.advanceTo(t)
      f.update(t, 1 / fps)
      await frame()
      g.drawImage(c, 0, 0, c.width, c.height, 0, 0, small.width, small.height)
      await save(small, `v_${String(n).padStart(4, '0')}.png`)
      n++
    }
  }
  p.tick = realTick
  return n
}

/** Вставить в таймлайн дня полароид и веер (пока их не ставит хореограф). */
export function photoPatch(at: number, dur = 8) {
  return (tl: Timeline) => {
    tl.events = tl.events.filter((e) => !(e.type === 'camera' && e.t >= at - 0.5 && e.t < at + dur + 2.6))
    tl.events.push({ type: 'photo_reveal', t: at, dur, beat: -1, photo: 0 })
    tl.events.push({ type: 'photo_fan', t: at + dur, dur: 2.5, beat: -1, from: 1 })
    tl.events.push({ type: 'camera', t: at + dur, dur: 2.6, beat: -1, shot: 'wide', targetQuote: null })
    tl.events.sort((a, b) => a.t - b.t)
  }
}

/** Две проверочные картинки (какао и дерево), пока нет библиотеки SVG. */
export function testSvgs() {
  registerSvg(
    'cocoa',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#1b1410" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M40 22 q-5 -7 0 -13 M54 20 q-5 -7 0 -13" fill="none" stroke="#fbf6ea" stroke-width="3.5"/><path d="M70 46 q18 0 18 15 q0 15 -18 15" fill="none" stroke-width="10"/><path d="M70 46 q18 0 18 15 q0 15 -18 15" fill="none" stroke="#f3e6c8" stroke-width="4"/><path d="M22 34 h50 v46 q0 16 -16 16 h-18 q-16 0 -16 -16 z" fill="#f3e6c8"/><path d="M61 37 h9 v43 q0 13 -13 13 h-3 q10 -5 7 -16 z" fill="#cbb78d" stroke="none"/><rect x="22" y="66" width="50" height="9" fill="#b5432f"/><ellipse cx="47" cy="34" rx="25" ry="6" fill="#5c3b22"/><rect x="35" y="25" width="11" height="9" rx="2" fill="#fbf6ea"/><rect x="49" y="27" width="9" height="7" rx="2" fill="#f2a983"/><path d="M29 43 v19" stroke="#fbf6ea" stroke-width="3"/></g></svg>`,
  )
  registerSvg(
    'tree',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#1b1410" stroke-width="3" stroke-linejoin="round"><path d="M44 96 l3 -42 h7 l3 42 z" fill="#5c3b22"/><path d="M50 56 l-12 -8 M52 62 l12 -9" fill="none"/><circle cx="31" cy="48" r="17" fill="#55784a"/><circle cx="69" cy="47" r="17" fill="#55784a"/><circle cx="50" cy="34" r="27" fill="#55784a"/><circle cx="42" cy="26" r="11" fill="#8fa868" stroke="none"/><circle cx="62" cy="21" r="6" fill="#c3d39a" stroke="none"/><circle cx="26" cy="44" r="6" fill="#8fa868" stroke="none"/><circle cx="37" cy="52" r="3.5" fill="#b5432f"/><circle cx="66" cy="40" r="3.5" fill="#b5432f"/><circle cx="55" cy="56" r="3.5" fill="#b5432f"/></g></svg>`,
  )
}

/**
 * Проба «Haiku собирает сценку»: показать сценки из eval/haiku-scene/scenes.json прямо в сцене —
 * человечек в позе, предмет в руках, декорация и деталь вокруг. Два ракурса на сценку, лист в snaps/.
 */
export async function showScenes(name = 'haiku_scenes.png') {
  const THREE = await import('three')
  const { buildKit } = await import('../kit/build')
  const { toonFor, toPixelLayer } = await import('./PixelLayer')
  const { KIT_UNIT } = await import('../kit/format')
  type Obj = { role: string; ru: string; at: [number, number]; rotY: number; parts: unknown[] }
  type Sc = { phrase: string; action: string; objects: Obj[] }
  const scenes = (await (await fetch('/eval/haiku-scene/scenes.json')).json()) as Sc[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (w.world as any).film
  const px = w.world.px as any
  if (px.renderer.domElement.width < 64) px.fit()
  f.person?.setVisible(false)
  f.book.setOpen(1)
  // вход человека и экран полки управляют камерой сами — выключаем, иначе первые кадры общие
  f.introDone = true
  f.introCam = null
  f.shelfMode = false
  const W = 640
  const H = 400
  const sheet = document.createElement('canvas')
  sheet.width = W * 2
  sheet.height = H * scenes.length
  const g = sheet.getContext('2d')!
  const fig = f.figures[0].fig
  const hero = f.hero.object
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i]
    f.book.setText(sc.phrase)
    const at = new THREE.Vector3(-1.5, f.book.pageY, 0.4)
    hero.position.copy(at)
    hero.visible = true
    f.anim.hero = { row: sc.action, t0: 0, loop: sc.action !== 'sit', fps: 6, dur: 1.5 }
    const made: any[] = []
    let handObj: any = null
    let handH = 0
    for (const o of sc.objects) {
      const model = { id: 'scene', ru: o.ru, stems: [], tags: [], hold: o.role === 'hand' ? 'hand' : 'ground', parts: o.parts }
      const obj = buildKit(model as never, toonFor)
      toPixelLayer(obj)
      obj.rotation.y = ((o.rotY || 0) * Math.PI) / 180
      if (o.role === 'hand') {
        handObj = obj
        handH = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y
      } else obj.position.set(at.x + (o.at?.[0] ?? 0) * KIT_UNIT, at.y, at.z + (o.at?.[1] ?? -25) * KIT_UNIT)
      px.scene.add(obj)
      made.push(obj)
    }
    const views = [
      { pos: [1.3, 1.25, 2.9], look: [0.05, 0.5, -0.45] },
      { pos: [-2.6, 1.0, 1.4], look: [0.1, 0.5, -0.4] },
    ]
    for (let v = 0; v < 2; v++) {
      for (let k = 0; k < 40; k++) {
        f.camPos.set(at.x + views[v].pos[0], at.y + views[v].pos[1], at.z + views[v].pos[2])
        f.camLook.set(at.x + views[v].look[0], at.y + views[v].look[1], at.z + views[v].look[2])
        f.update(1 + k / 30, 1 / 30)
        if (handObj) {
          const p = new THREE.Vector3()
          if (sc.action === 'drink') fig.head.localToWorld(p.set(1.5, 3.0, 9))
          else fig.chest.getWorldPosition(p)
          handObj.position.copy(p)
          handObj.position.y -= handH * 0.5
          handObj.rotation.y = fig.object.rotation.y
        }
      }
      f.applyCamera()
      px.pixel.render(px.renderer, px.scene, px.camera)
      const c = px.renderer.domElement
      g.drawImage(c, 0, 0, c.width, c.height, v * W, i * H, W, H)
    }
    g.fillStyle = 'rgba(0,0,0,0.55)'
    g.fillRect(0, i * H, W * 2, 30)
    g.fillStyle = '#fff'
    g.font = '20px sans-serif'
    g.fillText(`«${sc.phrase}» — ${sc.objects.map((o) => o.ru).join(', ')}`, 10, i * H + 22)
    for (const o of made) px.scene.remove(o)
  }
  hero.visible = false
  f.person?.setVisible(true)
  await save(sheet, name)
  return scenes.length
}

/** Проверка сценок в фильме без сервера: цитате бита сопоставляется сценка из файла (по порядку или по карте). */
export async function fakeScenes(map: Record<string, number>, path = '/eval/haiku-scene/scenes.json') {
  const scenes = (await (await fetch(path)).json()) as { action: string; objects: unknown[] }[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (w.world as any).film
  f.sceneProvider = {
    request() {},
    get(quote: string) {
      const i = map[quote]
      const s = i === undefined ? null : scenes[i]
      if (!s) return null
      // в пробе фигуры лежат прямо в объекте — заворачиваем в model
      const objects = (s.objects as { role: string; ru: string; parts?: unknown[]; model?: unknown; ref?: string }[]).map((o) => ({
        ...o,
        model: o.model ?? (o.parts ? { id: 'probe', ru: o.ru, stems: [], tags: [], hold: o.role === 'hand' ? 'hand' : 'ground', parts: o.parts } : undefined),
      }))
      return { quote, action: s.action, objects }
    },
  }
  return Object.keys(map).length
}

Object.assign(window, { __dev: { filmSheet, filmFrames, testPhotos, photoPatch, save, testSvgs, showScenes, fakeScenes } })
