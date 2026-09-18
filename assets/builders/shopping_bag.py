"""Glossy plastic shopping bag: pleated gusset, folded base, two arch handles."""
import math
from modeling import bevel, mesh, sweep

# Shell, metres. The body flares toward the base. Each side panel is pleated
# inward along its centre line, the way a bag folds flat, and the pleat opens out
# at the base into the bright triangle that makes the folded bottom read.
WB = 0.0575       # half width at the base
WT = 0.0495       # half width at the rim
DB = 0.0400       # half depth at the base
DT = 0.0344       # half depth at the rim
HEIGHT = 0.109
FOLD_Y = 0.026    # where the pleat stops and the base triangle starts
PLEAT = 0.0110    # how far the pleat pulls the gusset centre in, at FOLD_Y
PLEAT_TOP = 0.0050
EDGE = 0.0036     # rounding of every panel edge
EDGE_ANGLE = 8    # round the shallow pleat creases too, not just the panel corners

# Handle arch: straight legs and a semicircular crown, thick enough to read small.
HANDLE_X = 0.0230
HANDLE_R = 0.0063
LEG_TOP = 0.0170       # straight leg between the rim and the crown
LEG_BOTTOM = 0.0165    # rounded leg end resting on the front panel
LEAN = 0.0045          # the crown leans back over the mouth of the bag


def taper(y):
    """Half width and half depth of the shell at height y; the panels stay planar."""
    t = y / HEIGHT
    return WB + (WT - WB) * t, DB + (DT - DB) * t


def ring(y, pleat):
    w, d = taper(y)
    return [
        (-w, y, d), (w, y, d), (w - pleat, y, 0),
        (w, y, -d), (-w, y, -d), (-w + pleat, y, 0),
    ]


def build_shell(material):
    rim, mid, base = ring(HEIGHT, PLEAT_TOP), ring(FOLD_Y, PLEAT), ring(0, 0)
    r, m, b = 0, 6, 12
    # Split each cap into two quads by hand: the hexagon is concave at the pleats,
    # and letting Blender tessellate it leaves a lens-shaped shading artefact.
    faces = [(r + 0, r + 1, r + 2, r + 5), (r + 5, r + 2, r + 3, r + 4)]
    for i in range(6):                                   # rim down to the pleat
        j = (i + 1) % 6
        faces.append((r + i, r + j, m + j, m + i))
    faces += [
        (m + 0, m + 1, b + 1, b + 0),                    # front panel, below the pleat
        (m + 3, m + 4, b + 4, b + 3),                    # back panel
        (m + 1, m + 2, b + 1), (m + 2, b + 2, b + 1),    # right gusset closing out
        (m + 2, m + 3, b + 3), (m + 2, b + 3, b + 2),    # into the base triangle
        (m + 4, m + 5, b + 4), (m + 5, b + 5, b + 4),    # left gusset, mirrored
        (m + 5, m + 0, b + 0), (m + 5, b + 0, b + 5),
        (b + 0, b + 5, b + 2, b + 1), (b + 5, b + 4, b + 3, b + 2),   # base
    ]
    shell = bevel(mesh('bag-shell', rim + mid + base, faces, material), EDGE, 8)
    shell.modifiers[-1].angle_limit = math.radians(EDGE_ANGLE)
    return shell


def handle_path(side):
    """Centre line: straight legs, a semicircular crown, leaning back over the mouth."""
    z0 = DT + HANDLE_R * 0.40
    crown = HEIGHT + LEG_TOP
    centers = [(-HANDLE_X, HEIGHT - LEG_BOTTOM, z0), (-HANDLE_X, HEIGHT - LEG_BOTTOM * 0.3, z0)]
    steps = 24
    for i in range(steps + 1):
        angle = math.pi - i * math.pi / steps
        centers.append((HANDLE_X * math.cos(angle),
                        crown + HANDLE_X * math.sin(angle),
                        z0 - LEAN * math.sin(angle)))
    centers += [(HANDLE_X, HEIGHT - LEG_BOTTOM * 0.3, z0), (HANDLE_X, HEIGHT - LEG_BOTTOM, z0)]
    return [(x, y, z * side) for x, y, z in centers]


def build_handle(name, side, material):
    centers = handle_path(side)
    # Taper the last section so each leg ends in a rounded cap, not a flat disc.
    radii = [HANDLE_R] * len(centers)
    radii[0] = radii[-1] = HANDLE_R * 0.62
    handle = sweep(name, centers, radii, segments=24, levels=2)
    handle['material_key'] = material
    return handle


def build(parameters):
    tint = parameters.get('tint', 'pink')
    if not isinstance(tint, str) or not tint.isidentifier():
        raise ValueError('tint must be a material-name prefix such as "pink"')
    return [
        build_shell(tint),
        build_handle('handle-front', 1, tint + '_handle'),
        build_handle('handle-back', -1, tint + '_handle'),
    ]
