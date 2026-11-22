import bpy
A = bpy.data.objects['root']
A.data.pose_position = 'REST'
bpy.context.scene.frame_set(0)
for n in ('fp_hands', 'sleeves_boy', 'sleeves_girl'):
    o = bpy.data.objects.get(n)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)


def bake(srcs, name):
    parts = []
    for src in srcs:
        src.modifiers['arm'].show_viewport = False
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        src.modifiers['arm'].show_viewport = True
        ob = bpy.data.objects.new('tmp_' + src.name, me)
        bpy.context.scene.collection.objects.link(ob)
        parts.append(ob)
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts, object=parts[0]):
        bpy.ops.object.join()
    o = parts[0]
    o.name = name
    o.data.name = name
    o.parent = A
    for g in list(o.vertex_groups):
        if '.' in g.name:
            o.vertex_groups.remove(g)
    m = o.modifiers.new('arm', 'ARMATURE')
    m.object = A
    for p in o.data.polygons:
        p.use_smooth = True
    print(name, len(o.data.vertices), len(o.vertex_groups), [mt.name for mt in o.data.materials])
    return o


O = bpy.data.objects
bake([O['hand_new_R'], O['hand_new_L']], 'fp_hands')
bake([O['slv_boy_R'], O['slv_boy_L']], 'sleeves_boy')
bake([O['slv_girl_R'], O['slv_girl_L']], 'sleeves_girl')
keep = {'root', 'fp_hands', 'sleeves_boy', 'sleeves_girl'}
for o in O:
    o.hide_set(False)
    o.select_set(o.name in keep)
bpy.context.view_layer.objects.active = A
out = '/Users/emil2ka/Desktop/projects/memory-book/assets/_raw/people/blender_arms.glb'
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=False, export_skins=True,
                          export_apply=False, export_yup=True, export_vertex_color='MATERIAL', export_image_format='AUTO')
print('exported')
