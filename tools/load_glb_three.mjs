// load_glb_three.mjs — parse a GLB with three's real GLTFLoader in Node (images stubbed),
// list nodes/materials/morphs and check every animation track binds to an existing node.
// Usage: node tools/load_glb_three.mjs assets/models/book.glb
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

// Node has no image decoding: stub the texture loaders so geometry/animation parse fully.
globalThis.self = globalThis
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
const file = process.argv[2]
const buf = readFileSync(file)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
loader.parse(ab, '', (gltf) => {
  const scene = gltf.scene
  const names = new Set()
  let tris = 0
  const mats = new Set()
  scene.traverse((o) => {
    names.add(o.name)
    if (o.isMesh) {
      const g = o.geometry
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      ;[].concat(o.material).forEach((m) => mats.add(`${m.name}${m.transparent ? '(transparent ' + m.opacity + ')' : ''}${m.emissive && m.emissive.getHex() ? '(emissive)' : ''}`))
      if (o.morphTargetDictionary) console.log(`morphs  ${o.name}: ${Object.keys(o.morphTargetDictionary).join(', ')}`)
    }
    if (o.isLight) console.log(`light   ${o.name} ${o.type} intensity ${o.intensity}`)
  })
  console.log(`loaded  ${file}: ${tris} triangles, ${names.size} objects`)
  console.log(`mats    ${[...mats].join(', ')}`)
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene, true) // precise: rest pose, morphs at 0
  console.log(`bbox    min ${box.min.toArray().map((v) => v.toFixed(2))} max ${box.max.toArray().map((v) => v.toFixed(2))}`)
  let bad = 0
  for (const clip of gltf.animations) {
    const missing = clip.tracks.filter((t) => !names.has(THREE.PropertyBinding.parseTrackName(t.name).nodeName))
    bad += missing.length
    console.log(`clip    ${clip.name} ${clip.duration.toFixed(2)}s ${clip.tracks.length} tracks${missing.length ? ' UNBOUND: ' + missing.map((t) => t.name).join(',') : ''}`)
  }
  // play every clip to its end to make sure the mixer accepts it
  const mixer = new THREE.AnimationMixer(scene)
  for (const clip of gltf.animations) { const a = mixer.clipAction(clip); a.play(); mixer.update(clip.duration); a.stop() }
  console.log(bad ? `RESULT FAIL (${bad} unbound tracks)` : 'RESULT LOAD OK')
}, (err) => { console.error('LOAD ERROR', err); process.exit(1) })
