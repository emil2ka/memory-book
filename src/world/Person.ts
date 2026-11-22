// Человек за столом: мальчик или девочка из Claude Design (assets/models/world/boy.glb, girl.glb) и стул.
// Один скелет и одни клипы на обоих. Сцена ставит камеру в узел eyes (вид из глаз) и прячет голову и волосы.
import * as THREE from 'three'
import { loadWorldModel, type WorldModel } from './loader'

export type PersonKind = 'boy' | 'girl'

/** Клипы человека (точные имена из Claude Design). */
export type PersonClip =
  | 'Walk_In'
  | 'Sit_Down'
  | 'Sit_Idle'
  | 'Open_Book'
  | 'Write'
  | 'Place_Photo'
  | 'Press_Play'
  | 'Lean_Back'
  | 'Watch_Idle'
  | 'Close_Book'

/** Циклы; остальные клипы играют один раз и замирают в последней позе. */
export const LOOP_CLIPS: PersonClip[] = ['Sit_Idle', 'Write', 'Watch_Idle']

/** Где сидит человек: точка пола под стулом (стол — y 0, пол — y −7.5). */
export const SEAT_AT = new THREE.Vector3(0, -7.5, 6.5)

const RIG = ['upperarm_R', 'forearm_R', 'hand_R', 'upperarm_L', 'forearm_L', 'hand_L', 'pen', 'pen_tip'] as const
type RigName = (typeof RIG)[number]
function rigOf(root: THREE.Object3D): Record<string, THREE.Object3D | null> {
  return Object.fromEntries(RIG.map((n) => [n, root.getObjectByName(n) ?? null]))
}

export class Person {
  /** Корень в сцене: стоит в SEAT_AT, клипы двигают человека внутри. */
  readonly root = new THREE.Group()
  readonly ready: Promise<void>
  model: WorldModel | null = null
  chair: WorldModel | null = null
  /** Отдельные руки для вида из глаз (fp_arms.glb): в режиме «из глаз» тело скрыто, видны только они. */
  arms: WorldModel | null = null
  eyes: THREE.Object3D | null = null
  /** Вид из глаз включён. */
  firstPerson = false
  /** Человек спрятан целиком — и тело, и руки fp_arms (вход от первого лица); стул виден. */
  hidden = false
  private bodyRig: Record<string, THREE.Object3D | null> = {}
  private armsRig: Record<string, THREE.Object3D | null> = {}
  private head: THREE.Object3D[] = []
  private armsAction: THREE.AnimationAction | null = null
  private current: THREE.AnimationAction | null = null
  private chairAction: THREE.AnimationAction | null = null

  constructor(
    readonly kind: PersonKind,
    opts: { shadows?: boolean } = {},
  ) {
    this.root.name = `person_${kind}`
    this.root.position.copy(SEAT_AT)
    this.ready = Promise.all([
      loadWorldModel(`${kind}.glb`, opts),
      loadWorldModel('chair.glb', opts),
      loadWorldModel('fp_arms.glb', { shadows: false }),
    ]).then(([m, chair, arms]) => {
      if (chair) {
        this.chair = chair
        this.root.add(chair.root)
      }
      if (m) {
        this.model = m
        this.root.add(m.root)
        const r = m.root
        this.eyes = r.getObjectByName('eyes') ?? null
        this.bodyRig = rigOf(r)
        this.head = ['head_mesh', 'hair_mesh', 'neck_mesh'].map((n) => r.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o)
      }
      if (arms) {
        this.arms = arms
        this.armsRig = rigOf(arms.root)
        // рукава своего цвета: у мальчика синие, у девочки горчичные
        arms.root.getObjectByName(kind === 'boy' ? 'sleeves_girl' : 'sleeves_boy')?.removeFromParent()
        // руки и ручка отбрасывают тень на страницу — без неё кисть «висит» над бумагой
        arms.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true
        })
        arms.root.visible = false
        this.root.add(arms.root)
      }
      // глаза сидя: один раз ставим первый кадр Sit_Idle и запоминаем точку относительно корня
      // (сцена сразу после загрузки ставит свою позу — вход или сидит)
      if (this.eyes && this.has('Sit_Idle')) {
        this.pose('Sit_Idle', 0)
        this.root.updateMatrixWorld(true)
        this.seatEyes = this.root.worldToLocal(this.eyes.getWorldPosition(new THREE.Vector3()))
      }
      // вид из глаз или «спрятан» могли включить, пока модели грузились
      this.applyVisibility()
    })
  }

  /** Кости руки и ручка: в виде из глаз — у fp_arms, иначе у тела. Имена одинаковые, поэтому IK сцены работает и там, и там. */
  private bone(name: RigName) {
    return (this.firstPerson && this.arms ? this.armsRig[name] : this.bodyRig[name]) ?? this.bodyRig[name] ?? null
  }
  get handR() {
    return this.bone('hand_R')
  }
  get forearmR() {
    return this.bone('forearm_R')
  }
  get upperarmR() {
    return this.bone('upperarm_R')
  }
  get handL() {
    return this.bone('hand_L')
  }
  get forearmL() {
    return this.bone('forearm_L')
  }
  get upperarmL() {
    return this.bone('upperarm_L')
  }
  get pen() {
    return this.bone('pen')
  }
  get penTip() {
    return this.bone('pen_tip')
  }

  /** Есть ли такой клип у модели. */
  has(clip: string) {
    return !!this.model?.clips.get(clip)
  }

  /** Длина клипа в секундах (0 — нет такого). */
  clipDuration(clip: string) {
    return this.model?.clips.get(clip)?.duration ?? 0
  }

  /** Сколько секунд текущий клип уже играет. */
  clipTime() {
    return this.current?.time ?? 0
  }

  /**
   * Где глаза, когда человек сидит ровно (первый кадр Sit_Idle), в мировых координатах. Камера записи держится
   * здесь, пока тело в разовом клипе (Open_Book) наклоняется к книге. null — нет узла eyes или клипа Sit_Idle.
   */
  seatedEyes(out = new THREE.Vector3()) {
    if (!this.seatEyes) return null
    this.root.updateMatrixWorld(true)
    return out.copy(this.seatEyes).applyMatrix4(this.root.matrixWorld)
  }
  private seatEyes: THREE.Vector3 | null = null

  /**
   * Сыграть клип. loop — по умолчанию для Sit_Idle, Write, Watch_Idle; fade — секунды плавного перехода от прошлого клипа.
   * onDone — когда разовый клип доиграл (поза держится).
   */
  play(clip: PersonClip | string, opts: { loop?: boolean; fade?: number; onDone?: () => void; from?: number } = {}): THREE.AnimationAction | null {
    const m = this.model
    const c = m?.clips.get(clip)
    if (!m || !c) return null
    const loop = opts.loop ?? LOOP_CLIPS.includes(clip as PersonClip)
    const action = m.mixer.clipAction(c)
    action.reset()
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    action.clampWhenFinished = !loop
    // с середины клипа: смена человека посреди входа — новый продолжает с того же места
    if (opts.from) action.time = Math.min(c.duration - 1e-3, Math.max(0, opts.from))
    const fade = opts.fade ?? 0.25
    if (this.current && this.current !== action && fade > 0) action.crossFadeFrom(this.current, fade, false)
    else if (this.current && this.current !== action) this.current.stop()
    action.play()
    this.current = action
    this.playArms(clip, loop, fade)
    if (opts.onDone && !loop) {
      const done = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== action) return
        m.mixer.removeEventListener('finished', done)
        opts.onDone!()
      }
      m.mixer.addEventListener('finished', done)
    }
    return action
  }

  /** Тот же клип у рук из глаз (если у них такой есть: Write, Sit_Idle, Open_Book, Place_Photo). */
  private playArms(clip: string, loop: boolean, fade: number) {
    const a = this.arms
    const c = a?.clips.get(clip)
    if (!a || !c) return
    const action = a.mixer.clipAction(c)
    action.reset()
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    action.clampWhenFinished = !loop
    if (this.armsAction && this.armsAction !== action && fade > 0) action.crossFadeFrom(this.armsAction, fade, false)
    else if (this.armsAction && this.armsAction !== action) this.armsAction.stop()
    action.play()
    this.armsAction = action
  }

  /** Клип стула: Pull_Out (отодвинуть) или Push_In (задвинуть). */
  playChair(clip: 'Pull_Out' | 'Push_In', from = 0) {
    const ch = this.chair
    const c = ch?.clips.get(clip)
    if (!ch || !c) return null
    this.chairAction?.stop()
    const a = ch.mixer.clipAction(c)
    a.reset()
    a.setLoop(THREE.LoopOnce, 1)
    a.clampWhenFinished = true
    if (from) a.time = Math.min(c.duration, Math.max(0, from))
    a.play()
    this.chairAction = a
    return a
  }

  /** Поставить клип в момент t (секунды) без проигрывания — для перемотки фильма. */
  pose(clip: PersonClip | string, t: number) {
    const m = this.model
    const c = m?.clips.get(clip)
    if (!m || !c) return
    m.mixer.stopAllAction()
    const a = m.mixer.clipAction(c)
    a.reset()
    a.setLoop(THREE.LoopOnce, 1)
    a.clampWhenFinished = true
    a.play()
    m.mixer.setTime(Math.min(c.duration, Math.max(0, t)))
    this.current = a
    const ac = this.arms?.clips.get(clip)
    if (this.arms && ac) {
      this.arms.mixer.stopAllAction()
      const b = this.arms.mixer.clipAction(ac)
      b.reset()
      b.setLoop(THREE.LoopOnce, 1)
      b.clampWhenFinished = true
      b.play()
      this.arms.mixer.setTime(Math.min(ac.duration, Math.max(0, t)))
      this.armsAction = b
    }
  }

  /**
   * Вид из глаз. Если есть fp_arms: тело скрыто целиком, видны отдельные руки (тот же клип, те же имена костей).
   * Без fp_arms — как раньше: прячутся голова, волосы и шея.
   */
  setFirstPerson(on: boolean) {
    this.firstPerson = on
    this.applyVisibility()
  }

  /**
   * Спрятать человека целиком: тело и руки для вида из глаз (у fp_arms нет клипов ходьбы).
   * Нужен для входа от первого лица — камера в глазах, а голову, волосы и руки видеть не должно. Стул остаётся.
   */
  setHidden(on: boolean) {
    this.hidden = on
    this.applyVisibility()
  }

  private applyVisibility() {
    const fp = this.firstPerson
    if (this.arms && this.model) {
      this.model.root.visible = !fp && !this.hidden
      this.arms.root.visible = fp && !this.hidden
      for (const h of this.head) h.visible = true
    } else {
      if (this.model) this.model.root.visible = !this.hidden
      for (const h of this.head) h.visible = !fp
    }
  }

  /**
   * Попадает ли голова (волосы, шея) в пирамиду камеры — по вершинам, а не по коробке: у коробки угол над лбом
   * пустой, и по ней голова «в кадре», когда её там нет. Сетки головы жёсткие (не skinned), ~3.6 тыс. вершин.
   */
  headInView(frustum: THREE.Frustum) {
    const v = new THREE.Vector3()
    this.root.updateMatrixWorld(true)
    for (const h of this.head) {
      const pos = (h as THREE.Mesh).geometry?.getAttribute('position')
      if (!pos) continue
      for (let i = 0; i < pos.count; i++) {
        if (frustum.containsPoint(v.fromBufferAttribute(pos, i).applyMatrix4(h.matrixWorld))) return true
      }
    }
    return false
  }

  /** Мировые границы головы, волос и шеи (по текущей позе) — камера не должна оказаться внутри, когда тело видно. */
  headBox(box = new THREE.Box3()) {
    box.makeEmpty()
    if (!this.head.length) return null
    this.root.updateMatrixWorld(true)
    for (const h of this.head) box.expandByObject(h)
    return box
  }

  setVisible(on: boolean) {
    this.root.visible = on
  }

  /** Мировая позиция и направление взгляда глаз (для камеры сцены). */
  eyesWorld(pos = new THREE.Vector3(), dir = new THREE.Vector3()) {
    if (!this.eyes) return null
    this.eyes.updateWorldMatrix(true, false)
    this.eyes.getWorldPosition(pos)
    this.eyes.getWorldDirection(dir)
    return { pos, dir }
  }

  update(dt: number) {
    // левая кисть в виде из глаз: пальцы чуть согнуты и собраны, а не растопырены веером.
    // Сначала возвращаем прошлую позу (у костей без канала в клипе иначе изгиб копился бы), потом клип, потом изгиб.
    for (const r of this.relax) r.bone.quaternion.copy(r.base)
    this.model?.mixer.update(dt)
    this.arms?.mixer.update(dt)
    this.chair?.mixer.update(dt)
    if (this.arms && !this.relax.length) this.relax = relaxLeftHand(this.arms.root)
    for (const r of this.relax) {
      r.base.copy(r.bone.quaternion)
      r.bone.quaternion.multiply(r.q)
    }
  }

  private relax: { bone: THREE.Object3D; base: THREE.Quaternion; q: THREE.Quaternion }[] = []
}

/**
 * Изгиб пальцев левой руки поверх клипа. В позе привязки пальцы смотрят вдоль −Y, ладонь — к −Z,
 * поэтому сгиб к ладони — поворот вокруг своей оси +X; разведение уменьшаем поворотом вокруг Z.
 */
function relaxLeftHand(root: THREE.Object3D) {
  const curl: Record<string, [number, number]> = {
    index_L_1: [0.18, 0.06],
    index_L_2: [0.32, 0],
    index_L_3: [0.22, 0],
    middle_L_1: [0.24, 0],
    middle_L_2: [0.38, 0],
    middle_L_3: [0.24, 0],
    ring_L_1: [0.28, -0.05],
    ring_L_2: [0.42, 0],
    ring_L_3: [0.26, 0],
    pinky_L_1: [0.32, -0.1],
    pinky_L_2: [0.45, 0],
    pinky_L_3: [0.28, 0],
    thumb_L_1: [0.12, 0],
    thumb_L_2: [0.18, 0],
  }
  const out: { bone: THREE.Object3D; base: THREE.Quaternion; q: THREE.Quaternion }[] = []
  for (const [name, [x, z]] of Object.entries(curl)) {
    const bone = root.getObjectByName(name)
    if (!bone) continue
    out.push({ bone, base: bone.quaternion.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, z)) })
  }
  return out
}
