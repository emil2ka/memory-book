// Витрина мира стола: ?lab=world. Стол, книга, лампа и кассетник из сцены + мир: стена, окно с небом, полка-архив, вещи дня.
// Параметры: &day=1..3 — одеть под демо-день, &time=…&weather=… — окно, &cam=wide|room|window|shelf|desk|items, &ui=0 — кадр без панели.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loadModels } from '../scene/models'
import { PALETTE, css } from '../scene/palette'
import { sampleDays } from '../timeline/samples'
import type { TimeOfDay, Weather } from '../types/script'
import { DeskWorld } from '../world/DeskWorld'
import { Person, type PersonKind } from '../world/Person'
import { loadWorldModel, worldUrl } from '../world/loader'
import { WORLD, type ItemDef } from '../world/manifest'
import type { ShelfDay } from '../world/Shelf3D'
import './worldlab.css'

const params = new URLSearchParams(location.search)
const UI = params.get('ui') !== '0'
const PERSON = (params.get('person') as PersonKind | null) ?? null
const ORDER = ['Walk_In', 'Sit_Down', 'Open_Book', 'Write', 'Place_Photo', 'Press_Play', 'Lean_Back', 'Watch_Idle', 'Close_Book']
const TIMES: TimeOfDay[] = ['morning', 'day', 'evening', 'night']
const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'snow', 'fog']

const CAMS: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
  wide: { pos: [0, 8.6, 6.4], look: [0, 0.3, 0.3] },
  // общий план сцены (FilmStage WIDE после подключения мира)
  film: { pos: [0, 6.4, 9.6], look: [0, 0.9, -0.9] },
  room: { pos: [0.5, 8.5, 27], look: [0, 4.8, -3] },
  window: { pos: [2.6, 4.6, 9], look: [4.5, 5.2, -4.6] },
  shelf: { pos: [-4, 8.6, 15], look: [-6, 8.0, -3.5] },
  desk: { pos: [7.5, 4.5, 8.5], look: [0, 0.8, -0.5] },
  items: { pos: [0, 10, 16], look: [0, 0.6, 0] },
  // люди: сзади-справа со стороны +Z и через плечо; eyes — камера в узле глаз
  behind: { pos: [8.5, 6.5, 22], look: [0, 0.5, 2] },
  shoulder: { pos: [2.6, 7.6, 12.5], look: [0, 0.5, 0] },
  eyes: { pos: [0, 4.5, 6.5], look: [0, 0.3, 0] },
}

const EXTRA_DAYS: ShelfDay[] = [
  { id: 'x-1', title: 'Первый снег', color: 'slate_blue' },
  { id: 'x-2', title: 'Экзамен', color: 'brick_red' },
  { id: 'x-3', title: 'Дача у бабушки', color: 'soft_green' },
  { id: 'x-4', title: 'Концерт', color: 'ochre' },
]

interface Row {
  id: string
  file: string
  kb: number | null
  tris: number
  clips: string[]
  size: string
  ok: boolean
}

function tris(root: THREE.Object3D) {
  let n = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry
    n += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return Math.round(n)
}

function sizeOf(root: THREE.Object3D) {
  const b = new THREE.Box3().setFromObject(root, true)
  const s = b.getSize(new THREE.Vector3())
  return `${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)}`
}

// &kitscene=… — витрина 3D-кита для сценок рядом с пиксельным человечком (src/lab/KitSceneLab.tsx)
const KitSceneLab = lazy(() => import('./KitSceneLab'))

export default function WorldLab() {
  if (params.get('kitscene') !== null)
    return (
      <Suspense fallback={null}>
        <KitSceneLab />
      </Suspense>
    )
  return <WorldLabMain />
}

function WorldLabMain() {
  const host = useRef<HTMLDivElement>(null)
  const ref = useRef<{ world: DeskWorld; camTo: (name: string) => void; showItems: (on: boolean) => void; toShelf: (k?: number) => Promise<void>; person: Person | null; playAll: () => void } | null>(null)
  const [time, setTime] = useState<TimeOfDay>((params.get('time') as TimeOfDay) || 'evening')
  const [weather, setWeather] = useState<Weather>((params.get('weather') as Weather) || 'clear')
  const [day, setDay] = useState<number>(Number(params.get('day')) || 0)
  const [rows, setRows] = useState<Row[]>([])
  const [dressed, setDressed] = useState<string>('')

  useEffect(() => {
    for (const [k, v] of Object.entries(PALETTE)) document.documentElement.style.setProperty(`--${k}`, css(v))
    document.title = 'Мир стола'
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.setClearColor(0x1b1410)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    // свет как в сцене (src/scene/Room.ts): тёплая лампа слева, холодный контровой, мягкий общий
    const lamp = new THREE.PointLight(PALETTE.yellow, 60, 30, 1.6)
    lamp.position.set(-3.6, 3.4, -0.6)
    lamp.castShadow = true
    lamp.shadow.mapSize.set(1024, 1024)
    lamp.shadow.radius = 6
    lamp.shadow.bias = -0.002
    const rim = new THREE.DirectionalLight(PALETTE.greyBlue, 0.7)
    rim.position.set(5, 4, -6)
    const ambient = new THREE.AmbientLight(PALETTE.mauve, 0.9)
    scene.add(lamp, rim, ambient)

    loadModels()
      .then((m) => {
        m.desk.root.traverse((o) => (o.receiveShadow = true))
        m.lamp.root.scale.setScalar(0.62)
        m.lamp.root.position.set(-4.7, 0, -0.4)
        m.lamp.root.rotation.y = -0.25
        m.cassette.root.position.set(4.4, 0, 1.5)
        m.cassette.root.rotation.y = -0.35
        for (const r of [m.book.root, m.cassette.root, m.lamp.root]) r.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)))
        scene.add(m.desk.root, m.book.root, m.lamp.root, m.cassette.root)
        Object.assign(window, { labModels: m })
      })
      .catch((e) => console.warn('[lab] модели сцены', e))

    const world = new DeskWorld(scene)
    void world.placeDays([
      ...EXTRA_DAYS.slice(0, 2),
      ...sampleDays.map((d) => ({ id: d.id, title: d.script.title, paletteHint: d.script.palette_hint })),
      ...EXTRA_DAYS.slice(2),
    ])

    const mixers: THREE.AnimationMixer[] = []
    // все вещи рядом с книгой — для масштаба
    const itemsRow = new THREE.Group()
    itemsRow.visible = false
    scene.add(itemsRow)
    const showItems = (on: boolean) => {
      itemsRow.visible = on
      world.set.group.visible = !on
    }
    void (async () => {
      // два ряда: перед книгой и за ней
      let x = -7.4
      let z = 3.4
      for (const it of WORLD.items) {
        const m = await loadWorldModel(it.file)
        if (!m) continue
        if (x + it.size[0] > 7.6 && z > 0) {
          x = -7.4
          z = -3.3
        }
        m.root.position.set(x + it.size[0] / 2, 0, z)
        x += it.size[0] + 0.45
        itemsRow.add(m.root)
        const idle = it.clips?.idle && m.clips.get(it.clips.idle)
        if (idle) m.mixer.clipAction(idle).play()
        mixers.push(m.mixer)
      }
    })()

    // человек за столом (?person=boy|girl); пол — только для лаборатории, настоящий придёт из Claude Design
    const person = PERSON ? new Person(PERSON) : null
    if (person) {
      scene.add(person.root)
      // временный пол, пока нет настоящего (floor.glb)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: PALETTE.brown, roughness: 0.9 }))
      floor.rotation.x = -Math.PI / 2
      floor.position.set(0, -7.55, 4)
      floor.receiveShadow = true
      scene.add(floor)
      void world.ready.then(() => (floor.visible = !world.floor))
      void person.ready.then(() => person.play(params.get('clip') ?? 'Sit_Idle'))
    }
    let eyesCam = false
    const camTo = (name: string) => {
      const c = CAMS[name] ?? CAMS.room
      camera.position.set(...c.pos)
      controls.target.set(...c.look)
      controls.update()
      showItems(name === 'items')
      eyesCam = name === 'eyes' && !!person
      controls.enabled = !eyesCam
      person?.setFirstPerson(eyesCam)
    }
    // все клипы подряд, как в фильме
    const playAll = () => {
      if (!person) return
      let i = 0
      const next = () => {
        const clip = ORDER[i++]
        if (!clip) return
        if (clip === 'Sit_Down') person.playChair('Pull_Out')
        if (clip === 'Write') {
          person.play('Write')
          setTimeout(next, 3600)
          return
        }
        if (clip === 'Watch_Idle') {
          person.play('Watch_Idle')
          setTimeout(next, 4000)
          return
        }
        if (!person.play(clip, { onDone: next })) next()
      }
      next()
    }
    camTo(params.get('cam') ?? 'room')

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h, false)
      // то же правило, что в сцене (PixelStage): уже 16:9 — держим ширину кадра, стоя — чуть ближе
      const aspect = w / h
      const design = 16 / 9
      camera.aspect = aspect
      if (aspect >= design) camera.fov = 32
      else {
        const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * design)
        const k = aspect < 1 ? 0.88 : 1
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * k) / aspect))
      }
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      world.update(dt, now / 1000)
      for (const m of mixers) m.update(dt)
      person?.update(dt)
      if (eyesCam && person?.eyes) {
        // камера = узел глаз: смотрит вдоль −Z узла
        person.eyes.updateWorldMatrix(true, false)
        person.eyes.matrixWorld.decompose(camera.position, camera.quaternion, new THREE.Vector3())
      }
      if (flight) {
        flight.t += dt
        const k = Math.min(1, flight.t / 2.4)
        world.shelf.arrive(flight.id, FROM, k)
        if (k >= 1) flight = null
      }
      if (!eyesCam) controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // финал: закрытая книга дня со стола летит на полку
    const FROM = new THREE.Matrix4().makeTranslation(-1.6, 0, 0)
    let flight: { id: string; t: number } | null = null
    const toShelf = async (k?: number) => {
      const day = { id: `new-${Date.now()}`, title: 'Новый день', color: 'coral' }
      await world.ready
      await world.shelf.prepareArrival(day)
      if (k === undefined) flight = { id: day.id, t: 0 }
      else world.shelf.arrive(day.id, FROM, k)
    }
    ref.current = { world, camTo, showItems, toShelf, person, playAll }
    const fk = params.get('fly')
    if (fk !== null) void toShelf(fk === '' ? undefined : Number(fk))
    Object.assign(window, { deskWorld: world, labCam: camTo, labToShelf: toShelf, labPerson: person, labPlayAll: playAll })

    // таблица моделей: размер файла, треугольники, клипы, габариты
    void (async () => {
      await world.ready
      const entries: { id: string; file: string; item?: ItemDef }[] = [
        ...Object.entries(WORLD.room).map(([id, e]) => ({ id, file: e.file })),
        ...WORLD.items.map((it) => ({ id: it.id, file: it.file, item: it })),
      ]
      const out: Row[] = []
      for (const e of entries) {
        const url = worldUrl(e.file)
        const m = url ? await loadWorldModel(e.file) : null
        let kb: number | null = null
        if (url) {
          try {
            kb = (await (await fetch(url)).blob()).size / 1024
          } catch {
            kb = null
          }
        }
        out.push({
          id: e.id,
          file: e.file,
          kb,
          tris: m ? tris(m.root) : 0,
          clips: m ? [...m.clips.keys()] : [],
          size: m ? sizeOf(m.root) : '—',
          ok: !!m,
        })
      }
      setRows(out)
    })()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      world.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const r = ref.current
    if (!r) return
    if (day > 0) {
      const d = sampleDays[day - 1]
      if (!d) return
      void r.world.dress(d.script, day).then(() => {
        setDressed(r.world.set.placed.map((p) => `${p.item.id}@${p.slot}`).join(', ') || 'вещей пока нет')
        // окно уже одето днём (с инеем противоречия) — кнопки только показывают его время и погоду
        fromDay.current = `${d.script.time_of_day}/${d.script.weather}`
        setTime(d.script.time_of_day)
        setWeather(d.script.weather)
      })
    }
  }, [day])

  const firstSky = useRef(true)
  const fromDay = useRef('')
  useEffect(() => {
    if (fromDay.current === `${time}/${weather}`) return
    fromDay.current = ''
    // открыт сразу день — окно одевает он
    if (firstSky.current && day > 0) {
      firstSky.current = false
      return
    }
    ref.current?.world.setWindow(time, weather, { fade: firstSky.current ? 0 : 0.8, frost: weather === 'snow' ? 0.75 : 0 })
    firstSky.current = false
  }, [time, weather])

  return (
    <div className="worldlab">
      <div ref={host} className="worldlab-stage" />
      {UI && (
        <aside className="worldlab-panel">
          <h1>Мир стола</h1>
          <nav>
            {Object.keys(CAMS).map((c) => (
              <button key={c} className="link" onClick={() => ref.current?.camTo(c)}>
                {c}
              </button>
            ))}
          </nav>
          <nav>
            {sampleDays.map((d, i) => (
              <button key={d.id} className={`link${day === i + 1 ? ' on' : ''}`} onClick={() => setDay(i + 1)}>
                день {i + 1}: {d.script.title}
              </button>
            ))}
          </nav>
          {PERSON && (
            <nav>
              <button className="link" onClick={() => ref.current?.playAll()}>
                всё по порядку
              </button>
              {[...ORDER, 'Sit_Idle'].map((c) => (
                <button key={c} className="link" onClick={() => ref.current?.person?.play(c)}>
                  {c}
                </button>
              ))}
              <button className="link" onClick={() => ref.current?.person?.playChair('Pull_Out')}>
                стул: Pull_Out
              </button>
              <button className="link" onClick={() => ref.current?.person?.playChair('Push_In')}>
                Push_In
              </button>
            </nav>
          )}
          <nav>
            <button className="link" onClick={() => void ref.current?.toShelf()}>
              финал: книга на полку
            </button>
          </nav>
          {dressed && <p className="meta">на столе: {dressed}</p>}
          <nav>
            {TIMES.map((t) => (
              <button key={t} className={`link${time === t ? ' on' : ''}`} onClick={() => setTime(t)}>
                {t}
              </button>
            ))}
          </nav>
          <nav>
            {WEATHERS.map((w) => (
              <button key={w} className={`link${weather === w ? ' on' : ''}`} onClick={() => setWeather(w)}>
                {w}
              </button>
            ))}
          </nav>
          <table>
            <thead>
              <tr>
                <th>модель</th>
                <th>КБ</th>
                <th>треуг.</th>
                <th>габариты</th>
                <th>клипы</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.ok ? '' : 'missing'}>
                  <td>{r.id}</td>
                  <td className={r.kb && r.kb > 300 ? 'bad' : ''}>{r.kb ? r.kb.toFixed(0) : '—'}</td>
                  <td className={r.tris > 3000 ? 'bad' : ''}>{r.tris || '—'}</td>
                  <td>{r.size}</td>
                  <td>
                    {r.clips.map((c) => (
                      <button
                        key={c}
                        className="link"
                        onClick={() => {
                          const p = ref.current?.world.set.placed.find((x) => x.item.id === r.id)
                          const clip = p?.model.clips.get(c)
                          if (p && clip) p.model.mixer.clipAction(clip).reset().play()
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      )}
    </div>
  )
}
