import * as THREE from 'three'
import { HAND_FONT } from './Book'

/**
 * Настоящий полароид (мир, полное разрешение): белая карточка с толстым нижним полем
 * и снимком, который умеет проявляться — из молочно-белого через серое в цвет,
 * тёмные места проступают первыми.
 * Локально: карточка стоит в плоскости XY лицом к +Z, центр — в центре карточки.
 */
export class Polaroid {
  readonly object = new THREE.Group()
  readonly width: number
  readonly height: number
  private dev = { value: 1 }

  constructor(image: CanvasImageSource & { width: number; height: number }, side: number, caption?: string) {
    const border = side * 0.07
    const bottom = side * 0.26
    this.width = side + border * 2
    this.height = side + border + bottom
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(this.width, this.height, 0.022),
      new THREE.MeshLambertMaterial({ color: 0xf4efe4 }),
    )
    card.castShadow = true
    card.receiveShadow = true

    // квадратный кадр из середины снимка
    const c = document.createElement('canvas')
    const n = 768
    c.width = c.height = n
    const g = c.getContext('2d')!
    const w = (image as HTMLImageElement).naturalWidth || image.width
    const h = (image as HTMLImageElement).naturalHeight || image.height
    const crop = Math.min(w, h)
    g.drawImage(image, (w - crop) / 2, (h - crop) / 2, crop, crop, 0, 0, n, n)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    // снимок чуть светится сам (как отпечаток под лампой): за сценкой у дальнего края страницы он в тени,
    // а зритель должен узнать фото, из которого ожила сценка (план 14)
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 })
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDev = this.dev
      sh.fragmentShader = 'uniform float uDev;\n' + sh.fragmentShader.replace(
        '#include <map_fragment>',
        `vec4 texel = texture2D(map, vMapUv);
        float lum = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
        vec3 milky = vec3(0.80, 0.82, 0.78);
        float early = clamp(uDev * 1.7 - lum * 0.7, 0.0, 1.0);
        vec3 grey = mix(vec3(lum) * vec3(0.92, 0.97, 1.0), texel.rgb, smoothstep(0.45, 1.0, uDev));
        diffuseColor.rgb *= mix(milky, grey, early);`,
      ).replace(
        '#include <emissivemap_fragment>',
        // свечение — только у проявленного снимка
        '#include <emissivemap_fragment>\n        totalEmissiveRadiance *= smoothstep(0.55, 1.0, uDev);',
      )
    }
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat)
    photo.position.set(0, this.height / 2 - border - side / 2, 0.0115)
    photo.receiveShadow = true
    this.object.add(card, photo)
    if (caption) this.object.add(this.captionMesh(caption, side, bottom))
  }

  /** Подпись от руки на нижнем поле — строка рассказа под кадром (план 15, фотоальбом дня). */
  private captionMesh(text: string, side: number, bottom: number) {
    const c = document.createElement('canvas')
    c.width = 768
    c.height = Math.round((768 * bottom) / side)
    const g = c.getContext('2d')!
    g.fillStyle = '#2b2420'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    // две строки максимум, кегль под длину
    let size = 64
    let lines: string[] = []
    for (; size >= 34; size -= 4) {
      g.font = `${size}px ${HAND_FONT}, cursive`
      lines = []
      let line = ''
      for (const w of text.split(/\s+/)) {
        const next = line ? `${line} ${w}` : w
        if (g.measureText(next).width > c.width - 60 && line) {
          lines.push(line)
          line = w
        } else line = next
      }
      if (line) lines.push(line)
      if (lines.length <= 2) break
    }
    lines = lines.slice(0, 2)
    lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.05))
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const m = new THREE.Mesh(new THREE.PlaneGeometry(side, bottom * 0.86), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
    m.position.set(0, -this.height / 2 + bottom / 2, 0.0118)
    return m
  }

  /** 0 — молочно-белый, 1 — проявлен. */
  setDevelop(k: number) {
    this.dev.value = Math.min(1, Math.max(0, k))
  }
}
