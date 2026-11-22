// glb_set_color.mjs — задать baseColorFactor материалу внутри GLB (без пересборки геометрии).
// Usage: node tools/glb_set_color.mjs in.glb out.glb <material> <#rrggbb>
import { readFileSync, writeFileSync } from 'node:fs'
const [, , inp, out, matName, hex] = process.argv
const buf = readFileSync(inp)
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
const rest = buf.subarray(20 + jsonLen)
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const n = parseInt(hex.replace('#', ''), 16)
const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +srgb(v / 255).toFixed(4))
const mat = json.materials.find((m) => m.name === matName)
if (!mat) throw new Error(`no material ${matName}`)
mat.pbrMetallicRoughness ??= {}
mat.pbrMetallicRoughness.baseColorFactor = [...lin, 1]
let js = Buffer.from(JSON.stringify(json), 'utf8')
const pad = (4 - (js.length % 4)) % 4
js = Buffer.concat([js, Buffer.alloc(pad, 0x20)])
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + js.length + rest.length, 8)
header.writeUInt32LE(js.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
writeFileSync(out, Buffer.concat([header, js, rest]))
console.log(`${matName} = ${hex} → ${lin}`)
