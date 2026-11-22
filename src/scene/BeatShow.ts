// Как фильм показывает бит, чтобы его легко было прочитать (план 13, § 1 и § 4):
// подложка под сценкой (текст страницы не лезет в силуэты), рукописная цитата внизу кадра
// и марка, в которую сценка сворачивается после бита.
import * as THREE from 'three'
import { HAND_FONT } from './Book'

const TAU = Math.PI * 2

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// ---------- подложка ----------

let discTex: THREE.CanvasTexture | null = null

/** Мягкое пятно под сценкой: бумага чуть темнее и плотнее, строки текста под ним гаснут. */
export function makeBaseDisc(): THREE.Mesh {
  if (!discTex) {
    const c = canvas(256, 256)
    const g = c.getContext('2d')!
    const r = g.createRadialGradient(128, 128, 8, 128, 128, 128)
    r.addColorStop(0, 'rgba(232,218,192,0.97)')
    r.addColorStop(0.55, 'rgba(226,210,182,0.9)')
    r.addColorStop(0.78, 'rgba(200,180,150,0.45)')
    r.addColorStop(1, 'rgba(200,180,150,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 256, 256)
    discTex = new THREE.CanvasTexture(c)
    discTex.colorSpace = THREE.SRGBColorSpace
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    // поверх бумаги и чернил страницы (они лежат отдельным слоем чуть выше листа); жители — в пиксельном слое, их не закрывает
    new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0, toneMapped: false }),
  )
  m.rotation.x = -Math.PI / 2
  m.renderOrder = 20
  return m
}

// ---------- цитата внизу кадра ----------

/** Рукописная полоска с цитатой бита. Живёт перед камерой, всегда поверх мира. */
export class QuoteCaption {
  readonly mesh: THREE.Mesh
  private tex: THREE.CanvasTexture
  private c = canvas(1024, 160)
  private text = ''
  private aspect = 1024 / 160

  constructor() {
    this.tex = new THREE.CanvasTexture(this.c)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.anisotropy = 4
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false }),
    )
    this.mesh.renderOrder = 999
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  /** Нарисовать полоску под текст (длинная цитата — шрифт меньше). */
  setText(text: string) {
    if (text === this.text) return
    this.text = text
    const g = this.c.getContext('2d')!
    const W = this.c.width
    const H = this.c.height
    g.clearRect(0, 0, W, H)
    const q = `«${text}»`
    let size = 76
    g.font = `${size}px ${HAND_FONT}, cursive`
    while (g.measureText(q).width > W - 140 && size > 40) {
      size -= 4
      g.font = `${size}px ${HAND_FONT}, cursive`
    }
    const tw = Math.min(W - 40, g.measureText(q).width + 110)
    const x0 = (W - tw) / 2
    // рваная бумажная полоска
    g.save()
    g.shadowColor = 'rgba(40,25,10,0.35)'
    g.shadowBlur = 14
    g.shadowOffsetY = 5
    g.fillStyle = '#f4ead6'
    g.beginPath()
    const top = 22
    const bot = H - 26
    g.moveTo(x0, top + 4)
    for (let x = x0; x <= x0 + tw; x += 18) g.lineTo(x, top + (Math.sin(x * 0.37) + Math.sin(x * 0.11)) * 2.2)
    g.lineTo(x0 + tw + 4, (top + bot) / 2)
    for (let x = x0 + tw; x >= x0; x -= 18) g.lineTo(x, bot + (Math.sin(x * 0.29) + Math.cos(x * 0.13)) * 2.4)
    g.lineTo(x0 - 4, (top + bot) / 2)
    g.closePath()
    g.fill()
    g.restore()
    // полоска скотча слева
    g.fillStyle = 'rgba(196,92,72,0.55)'
    g.save()
    g.translate(x0 + 10, top + 6)
    g.rotate(-0.35)
    g.fillRect(-30, -12, 76, 26)
    g.restore()
    g.fillStyle = '#2b2420'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(q, W / 2, (top + bot) / 2 + 4)
    this.tex.needsUpdate = true
  }

  /**
   * Поставить полоску внизу кадра. k — видимость 0..1.
   * Ширина — до 62 % кадра, высота по пропорции холста, небольшой наклон.
   */
  place(camera: THREE.PerspectiveCamera, k: number) {
    const m = this.mesh.material as THREE.MeshBasicMaterial
    m.opacity = k
    this.mesh.visible = k > 0.01
    if (!this.mesh.visible) return
    const d = camera.near * 4
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const w = h * camera.aspect
    // на телефоне (кадр выше, чем шире) полоска почти во всю ширину
    const sw = Math.min(w * (camera.aspect < 1 ? 0.98 : 0.62), h * 0.9)
    const sh = sw / this.aspect
    this.mesh.scale.set(sw, sh, 1)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    this.mesh.position.copy(camera.position).addScaledVector(fwd, d).addScaledVector(up, -h / 2 + sh * 0.62 + (1 - k) * -sh * 0.25)
    this.mesh.quaternion.copy(camera.quaternion)
    this.mesh.rotateZ(-0.012)
  }
}

// ---------- марка ----------

const stampTex = new Map<string, THREE.CanvasTexture>()

/**
 * Почтовая марка: белая бумага с зубчатым краем, цветной рамкой и тенью на странице —
 * чтобы на бежевой бумаге её было видно издалека. На неё садится уменьшенная сценка.
 */
export function makeStampPaper(frame: string): THREE.Mesh {
  let tex = stampTex.get(frame)
  if (!tex) {
    const S = 256
    const P = 22 // поле под тень
    const c = canvas(S, S)
    const g = c.getContext('2d')!
    g.clearRect(0, 0, S, S)
    // бумага с зубцами
    const paper = canvas(S, S)
    const q = paper.getContext('2d')!
    q.fillStyle = '#fffdf6'
    q.fillRect(P, P, S - 2 * P, S - 2 * P)
    q.globalCompositeOperation = 'destination-out'
    const n = 10
    for (let i = 0; i <= n; i++) {
      const p = P + ((S - 2 * P) * i) / n
      for (const [x, y] of [
        [p, P],
        [p, S - P],
        [P, p],
        [S - P, p],
      ]) {
        q.beginPath()
        q.arc(x, y, 6.5, 0, TAU)
        q.fill()
      }
    }
    q.globalCompositeOperation = 'source-over'
    // цветная рамка и тонкая линия внутри
    q.strokeStyle = frame
    q.lineWidth = 9
    q.strokeRect(P + 16, P + 16, S - 2 * P - 32, S - 2 * P - 32)
    q.strokeStyle = 'rgba(60,40,25,0.35)'
    q.lineWidth = 2
    q.strokeRect(P + 26, P + 26, S - 2 * P - 52, S - 2 * P - 52)
    // тень под маркой
    g.save()
    g.shadowColor = 'rgba(50,30,10,0.45)'
    g.shadowBlur = 12
    g.shadowOffsetX = 4
    g.shadowOffsetY = 6
    g.drawImage(paper, 0, 0)
    g.restore()
    g.drawImage(paper, 0, 0)
    tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    stampTex.set(frame, tex)
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  m.rotation.x = -Math.PI / 2
  m.renderOrder = 21
  return m
}

// ---------- рассказ слева сверху (план 15, § 1.2) ----------

/**
 * Голос книги: строка рассказа о дне пишется словами в левом верхнем углу кадра,
 * прошлая строка над ней бледнеет. Цитата человека остаётся внизу.
 */
export class StoryCaption {
  readonly mesh: THREE.Mesh
  private tex: THREE.CanvasTexture
  private c = canvas(1024, 330)
  private aspect = 1024 / 330
  private key = ''

  constructor() {
    this.tex = new THREE.CanvasTexture(this.c)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.anisotropy = 4
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false }),
    )
    this.mesh.renderOrder = 999
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  /** prev — прошлая строка (бледно сверху), cur — текущая, shown — сколько её знаков уже написано. */
  set(prev: string, cur: string, shown: number) {
    shown = Math.max(0, Math.min(cur.length, Math.round(shown)))
    const key = `${prev}|${cur}|${shown}`
    if (key === this.key) return
    this.key = key
    const g = this.c.getContext('2d')!
    const W = this.c.width
    const H = this.c.height
    g.clearRect(0, 0, W, H)
    const x0 = 18
    const top = 16
    const right = W - 24
    const tx = x0 + 78
    const maxW = right - tx - 26
    // сначала раскладка: кегль текущей строки — крупный, мельче только если не влезает в три строки
    const prevH = prev ? 44 : 0
    let size = 70
    let lines: string[] = []
    for (; size >= 44; size -= 4) {
      g.font = `${size}px ${HAND_FONT}, cursive`
      lines = wrapWords(g, cur, maxW)
      if (lines.length <= 3 && top + 22 + prevH + lines.length * size * 1.02 + 26 <= H - 22) break
    }
    // лист по высоте текста: снизу рваный край
    const bot = Math.min(H - 22, top + 22 + prevH + Math.max(1, lines.length) * size * 1.02 + 30)
    g.save()
    g.shadowColor = 'rgba(40,25,10,0.32)'
    g.shadowBlur = 16
    g.shadowOffsetY = 6
    g.fillStyle = '#f6eedd'
    g.beginPath()
    g.moveTo(x0, top)
    g.lineTo(right, top + 3)
    g.lineTo(right - 4, bot)
    for (let x = right - 4; x >= x0; x -= 16) g.lineTo(x, bot + (Math.sin(x * 0.31) + Math.cos(x * 0.17)) * 3)
    g.closePath()
    g.fill()
    g.restore()
    // красная линия поля, как в тетради
    g.strokeStyle = 'rgba(196,85,63,0.55)'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(x0 + 58, top + 6)
    g.lineTo(x0 + 56, bot - 4)
    g.stroke()
    let y = top + 22
    if (prev) {
      g.font = `40px ${HAND_FONT}, cursive`
      g.fillStyle = 'rgba(70,58,48,0.45)'
      let p = prev
      while (g.measureText(p).width > maxW && p.length > 4) p = p.slice(0, -2)
      if (p !== prev) p = p.trimEnd() + '…'
      g.fillText(p, tx, y + 32)
      y += prevH
    }
    g.font = `${size}px ${HAND_FONT}, cursive`
    g.fillStyle = '#2b2420'
    let left = shown
    let lastX = tx
    let lastY = y
    for (const [n, line] of lines.entries()) {
      if (left <= 0) break
      const part = line.slice(0, left)
      left -= line.length + 1
      const ly = y + size * 0.92 + n * size * 1.02
      g.fillText(part, tx, ly)
      lastX = tx + g.measureText(part).width
      lastY = ly
    }
    // кончик пера, пока строка пишется
    if (shown < cur.length) {
      g.fillStyle = 'rgba(43,36,32,0.85)'
      g.beginPath()
      g.arc(lastX + 8, lastY - size * 0.18, 5, 0, TAU)
      g.fill()
    }
    this.tex.needsUpdate = true
  }

  /** Поставить лист в левый верхний угол кадра. k — видимость 0..1. */
  place(camera: THREE.PerspectiveCamera, k: number) {
    const m = this.mesh.material as THREE.MeshBasicMaterial
    m.opacity = k
    this.mesh.visible = k > 0.01
    if (!this.mesh.visible) return
    const d = camera.near * 4
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const w = h * camera.aspect
    // на телефоне лист почти во всю ширину, на широком экране — меньше половины
    const sw = Math.min(w * (camera.aspect < 1 ? 0.94 : 0.46), h * 1.15)
    const sh = sw / this.aspect
    this.mesh.scale.set(sw, sh, 1)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    const rightV = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    const margin = h * 0.025
    this.mesh.position
      .copy(camera.position)
      .addScaledVector(fwd, d)
      .addScaledVector(rightV, -w / 2 + sw / 2 + margin)
      .addScaledVector(up, h / 2 - sh / 2 - margin + (1 - k) * sh * 0.2)
    this.mesh.quaternion.copy(camera.quaternion)
    this.mesh.rotateZ(0.01)
  }
}

function wrapWords(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${w}` : w
    if (g.measureText(next).width > maxW && line) {
      out.push(line)
      line = w
    } else line = next
  }
  if (line) out.push(line)
  return out
}

// ---------- следы человечка (план 15, § 1.3) ----------

let printGeo: THREE.BufferGeometry | null = null
let printMat: THREE.MeshBasicMaterial | null = null

/** Чернильный след ботинка на странице: путь дня от сценки к сценке. */
export function makeFootprint(): THREE.Mesh {
  if (!printGeo) {
    printGeo = new THREE.CircleGeometry(1, 14)
    printGeo.rotateX(-Math.PI / 2)
  }
  printMat ??= new THREE.MeshBasicMaterial({ color: 0x4a3a2e, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false })
  const m = new THREE.Mesh(printGeo, printMat)
  m.scale.set(0.03, 1, 0.052)
  m.renderOrder = 5
  return m
}
