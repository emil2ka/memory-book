import * as THREE from 'three'
import { PALETTE } from './palette'
import { HD } from './PixelStage'
import type { Model } from './models'

/** ЗАГЛУШКА комнаты: стол, лампа, кассетник, свет. Модели придут из assets/models. */
export class Room {
  readonly group = new THREE.Group()
  readonly lamp: THREE.PointLight
  readonly rim: THREE.DirectionalLight
  readonly ambient: THREE.AmbientLight
  private placeholders: THREE.Object3D[] = []
  private deskBox: THREE.Object3D | null = null
  private mixers: THREE.AnimationMixer[] = []

  constructor() {
    const desk = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.4, 9),
      new THREE.MeshLambertMaterial({ color: PALETTE.wood }),
    )
    desk.position.y = -0.2
    this.group.add(desk)
    this.deskBox = desk

    // лампа: стойка и абажур
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), new THREE.MeshLambertMaterial({ color: PALETTE.brownDark }))
    stand.position.set(-5.2, 1.2, -2.6)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.amber }))
    shade.position.set(-5.0, 2.6, -2.4)
    this.group.add(stand, shade)
    this.placeholders.push(stand, shade)

    // кассетник
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 1.0), new THREE.MeshLambertMaterial({ color: PALETTE.slateDark }))
    deck.position.set(5.2, 0.25, 2.4)
    this.group.add(deck)
    this.placeholders.push(deck)

    // тёплая лампа слева сверху + холодный контровой от окна
    this.lamp = new THREE.PointLight(PALETTE.yellow, 60, 30, 1.6)
    this.lamp.position.set(-4.6, 3.2, -1.8)
    this.rim = new THREE.DirectionalLight(PALETTE.greyBlue, 0.7)
    this.rim.position.set(5, 4, -6)
    this.ambient = new THREE.AmbientLight(PALETTE.mauve, 0.9)
    this.group.add(this.lamp, this.rim, this.ambient)
    if (HD) {
      desk.receiveShadow = true
      this.lamp.castShadow = true
      this.lamp.shadow.mapSize.set(1024, 1024)
      this.lamp.shadow.radius = 6
      this.lamp.shadow.bias = -0.002
      this.lamp.position.set(-3.6, 3.4, -0.6)
    }
  }

  /** Заменить коробки настоящими моделями лампы и кассетника. */
  useModels(lamp: Model, cassette: Model, desk?: Model) {
    if (desk && HD) {
      if (this.deskBox) this.group.remove(this.deskBox)
      desk.root.traverse((o) => (o.receiveShadow = true))
      this.group.add(desk.root)
    }
    for (const p of this.placeholders) this.group.remove(p)
    this.placeholders = []
    lamp.root.scale.setScalar(0.62)
    lamp.root.position.set(-4.7, 0, -0.4)
    lamp.root.rotation.y = -0.25
    cassette.root.position.set(4.4, 0, 1.5)
    cassette.root.rotation.y = -0.35
    this.group.add(lamp.root, cassette.root)
    if (HD) {
      cassette.root.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)))
      lamp.root.traverse((o) => (o.receiveShadow = true))
    }
    const spin = cassette.clips.get('Spin')
    if (spin) cassette.mixer.clipAction(spin).play()
    this.mixers.push(cassette.mixer)
  }

  update(dt: number) {
    for (const m of this.mixers) m.update(dt)
  }
}
