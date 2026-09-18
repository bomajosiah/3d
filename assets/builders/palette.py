"""Artist's palette: one oval board with a thumb hole and a hooked notch, five paint blobs.

The board outline is a signed distance field - an ellipse with a curved tube of
void swept out of its lower right - traced at the zero level so the notch joins
the rim as one continuous curve instead of two primitives meeting at a seam. The
blobs are lofted from an irregular closed outline up to a pillow dome, so each one
is a single skinned surface rather than a squashed sphere.

Lengths are fractions of the board's semi-major axis until the final scale.
"""
import math
import bpy
import bmesh
from modeling import mesh, bevel, loft, solidify

SPAN = 0.15          # board semi-major axis, metres
WAIST = 0.67         # semi-minor / semi-major
THICK = 0.157        # slab thickness
RIM = 0.040          # rounding of every slab edge
OUTLINE = 320        # samples around the board outline

HOLE = (0.265, -0.141)   # thumb hole centre
HOLE_R = (0.181, 0.166)  # thumb hole radii
HOLE_TILT = 35           # degrees, ccw in the board plane
HOLE_SEGMENTS = 88

# The notch is a wedge of void driven in from the lower right: a rounded apex
# just under the thumb hole, one arm sweeping out along the rim and the other
# cutting back to leave the thumb rest. Apex point, bisector, half angle.
NOTCH_APEX = (0.340, 0.164)
NOTCH_AIM = 11.5         # degrees, direction the wedge opens
NOTCH_FLARE = 26.3       # half angle of the wedge
NOTCH_NOSE = 0.030       # rounding of the apex
NOTCH_REACH = 1.30       # how far past the apex the wedge runs
JOIN = 0.060             # rounding where the notch breaks out through the rim

# Paint blobs. `shape` lists (harmonic, amplitude, phase) so no two read alike.
BLOBS = [
    {'name': 'blue', 'at': (-0.505, 0.175), 'radii': (0.320, 0.228), 'turn': 10,
     'rise': 0.150, 'shape': [(1, 0.075, 152), (2, 0.130, 26), (3, 0.070, -44), (4, 0.030, 12)]},
    {'name': 'green', 'at': (-0.379, -0.268), 'radii': (0.268, 0.210), 'turn': 4,
     'rise': 0.142, 'shape': [(1, 0.095, -108), (2, 0.110, -6), (3, 0.058, 128), (4, 0.026, 58)]},
    {'name': 'yellow', 'at': (0.156, -0.450), 'radii': (0.278, 0.178), 'turn': -13,
     'rise': 0.128, 'shape': [(1, 0.085, 18), (2, 0.098, 64), (3, 0.052, -20), (4, 0.022, 98)]},
    {'name': 'purple', 'at': (0.118, 0.382), 'radii': (0.310, 0.224), 'turn': -2,
     'rise': 0.148, 'shape': [(1, 0.070, -158), (2, 0.124, 42), (3, 0.066, 94), (4, 0.028, -42)]},
    {'name': 'red', 'at': (0.740, -0.230), 'radii': (0.276, 0.188), 'turn': 11,
     'rise': 0.136, 'shape': [(1, 0.105, 94), (2, 0.108, -28), (3, 0.060, 38), (4, 0.024, 138)]},
]
BLOB_RINGS = 26
BLOB_SEGMENTS = 76
BLOB_SINK = 0.010    # how far the foot sits inside the board


# --- signed distance field -------------------------------------------------

def sd_ellipse(p, a, b):
    """Gradient-normalised ellipse field; exact at the boundary, smooth nearby."""
    k1 = math.hypot(p[0] / a, p[1] / b)
    if k1 < 1e-9:
        return -min(a, b)
    k2 = math.hypot(p[0] / (a * a), p[1] / (b * b))
    return (k1 - 1.0) * k1 / k2


def _wedge():
    """Near and far circles of the notch: a cone whose sides open at NOTCH_FLARE."""
    flare = math.radians(NOTCH_FLARE)
    aim = (math.cos(math.radians(NOTCH_AIM)), math.sin(math.radians(NOTCH_AIM)))
    near = NOTCH_NOSE / math.sin(flare)
    a = (NOTCH_APEX[0] + aim[0] * near, NOTCH_APEX[1] + aim[1] * near)
    b = (a[0] + aim[0] * NOTCH_REACH, a[1] + aim[1] * NOTCH_REACH)
    return a, b, NOTCH_NOSE, NOTCH_NOSE + NOTCH_REACH * math.sin(flare)


WEDGE = _wedge()


def sd_notch(p):
    """Distance to a rounded cone: two circles and the tangent lines between them."""
    a, b, r1, r2 = WEDGE
    bx, bz = b[0] - a[0], b[1] - a[1]
    px, pz = p[0] - a[0], p[1] - a[1]
    span = bx * bx + bz * bz
    drop = r1 - r2
    reach = span - drop * drop
    y = px * bx + pz * bz
    z = y - span
    cross = px * span - bx * y, pz * span - bz * y
    x2 = cross[0] * cross[0] + cross[1] * cross[1]
    y2, z2 = y * y * span, z * z * span
    k = math.copysign(drop * drop * x2, drop)
    if (1 if z > 0 else -1) * reach * z2 > k:
        return math.sqrt(x2 + z2) / span - r2
    if (1 if y > 0 else -1) * reach * y2 < k:
        return math.sqrt(x2 + y2) / span - r1
    return (math.sqrt(x2 * reach / span) + y * drop) / span - r1


def smax(a, b, k):
    """Smooth intersection; rounds the concave corner where the notch cuts the rim."""
    h = max(0.0, min(1.0, 0.5 - 0.5 * (b - a) / k))
    return b * (1 - h) + a * h + k * h * (1 - h)


def sd_board(p):
    return smax(sd_ellipse(p, 1.0, WAIST), -sd_notch(p), JOIN)


def _gradient(p, h=2e-5):
    return ((sd_board((p[0] + h, p[1])) - sd_board((p[0] - h, p[1]))) / (2 * h),
            (sd_board((p[0], p[1] + h)) - sd_board((p[0], p[1] - h))) / (2 * h))


def _settle(p):
    for _ in range(6):
        d = sd_board(p)
        g = _gradient(p)
        n = g[0] * g[0] + g[1] * g[1]
        if n < 1e-12:
            break
        p = (p[0] - d * g[0] / n, p[1] - d * g[1] / n)
    return p


def board_outline(count):
    """Walk the zero level set, then resample it to `count` evenly spaced points."""
    start = _settle((-1.0, 0.0))
    step = 0.003
    p, heading, walked = start, None, []
    for _ in range(4000):
        walked.append(p)
        g = _gradient(p)
        length = math.hypot(*g) or 1.0
        tangent = (-g[1] / length, g[0] / length)
        # Creases in the field can flip the gradient; never let the walk double back.
        if heading and tangent[0] * heading[0] + tangent[1] * heading[1] < 0:
            tangent = (-tangent[0], -tangent[1])
        heading = tangent
        p = _settle((p[0] + tangent[0] * step, p[1] + tangent[1] * step))
        if len(walked) > 30 and math.hypot(p[0] - start[0], p[1] - start[1]) < step * 1.5:
            break
    else:
        raise ValueError('Board outline did not close; check the notch placement')
    return _resample(walked, count)


def _resample(points, count):
    spans = [math.hypot(points[(i + 1) % len(points)][0] - points[i][0],
                        points[(i + 1) % len(points)][1] - points[i][1])
             for i in range(len(points))]
    total = sum(spans)
    out, target, walked, i = [], 0.0, 0.0, 0
    for _ in range(count):
        while walked + spans[i] < target:
            walked += spans[i]
            i = (i + 1) % len(points)
        t = (target - walked) / spans[i] if spans[i] else 0.0
        a, b = points[i], points[(i + 1) % len(points)]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        target += total / count
    return out


def hole_outline(count):
    cos, sin = math.cos(math.radians(HOLE_TILT)), math.sin(math.radians(HOLE_TILT))
    ring = []
    for i in range(count):
        a = i * math.tau / count
        x, z = HOLE_R[0] * math.cos(a), HOLE_R[1] * math.sin(a)
        ring.append((HOLE[0] + x * cos - z * sin, HOLE[1] + x * sin + z * cos))
    return ring


# --- board -----------------------------------------------------------------

def build_board(material):
    top = THICK / 2
    bm = bmesh.new()
    loops, edges = [], []
    for ring in (board_outline(OUTLINE), hole_outline(HOLE_SEGMENTS)):
        verts = [bm.verts.new((x * SPAN, -z * SPAN, top * SPAN)) for x, z in ring]
        loops.append(verts)
        edges.extend(bm.edges.new((verts[i], verts[(i + 1) % len(verts)])) for i in range(len(verts)))
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges, normal=(0, 0, 1))
    if not bm.faces:
        raise ValueError('Board cap did not fill; the outline probably self-intersects')
    for face in bm.faces:
        if face.normal.z < 0:
            face.normal_flip()
    data = bpy.data.meshes.new('palette-board')
    bm.to_mesh(data)
    bm.free()
    data.update()
    for polygon in data.polygons:
        polygon.use_smooth = True
    board = bpy.data.objects.new('palette-board', data)
    bpy.context.collection.objects.link(board)
    board['material_key'] = material
    solidify(board, THICK * SPAN)
    bevel(board, RIM * SPAN, 10)
    board.modifiers[-1].angle_limit = math.radians(22)
    return board


# --- paint blobs -----------------------------------------------------------

def blob_radius(blob, angle):
    r = 1.0
    for harmonic, amplitude, phase in blob['shape']:
        r += amplitude * math.cos(harmonic * angle + math.radians(phase))
    return r


FULL, DOME = 2.9, 2.15     # superellipse section: |t|^FULL + |width|^DOME = 1


def blob_sections():
    """Heights and widths of the lofted rings: tight at the foot, even over the dome."""
    def flare(t):              # the foot spreads a little where the paint wets the board
        return 0.020 * (1.0 - t / 0.22) ** 2 if t < 0.22 else 0.0

    sections = []
    for t in (0.0, 0.010, 0.026, 0.050):
        sections.append(((1.0 - t ** FULL) ** (1 / DOME) + flare(t), t))
    start = math.asin(0.050 ** (FULL / 2))
    steps = BLOB_RINGS - len(sections)
    for i in range(1, steps + 1):
        angle = start + (math.pi / 2 - start) * i / (steps + 0.55)
        sections.append((math.cos(angle) ** (2 / DOME) + flare(math.sin(angle) ** (2 / FULL)),
                         math.sin(angle) ** (2 / FULL)))
    return sections


def build_blob(blob):
    cos, sin = math.cos(math.radians(blob['turn'])), math.sin(math.radians(blob['turn']))
    base = []
    for i in range(BLOB_SEGMENTS):
        a = i * math.tau / BLOB_SEGMENTS
        r = blob_radius(blob, a)
        x, z = blob['radii'][0] * r * math.cos(a), blob['radii'][1] * r * math.sin(a)
        base.append((blob['at'][0] + x * cos - z * sin, blob['at'][1] + x * sin + z * cos))
    cx, cz = blob['at']
    rings = []
    for width, lift in blob_sections():
        y = THICK / 2 - BLOB_SINK + lift * blob['rise']
        rings.append([((cx + (x - cx) * width) * SPAN, y * SPAN, (cz + (z - cz) * width) * SPAN)
                      for x, z in base])
    obj = loft('paint-%s' % blob['name'], rings, cap=True, levels=1, material=blob['name'])
    return obj


def build(parameters):
    board_material = parameters.get('board', 'board')
    if not isinstance(board_material, str) or not board_material:
        raise ValueError('board must be a material name')
    return [build_board(board_material)] + [build_blob(blob) for blob in BLOBS]
