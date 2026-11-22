import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix

# expects globals: HEAD (head mesh object name), HAIR (old hair object name), NEW (new name), STYLE ('boy'|'girl'), COLS (dark, light sRGB)
O = bpy.data.objects
head = O[HEAD]
old = O[HAIR]
dg = bpy.context.evaluated_depsgraph_get()


def srgb2lin(c):
    return tuple(((x / 255) / 12.92 if (x / 255) <= 0.04045 else (((x / 255) + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


# head geometry in world space
he = head.evaluated_get(dg)
hw = [he.matrix_world @ v.co for v in he.data.vertices]
mn = Vector((min(v.x for v in hw), min(v.y for v in hw), min(v.z for v in hw)))
mx = Vector((max(v.x for v in hw), max(v.y for v in hw), max(v.z for v in hw)))
# skull centre: upper part of head bbox
c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2 - 0.05 * (mx.y - mn.y), mn.z + 0.58 * (mx.z - mn.z)))
R = Vector(((mx.x - mn.x) / 2, (mx.y - mn.y) / 2, (mx.z - mn.z) * 0.45))
print('head c', c, 'R', R)

if NEW in O:
    O.remove(O[NEW], do_unlink=True)
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=2.0)
bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=11, use_grid_fill=True)
for v in bm.verts:
    d = v.co.normalized()
    v.co = c + Vector((d.x * R.x * 1.25, d.y * R.y * 1.25, d.z * R.z * 1.6))
# shrink onto the head surface + offset
from mathutils.bvhtree import BVHTree
tris = [tuple(p.vertices) for p in he.data.polygons]
bvh = BVHTree.FromPolygons(hw, tris)
thick = 0.13 if STYLE == 'boy' else 0.11
for v in bm.verts:
    d = (v.co - c).normalized()
    hit = bvh.ray_cast(v.co, -d)
    if hit[0] is None:
        hit = bvh.find_nearest(v.co)
    p = hit[0]
    up = max(0.0, (v.co - c).normalized().z)
    v.co = p + d * (thick + (0.14 if STYLE == 'boy' else 0.06) * up * up)

# hairline: keep top/back
kill = []
for f in bm.faces:
    cc = f.calc_center_median()
    d = (cc - c)
    dn = Vector((d.x / R.x, d.y / R.y, d.z / R.z)).normalized()
    front = dn.y  # person faces +Y
    if STYLE == 'boy':
        thr = -0.62 + 0.62 * max(0.0, front) * 1.25 + 0.18 * max(0.0, -front) * 0  # back low, front high
        thr = (-0.62 + 0.3 * front if front < 0 else -0.62 + 0.95 * front)
        if abs(dn.x) > 0.75 and front > -0.2:
            thr = max(thr, -0.05)  # above ears
    else:
        thr = (-0.95 if front < 0 else -0.62 + 0.9 * front)
        if abs(dn.x) > 0.7 and front > 0.1:
            thr = max(thr, -0.35)
    if dn.z < thr:
        kill.append(f)
bmesh.ops.delete(bm, geom=kill, context='FACES')
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context='VERTS')
me = bpy.data.meshes.new(NEW)
bm.to_mesh(me)
bm.free()
ob = bpy.data.objects.new(NEW, me)
bpy.context.scene.collection.objects.link(ob)
for p in me.polygons:
    p.use_smooth = True
# modifiers: solidify (thickness), displace (curls), subsurf
so = ob.modifiers.new('solid', 'SOLIDIFY')
so.thickness = 0.16
so.offset = -1.0
so.use_rim = True
tex = bpy.data.textures.get('curls_' + STYLE) or bpy.data.textures.new('curls_' + STYLE, 'VORONOI')
tex.distance_metric = 'DISTANCE'
tex.color_mode = 'INTENSITY'
tex.noise_scale = 0.34 if STYLE == 'boy' else 0.7
tex.noise_intensity = 1.0
tex.weight_1 = 1.0
tex.weight_2 = 0.0
dp = ob.modifiers.new('curls', 'DISPLACE')
dp.texture = tex
dp.texture_coords = 'GLOBAL'
dp.strength = -0.34 if STYLE == 'boy' else -0.12
dp.mid_level = 0.35
sub = ob.modifiers.new('sub', 'SUBSURF')
sub.levels = 2
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
final = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
ob.modifiers.clear()
old_me = ob.data
ob.data = final
bpy.data.meshes.remove(old_me)
final.name = NEW
# colours: darker deep, lighter on bumps (distance from centre in normalized space)
ca = final.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
dark = srgb2lin(COLS[0])
light = srgb2lin(COLS[1])
ds = []
for v in final.vertices:
    d = v.co - c
    ds.append(Vector((d.x / R.x, d.y / R.y, d.z / R.z)).length)
ds = np.array(ds)
lo, hi = np.percentile(ds, 8), np.percentile(ds, 97)
for i, v in enumerate(final.vertices):
    t = float(np.clip((ds[i] - lo) / (hi - lo), 0, 1)) ** 1.2
    ca.data[i].color = tuple(dark[k] + (light[k] - dark[k]) * t for k in range(3)) + (1.0,)
for p in final.polygons:
    p.use_smooth = True
mat = bpy.data.materials.get('hair_new_' + STYLE) or bpy.data.materials.new('hair_new_' + STYLE)
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
bs.inputs['Roughness'].default_value = 0.55
final.materials.append(mat)
print(NEW, 'verts', len(final.vertices), 'faces', len(final.polygons))
