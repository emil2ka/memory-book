import bpy, bmesh, math
import numpy as np
from mathutils import Vector

A = bpy.data.objects['root']
B = A.data.bones
D = '/Users/emil2ka/Desktop/projects/memory-book/assets/_raw/people/'


# ---------- knit texture (tileable, gray albedo + normal) ----------
def knit_images(size=256, cols=8, rows=10):
    H = np.zeros((size, size), np.float32)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    cw = size / cols
    rh = size / rows
    u = (xs % cw) / cw  # 0..1 inside column
    v = (ys % rh) / rh
    for cxl, sgn in ((0.28, 1), (0.72, -1)):
        dx = u - cxl
        dy = v - 0.5
        ang = math.radians(32) * sgn
        x2 = dx * math.cos(ang) - dy * math.sin(ang)
        y2 = dx * math.sin(ang) + dy * math.cos(ang)
        e = (x2 / 0.2) ** 2 + (y2 / 0.62) ** 2
        H = np.maximum(H, np.clip(1 - e, 0, 1) ** 0.6)
    # stitches of the next row overlap: shift by half row
    v2 = ((ys + rh * 0.5) % rh) / rh
    for cxl, sgn in ((0.28, 1), (0.72, -1)):
        dx = u - cxl
        dy = v2 - 0.5
        ang = math.radians(32) * sgn
        x2 = dx * math.cos(ang) - dy * math.sin(ang)
        y2 = dx * math.sin(ang) + dy * math.cos(ang)
        e = (x2 / 0.2) ** 2 + (y2 / 0.62) ** 2
        H = np.maximum(H, 0.85 * np.clip(1 - e, 0, 1) ** 0.6)
    # fibre noise (tileable via sum of sines)
    rng = np.random.default_rng(3)
    for _ in range(14):
        fx, fy = rng.integers(8, 40), rng.integers(8, 40)
        ph = rng.random() * 6.28
        H += 0.018 * np.sin(2 * np.pi * (fx * xs + fy * ys) / size + ph)
    H = (H - H.min()) / (H.max() - H.min())
    # albedo: grooves darker
    alb = 0.5 + 0.5 * H
    # normal from height (wrap)
    k = 4.5
    dx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) * k
    dy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) * k
    nz = np.ones_like(H)
    ln = np.sqrt(dx * dx + dy * dy + nz * nz)
    nx, ny, nz = -dx / ln, dy / ln, nz / ln

    def save(name, rgb, colorspace):
        old = bpy.data.images.get(name)
        if old:
            bpy.data.images.remove(old)
        img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False, is_data=(colorspace != 'sRGB'))
        img.colorspace_settings.name = colorspace
        px = np.ones((size, size, 4), np.float32)
        px[..., :3] = rgb
        # numpy row 0 is top; Blender image row 0 is bottom
        img.pixels.foreach_set(np.ascontiguousarray(px[::-1]).ravel())
        img.update()
        img.filepath_raw = D + name + '.png'
        img.file_format = 'PNG'
        img.save()
        return img

    a = save('knit_albedo', np.stack([alb, alb, alb], -1), 'sRGB')
    n = save('knit_normal', np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], -1), 'Non-Color')
    return a, n


def srgb2lin(c):
    return tuple(((x / 255) / 12.92 if (x / 255) <= 0.04045 else (((x / 255) + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def sleeve_mat(name, color, alb, nrm):
    m = bpy.data.materials.get(name + '_new') or bpy.data.materials.new(name + '_new')
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    ta = nt.nodes.new('ShaderNodeTexImage')
    ta.image = alb
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = nrm
    nm = nt.nodes.new('ShaderNodeNormalMap')
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs['B'].default_value = srgb2lin(color)
    nt.links.new(ta.outputs['Color'], mix.inputs['A'])
    nt.links.new(mix.outputs['Result'], bs.inputs['Base Color'])
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    bs.inputs['Roughness'].default_value = 0.95
    try:
        bs.inputs['Sheen Weight'].default_value = 0.6
        bs.inputs['Sheen Tint'].default_value = (1, 1, 1, 1)
        bs.inputs['Sheen Roughness'].default_value = 0.6
    except Exception:
        pass
    nt.links.new(bs.outputs[0], out.inputs[0])
    return m


# ---------- sleeve geometry ----------
SEG = 20


def build_sleeve(sd, name, mat):
    s = 1 if sd == 'R' else -1
    N = lambda b: f'{b}_{sd}'
    sh = B[N('upperarm')].head_local.copy()
    el = B[N('forearm')].head_local.copy()
    wr = B[N('hand')].head_local.copy()
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    vgs = {b.name: ob.vertex_groups.new(name=b.name).index for b in B}
    bm = bmesh.new()
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.new('UVMap')
    up_ = N('upperarm')
    fo_ = N('forearm')
    # stations along the arm: (z, rx, ry, weights)
    top = sh.z + 0.6
    cuff_end = wr.z + 0.14
    zs = []
    z = top
    while z > cuff_end + 1e-6:
        zs.append(z)
        z -= 0.12
    zs.append(cuff_end)
    rings = []
    rng = np.random.default_rng(7 if sd == 'R' else 11)
    phase = rng.random(8) * 6.28
    for zi, z in enumerate(zs):
        t_el = z - el.z  # >0 above elbow
        # radius profile
        if t_el > 0:
            r = 0.5 + 0.05 * min(1, t_el / 2.0)
        else:
            k = min(1, -t_el / (el.z - wr.z))
            r = 0.5 - 0.1 * k
        dcuff = z - cuff_end
        cuff = dcuff < 0.42
        if cuff:
            r = 0.355 + 0.012 * math.sin(dcuff / 0.42 * math.pi)
        elif dcuff < 1.3:
            # bunching above the cuff: soft rings
            r += 0.06 * (0.5 + 0.5 * math.sin((dcuff - 0.42) / 0.88 * math.pi * 3.0 + phase[0])) * (1 - (dcuff - 0.42) / 0.88 * 0.4)
        # weights
        if t_el > 0.55:
            w = {up_: 1.0}
        elif t_el < -0.55:
            w = {fo_: 1.0}
        else:
            a = (t_el + 0.55) / 1.1
            a = a * a * (3 - 2 * a)
            w = {up_: a, fo_: 1 - a}
        ring = []
        for i in range(SEG):
            th = 2 * math.pi * i / SEG
            # elliptic: a bit flatter front-back
            rx, ry = r, r * 0.9
            if cuff:
                ry = r * 0.84
            # folds: angular waves, stronger near elbow inner side and above cuff
            fold = 0.0
            if not cuff:
                fold += 0.032 * math.sin(3 * th + phase[1] + z * 1.7)
                fold += 0.02 * math.sin(5 * th + phase[2] - z * 2.3)
                fold += 0.018 * math.sin(2 * th + z * 3.1 + phase[4])  # diagonal drapes along the forearm
                near_el = math.exp(-((t_el) / 0.45) ** 2)
                inner = max(0.0, math.cos(th - math.pi / 2))  # +Y side = inner elbow in rest (palm forward)
                fold += near_el * inner * 0.05 * math.sin(z * 22 + phase[3])
            x = rx * (1 + fold) * math.cos(th)
            y = ry * (1 + fold) * math.sin(th)
            co = Vector((sh.x + (s * 0) + x, y, z))
            v = bm.verts.new(co)
            for k_, val in w.items():
                v[dl][vgs[k_]] = val
            ring.append(v)
        rings.append((z, ring, cuff))
    # rolled cuff edge: one ring slightly bigger and one inside
    z_last, ring_last, _ = rings[-1]
    lip_o = []
    lip_i = []
    for i, v in enumerate(ring_last):
        d = Vector((v.co.x - sh.x, v.co.y, 0))
        lip_o.append(bm.verts.new(Vector((sh.x, 0, z_last - 0.05)) + d * 1.03))
        lip_i.append(bm.verts.new(Vector((sh.x, 0, z_last + 0.06)) + d * 0.86))
    for vv in lip_o + lip_i:
        vv[dl][vgs[fo_]] = 1.0
    rings.append((z_last - 0.05, lip_o, True))
    rings.append((z_last + 0.06, lip_i, True))
    # faces + uv
    # uv: u around (3 repeats), v along length (world units * 1.25); cuff rows stretch v (ribs)
    vacc = [0.0]
    for (z0, _, c0), (z1, _, c1) in zip(rings, rings[1:]):
        dz = abs(z1 - z0)
        vacc.append(vacc[-1] + dz * (0.35 if (c0 and c1) else 1.25))
    for ri in range(len(rings) - 1):
        r0 = rings[ri][1]
        r1 = rings[ri + 1][1]
        for i in range(SEG):
            j = (i + 1) % SEG
            f = bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
            uu0 = 3.0 * i / SEG
            uu1 = 3.0 * (i + 1) / SEG
            for loop in f.loops:
                vi = r0.index(loop.vert) if loop.vert in r0 else None
                if vi is not None:
                    vv = vacc[ri]
                    idx = vi
                else:
                    vv = vacc[ri + 1]
                    idx = r1.index(loop.vert)
                uu = uu1 if (idx == j and j == 0) else 3.0 * idx / SEG
                if idx == 0 and i == SEG - 1:
                    uu = 3.0
                loop[uvl].uv = (uu, -vv * 1.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # make normals point outward: check one face
    f0 = bm.faces[0]
    c = f0.calc_center_median()
    if f0.normal.dot(Vector((c.x - sh.x, c.y, 0))) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    if s < 0:
        pass
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob.parent = A
    am = ob.modifiers.new('arm', 'ARMATURE')
    am.object = A
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1
    return ob


alb, nrm = knit_images()
mb = sleeve_mat('sleeve_boy', (44, 78, 170), alb, nrm)
mg = sleeve_mat('sleeve_girl', (224, 154, 38), alb, nrm)
for sd in ('R', 'L'):
    build_sleeve(sd, f'slv_boy_{sd}', mb)
    build_sleeve(sd, f'slv_girl_{sd}', mg)
print('sleeves ok')
