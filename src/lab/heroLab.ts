// Витрина эмоций и действий человечка (план 15): /hero-lab.html — каждая анимация в своей клетке, в движении.
// Один WebGL-рендерер рисует героев по очереди и копирует кадр в 2D-холст клетки.
import * as THREE from 'three'
import { GIRL_ACCESSORY, GIRL_COLORS, Hero3D } from '../actors/Hero3D'
import { HERO_ACTIONS } from '../actors/heroActions'

const W = 200
const H = 210
const grid = document.getElementById('grid')!
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true })
renderer.setSize(W, H, false)
renderer.setPixelRatio(1)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#f6eedd')
const hemi = new THREE.HemisphereLight(0xfff3dc, 0x8a6f55, 1.6)
const sun = new THREE.DirectionalLight(0xffffff, 1.6)
sun.position.set(1.5, 3, 2.5)
for (const l of [hemi, sun]) {
  l.layers.enableAll()
  scene.add(l)
}
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50)
camera.position.set(0.35, 0.95, 3.4)
camera.lookAt(0, 0.62, 0)
camera.layers.enableAll()

const cells = HERO_ACTIONS.map((a) => {
  const cell = document.createElement('div')
  cell.className = 'cell'
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const title = document.createElement('b')
  title.textContent = `${a.id} · ${a.kind === 'emotion' ? 'эмоция' : 'действие'}`
  const note = document.createElement('span')
  note.textContent = a.ru
  cell.append(c, title, note)
  grid.append(cell)
  // ?kind=girl — героиня
  const hero = new URLSearchParams(location.search).get('kind') === 'girl' ? new Hero3D(GIRL_COLORS, undefined, GIRL_ACCESSORY) : new Hero3D()
  hero.object.visible = false
  scene.add(hero.object)
  hero.play(a.id, 0, a.dur)
  return { a, ctx: c.getContext('2d')!, hero }
})

let last = performance.now()
function frame(now: number) {
  const time = now / 1000
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  for (const cell of cells) {
    // одноразовые движения повторяем, чтобы их было видно на витрине
    const local = cell.a.loop ? time : time % (cell.a.dur + 1.2)
    if (!cell.a.loop && local < dt * 1.5) cell.hero.play(cell.a.id, time - local, cell.a.dur)
    cell.hero.object.visible = true
    cell.hero.update(time, dt)
    renderer.render(scene, camera)
    cell.ctx.drawImage(renderer.domElement, 0, 0)
    cell.hero.object.visible = false
  }
  if (!stopped) requestAnimationFrame(frame)
}
let stopped = false
requestAnimationFrame(frame)
// для листа кадров из скрытой вкладки: нарисовать кадр в момент t секунд
;(window as unknown as { __heroLabAt: (t: number) => void }).__heroLabAt = (t: number) => {
  last = t * 1000 - 16
  for (const cell of cells) {
    const local = cell.a.loop ? t : Math.min(t, cell.a.dur * 0.7)
    cell.hero.play(cell.a.id, t - local, cell.a.dur)
  }
  stopped = true
  for (let i = 0; i < 12; i++) frame(t * 1000 + i * 16)
}
