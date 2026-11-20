#!/usr/bin/env node
// check_glb.mjs — validate a GLB against the Memory Book limits (03-art-pipeline.md).
// Usage: node tools/check_glb.mjs <file.glb> [--max-tris 3000] [--clips Open,Close,Flip,Idle] [--json]
// Prints triangle count, textures (size, filter), animation clips (name, duration),
// world bounding box (Y up, origin at base, 1 unit = 10 cm) and PASS/FAIL per rule.
// Parses the GLB container directly (no DOM needed), so it runs in plain Node.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const args = process.argv.slice(2)
if (!args.length) {
  console.error('usage: node tools/check_glb.mjs <file.glb> [--max-tris N] [--clips A,B] [--json]')
  process.exit(2)
}
const file = args[0]
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const maxTris = Number(opt('--max-tris', 3000))
const wantClips = (opt('--clips', '') || '').split(',').map(s => s.trim()).filter(Boolean)
const asJson = args.includes('--json')

const buf = readFileSync(file)
const fail = []
const warn = []
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)')
const version = buf.readUInt32LE(4)
let off = 12, json = null, bin = null
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4)
  const chunk = buf.subarray(off + 8, off + 8 + len)
  if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'))
  else if (type === 0x004e4942) bin = chunk
  off += 8 + len
}
if (!json) throw new Error('GLB has no JSON chunk')

const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
function readAccessor(i) {
  const a = json.accessors[i]
  const bv = json.bufferViews[a.bufferView]
  if (!bin || bv == null) return null
  const n = NCOMP[a.type], cs = COMP[a.componentType]
  const stride = bv.byteStride || n * cs
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0)
  const out = new Float64Array(a.count * n)
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const p = base + k * stride + c * cs
    out[k * n + c] = a.componentType === 5126 ? bin.readFloatLE(p)
      : a.componentType === 5125 ? bin.readUInt32LE(p)
      : a.componentType === 5123 ? bin.readUInt16LE(p)
      : a.componentType === 5121 ? bin.readUInt8(p)
      : a.componentType === 5122 ? bin.readInt16LE(p) : bin.readInt8(p)
  }
  return out
}

// ---- matrices (column-major, like glTF) ----
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function mul(a, b) {
  const o = new Array(16).fill(0)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function trs(n) {
  if (n.matrix) return n.matrix.slice()
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale || [1, 1, 1]
  const [tx, ty, tz] = n.translation || [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}
const apply = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

// ---- triangles + world bbox ----
let tris = 0
const meshTris = {}
const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
function primTris(p) {
  const mode = p.mode ?? 4
  const count = p.indices != null ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count
  if (mode === 4) return Math.floor(count / 3)
  if (mode === 5 || mode === 6) return Math.max(0, count - 2)
  return 0
}
function visit(ni, parent, seen = new Set()) {
  if (seen.has(ni)) return
  seen.add(ni)
  const n = json.nodes[ni]
  const m = mul(parent, trs(n))
  if (n.mesh != null) {
    const mesh = json.meshes[n.mesh]
    let t = 0
    for (const p of mesh.primitives) {
      t += primTris(p)
      const acc = json.accessors[p.attributes.POSITION]
      if (acc.min && acc.max) {
        // 8 corners of the local AABB -> world
        for (const cx of [acc.min[0], acc.max[0]]) for (const cy of [acc.min[1], acc.max[1]]) for (const cz of [acc.min[2], acc.max[2]]) {
          const w = apply(m, [cx, cy, cz])
          for (let k = 0; k < 3; k++) { bb.min[k] = Math.min(bb.min[k], w[k]); bb.max[k] = Math.max(bb.max[k], w[k]) }
        }
      }
    }
    tris += t
    const key = n.name || mesh.name || `mesh${n.mesh}`
    meshTris[key] = (meshTris[key] || 0) + t
  }
  for (const c of n.children || []) visit(c, m, seen)
}
const scene = json.scenes?.[json.scene ?? 0]
const roots = scene ? scene.nodes : (json.nodes || []).map((_, i) => i)
for (const r of roots) visit(r, ident())

// ---- textures ----
function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20), 'png']
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let p = 2
    while (p < bytes.length) {
      if (bytes[p] !== 0xff) { p++; continue }
      const mk = bytes[p + 1], len = bytes.readUInt16BE(p + 2)
      if (mk >= 0xc0 && mk <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(mk)) return [bytes.readUInt16BE(p + 7), bytes.readUInt16BE(p + 5), 'jpeg']
      p += 2 + len
    }
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF') return [null, null, 'webp']
  return [null, null, 'unknown']
}
const textures = (json.images || []).map((img, i) => {
  let w = null, h = null, fmt = img.mimeType || 'uri'
  if (img.bufferView != null && bin) {
    const bv = json.bufferViews[img.bufferView]
    ;[w, h, fmt] = imageSize(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength))
  } else if (img.uri?.startsWith('data:')) {
    ;[w, h, fmt] = imageSize(Buffer.from(img.uri.split(',')[1], 'base64'))
  }
  return { index: i, name: img.name || '', width: w, height: h, format: fmt }
})
const samplers = (json.samplers || []).map(s => ({ mag: s.magFilter, min: s.minFilter }))
const NEAREST = new Set([9728, 9984, 9986])

// ---- animations ----
const clips = (json.animations || []).map((a, i) => {
  let dur = 0
  const targets = new Set()
  for (const s of a.samplers) { const acc = json.accessors[s.input]; if (acc.max) dur = Math.max(dur, acc.max[0]) }
  for (const c of a.channels) targets.add(c.target.path)
  return { name: a.name || `(unnamed ${i})`, duration: +dur.toFixed(3), channels: a.channels.length, paths: [...targets] }
})

// ---- rules ----
if (tris > maxTris) fail.push(`triangles ${tris} > ${maxTris}`)
if (textures.length > 1) warn.push(`${textures.length} textures (rule: one atlas)`)
for (const t of textures) if (t.width > 256 || t.height > 256) fail.push(`texture ${t.index} ${t.width}x${t.height} > 256x256`)
for (const s of samplers) if (s.mag != null && !NEAREST.has(s.mag)) warn.push(`sampler magFilter ${s.mag} is not NEAREST (engine can override)`)
const names = clips.map(c => c.name)
for (const c of wantClips) if (!names.includes(c)) fail.push(`missing clip "${c}"`)
for (const n of names) if (wantClips.length && !wantClips.includes(n)) warn.push(`extra clip "${n}"`)
if (isFinite(bb.min[1]) && Math.abs(bb.min[1]) > 0.05) warn.push(`base not at y=0 (min y ${bb.min[1].toFixed(3)})`)
if (isFinite(bb.min[0])) {
  const cx = (bb.min[0] + bb.max[0]) / 2, cz = (bb.min[2] + bb.max[2]) / 2
  const span = Math.max(bb.max[0] - bb.min[0], bb.max[2] - bb.min[2])
  if (Math.abs(cx) > 0.25 * span || Math.abs(cz) > 0.25 * span) warn.push(`origin far from footprint centre (centre x ${cx.toFixed(2)}, z ${cz.toFixed(2)})`)
}

const report = {
  file: basename(file), bytes: buf.length, glbVersion: version, generator: json.asset?.generator,
  triangles: tris, maxTris, meshes: meshTris, nodes: (json.nodes || []).length,
  materials: (json.materials || []).map(m => m.name || '(unnamed)'),
  textures, samplers, clips,
  bbox: isFinite(bb.min[0]) ? { min: bb.min.map(v => +v.toFixed(3)), max: bb.max.map(v => +v.toFixed(3)), sizeCm: bb.max.map((v, k) => +((v - bb.min[k]) * 10).toFixed(1)) } : null,
  fail, warn, ok: fail.length === 0,
}
if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(report.ok ? 0 : 1) }

console.log(`${report.file}  ${(buf.length / 1024).toFixed(1)} KB  generator: ${report.generator || '-'}`)
console.log(`triangles   ${tris} (limit ${maxTris})`)
for (const [k, v] of Object.entries(meshTris)) console.log(`  ${k.padEnd(28)} ${v}`)
console.log(`materials   ${report.materials.join(', ') || '-'}`)
console.log(`textures    ${textures.length ? textures.map(t => `#${t.index} ${t.width}x${t.height} ${t.format}`).join('; ') : 'none (vertex/material colours)'}`)
if (samplers.length) console.log(`samplers    ${samplers.map(s => `mag ${s.mag ?? '-'} min ${s.min ?? '-'}`).join('; ')}`)
console.log(`clips       ${clips.length ? clips.map(c => `${c.name} ${c.duration}s [${c.paths.join('/')}]`).join('; ') : 'none'}`)
if (report.bbox) console.log(`bbox        min ${report.bbox.min.join(', ')}  max ${report.bbox.max.join(', ')}  size ${report.bbox.sizeCm.join(' x ')} cm (1 u = 10 cm)`)
for (const w of warn) console.log(`WARN  ${w}`)
for (const f of fail) console.log(`FAIL  ${f}`)
console.log(report.ok ? 'RESULT PASS' : 'RESULT FAIL')
process.exit(report.ok ? 0 : 1)
