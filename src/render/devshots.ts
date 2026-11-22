// Только для разработки: снимки фильма покадрово и проверочные снимки.
// Подключается из main.tsx под import.meta.env.DEV. Кадры сохраняются через /__snap
// (tools/snapshot-plugin.ts) в assets/_raw/snaps/.
import { sampleDays } from '../timeline/samples'
import { estimateBeats } from '../audio/tempo'
import { energyCurve, riseTime, type SongShape } from '../timeline/songShape'
import { SONG_LIST } from '../director/songList'

/** Свой тестовый трек (не чужая песня, в сборку не идёт): щелчки на долях, тихо → громко с 18 с → затухание с 48 с. */
function testTrack(bpm: number, seconds = 70, rate = 22050): { samples: Float32Array; rate: number } {
  const samples = new Float32Array(seconds * rate)
  const amp = (t: number) => (t < 18 ? 0.25 : t < 48 ? 0.9 : 0.12)
  const period = 60 / bpm
  for (let k = 0; k * period < seconds; k++) {
    const t0 = 0.3 + k * period
    const a = amp(t0)
    for (let i = 0; i < rate * 0.12; i++) {
      const idx = Math.floor(t0 * rate) + i
      if (idx >= samples.length) break
      samples[idx] += a * Math.sin((2 * Math.PI * 70 * i) / rate) * Math.exp(-i / (rate * 0.03))
    }
  }
  // тихий фон, чтобы громкость была и между долями
  for (let i = 0; i < samples.length; i++) samples[i] += amp(i / rate) * 0.05 * Math.sin((2 * Math.PI * 220 * i) / rate)
  return { samples, rate }
}

/** Как фильм лёг на песню: доля начал битов и дорог на долях (±0.05 с), поворот и подъём. */
function songReport(tl: Timeline, song: SongShape, script: DayScript) {
  const beats = song.beatTimes ?? []
  const onBeat = (t: number) => beats.some((b) => Math.abs(b - t) <= 0.05)
  const starts = (tl.beats ?? []).slice(1).map((w) => w.start)
  const travels = tl.events.filter((e) => e.type === 'travel').map((e) => e.t + e.dur)
  const turn = tl.beats?.find((w) => w.beat === tl.turn)
  return {
    songBpm: song.bpm ? Math.round(song.bpm) : null,
    startsOnBeat: `${starts.filter(onBeat).length}/${starts.length}`,
    travelEndsOnBeat: `${travels.filter(onBeat).length}/${travels.length}`,
    turn: turn ? { beat: turn.beat, start: turn.start, quote: turn.quote } : null,
    rise: riseTime(song.energyCurve, 0, 70),
    songWhy: script.why[2],
    travelMode: tl.events.find((e) => e.type === 'travel')?.type === 'travel' ? (tl.events.find((e) => e.type === 'travel') as { mode: string }).mode : null,
    pace: tl.pace,
  }
}
import type { Timeline } from '../types/timeline'
import type { DayScript, DirectorInput } from '../types/script'
import type { SceneRequest } from '../kit/scene'
import { closeSceneDb, forgetScenes, makeScene, sceneFor } from '../kit/sceneClient'
import { sceneRef } from '../kit/sceneCheck'
import { directDay, fallbackDirect } from '../director'
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
    tl.events.push({ type: 'photo_fan', t: at + dur, dur: 2.5, beat: -1, from: 1, photos: [1, 2] })
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

// ---------- прогон дня (план 13 § 6) ----------

export interface RunDayInput {
  /** Имя папки в assets/_raw/runs/ (латиница, цифры, _ и -). */
  name: string
  text: string
  /** Сколько проверочных фото (0–3). */
  photos?: number
  /** Настоящие снимки по адресам (например /assets/_raw/photos_test/photo_cafe.jpg) — вместо проверочных. */
  photoFiles?: string[]
  song?: DirectorInput['song']
  /** Набор: etalon, demo, eval, edge. */
  kind?: string
  seed?: number
  /** Готовый сценарий — без режиссёра. */
  script?: DayScript
  /** Без ИИ: запасной режиссёр и сценки из библиотеки. */
  offline?: boolean
  /** Тест узнавания (Haiku по кадру бита). По умолчанию да. */
  recognize?: boolean
  /**
   * История под песню (план 15): 'file' — свой тестовый трек, синтезируется здесь же (доли 104 bpm, тихо → громко с 18 с →
   * затухание с 48 с) и проходит настоящий анализ (estimateBeats, energyCurve); 'yt' — песня из списка (Here Comes the Sun, bpm).
   */
  songTest?: 'file' | 'yt'
  /** Начать с пустого кэша сценок (честные тайминги ИИ). По умолчанию да. */
  freshCache?: boolean
  /** Нет сети для ИИ: любой запрос к /api/* падает как сетевая ошибка (попытки считаются в fetches со status 0). */
  blockApi?: boolean
}

interface SceneLog {
  beat: number
  quote: string
  req: { hero_prop?: string; place?: string | null; companion?: { name: string; role: string } | null; hint?: string }
  /** Когда запрошена, секунды от старта сборки фильма. */
  at: number
  ms?: number
  source?: string
  reason?: string
  action?: string
  objects?: string[]
  /** Главный построенный предмет (в руках), по-русски. */
  built?: string
  /** Пришла позже, чем бит превращает слово (в реальном времени). */
  late?: boolean
}

const sendRun = (run: string, file: string, body: Blob | string) => fetch(`/__run/save?run=${run}&file=${file}`, { method: 'POST', body })
const toBlob = (c: HTMLCanvasElement, type = 'image/png', q?: number) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, q))

/** Пустоты фильма: самые длинные отрезки без действия (не вступление, бит, фото, противоречие, финал). */
export function filmGaps(tl: Timeline): { first: number; maxGap: number; gaps: [number, number][] } {
  const spans: [number, number][] = []
  for (const e of tl.events) {
    if (e.beat === -1 && e.type !== 'camera') spans.push([e.t, e.t + e.dur])
    if (e.type === 'photo_reveal' || e.type === 'photo_fan' || e.type === 'staging') spans.push([e.t, e.t + e.dur])
  }
  for (const w of tl.beats ?? []) spans.push([w.start, w.end + 0.6])
  spans.sort((a, b) => a[0] - b[0])
  const gaps: [number, number][] = []
  let cur = 0
  for (const [a, b] of spans) {
    if (a > cur + 0.05) gaps.push([+cur.toFixed(2), +a.toFixed(2)])
    cur = Math.max(cur, b)
  }
  if (tl.duration > cur + 0.05) gaps.push([+cur.toFixed(2), +tl.duration.toFixed(2)])
  return { first: tl.beats?.[0]?.transform ?? -1, maxGap: Math.max(0, ...gaps.map(([a, b]) => b - a)), gaps }
}

/**
 * Весь путь дня без кликов, с настоящим ИИ: режиссёр → сценки → фильм покадрово → кадр каждого бита на пике →
 * тест узнавания. Пишет в assets/_raw/runs/<name>/: beat_N.png, beats.jpg (лист битов с ответами),
 * sheet.jpg (кадр каждую секунду), timeline.json, run.json (сценарий, источники сценок, тайминги ИИ, ошибки консоли,
 * узнавание, итог). Нужен frozen-сервер (eval/vite.frozen.config.ts): там /__run/save и /__run/recognize.
 */
export async function runDay(input: RunDayInput) {
  if (!/^[a-z0-9_-]{1,48}$/i.test(input.name)) throw new Error('name: латиница, цифры, _ и -')
  const run = input.name
  const t0 = performance.now()
  const sec = () => +((performance.now() - t0) / 1000).toFixed(2)
  // ошибки консоли за прогон
  const errors: string[] = []
  const origError = console.error
  console.error = (...a: unknown[]) => {
    errors.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 300))
    origError.apply(console, a as [])
  }
  const onErr = (e: ErrorEvent) => errors.push(`error: ${e.message}`.slice(0, 300))
  const onRej = (e: PromiseRejectionEvent) => errors.push(`unhandledrejection: ${String(e.reason)}`.slice(0, 300))
  window.addEventListener('error', onErr)
  window.addEventListener('unhandledrejection', onRej)
  // запросы к ИИ: путь, время, статус
  const fetches: { url: string; at: number; ms: number; status: number }[] = []
  let pending = 0
  const origFetch = window.fetch
  window.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url instanceof Request ? url.url : url)
    if (!u.includes('/api/')) return origFetch(url, init)
    const at = sec()
    pending++
    try {
      if (input.blockApi) throw new TypeError('Failed to fetch (blockApi)')
      const r = await origFetch(url, init)
      fetches.push({ url: u.replace(/^.*(\/api\/\w+).*$/, '$1'), at, ms: Math.round((performance.now() - t0) - at * 1000), status: r.status })
      return r
    } catch (e) {
      fetches.push({ url: u.replace(/^.*(\/api\/\w+).*$/, '$1'), at, ms: Math.round((performance.now() - t0) - at * 1000), status: 0 })
      throw e
    } finally {
      pending--
    }
  }
  const f = (w.world as unknown as { film: Record<string, unknown> & { update(t: number, dt: number): void } }).film
  const prevProvider = f.sceneProvider
  try {
    if (input.freshCache !== false) {
      await closeSceneDb()
      await new Promise<void>((r) => {
        const d = indexedDB.deleteDatabase('memory-book-scene')
        d.onsuccess = d.onerror = d.onblocked = () => r()
      })
    }
    forgetScenes()
    // фото и песня
    let photos: HTMLCanvasElement[]
    if (input.photoFiles?.length) {
      photos = await Promise.all(
        input.photoFiles.slice(0, 5).map(async (u) => {
          const img = new Image()
          img.src = u
          await img.decode()
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          c.getContext('2d')!.drawImage(img, 0, 0)
          return c
        }),
      )
    } else photos = testPhotos().slice(0, Math.max(0, Math.min(3, input.photos ?? 0)))
    const n = photos.length
    const photoUrls = photos.map((c) => {
      const s = document.createElement('canvas')
      s.width = 768
      s.height = Math.round((768 * c.height) / c.width)
      s.getContext('2d')!.drawImage(c, 0, 0, s.width, s.height)
      return s.toDataURL('image/jpeg', 0.8)
    })
    let bpm = input.song?.measuredTempoBpm
    let beatTimes = bpm ? Array.from({ length: Math.floor(80 / (60 / bpm)) }, (_, i) => +(0.3 + (i * 60) / bpm!).toFixed(3)) : undefined
    // история под песню: форма песни для хореографа и песня для режиссёра
    let songShape: SongShape | undefined
    let directorSong = input.song ?? null
    if (input.songTest === 'file') {
      const t = testTrack(104)
      const est = estimateBeats(t.samples, t.rate)
      bpm = est.bpm
      beatTimes = est.beatTimes
      songShape = { bpm: est.bpm, beatTimes: est.beatTimes, energyCurve: energyCurve(t.samples, t.rate), duration: t.samples.length / t.rate }
      directorSong = { title: 'тестовый трек', measuredTempoBpm: est.bpm, energy: 0.55 }
    } else if (input.songTest === 'yt') {
      const listed = SONG_LIST.find((x) => x.id === 'here_comes_the_sun')!
      bpm = listed.bpm
      beatTimes = Array.from({ length: 200 }, (_, i) => +((i * 60) / listed.bpm!).toFixed(3))
      songShape = { bpm: listed.bpm, beatTimes }
      directorSong = { title: listed.title, artist: listed.artist, bpm: listed.bpm, energy: listed.energy, mood: listed.mood }
    }
    // ① режиссёр
    const dT0 = sec()
    let director: { source: string; ms: number; reason?: string; issues?: string[] }
    let script: DayScript
    if (input.script) {
      script = input.script
      director = { source: 'given', ms: 0 }
    } else if (input.offline) {
      script = fallbackDirect({ text: input.text })
      director = { source: 'fallback', ms: Math.round((sec() - dT0) * 1000), reason: 'offline' }
    } else {
      const res = await directDay({ text: input.text, photos: photoUrls, song: directorSong })
      script = res.script
      director = { source: res.source, ms: Math.round((sec() - dT0) * 1000), reason: res.reason, issues: res.issues }
    }
    // ② сценки: тот же поставщик, что у сцены, но с записью источника и времени
    const scenes: SceneLog[] = []
    const tPlay = sec()
    f.sceneProvider = {
      request: (req: SceneRequest) => {
        const rec: SceneLog = { beat: -1, quote: req.quote, req: { hero_prop: req.hero_prop, place: req.place, companion: req.companion, hint: req.hint }, at: +(sec() - tPlay).toFixed(2) }
        scenes.push(rec)
        const s0 = performance.now()
        void makeScene(req, { offline: input.offline }).then((r) => {
          rec.ms = Math.round(performance.now() - s0)
          rec.source = r.source
          rec.reason = r.reason
          rec.action = r.scene.action
          rec.objects = r.scene.objects.map((o) => `${o.role}:${o.ref ? o.ref : `model ${o.ru} (${o.model?.parts.length ?? 0})`}`)
          // что в руках по-русски — для проверки «узнан ли построенный предмет»
          const hand = r.scene.objects.find((o) => o.role === 'hand') ?? r.scene.objects[0]
          rec.built = hand ? (hand.ref ? sceneRef(hand.ref)?.ru ?? hand.ru : hand.ru) : undefined
        })
      },
      get: (q: string) => sceneFor(q),
    }
    w.world.setDraftPhotos(photos)
    const p = (w.world.playDay as unknown as (t: string, s: DayScript, o: Record<string, unknown>) => ReturnType<W['world']['playDay']>)(input.text, script, {
      seed: input.seed ?? 7,
      photoCount: n,
      ...(beatTimes ? { beatTimes } : {}),
      ...(songShape ? { song: songShape } : {}),
    })
    p.pause()
    const realTick = p.tick.bind(p)
    p.tick = () => {}
    const tl = p.timeline
    // ждём ИИ: сценки и дорисовки (не дольше 25 с)
    const wait0 = performance.now()
    while (performance.now() - wait0 < 25_000 && (pending > 0 || scenes.some((s) => s.ms === undefined))) await sleep(100)
    for (const s of scenes) {
      const win = tl.beats?.find((b) => b.quote === s.quote)
      s.beat = win?.beat ?? -1
      if (win && s.ms !== undefined) s.late = s.at + s.ms / 1000 > win.transform
    }
    // ③ фильм покадрово: кадр бита на пике (середина крупного кадра) + кадр каждую секунду
    const peaks = (tl.beats ?? []).map((b) => ({ b, t: (b.hold[0] + b.hold[1]) / 2 }))
    const c = w.world.px.renderer.domElement
    const cols = 8
    const cw = 320
    const ch = 180
    const secs = Math.ceil(tl.duration)
    const sheet = document.createElement('canvas')
    sheet.width = cw * cols
    sheet.height = ch * Math.ceil(secs / cols)
    const sg = sheet.getContext('2d')!
    sg.fillStyle = '#1b1410'
    sg.fillRect(0, 0, sheet.width, sheet.height)
    const big = document.createElement('canvas')
    big.width = 1280
    big.height = 720
    const bg = big.getContext('2d')!
    // jpg — кадр как у зрителя (с цитатой внизу), bare — тот же кадр без полоски с цитатой
    const beatShots: { b: (typeof peaks)[number]['b']; jpg: string; bare: string }[] = []
    p.seek(0)
    const fps = 24
    let nextSec = 0
    let pi = 0
    for (let i = 0; i <= Math.ceil(tl.duration * fps); i++) {
      const t = Math.min(tl.duration, i / fps)
      p.advanceTo(t)
      f.update(t, 1 / fps)
      const atPeak = pi < peaks.length && t >= peaks[pi].t - 1e-6
      if (t >= nextSec - 1e-6 || atPeak) await frame()
      if (t >= nextSec - 1e-6) {
        const k = Math.round(nextSec)
        sg.drawImage(c, 0, 0, c.width, c.height, (k % cols) * cw, Math.floor(k / cols) * ch, cw, ch)
        const cur = tl.beats?.find((b) => t >= b.start && t <= b.end + 0.6)
        sg.fillStyle = '#fff'
        sg.font = '13px sans-serif'
        sg.fillText(`${k} с${cur ? ` · ${cur.beat}: ${cur.quote.slice(0, 30)}` : ''}`, (k % cols) * cw + 5, Math.floor(k / cols) * ch + 15)
        nextSec++
      }
      if (atPeak) {
        bg.drawImage(c, 0, 0, c.width, c.height, 0, 0, big.width, big.height)
        const k = beatShots.length
        await sendRun(run, `beat_${k}.png`, await toBlob(big))
        const jpg = big.toDataURL('image/jpeg', 0.85)
        // тот же кадр без полоски с цитатой (тест узнавания «без подписи»)
        const cap = (f as unknown as { caption?: { mesh: { visible: boolean } } | null }).caption?.mesh
        let bare = jpg
        if (cap?.visible) {
          cap.visible = false
          await frame()
          bg.drawImage(c, 0, 0, c.width, c.height, 0, 0, big.width, big.height)
          bare = big.toDataURL('image/jpeg', 0.85)
          cap.visible = true
          await frame()
        }
        beatShots.push({ b: peaks[pi].b, jpg, bare })
        pi++
      }
    }
    p.tick = realTick
    await sendRun(run, 'sheet.jpg', await toBlob(sheet, 'image/jpeg', 0.85))
    await sendRun(run, 'timeline.json', JSON.stringify(tl, null, 1))
    // ④ тест узнавания
    type Seen = { held: string; place: string; second: boolean; phrase: string }
    type Rec =
      | { seen: Seen; match: { prop: boolean; place: boolean | null; companion: boolean | null; built: boolean | null }; ms: { see: number; judge: number }; withCaption?: { seen: Seen; match: { prop: boolean; place: boolean | null; companion: boolean | null } } }
      | { error: string }
    const recog: Rec[] = []
    const builtOf = (quote: string) => scenes.find((s) => s.quote === quote)?.built ?? null
    if (input.recognize !== false) {
      for (const s of beatShots) {
        try {
          const r = await origFetch('/__run/recognize', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            // image — без подписи, full — с цитатой, как у зрителя (два числа)
            body: JSON.stringify({ image: s.bare, full: s.jpg, mediaType: 'image/jpeg', expect: { hero_prop: s.b.hero_prop, place: s.b.place, companion: s.b.companion, built: builtOf(s.b.quote) } }),
          })
          recog.push(r.ok ? ((await r.json()) as Rec) : { error: `http ${r.status}` })
        } catch (e) {
          recog.push({ error: e instanceof Error ? e.message : 'error' })
        }
      }
    }
    // лист битов: кадр + цитата + ожидание + что увидела Haiku
    const bw = 480
    const bh = 270
    const cap = 92
    const bc = Math.min(3, Math.max(1, beatShots.length))
    const bs = document.createElement('canvas')
    bs.width = bw * bc
    bs.height = (bh + cap) * Math.max(1, Math.ceil(beatShots.length / bc))
    const bsg = bs.getContext('2d')!
    bsg.fillStyle = '#1b1410'
    bsg.fillRect(0, 0, bs.width, bs.height)
    for (let k = 0; k < beatShots.length; k++) {
      const x = (k % bc) * bw
      const y = Math.floor(k / bc) * (bh + cap)
      const img = new Image()
      img.src = beatShots[k].jpg
      await img.decode()
      bsg.drawImage(img, x, y, bw, bh)
      const b = beatShots[k].b
      const r = recog[k]
      bsg.font = '14px sans-serif'
      bsg.fillStyle = '#f3e6c8'
      bsg.fillText(`${b.beat}: «${b.quote.slice(0, 48)}»`, x + 6, y + bh + 18)
      bsg.fillText(`ждём: ${b.hero_prop}${b.place ? ` · ${b.place}` : ''}${b.companion ? ` · ${b.companion.role}` : ''} | построено: ${builtOf(b.quote) ?? '—'}${r && 'seen' in r && r.match.built !== null ? (r.match.built ? ' ✓' : ' ✗') : ''}`.slice(0, 70), x + 6, y + bh + 38)
      if (r && 'seen' in r) {
        const ok = (v: boolean | null) => (v === null ? '' : v ? '✓' : '✗')
        bsg.fillStyle = r.match.prop ? '#9fd48a' : '#ff8a7a'
        bsg.fillText(`видно: ${r.seen.held || '—'}${r.seen.place ? ` · ${r.seen.place}` : ''} ${ok(r.match.prop)}${r.match.place !== null ? ` место ${ok(r.match.place)}` : ''}${r.match.companion !== null ? ` второй ${ok(r.match.companion)}` : ''}`, x + 6, y + bh + 58)
        bsg.fillStyle = '#c9b89a'
        // с цитатой в кадре (как у зрителя)
        const wc = r.withCaption
        bsg.fillText(wc ? `с цитатой: ${wc.seen.held || '—'} ${ok(wc.match.prop)}${wc.match.place !== null ? ` место ${ok(wc.match.place)}` : ''}` : r.seen.phrase.slice(0, 64), x + 6, y + bh + 78)
      }
    }
    await sendRun(run, 'beats.jpg', await toBlob(bs, 'image/jpeg', 0.85))
    // итог
    const ok = recog.filter((r): r is Extract<Rec, { seen: unknown }> => 'seen' in r)
    const gaps = filmGaps(tl)
    const summary = {
      name: run,
      kind: input.kind ?? '',
      beats: tl.beats?.length ?? 0,
      duration: tl.duration,
      // история под песню: начала битов на долях, поворот — где подъём
      ...(songShape ? songReport(tl, songShape, script) : {}),
      firstWord: +gaps.first.toFixed(2),
      maxGap: +gaps.maxGap.toFixed(2),
      director: director.source,
      directorMs: director.ms,
      scenes: { claude: scenes.filter((s) => s.source === 'claude').length, cache: scenes.filter((s) => s.source === 'cache').length, fallback: scenes.filter((s) => s.source === 'fallback').length, late: scenes.filter((s) => s.late).length },
      sceneMs: scenes.map((s) => s.ms ?? -1),
      models: scenes.reduce((n, s) => n + (s.objects ?? []).filter((o) => o.includes('model ')).length, 0),
      objects: scenes.reduce((n, s) => n + (s.objects?.length ?? 0), 0),
      recognized: {
        prop: ok.filter((r) => r.match.prop).length,
        place: ok.filter((r) => r.match.place === true).length,
        placeAsked: ok.filter((r) => r.match.place !== null).length,
        companion: ok.filter((r) => r.match.companion === true).length,
        companionAsked: ok.filter((r) => r.match.companion !== null).length,
        built: ok.filter((r) => r.match.built === true).length,
        builtAsked: ok.filter((r) => r.match.built !== null).length,
        of: ok.length,
      },
      // то же с цитатой в кадре (как видит зритель)
      recognizedCaption: {
        prop: ok.filter((r) => r.withCaption?.match.prop).length,
        place: ok.filter((r) => r.withCaption?.match.place === true).length,
        companion: ok.filter((r) => r.withCaption?.match.companion === true).length,
        of: ok.filter((r) => r.withCaption).length,
      },
      errors: errors.length,
      totalSec: sec(),
    }
    const out = { summary, input: { ...input, script: undefined }, script, director, scenes, fetches, errors, gaps, recognition: beatShots.map((s, k) => ({ beat: s.b.beat, quote: s.b.quote, expect: { hero_prop: s.b.hero_prop, place: s.b.place, companion: s.b.companion, kind: s.b.kind, weight: s.b.weight }, ...(recog[k] ?? {}) })) }
    await sendRun(run, 'run.json', JSON.stringify(out, null, 1))
    // последний прогон целиком — для «Ещё раз» (тот же сценарий без режиссёра) и отладки из консоли
    ;(window as unknown as { __lastRun?: unknown }).__lastRun = out
    return summary
  } finally {
    f.sceneProvider = prevProvider
    window.fetch = origFetch
    console.error = origError
    window.removeEventListener('error', onErr)
    window.removeEventListener('unhandledrejection', onRej)
  }
}

Object.assign(window, { __dev: { filmSheet, filmFrames, testPhotos, photoPatch, save, testSvgs, showScenes, fakeScenes, runDay, filmGaps } })
