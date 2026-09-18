"""Exports the evaluated scene as one GLB or USDZ for real-time and AR viewers.

Consumes the same evaluated geometry and world matrices as the Cycles renderer,
so an export is the model you already looked at, never a re-interpretation.
"""
import bpy
import json
import sys
from mathutils import Matrix

request = json.load(open(sys.argv[sys.argv.index('--') + 1]))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
C = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def xyz(p): return (p[0], -p[2], p[1])
def color(hex):
    h = hex.lstrip('#')
    if len(h) < 6: h = ''.join(c*2 for c in h)
    values = [int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values)
def material(name, spec):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    rgb = color(spec['color'])
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = spec.get('metalness', 0)
    bsdf.inputs['Roughness'].default_value = spec.get('roughness', .5)
    bsdf.inputs['Alpha'].default_value = spec.get('opacity', 1)
    if spec.get('opacity', 1) < 1: m.blend_method = 'BLEND'
    if spec.get('unlit'):
        bsdf.inputs['Base Color'].default_value = (0,0,0,1)
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = 1
    return m

objects = []
for item in request['meshes']:
    p, n, idx = item['positions'], item['normals'], item['indices']
    mesh = bpy.data.meshes.new(item['name'])
    mesh.from_pydata([xyz(p[i:i+3]) for i in range(0,len(p),3)], [], [idx[i:i+3] for i in range(0,len(idx),3)])
    mesh.update()
    for polygon in mesh.polygons: polygon.use_smooth = True
    mesh.normals_split_custom_set_from_vertices([xyz(n[i:i+3]) for i in range(0,len(n),3)])
    obj = bpy.data.objects.new(item['name'], mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material(item['name'], item['material']))
    obj.rotation_mode = 'QUATERNION'
    objects.append(obj)

def place(frame):
    for obj, state in zip(objects, frame['objects']):
        a = state['matrix']
        matrix = Matrix(tuple(tuple(a[c*4+r] for c in range(4)) for r in range(4)))
        obj.matrix_world = C @ matrix @ C.inverted()

frames = request['frames']
scene.render.fps = request['fps']
if len(frames) > 1:
    # Every frame is baked, so LINEAR keys reproduce the sampled motion exactly
    # rather than letting Blender re-ease between them.
    # Frame 0 so the clip starts at t=0 and loops seamlessly on the last sample.
    scene.frame_start, scene.frame_end = 0, len(frames) - 1
    if request.get('clip'): scene.name = request['clip']
    for i, frame in enumerate(frames):
        scene.frame_set(i)
        place(frame)
        for obj in objects:
            for channel in ('location','rotation_quaternion','scale'): obj.keyframe_insert(channel)
    for obj in objects:
        for fcurve in obj.animation_data.action.fcurves:
            for point in fcurve.keyframe_points: point.interpolation = 'LINEAR'
else:
    scene.frame_start = scene.frame_end = 1
    place(frames[0])

def supported(operator, wanted):
    """Export operators gain and rename options between Blender releases; pass
    only what this build actually declares so a newer Blender still works."""
    known = set(operator.get_rna_type().properties.keys())
    return {k: v for k, v in wanted.items() if k in known}

output = request['output']
animated = len(frames) > 1
if request['format'] == 'glb':
    bpy.ops.export_scene.gltf(**supported(bpy.ops.export_scene.gltf, {
        'filepath': output, 'export_format': 'GLB', 'export_yup': True,
        'export_apply': False, 'export_animations': animated,
        'export_frame_range': animated, 'export_bake_animation': animated,
        # ACTIVE_ACTIONS merges every object's action into ONE clip. The
        # default splits the scene's single clip into one animation per object,
        # and a viewer that plays only the first would leave the rest still.
        'export_animation_mode': 'ACTIVE_ACTIONS',
        'export_nla_strips_merged_animation_name': request.get('clip') or 'Animation',
        'export_materials': 'EXPORT', 'export_cameras': False, 'export_lights': False,
    }))
else:
    # AR Quick Look expects Y-up metres; Blender authors Z-up.
    bpy.ops.wm.usd_export(**supported(bpy.ops.wm.usd_export, {
        'filepath': output, 'export_animation': animated, 'export_materials': True,
        'export_cameras': False, 'export_lights': False, 'selected_objects_only': False,
        'convert_orientation': True, 'export_global_up_selection': 'Y',
        'export_global_forward_selection': 'NEGATIVE_Z', 'generate_preview_surface': True,
        'root_prim_path': '/root',
    }))
print(json.dumps({'ok': True, 'format': request['format'], 'output': output, 'frames': len(frames)}))
