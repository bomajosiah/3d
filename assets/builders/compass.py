"""Soft, toy-like pocket compass for a small UI icon.

The casing and dial are built as closed manufactured parts. The needle is a
separate asset so its group origin stays at the dial centre for animation.
"""
import math
from modeling import bevel, mesh


TAU = math.tau


def closed_cylinder(name, radius, depth, z, material, segments=64, bevel_width=0.0):
    vertices = []
    for zz in (z - depth / 2, z + depth / 2):
        vertices.extend((radius * math.cos(i * TAU / segments), radius * math.sin(i * TAU / segments), zz) for i in range(segments))
    faces = [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, j + segments, i + segments))
    obj = mesh(name, vertices, faces, material)
    return bevel(obj, bevel_width, 4) if bevel_width else obj


def torus(name, center, major_radius, radial_radius, depth_radius, material, major_segments=72, minor_segments=16):
    cx, cy, cz = center
    vertices = []
    for i in range(major_segments):
        a = i * TAU / major_segments
        for j in range(minor_segments):
            b = j * TAU / minor_segments
            radius = major_radius + radial_radius * math.cos(b)
            vertices.append((cx + radius * math.cos(a), cy + radius * math.sin(a), cz + depth_radius * math.sin(b)))
    faces = []
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            faces.append((i * minor_segments + j, ni * minor_segments + j, ni * minor_segments + nj, i * minor_segments + nj))
    return mesh(name, vertices, faces, material)


def capsule(name, center, length, width, angle, z, depth, material, arc_segments=6):
    """Closed rounded rectangle in the XY plane, with length along local Y."""
    radius = width / 2
    straight = max(0.0, length / 2 - radius)
    outline = []
    for side in (1, -1):
        cy = side * straight
        start = 0 if side == 1 else math.pi
        for i in range(arc_segments + 1):
            a = start + i * math.pi / arc_segments
            outline.append((radius * math.cos(a), cy + radius * math.sin(a)))

    ca, sa = math.cos(angle), math.sin(angle)
    rotated = [(center[0] + x * ca - y * sa, center[1] + x * sa + y * ca) for x, y in outline]
    count = len(rotated)
    vertices = [(x, y, z - depth / 2) for x, y in rotated] + [(x, y, z + depth / 2) for x, y in rotated]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, j + count, i + count))
    return bevel(mesh(name, vertices, faces, material), min(width * 0.16, depth * 0.24), 3)


def needle_half(name, direction, material):
    width = 0.012
    length = 0.066
    base_z, edge_z, ridge_z = 0.0215, 0.0235, 0.028
    tip_y = direction * length
    # A low closed prism with a raised centre ridge gives the two broad facets
    # visible at icon scale without relying on a painted highlight.
    vertices = [
        (-width, 0, base_z), (width, 0, base_z), (0, tip_y, base_z),
        (-width, 0, edge_z), (0, 0, ridge_z), (width, 0, edge_z), (0, tip_y, edge_z),
    ]
    faces = [
        (2, 1, 0),
        (0, 1, 5, 4, 3),
        (3, 4, 6), (4, 5, 6),
        (0, 3, 6, 2), (2, 6, 5, 1),
    ]
    return bevel(mesh(name, vertices, faces, material), 0.0012, 3)


def build_casing():
    parts = [
        closed_cylinder('blue-housing', 0.103, 0.022, -0.002, 'blue', bevel_width=0.005),
        closed_cylinder('cream-dial', 0.080, 0.007, 0.012, 'face', bevel_width=0.002),
        torus('blue-bezel', (0, 0, 0.014), 0.090, 0.0135, 0.010, 'blue'),
        torus('top-loop', (0.070, 0.112, -0.001), 0.018, 0.006, 0.0055, 'blue', major_segments=48),
        capsule('loop-stem', (0.059, 0.094), 0.027, 0.014, -math.pi / 4, 0.000, 0.013, 'blue'),
    ]

    tick_count = 24
    for i in range(tick_count):
        angle = i * TAU / tick_count
        cardinal = i % 6 == 0
        length = 0.017 if cardinal else 0.0125
        width = 0.0058 if cardinal else 0.0045
        radius = 0.065 if cardinal else 0.067
        center = (radius * math.sin(angle), radius * math.cos(angle))
        parts.append(capsule(f'tick-{i:02d}', center, length, width, -angle, 0.018, 0.0033, 'blue', arc_segments=4))
    return parts


def build(parameters):
    part = parameters.get('part', 'casing')
    if part == 'casing':
        return build_casing()
    if part == 'needle':
        return [needle_half('needle-red', 1, 'red'), needle_half('needle-white', -1, 'needle_white')]
    raise ValueError('part must be casing or needle')
