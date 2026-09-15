import json
import sys
import os
import importlib.util
import math
import bpy
import bmesh

sys.path.insert(0, os.path.dirname(__file__))
request = json.load(open(sys.argv[sys.argv.index('--') + 1]))
os.chdir(request.get('projectRoot', os.path.dirname(request['builder'])))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
sys.path.insert(0, os.path.dirname(request['builder']))
spec = importlib.util.spec_from_file_location('asset_builder', request['builder'])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
objects = module.build(request['parameters'])
if not objects or any(o.type != 'MESH' for o in objects):
    raise ValueError('build(parameters) must return a nonempty list of mesh objects')
if len({o.name for o in objects}) != len(objects):
    raise ValueError('Builder object names must be unique')
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
meshes = []
reports = []
for obj in objects:
    evaluated = obj.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    data.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(data)
    components = 0
    remaining = set(bm.verts)
    while remaining:
        components += 1
        pending = [remaining.pop()]
        while pending:
            vert = pending.pop()
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if other in remaining:
                    remaining.remove(other)
                    pending.append(other)
    report = {'name': obj.name, 'vertices': len(data.vertices), 'triangles': len(data.loop_triangles),
              'boundaryEdges': sum(e.is_boundary for e in bm.edges),
              'nonManifoldEdges': sum(not e.is_manifold for e in bm.edges),
              'components': components, 'degenerateFaces': sum(f.calc_area() < 1e-14 for f in bm.faces)}
    if report['degenerateFaces']:
        raise ValueError(f'Degenerate faces in {obj.name}: {report}')
    positions, normals, indices = [], [], []
    normal_matrix = obj.matrix_world.to_3x3().inverted().transposed()
    # Loop normals preserve hard edges and modifier-generated normals.
    for triangle in data.loop_triangles:
        for loop in triangle.loops:
            point = obj.matrix_world @ data.vertices[data.loops[loop].vertex_index].co
            normal = (normal_matrix @ data.corner_normals[loop].vector).normalized()
            p, n = (point.x, point.z, -point.y), (normal.x, normal.z, -normal.y)
            if not all(math.isfinite(v) for v in (*p, *n)):
                raise ValueError('Nonfinite geometry')
            indices.append(len(indices)); positions.extend(p); normals.extend(n)
    meshes.append({'name': obj.name, 'positions': positions, 'normals': normals, 'indices': indices,
                   'material': obj.get('material_key')})
    reports.append(report)
    bm.free()
    evaluated.to_mesh_clear()
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
out = request['output']
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'source.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'asset.glb'), export_format='GLB',
                          use_selection=True, export_apply=True, export_yup=True, export_extras=True)
with open(os.path.join(out, 'mesh.json'), 'w') as file:
    json.dump({'meshes': meshes, 'report': reports}, file, separators=(',', ':'))
