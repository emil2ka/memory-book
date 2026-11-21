import * as THREE from 'three'
import { PALETTE, type PaletteName } from '../scene/palette'

/**
 * Слой сцены для жителей. Камера мира его не видит; его рисует пиксельный слой.
 * Лампа отбрасывает тени и от мира (слой 0), и от жителей (этот слой).
 */
export const LAYER_PIX = 1

/** Тень и блик для каждого цвета палитры: жители окрашены только цветами палитры. */
const RAMP: Record<PaletteName, [PaletteName, PaletteName]> = {
  ink: ['ink', 'brownDark'],
  brownDark: ['ink', 'brown'],
  brown: ['brownDark', 'wood'],
  wood: ['brown', 'woodLight'],
  woodLight: ['wood', 'ochre'],
  ochre: ['wood', 'amber'],
  amber: ['ochre', 'yellow'],
  yellow: ['amber', 'cream'],
  cream: ['paperShade', 'white'],
  paper: ['paperShade', 'cream'],
  paperShade: ['grey', 'paper'],
  white: ['greyLight', 'white'],
  brickDark: ['plum', 'brick'],
  brick: ['brickDark', 'coral'],
  coral: ['brick', 'peach'],
  peach: ['coral', 'cream'],
  greenDark: ['navy', 'green'],
  green: ['greenDark', 'greenSoft'],
  greenSoft: ['green', 'mint'],
  mint: ['greenSoft', 'cream'],
  tealDark: ['navy', 'teal'],
  teal: ['tealDark', 'mint'],
  navy: ['ink', 'slateDark'],
  slateDark: ['navy', 'slate'],
  slate: ['slateDark', 'greyBlue'],
  greyBlue: ['slate', 'ice'],
  ice: ['greyBlue', 'frost'],
  frost: ['ice', 'white'],
  plum: ['navy', 'mauve'],
  mauve: ['plum', 'peach'],
  grey: ['brown', 'greyLight'],
  greyLight: ['grey', 'cream'],
  skin: ['skinShade', 'cream'],
  skinShade: ['coral', 'skin'],
}

/** Цвет палитры как есть, без перевода в линейное пространство: в слой пишутся готовые sRGB. */
const raw = (h: number) => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)

/** Пороги ступеней света: доля освещённости ниже t1 — тень, выше t2 — блик. Общие для всех жителей. */
export const TOON = { t1: { value: 0.55 }, t2: { value: 2.4 } }

const toonCache = new Map<string, THREE.Material>()

/**
 * Ступенчатый материал жителя: обычный расчёт света и теней Ламберта,
 * но результат сводится к трём цветам палитры — тень, основной, блик.
 */
export function toonFor(c: PaletteName, glow = false): THREE.Material {
  const key = `${c}:${glow}`
  let m = toonCache.get(key)
  if (m) return m
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE[c] })
  mat.toneMapped = false
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDark = { value: raw(PALETTE[RAMP[c][0]]) }
    sh.uniforms.uBase = { value: raw(PALETTE[c]) }
    sh.uniforms.uLight = { value: raw(PALETTE[RAMP[c][1]]) }
    sh.uniforms.uT1 = TOON.t1
    sh.uniforms.uT2 = TOON.t2
    sh.uniforms.uGlow = { value: glow ? 1 : 0 }
    sh.fragmentShader =
      'uniform vec3 uDark;\nuniform vec3 uBase;\nuniform vec3 uLight;\nuniform float uT1;\nuniform float uT2;\nuniform float uGlow;\n' +
      sh.fragmentShader
        .replace(
          '#include <opaque_fragment>',
          `float lumL = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
          float lumB = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.002);
          float kL = lumL / lumB;
          vec3 toon = kL < uT1 ? uDark : (kL < uT2 ? uBase : uLight);
          if (uGlow > 0.5) toon = kL < uT1 ? uBase : uLight;
          gl_FragColor = vec4(toon, 1.0);`,
        )
        .replace('#include <colorspace_fragment>', '')
  }
  toonCache.set(key, mat)
  return mat
}

/** Перевести объект и всех потомков на слой жителей и включить тени. */
export function toPixelLayer(o: THREE.Object3D) {
  o.traverse((x) => {
    x.layers.set(LAYER_PIX)
    if ((x as THREE.Mesh).isMesh) {
      x.castShadow = true
      x.receiveShadow = true
    }
  })
}

const COMPOSITE_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform float f;
uniform vec2 offset;
uniform vec2 lowSize;
uniform float near;
uniform float far;
uniform vec3 ink;
uniform float edge;

float viewZ(ivec2 p) {
  return -perspectiveDepthToViewZ(texelFetch(tDepth, p, 0).r, near, far);
}

void main() {
  ivec2 p = ivec2(floor((gl_FragCoord.xy - offset) / f));
  if (p.x < 0 || p.y < 0) discard;
  ivec2 hi = ivec2(lowSize) - 1;
  if (p.x > hi.x || p.y > hi.y) discard;
  vec4 c = texelFetch(tColor, p, 0);
  float d = viewZ(p);
  ivec2 o[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
  if (c.a > 0.5) {
    // внутренний контур: сосед заметно дальше — мы на краю ближней фигуры
    for (int i = 0; i < 4; i++) {
      ivec2 q = clamp(p + o[i], ivec2(0), hi);
      vec4 cn = texelFetch(tColor, q, 0);
      if (cn.a > 0.5 && viewZ(q) - d > edge) {
        gl_FragColor = vec4(ink, 1.0);
        return;
      }
    }
    gl_FragColor = vec4(c.rgb, 1.0);
    return;
  }
  // внешний контур: пустой пиксель рядом с жителем, если мир здесь не ближе жителя
  float nearest = 1e9;
  for (int i = 0; i < 4; i++) {
    ivec2 q = clamp(p + o[i], ivec2(0), hi);
    if (texelFetch(tColor, q, 0).a > 0.5) nearest = min(nearest, viewZ(q));
  }
  if (nearest < 1e8 && d > nearest - 0.02) {
    gl_FragColor = vec4(ink, 1.0);
    return;
  }
  discard;
}
`

/**
 * Пиксельный слой. Каждый кадр:
 * 1) мир рисуется как обычно, в полном разрешении (тени лампы уже учитывают жителей);
 * 2) в маленькую текстуру пишется глубина мира — чтобы мир закрывал жителей;
 * 3) туда же рисуются жители ступенчатым светом;
 * 4) текстура ложится поверх кадра крупными пикселями, с тёмным контуром.
 *
 * Размер пикселя задаётся плотностью: сколько пикселей слоя приходится на единицу мира
 * там, куда смотрит камера. Поэтому человечек всегда примерно одного роста в пикселях,
 * а на крупном плане пиксели крупнее — как у спрайта, который приблизили.
 */
export class PixelLayer {
  /** Пикселей слоя на единицу мира в точке фокуса. */
  density = 40
  /** Фиксированная высота слоя в пикселях вместо плотности (для сравнения), 0 — выключено. */
  fixedHeight = 0
  /** Точка, по которой считается плотность; по умолчанию — куда смотрит камера. */
  focus: THREE.Vector3 | null = null
  /** Текущий размер пикселя слоя в пикселях холста. */
  f = 6

  private rt: THREE.WebGLRenderTarget
  private lowCam = new THREE.PerspectiveCamera()
  private depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })
  private quad: THREE.Mesh
  private quadScene = new THREE.Scene()
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private uniforms: Record<string, THREE.IUniform>
  private clear = new THREE.Color()
  private tmp = new THREE.Vector3()
  private fwd = new THREE.Vector3()

  constructor() {
    this.rt = this.makeTarget(64, 64)
    this.lowCam.matrixAutoUpdate = false
    this.lowCam.matrixWorldAutoUpdate = false
    this.uniforms = {
      tColor: { value: this.rt.texture },
      tDepth: { value: this.rt.depthTexture },
      f: { value: this.f },
      offset: { value: new THREE.Vector2(0, 0) },
      lowSize: { value: new THREE.Vector2(1, 1) },
      near: { value: 0.1 },
      far: { value: 100 },
      ink: { value: raw(PALETTE.ink) },
      edge: { value: 0.12 },
    }
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: COMPOSITE_FRAG,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.quad.frustumCulled = false
    this.quadScene.add(this.quad)
  }

  private makeTarget(w: number, h: number) {
    return new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(w, h),
    })
  }

  /** Лампа и остальной свет должны освещать жителей, а лампа — бросать от них тень. */
  attachLights(scene: THREE.Scene) {
    scene.traverse((o) => {
      const l = o as THREE.Light & { shadow?: THREE.LightShadow }
      if (!l.isLight) return
      l.layers.enable(LAYER_PIX)
      if (l.castShadow && l.shadow) l.shadow.camera.layers.enable(LAYER_PIX)
    })
  }

  /**
   * Нарисовать кадр. cell — прямоугольник холста в пикселях холста, от левого нижнего угла
   * (как в WebGL): тогда кадр рисуется только в нём (ячейки витрины). Без cell — весь холст.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, cell?: THREE.Vector4) {
    const pr = renderer.getPixelRatio()
    const W = cell ? cell.z : renderer.domElement.width
    const H = cell ? cell.w : renderer.domElement.height
    const mask = camera.layers.mask
    const toCanvas = () => {
      if (!cell) return
      renderer.setViewport(cell.x / pr, cell.y / pr, cell.z / pr, cell.w / pr)
      renderer.setScissor(cell.x / pr, cell.y / pr, cell.z / pr, cell.w / pr)
      renderer.setScissorTest(true)
    }

    // 1) мир
    camera.layers.set(0)
    toCanvas()
    renderer.render(scene, camera)

    // размер пикселя слоя
    camera.updateMatrixWorld()
    let lowH: number
    if (this.fixedHeight > 0) lowH = this.fixedHeight
    else {
      camera.getWorldDirection(this.fwd)
      const target = this.focus ?? this.tmp.copy(camera.position).addScaledVector(this.fwd, 10)
      const dist = Math.max(0.5, this.tmp.copy(target).sub(camera.position).dot(this.fwd))
      lowH = this.density * 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    }
    const f = Math.max(2, H / Math.max(16, lowH))
    this.f = f
    const lowW = Math.ceil(W / f)
    const lowHi = Math.ceil(H / f)
    if (this.rt.width < lowW || this.rt.height < lowHi) {
      this.rt.dispose()
      this.rt = this.makeTarget(Math.ceil(lowW * 1.25), Math.ceil(lowHi * 1.25))
      this.uniforms.tColor.value = this.rt.texture
      this.uniforms.tDepth.value = this.rt.depthTexture
    }
    this.rt.viewport.set(0, 0, lowW, lowHi)
    this.rt.scissor.set(0, 0, lowW, lowHi)

    // камера слоя: тот же вид, но кадр растянут так, чтобы пиксель слоя был ровно f пикселей холста
    const sx = W / (lowW * f)
    const sy = H / (lowHi * f)
    const lc = this.lowCam
    lc.matrixWorld.copy(camera.matrixWorld)
    lc.matrixWorldInverse.copy(camera.matrixWorldInverse)
    lc.projectionMatrix.makeScale(sx, sy, 1)
    const e = lc.projectionMatrix.elements
    e[12] = sx - 1
    e[13] = sy - 1
    lc.projectionMatrix.multiply(camera.projectionMatrix)
    lc.projectionMatrixInverse.copy(lc.projectionMatrix).invert()
    lc.near = camera.near
    lc.far = camera.far

    // 2) глубина мира в маленькую текстуру
    const autoClear = renderer.autoClear
    const clearAlpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clear)
    renderer.shadowMap.autoUpdate = false
    renderer.setRenderTarget(this.rt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, true, false)
    renderer.autoClear = false
    this.worldDepth(scene, () => {
      lc.layers.set(0)
      renderer.render(scene, lc)
    })

    // 3) жители
    lc.layers.set(LAYER_PIX)
    renderer.render(scene, lc)

    renderer.setRenderTarget(null)
    renderer.shadowMap.autoUpdate = true
    renderer.setClearColor(this.clear, clearAlpha)
    camera.layers.mask = mask

    // 4) поверх кадра
    toCanvas()
    ;(this.uniforms.offset.value as THREE.Vector2).set(cell ? cell.x : 0, cell ? cell.y : 0)
    this.uniforms.f.value = f
    ;(this.uniforms.lowSize.value as THREE.Vector2).set(lowW, lowHi)
    this.uniforms.near.value = camera.near
    this.uniforms.far.value = camera.far
    renderer.render(this.quadScene, this.quadCam)
    renderer.autoClear = autoClear
    if (cell) {
      const c = renderer.domElement
      renderer.setViewport(0, 0, c.width / pr, c.height / pr)
      renderer.setScissor(0, 0, c.width / pr, c.height / pr)
      renderer.setScissorTest(false)
    }
  }

  /**
   * Мир пишет только глубину. Непрозрачное — целиком, вырезанное по альфе (спрайты, слова) —
   * только там, где есть картинка, полупрозрачное (стекло, свечение) жителей не закрывает.
   */
  private worldDepth(scene: THREE.Scene, draw: () => void) {
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
    const hidden: THREE.Object3D[] = []
    const masked = new Set<THREE.Material>()
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !o.layers.isEnabled(0)) return
      const m = mesh.material as THREE.Material
      if (Array.isArray(mesh.material) || !m) {
        swapped.push([mesh, mesh.material])
        mesh.material = this.depthOnly
      } else if (m.transparent) {
        hidden.push(o)
      } else if (m.alphaTest > 0) {
        masked.add(m)
      } else {
        swapped.push([mesh, m])
        mesh.material = this.depthOnly
      }
    })
    for (const o of hidden) o.visible = false
    for (const m of masked) m.colorWrite = false
    try {
      draw()
    } finally {
      for (const [mesh, m] of swapped) mesh.material = m
      for (const o of hidden) o.visible = true
      for (const m of masked) m.colorWrite = true
    }
  }

  dispose() {
    this.rt.dispose()
    this.depthOnly.dispose()
    ;(this.quad.material as THREE.Material).dispose()
    this.quad.geometry.dispose()
  }
}
