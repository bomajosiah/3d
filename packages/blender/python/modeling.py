"""Modeling helpers. All public coordinates are metres, Y-up, right-handed.
Builders return a list of mesh Objects. Scene transforms are applied later.
"""
import math
import bpy
import bmesh
from mathutils import Vector


def xyz(point):
    return (point[0], -point[2], point[1])


def mesh(name, vertices, faces, material=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    for polygon in data.polygons:
        polygon.use_smooth = True
    if material:
        obj['material_key'] = material
    return obj


def subdivision(obj, levels=2):
    mod = obj.modifiers.new('Surface continuity', 'SUBSURF')
    mod.levels = mod.render_levels = levels
    return obj


def solidify(obj, thickness=0.002):
    mod = obj.modifiers.new('Wall thickness', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = -1
    return obj


def bevel(obj, width=0.001, segments=4):
    mod = obj.modifiers.new('Edge rounding', 'BEVEL')
    mod.width = width
    mod.segments = segments
    return obj


def mirror(obj, axis='x', merge=True):
    mod = obj.modifiers.new('Symmetry', 'MIRROR')
    mod.use_axis = [axis == 'x', axis == 'z', axis == 'y']
    mod.use_clip = merge
    mod.use_mirror_merge = merge
    return obj


def loft(name, rings, cap=True, levels=2, material=None):
    """Connect corresponding points of section rings; no intersecting solids."""
    count = len(rings[0])
    if count < 3 or any(len(r) != count for r in rings):
        raise ValueError('Loft rings need equal vertex counts (at least 3)')
    vertices = [p for ring in rings for p in ring]
    faces = []
    for j in range(len(rings) - 1):
        for i in range(count):
            a = j * count + i
            b = j * count + (i + 1) % count
            faces.append((a, b, b + count, a + count))
    if cap:
        faces.extend([tuple(reversed(range(count))), tuple((len(rings)-1)*count+i for i in range(count))])
    obj = mesh(name, vertices, faces, material)
    return subdivision(obj, levels) if levels else obj


def sweep(name, centers, radii, segments=16, levels=2):
    """Parallel-transport cross-sections along a centre line (avoids frame flips)."""
    points = [Vector(p) for p in centers]
    normal = None
    rings = []
    for i, p in enumerate(points):
        tangent = (points[min(i+1, len(points)-1)] - points[max(0, i-1)]).normalized()
        if normal is None:
            basis = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((1, 0, 0))
            normal = tangent.cross(basis).normalized()
        normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal).normalized()
        rings.append([tuple(p + radii[i] * (normal*math.cos(j*math.tau/segments) + binormal*math.sin(j*math.tau/segments))) for j in range(segments)])
    return loft(name, rings, levels=levels)
