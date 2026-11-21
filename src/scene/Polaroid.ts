import * as THREE from 'three'

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

  constructor(image: CanvasImageSource & { width: number; height: number }, side: number) {
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
    const mat = new THREE.MeshLambertMaterial({ map: tex })
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
      )
    }
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(side, side), mat)
    photo.position.set(0, this.height / 2 - border - side / 2, 0.0115)
    photo.receiveShadow = true
    this.object.add(card, photo)
  }

  /** 0 — молочно-белый, 1 — проявлен. */
  setDevelop(k: number) {
    this.dev.value = Math.min(1, Math.max(0, k))
  }
}
