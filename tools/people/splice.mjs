// Вставить новую сетку кисти (экспорт из Blender) в исходный fp_arms.glb, не трогая кости и клипы.
// node splice.mjs <original.glb> <blender_export.glb> <out.glb> [meshNode=fp_hands] [--check]
const GT = '/Users/emil2ka/Desktop/projects/space-mission/node_modules/@gltf-transform'
const { NodeIO, Accessor } = await import(`${GT}/core/dist/index.js`)
const { ALL_EXTENSIONS } = await import(`${GT}/extensions/dist/index.js`)

const [origPath, newPath, outPath, meshName = 'fp_hands'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const check = process.argv.includes('--check')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const A = await io.read(origPath)
const N = await io.read(newPath)

// ---- 4x4 helpers (column-major, like glTF) ----
const mul = (a, b) => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function inv(m) {
  // general 4x4 inverse
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  const d = 1 / det
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ]
}
const xf = (m, p, w = 1) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r] * w)

const nodeByName = (doc, n) => doc.getRoot().listNodes().find((x) => x.getName() === n)
const SLEEVE = { sleeves_boy: [44, 78, 170], sleeves_girl: [224, 154, 38] }
const lin = (c) => c.map((x) => ((x / 255) <= 0.04045 ? x / 255 / 12.92 : (((x / 255) + 0.055) / 1.055) ** 2.4))
const texCache = new Map()
const { readFileSync } = await import('node:fs')
const SCR = '/Users/emil2ka/Desktop/projects/memory-book/assets/_raw/people/'
function fileTex(name) {
  if (texCache.has(name)) return texCache.get(name)
  const t = A.createTexture(name).setImage(new Uint8Array(readFileSync(SCR + name + '.png'))).setMimeType('image/png')
  texCache.set(name, t)
  return t
}
function copyTex(nTex) {
  if (!nTex) return null
  if (texCache.has(nTex)) return texCache.get(nTex)
  const t = A.createTexture(nTex.getName()).setImage(nTex.getImage()).setMimeType(nTex.getMimeType())
  texCache.set(nTex, t)
  return t
}
const { KHRMaterialsSheen } = await import(`${GT}/extensions/dist/index.js`)
const sheenExt = A.createExtension(KHRMaterialsSheen)
function spliceMesh(meshName) {
  const aNode = nodeByName(A, meshName)
  const nNode = nodeByName(N, meshName)
  if (!aNode || !nNode) throw new Error('mesh node missing: ' + meshName)
  const aSkin = aNode.getSkin()
  const nSkin = nNode.getSkin()
  const ibm = (skin) => {
    const acc = skin.getInverseBindMatrices()
    return skin.listJoints().map((j, i) => [j.getName(), Array.from(acc.getElement(i, new Array(16)))])
  }
  const aIbm = new Map(ibm(aSkin))
  const nIbm = ibm(nSkin)
  const M = nIbm.map(([name, m]) => mul(inv(aIbm.get(name)), m))
  const aJointIndex = new Map(aSkin.listJoints().map((j, i) => [j.getName(), i]))
  const remap = nIbm.map(([name]) => aJointIndex.get(name))
  const nPrim = nNode.getMesh().listPrimitives()[0]
  const pos = nPrim.getAttribute('POSITION'), nor = nPrim.getAttribute('NORMAL')
  const jnt = nPrim.getAttribute('JOINTS_0'), wgt = nPrim.getAttribute('WEIGHTS_0')
  const col = nPrim.getAttribute('COLOR_0'), uv = nPrim.getAttribute('TEXCOORD_0')
  const count = pos.getCount()
  const P = new Float32Array(count * 3), Nn = new Float32Array(count * 3)
  const J = new Uint16Array(count * 4), W = new Float32Array(count * 4)
  const p = [0, 0, 0], n = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0]
  for (let i = 0; i < count; i++) {
    pos.getElement(i, p); nor.getElement(i, n); jnt.getElement(i, j4); wgt.getElement(i, w4)
    const op = [0, 0, 0], on = [0, 0, 0]
    for (let k = 0; k < 4; k++) {
      if (!w4[k]) continue
      const m = M[j4[k]]
      const q = xf(m, p), r = xf(m, n, 0)
      for (let c = 0; c < 3; c++) { op[c] += q[c] * w4[k]; on[c] += r[c] * w4[k] }
      J[i * 4 + k] = remap[j4[k]]
      W[i * 4 + k] = w4[k]
    }
    const ln = Math.hypot(...on) || 1
    P.set(op, i * 3)
    Nn.set(on.map((v) => v / ln), i * 3)
  }
  const buf = A.getRoot().listBuffers()[0]
  const mk = (arr, type) => A.createAccessor().setArray(arr).setType(type).setBuffer(buf)
  const aPrim = aNode.getMesh().listPrimitives()[0]
  for (const s of aPrim.listSemantics()) aPrim.setAttribute(s, null)
  aPrim.setAttribute('POSITION', mk(P, 'VEC3'))
  aPrim.setAttribute('NORMAL', mk(Nn, 'VEC3'))
  aPrim.setAttribute('JOINTS_0', mk(J, 'VEC4'))
  aPrim.setAttribute('WEIGHTS_0', mk(W, 'VEC4'))
  if (col) {
    const C = new Float32Array(count * 4), c4 = [0, 0, 0, 1]
    for (let i = 0; i < count; i++) { col.getElement(i, c4); C.set([c4[0], c4[1], c4[2], col.getElementSize() === 4 ? c4[3] : 1], i * 4) }
    aPrim.setAttribute('COLOR_0', mk(C, 'VEC4'))
  }
  if (uv) aPrim.setAttribute('TEXCOORD_0', mk(new Float32Array(uv.getArray()), 'VEC2'))
  aPrim.setIndices(mk(new Uint32Array(nPrim.getIndices().getArray()), 'SCALAR'))
  const oldMat = aPrim.getMaterial()
  const nMat = nPrim.getMaterial()
  const mat = A.createMaterial(oldMat ? oldMat.getName() : meshName).setMetallicFactor(0)
  if (SLEEVE[meshName]) {
    mat.setBaseColorFactor([...lin(SLEEVE[meshName]), 1]).setRoughnessFactor(0.95)
    mat.setBaseColorTexture(fileTex('knit_albedo'))
    mat.setNormalTexture(fileTex('knit_normal')).setNormalScale(1)
    mat.setExtension('KHR_materials_sheen', sheenExt.createSheen().setSheenColorFactor(lin(SLEEVE[meshName]).map((v) => v * 0.6 + 0.02)).setSheenRoughnessFactor(0.7))
  } else {
    mat.setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.55)
    mat.setExtension('KHR_materials_sheen', sheenExt.createSheen().setSheenColorFactor([0.1, 0.05, 0.04]).setSheenRoughnessFactor(0.5))
  }
  aPrim.setMaterial(mat)
  console.log('spliced', meshName, 'verts', count)
}
for (const name of meshName.split(',')) spliceMesh(name)
// drop unused stuff (old textures of the hand material if unused)
const { prune } = await import(`${GT}/functions/dist/index.js`)
await A.transform(prune({ keepLeaves: true, keepAttributes: true }))
await io.write(outPath, A)
console.log('->', outPath)
