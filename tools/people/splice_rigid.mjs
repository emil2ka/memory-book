// Заменить сетку жёстко привязанного узла (волосы, шея) данными из JSON (локальные координаты узла, оси glTF).
// node splice_rigid.mjs <in.glb> <out.glb> <node>=<json>[:scaleXZ] ...
const GT = '/Users/emil2ka/Desktop/projects/space-mission/node_modules/@gltf-transform'
const { NodeIO } = await import(`${GT}/core/dist/index.js`)
const { ALL_EXTENSIONS, KHRMaterialsSheen } = await import(`${GT}/extensions/dist/index.js`)
const { prune } = await import(`${GT}/functions/dist/index.js`)
const { readFileSync } = await import('node:fs')

const [inPath, outPath, ...jobs] = process.argv.slice(2)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(inPath)
const root = doc.getRoot()
const buf = root.listBuffers()[0]
const sheenExt = doc.createExtension(KHRMaterialsSheen)
const mk = (arr, type) => doc.createAccessor().setArray(arr).setType(type).setBuffer(buf)
for (const job of jobs) {
  const [nodeName, file] = job.split('=')
  const node = root.listNodes().find((n) => n.getName() === nodeName)
  if (!node?.getMesh()) throw new Error('no mesh node ' + nodeName)
  if (file.startsWith('@scale:')) {
    // thicken in place: scale X/Z (horizontal) around the mesh's vertical axis, keep material/UVs
    const k = Number(file.slice(7))
    const prim = node.getMesh().listPrimitives()[0]
    const pos = prim.getAttribute('POSITION')
    const arr = new Float32Array(pos.getCount() * 3)
    let cx = 0, cz = 0
    const p = [0, 0, 0]
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, p); cx += p[0]; cz += p[2] }
    cx /= pos.getCount(); cz /= pos.getCount()
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p)
      arr.set([cx + (p[0] - cx) * k, p[1], cz + (p[2] - cz) * k], i * 3)
    }
    prim.setAttribute('POSITION', mk(arr, 'VEC3'))
    console.log('scaled', nodeName, k)
    continue
  }
  const d = JSON.parse(readFileSync(file, 'utf8'))
  const prim = node.getMesh().listPrimitives()[0]
  for (const s of prim.listSemantics()) prim.setAttribute(s, null)
  prim.setAttribute('POSITION', mk(new Float32Array(d.positions), 'VEC3'))
  prim.setAttribute('NORMAL', mk(new Float32Array(d.normals), 'VEC3'))
  if (d.colors?.length) prim.setAttribute('COLOR_0', mk(new Float32Array(d.colors), 'VEC4'))
  prim.setIndices(mk(new Uint32Array(d.indices), 'SCALAR'))
  const old = prim.getMaterial()
  const mat = doc.createMaterial(old?.getName() ?? nodeName).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(d.roughness ?? 0.55).setMetallicFactor(0)
  if (d.sheen) mat.setExtension('KHR_materials_sheen', sheenExt.createSheen().setSheenColorFactor(d.sheen).setSheenRoughnessFactor(0.4))
  prim.setMaterial(mat)
  console.log('rigid', nodeName, d.positions.length / 3, 'verts')
}
await doc.transform(prune({ keepLeaves: true, keepAttributes: true }))
await io.write(outPath, doc)
console.log('->', outPath)
