// Витрина кита: ?lab=kit — сетка всех предметов библиотеки, медленно крутятся.
// Параметры: &cat=<категория>, &pack=<N>, &sheet=1 (лист для проверки: без вращения, 3/4, всё на одной странице),
// &scale=same (один масштаб для всех — видно, что кружка меньше человечка), &src=<url json> (свои предметы, например дорисованные).
// Пока предметы рисуются Ламбертом; когда будет пиксельный слой, рисовать через него (см. renderCell).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildKit, lambertFor } from '../kit/build'
import { KIT_UNIT, type KitModel } from '../kit/format'
import { CATEGORIES, CATEGORY_RU, KIT_LIBRARY, KIT_PACKS, categoryOf, type Category } from '../kit/library'
import { kitSize, validateKit } from '../kit/validate'
import { PALETTE, css } from '../scene/palette'
import './lab.css'

const params = new URLSearchParams(location.search)
const SHEET = params.get('sheet') === '1'
const SAME_SCALE = params.get('scale') === 'same'
/** Рост человечка в единицах кита — для единого масштаба. */
const HERO_H = 34

type Cell = { model: KitModel; label: string; cat: string }

function useCells(): { cells: Cell[]; extraError: string | null } {
  const [extra, setExtra] = useState<Cell[]>([])
  const [extraError, setExtraError] = useState<string | null>(null)
  const src = params.get('src')
  useEffect(() => {
    if (!src) return
    fetch(src)
      .then((r) => r.json())
      .then((list: unknown) => {
        const arr = Array.isArray(list) ? list : (list as { models?: unknown[] }).models ?? []
        const ok: Cell[] = []
        for (const raw of arr) {
          const r = validateKit(raw)
          if (r.ok) ok.push({ model: r.model!, label: r.model!.by === 'claude' ? 'claude' : 'extra', cat: 'extra' })
        }
        setExtra(ok)
      })
      .catch((e) => setExtraError(String(e)))
  }, [src])
  const cells = useMemo(() => [...KIT_LIBRARY.map((m) => ({ model: m, label: '', cat: categoryOf(m.id) ?? '' })), ...extra], [extra])
  return { cells, extraError }
}

export default function KitLab() {
  const { cells, extraError } = useCells()
  const [cat, setCat] = useState<string>(params.get('cat') ?? 'all')
  const [pack, setPack] = useState<string>(params.get('pack') ? `pack${params.get('pack')}` : 'all')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellEls = useRef(new Map<string, HTMLDivElement>())

  const shown = cells.filter((c) => (cat === 'all' || c.cat === cat) && (pack === 'all' || KIT_PACKS[pack]?.includes(c.model.id) || (pack === 'extra' && c.cat === 'extra')))

  // цвета интерфейса — из палитры
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(PALETTE)) root.style.setProperty(`--${k}`, css(v))
    document.title = 'Витрина кита'
  }, [])

  // адрес отражает фильтр
  useEffect(() => {
    const p = new URLSearchParams(location.search)
    cat === 'all' ? p.delete('cat') : p.set('cat', cat)
    pack === 'all' ? p.delete('pack') : p.set('pack', pack.replace('pack', ''))
    history.replaceState(null, '', `?${p}`)
  }, [cat, pack])

  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !SHEET, preserveDrawingBuffer: SHEET })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setScissorTest(true)
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(PALETTE.cream, 1.1))
    // тёплая лампа слева сверху и холодный контровой — как в сцене
    const lamp = new THREE.DirectionalLight(PALETTE.yellow, 2.2)
    lamp.castShadow = true
    lamp.shadow.mapSize.set(512, 512)
    scene.add(lamp, lamp.target)
    const rim = new THREE.DirectionalLight(PALETTE.ice, 0.9)
    scene.add(rim)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshLambertMaterial({ color: PALETTE.paper }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100)

    const groups = new Map<string, { g: THREE.Group; r: number; h: number }>()
    const groupFor = (m: KitModel) => {
      let x = groups.get(m.id)
      if (!x) {
        const g = buildKit(m, lambertFor)
        const [sx, sy, sz] = kitSize(m)
        x = { g, r: Math.hypot(sx, sz) * 0.5 * KIT_UNIT, h: sy * KIT_UNIT }
        groups.set(m.id, x)
      }
      return x
    }
    const maxR = Math.max(...cells.map((c) => groupFor(c.model).r), (HERO_H * KIT_UNIT) / 2)
    const maxH = Math.max(...cells.map((c) => groupFor(c.model).h), HERO_H * KIT_UNIT)
    const cellBg = new THREE.Color(PALETTE.paperShade)

    let raf = 0
    let stopped = false
    const t0 = performance.now()

    const renderCell = (el: HTMLDivElement, model: KitModel, t: number) => {
      const rect = el.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return
      const { g, r, h } = groupFor(model)
      const R = SAME_SCALE ? Math.max(maxR, maxH * 0.6) : Math.max(r, h * 0.6, 0.12)
      const H = SAME_SCALE ? maxH : h
      // камера чуть сверху, как в фильме
      const elev = 0.38
      const dist = (Math.max(R, H * 0.62) / Math.sin(((camera.fov / 2) * Math.PI) / 180)) * 1.02
      const cy = SAME_SCALE ? maxH * 0.45 : h * 0.45
      camera.position.set(0, cy + Math.sin(elev) * dist, Math.cos(elev) * dist)
      camera.lookAt(0, cy, 0)
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()

      g.rotation.y = SHEET ? -0.55 : -0.55 + Math.sin(t * 0.35 + model.id.length) * 1.1
      ground.scale.setScalar(R * 2.2)
      lamp.position.set(-R * 2.5, R * 4 + H, R * 2.5)
      rim.position.set(R * 2, R * 1.5, -R * 3)
      const sc = lamp.shadow.camera
      sc.left = sc.bottom = -R * 1.6
      sc.right = sc.top = R * 1.6
      sc.near = 0.01
      sc.far = R * 10 + H * 3
      sc.updateProjectionMatrix()

      scene.add(g)
      const y = renderer.domElement.clientHeight - rect.bottom
      renderer.setViewport(rect.left, y, rect.width, rect.height)
      renderer.setScissor(rect.left, y, rect.width, rect.height)
      renderer.setClearColor(cellBg)
      renderer.clear()
      renderer.render(scene, camera)
      scene.remove(g)
    }

    const frame = () => {
      if (stopped) return
      const w = canvas.clientWidth
      const hgt = canvas.clientHeight
      if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(hgt * renderer.getPixelRatio())) renderer.setSize(w, hgt, false)
      renderer.setScissor(0, 0, w, hgt)
      renderer.setClearColor(PALETTE.ink)
      renderer.clear()
      const t = (performance.now() - t0) / 1000
      for (const c of cells) {
        const el = cellEls.current.get(c.model.id)
        if (el) renderCell(el, c.model, t)
      }
      if (SHEET) {
        document.body.dataset.ready = '1'
        return
      }
      raf = requestAnimationFrame(frame)
    }
    // ждём раскладку и шрифт
    const start = setTimeout(frame, SHEET ? 300 : 0)
    const onResize = () => SHEET && frame()
    addEventListener('resize', onResize)
    return () => {
      stopped = true
      clearTimeout(start)
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
      renderer.dispose()
    }
    // перерисовка при смене фильтра — через новые элементы ячеек
  }, [cells, cat, pack])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cells) m.set(c.cat, (m.get(c.cat) ?? 0) + 1)
    return m
  }, [cells])
  const packNames = Object.keys(KIT_PACKS)

  return (
    <div className={`kitlab${SHEET ? ' sheet' : ''}`}>
      <canvas ref={canvasRef} className="kitlab-canvas" />
      <header className="kitlab-head">
        <h1>
          Кит · {shown.length} из {cells.length}
          {pack !== 'all' && <span className="small"> · {pack}</span>}
          {cat !== 'all' && <span className="small"> · {CATEGORY_RU[cat as Category] ?? cat}</span>}
        </h1>
        {!SHEET && (
          <>
            <nav>
              <button className={`link${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>все</button>
              {CATEGORIES.filter((c) => counts.get(c)).map((c) => (
                <button key={c} className={`link${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
                  {CATEGORY_RU[c]} {counts.get(c)}
                </button>
              ))}
              {counts.get('extra') ? <button className={`link${cat === 'extra' ? ' on' : ''}`} onClick={() => setCat('extra')}>дорисовка {counts.get('extra')}</button> : null}
            </nav>
            <nav>
              <button className={`link${pack === 'all' ? ' on' : ''}`} onClick={() => setPack('all')}>все пачки</button>
              {packNames.map((p) => (
                <button key={p} className={`link${pack === p ? ' on' : ''}`} onClick={() => setPack(p)}>{p} · {KIT_PACKS[p].length}</button>
              ))}
            </nav>
          </>
        )}
        {extraError && <div className="small">не загрузилось: {extraError}</div>}
      </header>
      <main className="kitlab-grid">
        {shown.map((c) => {
          const h = Math.round(kitSize(c.model)[1] * 2) / 2
          return (
            <figure key={c.model.id} className="kitlab-cell">
              <div className="kitlab-view" ref={(el) => void (el ? cellEls.current.set(c.model.id, el) : cellEls.current.delete(c.model.id))} />
              <figcaption>
                <span className="ru">{c.model.ru}</span>
                <span className="id">{c.model.id}{c.label ? ` · ${c.label}` : ''}</span>
                <span className="meta">{c.model.hold} · h {h} · {c.model.parts.length} фиг.</span>
              </figcaption>
            </figure>
          )
        })}
      </main>
    </div>
  )
}
