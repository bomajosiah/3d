"""Toy-like silver fork and butter knife with raised blue handle inlays."""
import math
from modeling import bevel, mesh, subdivision, loft


def prism(name, outline, z, depth, material, bevel_width=0.0, segments=4):
    count = len(outline)
    vertices = [(x, y, z - depth / 2) for x, y in outline]
    vertices += [(x, y, z + depth / 2) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, j + count, i + count))
    obj = mesh(name, vertices, faces, material)
    return bevel(obj, bevel_width, segments) if bevel_width else obj


def fork_surface():
    # Shared top/bottom grids form one closed utensil. Removing three quad
    # columns from the crown creates real open slots between four rounded tines.
    xs = [-1, -.81, -.62, -.46, -.27, -.08, .08, .27, .46, .62, .81, 1]
    rows = [
        (.000, .002, .0010), (.003, .019, .0045), (.010, .024, .0070),
        (.022, .025, .0080), (.050, .024, .0080), (.085, .021, .0070),
        (.112, .017, .0058), (.122, .012, .0048), (.140, .012, .0048),
        (.154, .017, .0055), (.166, .030, .0070), (.178, .037, .0080),
        (.194, .038, .0070), (.205, .0375, .0062), (.241, .036, .0052),
        (.266, .0345, .0048), (.271, .034, .0040), (.276, .034, .0015),
    ]
    vertices = []
    for side in (1, -1):
        for row, (y, width, height) in enumerate(rows):
            for col, x in enumerate(xs):
                if row == len(rows) - 1:
                    start = (col // 3) * 3
                    center = xs[start + 1]
                    x = center + (x - center) * .35
                crown = .58 + .42 * math.sqrt(max(0, 1 - x * x))
                vertices.append((x * width, y - .120, side * height * crown))

    columns = len(xs)
    offset = len(rows) * columns
    faces = []
    boundary = {}
    for row in range(len(rows) - 1):
        for col in range(columns - 1):
            if row >= 12 and col in (2, 5, 8):
                continue
            a = row * columns + col
            b, c, d = a + 1, a + 1 + columns, a + columns
            faces.extend(((a, b, c, d), (a + offset, d + offset, c + offset, b + offset)))
            for u, v in ((a, b), (b, c), (c, d), (d, a)):
                key = tuple(sorted((u, v)))
                if key in boundary:
                    del boundary[key]
                else:
                    boundary[key] = (u, v)
    for u, v in boundary.values():
        faces.append((v, u, u + offset, v + offset))

    used = sorted({index for face in faces for index in face})
    remap = {old: new for new, old in enumerate(used)}
    obj = mesh('silver-fork', [vertices[i] for i in used], [tuple(remap[i] for i in face) for face in faces], 'silver')
    return subdivision(obj, 2)


def rounded_sections(name, rows, material, z=0):
    # Elliptical sections create a continuous convex face and soft perimeter.
    rings = []
    for y, center, width, depth in rows:
        rings.append([(center + width * math.cos(i * math.tau / 24),
                       y - .120, z + depth * math.sin(i * math.tau / 24))
                      for i in range(24)])
    return loft(name, rings, levels=2, material=material)


def handle_insert(name):
    return rounded_sections(name, [
        (.012, 0, .002, .0007), (.014, 0, .012, .0020),
        (.020, 0, .018, .0033), (.030, 0, .019, .0038),
        (.055, 0, .018, .0040), (.084, 0, .0155, .0038),
        (.108, 0, .012, .0030), (.119, 0, .009, .0020),
        (.121, 0, .002, .0006),
    ], 'blue', .007)


def knife_surface():
    return rounded_sections('silver-knife', [
        (.000, 0, .002, .0010), (.003, 0, .019, .0045),
        (.010, 0, .024, .0070), (.022, 0, .025, .0080),
        (.050, 0, .024, .0080), (.085, 0, .021, .0070),
        (.112, 0, .017, .0058), (.122, 0, .012, .0048),
        (.130, 0, .012, .0048), (.137, -.002, .017, .0055),
        (.143, -.004, .024, .0065), (.152, -.004, .027, .0070),
        (.185, -.004, .027, .0072), (.213, -.002, .025, .0070),
        (.239, .003, .020, .0064), (.258, .008, .015, .0055),
        (.272, .014, .009, .0045), (.281, .019, .004, .0030),
        (.282, .020, .001, .0010),
    ], 'silver')


def build(parameters):
    kind = parameters.get('kind', 'fork')
    if kind == 'fork':
        return [fork_surface(), handle_insert('fork-blue-inlay')]
    if kind == 'knife':
        return [knife_surface(), handle_insert('knife-blue-inlay')]
    raise ValueError('kind must be fork or knife')
