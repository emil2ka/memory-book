import bpy, bmesh, math
from mathutils import Vector

A = bpy.data.objects['root']
B = A.data.bones


def srgb2lin(c):
    return tuple(((x / 255) / 12.92 if (x / 255) <= 0.04045 else (((x / 255) + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


SKIN = srgb2lin((206, 140, 108))
KNU = srgb2lin((192, 118, 92))
TIP = srgb2lin((212, 124, 104))
PALM = srgb2lin((216, 154, 124))
NAIL = srgb2lin((226, 172, 158))

P = dict(
    xs=[0.064, 0.269, 0.464, 0.6665, 0.884],
    fingers=[('pinky', 0.098), ('ring', 0.112), ('middle', 0.118), ('index', 0.114)],
    thumb=0.125,
)


def build_hand(sd):
    N = lambda base, k=None: f'{base}_{sd}' + (f'_{k}' if k else '')
    s = 1 if sd == 'R' else -1

    def R(base, k=None):
        v = B[N(base, k)].head_local.copy()
        v.x *= s  # build in right-hand space, mirror at the end
        return v

    name = f'hand_new_{sd}'
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    vgs = {b.name: ob.vertex_groups.new(name=b.name).index for b in B}
    bm = bmesh.new()
    dl = bm.verts.layers.deform.verify()
    ca = bm.verts.layers.float_color.new('Col')

    def V(co, w, col=SKIN):
        v = bm.verts.new(co)
        for k, val in w.items():
            v[dl][vgs[k]] = val
        v[ca] = col
        return v

    def addw(v, k, val):
        v[dl][vgs[k]] = v[dl].get(vgs[k], 0.0) + val

    wr = R('hand')
    hand = N('hand')
    fore = N('forearm')
    xs = P['xs']
    cx = wr.x

    def ploop(z, widthK, dep, w, bulge=0.0, thenar=0.0, palmcol=SKIN):
        front, back = [], []
        for j, x in enumerate(xs):
            xx = cx + (x - cx) * widthK
            t = j / 4.0
            arc = math.sin(t * math.pi)
            yf = dep * 0.5 + bulge * arc + thenar * max(0, (t - 0.5)) * 2
            yb = -dep * 0.5 - 0.35 * bulge * arc
            front.append(V(Vector((xx, yf, z)), w, palmcol))
            back.append(V(Vector((xx, yb, z)), w, SKIN))
        return front + back[::-1]

    fz = [R('pinky', 1).z, R('ring', 1).z, R('middle', 1).z, R('index', 1).z]
    L_F = ploop(wr.z + 0.95, 0.66, 0.44, {fore: 1.0}, bulge=0.03)
    L_W = ploop(wr.z + 0.05, 0.64, 0.34, {fore: 0.5, hand: 0.5}, bulge=0.03)
    L_P1 = ploop(wr.z - 0.28, 0.9, 0.36, {hand: 1.0}, bulge=0.04, thenar=0.05, palmcol=PALM)
    L_P2 = ploop(wr.z - 0.62, 1.0, 0.33, {hand: 1.0}, bulge=0.03, thenar=0.03, palmcol=PALM)
    kz = [fz[0] + 0.06, (fz[0] + fz[1]) / 2, (fz[1] + fz[2]) / 2, (fz[2] + fz[3]) / 2, fz[3] + 0.02]
    front, back = [], []
    for j, x in enumerate(xs):
        front.append(V(Vector((x, 0.13, kz[j])), {hand: 0.7}, PALM))
        back.append(V(Vector((x, -0.15, kz[j] - 0.03)), {hand: 0.7}, KNU))
    L_K = front + back[::-1]
    loops = [L_F, L_W, L_P1, L_P2, L_K]
    for a, b in zip(loops, loops[1:]):
        for i in range(10):
            if a is L_P1 and i == 4:
                continue
            bm.faces.new((a[i], a[(i + 1) % 10], b[(i + 1) % 10], b[i]))
    bm.faces.new(L_F[::-1])

    def sq(c, d, w, h, wt, colF=SKIN, colB=SKIN, padF=0.0):
        a = Vector((1, 0, 0))
        a = (a - d * a.dot(d)).normalized()
        n = d.cross(a).normalized()
        if n.y < 0:
            n = -n
        return [V(c - a * w + n * (h + padF), wt, colF), V(c + a * w + n * (h + padF), wt, colF),
                V(c + a * w - n * h, wt, colB), V(c - a * w - n * h, wt, colB)]

    nails = []
    for j, (fn, hw) in enumerate(P['fingers']):
        J0, J1, J2 = R(fn, 1), R(fn, 2), R(fn, 3)
        b1, b2, b3 = N(fn, 1), N(fn, 2), N(fn, 3)
        l3 = B[b3].length
        d0 = (J1 - J0).normalized()
        d1 = (J2 - J1).normalized()
        tip = J2 + d1 * l3 * 1.05
        base = [front[j], front[j + 1], back[j + 1], back[j]]
        for v in base:
            addw(v, b1, 0.3)
        secs = [base,
                sq(J0 + (J1 - J0) * 0.32, d0, hw * 0.98, hw * 0.86, {b1: 1.0}),
                sq(J0 + (J1 - J0) * 0.72, d0, hw * 0.93, hw * 0.8, {b1: 1.0}),
                sq(J1, (d0 + d1).normalized(), hw * 0.97, hw * 0.84, {b1: 0.5, b2: 0.5}, colB=KNU),
                sq(J1 + (J2 - J1) * 0.5, d1, hw * 0.88, hw * 0.76, {b2: 1.0}),
                sq(J2, d1, hw * 0.9, hw * 0.78, {b2: 0.5, b3: 0.5}, colB=KNU),
                sq(J2 + (tip - J2) * 0.5, d1, hw * 0.9, hw * 0.74, {b3: 1.0}, colF=TIP, padF=0.012),
                sq(J2 + (tip - J2) * 0.92, d1, hw * 0.62, hw * 0.5, {b3: 1.0}, colF=TIP, colB=TIP)]
        for a, b in zip(secs, secs[1:]):
            for i in range(4):
                bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
        bm.faces.new(secs[-1][::-1])
        nails.append((J2 + (tip - J2) * 0.4, d1, hw, b3))

    T0, T1, Tm = R('thumb', 1), R('thumb', 2), R('thumb')
    tb, t1, t2 = N('thumb'), N('thumb', 1), N('thumb', 2)
    dT = (T1 - T0).normalized()
    tl = B[t2].length
    Ttip = T1 + dT * tl * 1.02
    base = [L_P1[4], L_P1[5], L_P2[5], L_P2[4]]
    for v in base:
        v[dl][vgs[tb]] = 0.45
        v[dl][vgs[hand]] = 0.55

    def tsq(c, d, w, h, wt, colF=SKIN, colB=SKIN):
        n = Vector((0, 1, 0))
        n = (n - d * n.dot(d)).normalized()
        u = n.cross(d).normalized()
        if u.z < 0:
            u = -u
        return [V(c + n * h + u * w, wt, colF), V(c - n * h + u * w, wt, colB),
                V(c - n * h - u * w, wt, colB), V(c + n * h - u * w, wt, colF)]

    th = P['thumb']
    dm = (T0 - Tm).normalized()
    secs = [base,
            tsq(Tm + (T0 - Tm) * 0.75, (dm + dT).normalized(), th * 1.32, th * 1.18, {tb: 0.6, t1: 0.4}),
            tsq(T0 + (T1 - T0) * 0.5, dT, th * 1.08, th * 0.96, {t1: 1.0}),
            tsq(T1, dT, th * 1.02, th * 0.92, {t1: 0.5, t2: 0.5}, colB=KNU),
            tsq(T1 + (Ttip - T1) * 0.5, dT, th * 1.0, th * 0.88, {t2: 1.0}, colF=TIP),
            tsq(T1 + (Ttip - T1) * 0.92, dT, th * 0.68, th * 0.58, {t2: 1.0}, colF=TIP, colB=TIP)]
    for a, b in zip(secs, secs[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(secs[-1][::-1])
    # thumb nail: on the outer-back side of the distal segment
    n0 = Vector((0, 1, 0))
    n0 = (n0 - dT * n0.dot(dT)).normalized()
    u0 = n0.cross(dT).normalized()
    if u0.z < 0:
        u0 = -u0
    out = (u0 * 0.55 - n0 * 0.83).normalized()
    side = dT.cross(out).normalized()
    nails.append((T1 + (Ttip - T1) * 0.6, dT, th * 1.0, t2, out, side))

    # nails: small rounded slabs, curved across the finger
    for item in nails:
        if len(item) == 4:
            c, d, hw, bone = item
            a = Vector((1, 0, 0))
            a = (a - d * a.dot(d)).normalized()
            n = d.cross(a).normalized()
            if n.y < 0:
                n = -n
            out, side = -n, a
            depth = hw * 0.74
        else:
            c, d, hw, bone, out, side = item
            depth = hw * 0.86
        wN, lN, tN = hw * 0.6, hw * 0.62, 0.012
        cen = c + out * (depth * 0.8)
        vs = []
        for il in (-1, 1):
            for ia in (-1, 0, 1):
                for it in (0, 1):
                    curve = -0.028 * (ia * ia)
                    p = cen + d * (il * lN) + side * (ia * wN) + out * (it * tN + curve)
                    vs.append(V(p, {bone: 1.0}, NAIL))
        idx = lambda il, ia, it: vs[(0 if il < 0 else 1) * 6 + (ia + 1) * 2 + it]
        quads = []
        for ia in (-1, 0):
            quads.append((idx(-1, ia, 1), idx(-1, ia + 1, 1), idx(1, ia + 1, 1), idx(1, ia, 1)))  # top
            quads.append((idx(-1, ia, 0), idx(1, ia, 0), idx(1, ia + 1, 0), idx(-1, ia + 1, 0)))  # bottom
            quads.append((idx(-1, ia, 0), idx(-1, ia + 1, 0), idx(-1, ia + 1, 1), idx(-1, ia, 1)))  # near end
            quads.append((idx(1, ia, 0), idx(1, ia, 1), idx(1, ia + 1, 1), idx(1, ia + 1, 0)))  # far end
        quads.append((idx(-1, -1, 0), idx(-1, -1, 1), idx(1, -1, 1), idx(1, -1, 0)))
        quads.append((idx(-1, 1, 0), idx(1, 1, 0), idx(1, 1, 1), idx(-1, 1, 1)))
        for q in quads:
            bm.faces.new(q)

    if s < 0:
        for v in bm.verts:
            v.co.x = -v.co.x
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for v in me.vertices:
        tot = sum(g.weight for g in v.groups)
        if tot:
            for g in v.groups:
                g.weight /= tot
    for p in me.polygons:
        p.use_smooth = True
    ob.parent = A
    arm = ob.modifiers.new('arm', 'ARMATURE')
    arm.object = A
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    return ob


for sd in ('R', 'L'):
    build_hand(sd)
for o in bpy.data.objects:
    if o.name in ('fp_hands', 'sleeves_boy', 'sleeves_girl', 'pen_body', 'pen_brass'):
        o.hide_set(True)
        o.hide_render = True
print('ok', [(o.name, len(o.data.vertices)) for o in bpy.data.objects if o.name.startswith('hand_new')])
