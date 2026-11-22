// Загрузчик моделей мира: assets/models/world/*.glb, сжатые meshopt. Каждый файл грузится один раз, сцена получает копии.
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

const urls = import.meta.glob('../../assets/models/world/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>

export function worldUrl(file: string): string | null {
  return urls[`../../assets/models/world/${file}`] ?? null
}

export function hasWorldFile(file: string) {
  return worldUrl(file) !== null
}

let loader: GLTFLoader | null = null
function getLoader() {
  if (!loader) {
    loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
  }
  return loader
}

const cache = new Map<string, Promise<GLTF | null>>()

/** Один экземпляр модели в сцене. */
export interface WorldModel {
  file: string
  root: THREE.Object3D
  clips: Map<string, THREE.AnimationClip>
  mixer: THREE.AnimationMixer
}

function fetchGltf(file: string): Promise<GLTF | null> {
  let p = cache.get(file)
  if (!p) {
    const url = worldUrl(file)
    p = url
      ? getLoader()
          .loadAsync(url)
          .catch((e) => {
            console.warn('[world] не загрузилась модель', file, e)
            return null
          })
      : Promise.resolve(null)
    cache.set(file, p)
  }
  return p
}

/**
 * Новый экземпляр модели. Геометрия и текстуры общие; материалы общие, пока их не склонирует владелец.
 * null — файла нет или он не читается: мир живёт без этой вещи.
 */
export async function loadWorldModel(file: string, opts: { shadows?: boolean } = {}): Promise<WorldModel | null> {
  const g = await fetchGltf(file)
  if (!g) return null
  // SkeletonUtils.clone: у людей и рук есть скиннинг, обычный clone() теряет привязку к костям
  const root = cloneSkinned(g.scene)
  const shadows = opts.shadows ?? true
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as THREE.MeshStandardMaterial
      if (mat.map) mat.map.anisotropy = 8
    }
  })
  return { file, root, clips: new Map(g.animations.map((c) => [c.name, c])), mixer: new THREE.AnimationMixer(root) }
}

/** Заранее подтянуть файлы (без экземпляров). */
export function preloadWorld(files: string[]) {
  return Promise.all(files.map((f) => fetchGltf(f)))
}

/** Найти узел по имени (первый в обходе). */
export function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  return root.getObjectByName(name) ?? null
}

/** Материал по имени внутри модели. */
export function findMaterial(root: THREE.Object3D, name: string): THREE.Material | null {
  let found: THREE.Material | null = null
  root.traverse((o) => {
    if (found) return
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.name === name) found = m
  })
  return found
}

/** Заменить материал name на копию во всех мешах модели и вернуть копию (чтобы красить экземпляр отдельно). */
export function ownMaterial<T extends THREE.Material = THREE.MeshStandardMaterial>(root: THREE.Object3D, name: string): T | null {
  let copy: THREE.Material | null = null
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => (m.name === name ? (copy ??= m.clone()) : m))
    } else if (mesh.material.name === name) {
      mesh.material = copy ??= mesh.material.clone()
    }
  })
  return copy as T | null
}
