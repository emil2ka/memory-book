import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

# globals: HEAD, NEW, COLS
O = bpy.data.objects
head = O[HEAD]
dg = bpy.context.evaluated_depsgraph_get()


def srgb2lin(c):
    return tuple(((x / 255) / 12.92 if (x / 255) <= 0.04045 else (((x / 255) + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


he = head.evaluated_get(dg)
hw = [he.matrix_world @ v.co for v in he.data.vertices]
mn = Vector((min(v.x for v in hw), min(v.y for v in hw), min(v.z for v in hw)))
mx = Vector((max(v.x for v in hw), max(v.y for v in hw), max(v.z for v in hw)))
c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2 - 0.05 * (mx.y - mn.y), mn.z + 0.58 * (mx.z - mn.z)))
R = Vector(((mx.x - mn.x) / 2, (mx.y - mn.y) / 2, (mx.z - mn.z) * 0.45))
bvh = BVHTree.FromPolygons(hw, [tuple(p.vertices) for p in he.data.polygons])

if NEW in O:
    O.remove(O[NEW], do_unlink=True)
# UV-sphere-like grid: rings (lat) x segments (lon)
SEGS, RINGS = 48, 30
bob_bottom = c.z - 1.12 * R.z  # chin/jaw level
rng = np.random.default_rng(5)
ph = rng.random(6) * 6.28
bm = bmesh.new()
grid = []
for i in range(RINGS + 1):
    lat = math.pi / 2 - (i / RINGS) * (math.pi * 0.95)  # from top (pi/2) down to about -1.4
    row = []
    for j in range(SEGS):
        lon = 2 * math.pi * j / SEGS
        d = Vector((math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)))
        p0 = c + Vector((d.x * R.x * 1.6, d.y * R.y * 1.6, d.z * R.z * 1.6))
        hit = bvh.ray_cast(p0, (c - p0).normalized())
        hp = hit[0] if hit[0] is not None else bvh.find_nearest(p0)[0]
        up = max(0.0, d.z)
        cap = hp + d * (0.1 + 0.08 * up * up)
        # below the widest point the hair falls straight down
        if d.z < 0.15:
            hor = Vector((d.x, d.y, 0)).normalized()
            k = (0.15 - d.z) / 1.1
            rad = Vector((hor.x * R.x * 1.12, hor.y * R.y * 1.12, 0))
            fall = Vector((c.x, c.y, 0)) + rad * (1 + 0.06 * k)
            z = c.z + 0.15 * R.z - (0.15 - d.z) / 1.15 * (c.z + 0.15 * R.z - bob_bottom)
            # soft vertical locks
            wave = 0.075 * math.sin(lon * 11 + ph[0]) + 0.035 * math.sin(lon * 23 + ph[1])
            fall += Vector((hor.x, hor.y, 0)) * wave * min(1.0, k * 3)
            # bob curls slightly inward at the ends
            fall -= Vector((hor.x, hor.y, 0)) * 0.12 * max(0.0, k - 0.75) * 4
            t = min(1.0, (0.15 - d.z) / 0.3)
            p = cap.lerp(Vector((fall.x, fall.y, z)), t)
        else:
            p = cap
        row.append(bm.verts.new(p))
    grid.append(row)
faces = []
for i in range(RINGS):
    for j in range(SEGS):
        a, b = grid[i][j], grid[i][(j + 1) % SEGS]
        cc, dd = grid[i + 1][(j + 1) % SEGS], grid[i + 1][j]
        faces.append(bm.faces.new((a, b, cc, dd)))
# top cap
top = bm.verts.new(c + Vector((0, 0, R.z * 1.0)))
for j in range(SEGS):
    bm.faces.new((top, grid[0][(j + 1) % SEGS], grid[0][j]))
bm.verts.ensure_lookup_table()
# face opening: remove front faces below the fringe line
kill = []
for f in bm.faces:
    cc = f.calc_center_median()
    d = cc - c
    dn = Vector((d.x / R.x, d.y / R.y, d.z / R.z))
    hor = Vector((dn.x, dn.y, 0))
    front = dn.y / (hor.length + 1e-6)
    if front > 0.35 and dn.z < 0.42 - 0.25 * max(0.0, front - 0.85) * 4:
        kill.append(f)
bmesh.ops.delete(bm, geom=kill, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
f0 = max(bm.faces, key=lambda f: f.calc_center_median().z)
if f0.normal.z < 0:
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
me = bpy.data.meshes.new(NEW)
bm.to_mesh(me)
bm.free()
ob = bpy.data.objects.new(NEW, me)
bpy.context.scene.collection.objects.link(ob)
so = ob.modifiers.new('solid', 'SOLIDIFY')
so.thickness = 0.14
so.offset = -1.0
sub = ob.modifiers.new('sub', 'SUBSURF')
sub.levels = 1
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
final = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
ob.modifiers.clear()
old_me = ob.data
ob.data = final
bpy.data.meshes.remove(old_me)
final.name = NEW
ca = final.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
dark, light = srgb2lin(COLS[0]), srgb2lin(COLS[1])
for v in final.vertices:
    d = v.co - c
    lon = math.atan2(d.y, d.x)
    s = 0.5 + 0.5 * math.sin(lon * 11 + ph[0])  # follows the locks
    hgt = max(0.0, min(1.0, (v.co.z - bob_bottom) / (c.z + R.z - bob_bottom)))
    t = 0.15 + 0.6 * s * (0.55 + 0.45 * hgt) + 0.12 * hgt
    ca.data[v.index].color = tuple(dark[k] + (light[k] - dark[k]) * min(1, t) for k in range(3)) + (1.0,)
for p in final.polygons:
    p.use_smooth = True
mat = bpy.data.materials.get('hair_new_girl') or bpy.data.materials.new('hair_new_girl')
mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new('ShaderNodeOutputMaterial')
bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
vc = nt.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bs.inputs['Base Color'])
nt.links.new(bs.outputs[0], out.inputs[0])
bs.inputs['Roughness'].default_value = 0.45
final.materials.append(mat)
print(NEW, len(final.vertices))
