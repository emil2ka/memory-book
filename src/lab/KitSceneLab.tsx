// Витрина 3D-кита для сценок: ?lab=world&kitscene=<ids через запятую | packN | all>&sheet=1
// Каждый предмет — рядом с пиксельным человечком (Hero3D) через пиксельный слой, в масштабе фильма:
// hand — в правой руке (точка хвата grip совмещена с ладонью), stand — за спиной, detail — сбоку на бумаге.
// Подпись: id, фигур, высота в единицах и в пикселях слоя (силуэт в руке должен читаться в 15–25 px).
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Hero3D, type HeroAction } from '../actors/Hero3D'
import { buildKit, kitBounds } from '../kit/build'
import { KIT_UNIT, type KitModel } from '../kit/format'
import { KIT_LIBRARY, KIT_PACKS, kitById } from '../kit/library'
import { PixelLayer, toPixelLayer, toonFor } from '../render/PixelLayer'
import { PALETTE, css } from '../scene/palette'

const params = new URLSearchParams(location.search)
const SHEET = params.get('sheet') === '1'
/** Пикселей слоя на единицу мира: человечек (34 ед. кита) ≈ 64 px — как на среднем плане фильма. */
const DENSITY = 64 / (34 * KIT_UNIT)
const COLS = 5
const CELL_W = 300
const CELL_H = 330

type Role = 'hand' | 'stand' | 'detail' | 'both'
const roleOf = (m: KitModel): Role =>
  m.scene === 'stand' || m.scene === 'detail' ? m.scene : m.hold === 'hand' ? 'hand' : m.hold === 'both' ? 'both' : kitBounds(m).max.y < 24 ? 'detail' : 'stand'

function pickModels(): KitModel[] {
  const q = params.get('kitscene') ?? 'all'
  if (q === 'all') return [...KIT_LIBRARY]
  if (/^pack\d+$/.test(q)) return (KIT_PACKS[q] ?? []).map((id) => kitById(id)).filter((m): m is KitModel => !!m)
  return q.split(',').map((id) => kitById(id.trim())).filter((m): m is KitModel => !!m)
}

export default function KitSceneLab() {
  const models = useMemo(pickModels, [])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rows = Math.ceil(models.length / COLS)

  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
    renderer.setPixelRatio(1)
    renderer.setSize(COLS * CELL_W, rows * CELL_H, false)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const px = new PixelLayer()
    px.density = DENSITY
    px.minRows = 16

    const cells = models.map((model, i) => {
      const scene = new THREE.Scene()
      const role = roleOf(model)
      // бумага страницы
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshLambertMaterial({ color: PALETTE.paper }))
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)
      scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6b4a2e, 1.1))
      const lamp = new THREE.DirectionalLight(0xffe2b0, 2.4)
      lamp.position.set(-2.5, 4, 3)
      lamp.castShadow = true
      lamp.shadow.mapSize.set(1024, 1024)
      const sc = lamp.shadow.camera
      sc.left = sc.bottom = -2.5
      sc.right = sc.top = 2.5
      scene.add(lamp)

      const hero = new Hero3D()
      scene.add(hero.object)
      const action: HeroAction = role === 'both' ? 'carry' : 'idle'
      hero.play(action, 0, 1)
      hero.update(0.6, 1 / 60)

      const item = buildKit(model, toonFor)
      const inner = item.children[0]
      const b = kitBounds(model)
      const h = b.max.y
      if (role === 'hand' || role === 'both') {
        // в руке: внутреннюю группу кита вешаем на ладонь, grip — в ладонь, предмет стоит прямо
        const anchor = role === 'both' ? hero.chest : hero.hand.R
        if (role === 'hand') {
          hero.arm.R.rotation.x = -0.55
          hero.fore.R.rotation.x = -0.75
        }
        hero.object.updateMatrixWorld(true)
        item.remove(inner)
        inner.scale.setScalar(1)
        const g = model.grip ?? [(b.min.x + b.max.x) / 2, h * (role === 'both' ? 0.5 : 0.35), (b.min.z + b.max.z) / 2]
        const holder = new THREE.Group()
        anchor.add(holder)
        holder.quaternion.copy(anchor.getWorldQuaternion(new THREE.Quaternion()).invert())
        holder.add(inner)
        inner.position.set(-g[0], -g[1], -g[2])
      } else if (role === 'stand') {
        // декорация слева сзади, человечек справа впереди — видно и то и другое
        const w = (b.max.x - b.min.x) * KIT_UNIT
        item.position.set(-w * 0.32, 0, -0.55)
        scene.add(item)
        hero.object.position.set(Math.max(0.6, w * 0.25 + 0.45), 0, 0.35)
      } else {
        item.position.set(0.75, 0, 0.25)
        scene.add(item)
        hero.object.position.set(-0.3, 0, 0)
      }
      toPixelLayer(hero.object)
      toPixelLayer(item)
      inner.traverse((o) => o.layers.set(1))
      px.attachLights(scene)

      // кадр: всё, что в сцене, плюс человечек; камера 3/4 сверху, как в фильме
      const box = new THREE.Box3().setFromObject(hero.object)
      box.union(new THREE.Box3().setFromObject(item.parent ? item : inner))
      if (role === 'hand' || role === 'both') box.union(new THREE.Box3().setFromObject(inner))
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const camera = new THREE.PerspectiveCamera(30, CELL_W / CELL_H, 0.05, 60)
      const dist = (Math.max(size.y, size.x * (CELL_H / CELL_W)) * 0.62) / Math.tan((15 * Math.PI) / 180) + 0.5
      const dir = new THREE.Vector3(0.32, 0.42, 1).normalize()
      camera.position.copy(center).addScaledVector(dir, dist)
      camera.lookAt(center)
      px.focus = center
      // высота предмета в пикселях слоя: единицы кита → мир → пиксели
      const itemPx = Math.round(h * KIT_UNIT * DENSITY)
      return { scene, camera, model, role, itemPx, col: i % COLS, row: Math.floor(i / COLS), center }
    })

    renderer.setClearColor(PALETTE.ink)
    renderer.clear()
    for (const c of cells) {
      px.focus = c.center
      const x = c.col * CELL_W
      const y = (rows - 1 - c.row) * CELL_H
      renderer.setClearColor(PALETTE.brownDark)
      renderer.setViewport(x, y, CELL_W, CELL_H)
      renderer.setScissor(x, y, CELL_W, CELL_H)
      renderer.setScissorTest(true)
      renderer.clear()
      px.render(renderer, c.scene, c.camera, new THREE.Vector4(x, y, CELL_W, CELL_H))
    }
    renderer.setScissorTest(false)
    document.body.dataset.ready = '1'
    ;(window as unknown as { kitScene: unknown }).kitScene = cells.map((c) => ({ id: c.model.id, role: c.role, px: c.itemPx, parts: c.model.parts.length }))
    return () => renderer.dispose()
  }, [models, rows])

  return (
    <div style={{ background: css(PALETTE.ink), minHeight: '100vh', color: css(PALETTE.cream), font: '12px system-ui', padding: SHEET ? 0 : 12 }}>
      <div style={{ position: 'relative', width: COLS * CELL_W, height: rows * CELL_H }}>
        <canvas ref={canvasRef} style={{ width: COLS * CELL_W, height: rows * CELL_H, imageRendering: 'pixelated', display: 'block' }} />
        {models.map((m, i) => {
          const h = kitBounds(m).max.y
          const role = roleOf(m)
          const pxH = Math.round(h * KIT_UNIT * DENSITY)
          return (
            <div key={m.id} style={{ position: 'absolute', left: (i % COLS) * CELL_W + 6, top: Math.floor(i / COLS) * CELL_H + 4, width: CELL_W - 12, textShadow: '0 1px 2px #000' }}>
              <b>{m.ru}</b> <span style={{ opacity: 0.75 }}>{m.id} · {role} · {m.parts.length} фигур · {h.toFixed(0)} ед · {pxH} px{m.grip ? ' · grip' : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
