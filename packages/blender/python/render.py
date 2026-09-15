"""Final renderer consumes evaluated Three.js geometry/transforms, never reinterprets animation."""
import bpy
import json
import sys
import math
from mathutils import Matrix, Vector

request = json.load(open(sys.argv[sys.argv.index('--') + 1]))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = request['samples']
scene.cycles.use_denoising = True
scene.cycles.seed = 0
scene.render.resolution_x = request['width']
scene.render.resolution_y = request['height']
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Khronos PBR Neutral'
scene.view_settings.look = 'None'
scene.view_settings.exposure = request['environment']['exposure']
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
    objects.append(obj)
env = request['environment']
scene.render.film_transparent = env['background'] == 'transparent'
world = bpy.data.worlds.new('Studio world')
scene.world = world
world.use_nodes = True
nodes = world.node_tree.nodes
links = world.node_tree.links
bg = nodes.get('Background')
bg.inputs['Color'].default_value = (.55,.55,.55,1)
bg.inputs['Strength'].default_value = .16 * env['intensity']
if env['background'] != 'transparent':
    camera_bg = nodes.new('ShaderNodeBackground')
    camera_bg.inputs['Color'].default_value = (*color(env['background']),1)
    light_path = nodes.new('ShaderNodeLightPath')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(light_path.outputs['Is Camera Ray'], mix.inputs[0])
    links.new(bg.outputs[0], mix.inputs[1])
    links.new(camera_bg.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], nodes.get('World Output').inputs[0])
r = request['radius']
center = Vector(xyz(request['center']))
rotation = Matrix.Rotation(math.radians(env['rotation']), 3, 'Z')
def area(name, position, target, size, power, tint):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = power * env['intensity']
    light.shape = 'DISK'
    light.size = size
    light.color = color(tint)
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
if env['lights']:
    for i, spec in enumerate(env['lights']):
        area(str(i), xyz(spec['position']), xyz(spec['target']), spec['size'], spec['power'], spec['color'])
else:
    # Power scales with object size squared to preserve illumination across metre-scale scenes.
    rigs = {
      'product-white': [((-2,1.8,3),2.5,180,'#fff6e8'),((2,.7,2),1.8,110,'#ffffff'),((0,3,-1),2,85,'#ffffff')],
      'studio-soft': [((-2,2,3),3,90,'#fff6e8'),((2,1,1),2,45,'#dce7ff')],
      'studio-contrast': [((2,2,3),1.5,110,'#ffffff'),((-2,0,-1),1,20,'#8fa6d8')],
      'warm-key': [((2,2,3),2,110,'#ffd9a0'),((-2,0,1),2,40,'#6b8cff')],
      'rim-dark': [((-2,1,-2),2,120,'#ffffff'),((2,1,-2),2,90,'#7fc6ff'),((0,2,3),3,15,'#ffffff')],
      'flat-icon': [((0,2,3),5,120,'#ffffff')],
    }
    for i,(direction,size,power,tint) in enumerate(rigs[env['preset']]):
        pos = center + rotation @ Vector(xyz([x*r for x in direction]))
        area(str(i),pos,center,size*r,power*r*r,tint)
if env['floor']['mode'] != 'none':
    bpy.ops.mesh.primitive_plane_add(size=r*200, location=(center.x, center.y, request['bounds'][0][1]-r*.002))
    floor = bpy.context.object
    floor.name = 'Ground'
    floor.is_shadow_catcher = env['floor']['mode'] == 'shadow'
    floor.data.materials.append(material('Floor', {'color': env['floor']['color'], 'roughness': .85}))
camera_data = bpy.data.cameras.new('Camera')
camera = bpy.data.objects.new('Camera', camera_data)
bpy.context.collection.objects.link(camera)
scene.camera = camera
for frame in request['frames']:
    for obj, state in zip(objects, frame['objects']):
        a = state['matrix']
        matrix = Matrix(tuple(tuple(a[c*4+r] for c in range(4)) for r in range(4)))
        obj.matrix_world = C @ matrix @ C.inverted()
        obj.hide_render = not state['visible']
    spec = frame['camera']
    camera.location = xyz(spec['position'])
    camera.rotation_euler = (Vector(xyz(spec['target']))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera_data.type = 'ORTHO' if spec['type'] == 'orthographic' else 'PERSP'
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.angle = math.radians(spec['fov'])
    camera_data.ortho_scale = spec['orthoScale']
    scene.render.filepath = frame['output']
    bpy.ops.render.render(write_still=True)
