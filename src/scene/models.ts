import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import bookUrl from '../../assets/models/book.glb?url'
import lampUrl from '../../assets/models/lamp.glb?url'
import cassetteUrl from '../../assets/models/cassette.glb?url'

export interface Model {
  root: THREE.Object3D
  clips: Map<string, THREE.AnimationClip>
  mixer: THREE.AnimationMixer
}

export interface Models {
  book: Model
  lamp: Model
  cassette: Model
}

function toModel(g: GLTF): Model {
  // пиксельный вид: без сглаживания текстур, матовые поверхности
  g.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial
      if (mat.map) {
        mat.map.magFilter = THREE.NearestFilter
        mat.map.minFilter = THREE.NearestFilter
        mat.map.generateMipmaps = false
        mat.map.needsUpdate = true
      }
      if ('roughness' in mat) mat.roughness = 1
      if ('metalness' in mat) mat.metalness = 0
    }
  })
  return {
    root: g.scene,
    clips: new Map(g.animations.map((c) => [c.name, c])),
    mixer: new THREE.AnimationMixer(g.scene),
  }
}

export async function loadModels(): Promise<Models> {
  const loader = new GLTFLoader()
  const [book, lamp, cassette] = await Promise.all([bookUrl, lampUrl, cassetteUrl].map((u) => loader.loadAsync(u)))
  return { book: toModel(book), lamp: toModel(lamp), cassette: toModel(cassette) }
}

/** Поставить клип в заданный момент (0..1 от длительности) без проигрывания по часам. */
export function poseClip(model: Model, name: string, k: number) {
  const clip = model.clips.get(name)
  if (!clip) return
  const action = model.mixer.clipAction(clip)
  model.mixer.stopAllAction()
  action.setLoop(THREE.LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  model.mixer.setTime(Math.min(0.999, Math.max(0, k)) * clip.duration)
}
