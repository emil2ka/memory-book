import bpy, json


def dump(new_name, old_name, path, extra={}):
    ob = bpy.data.objects[new_name]
    old = bpy.data.objects[old_name]
    bpy.context.view_layer.update()
    inv = old.matrix_world.inverted()
    me = ob.data
    me.calc_loop_triangles()
    rot = inv.to_3x3().normalized()
    P, N, C = [], [], []
    ca = me.color_attributes.get('Col')
    for v in me.vertices:
        l = inv @ (ob.matrix_world @ v.co)
        n = (rot @ (ob.matrix_world.to_3x3() @ v.normal)).normalized()
        P += [l.x, l.z, -l.y]
        N += [n.x, n.z, -n.y]
        if ca:
            C += list(ca.data[v.index].color)
    I = [i for t in me.loop_triangles for i in t.vertices]
    d = {'positions': P, 'normals': N, 'colors': C, 'indices': I}
    d.update(extra)
    json.dump(d, open(path, 'w'))
    print(new_name, len(P) // 3, len(I) // 3)
