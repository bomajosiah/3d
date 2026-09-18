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
from modeling import loft

SPAN = 0.15          # board semi-major axis, metres
WAIST = 0.674        # semi-minor / semi-major
ROUND = 2.049        # outline exponent; a touch past an ellipse, fuller at the ends
THICK = 0.1471       # slab thickness
RIM = 0.0313         # rounding of every slab edge
OUTLINE = 340        # samples around the board outline
RIM_STEPS = 7        # segments in the quarter round of the rim

HOLE = (0.2591, -0.1163)   # thumb hole centre
HOLE_R = (0.1694, 0.0998)  # thumb hole radii
HOLE_TILT = 10.64          # degrees, ccw in the board plane
HOLE_SEGMENTS = 96

# The notch is a wedge of void driven in from the lower right: a rounded apex
# just under the thumb hole, one arm sweeping out along the rim and the other
# cutting back to leave the thumb rest. Apex point, bisector, half angle.
NOTCH_APEX = (0.3460, 0.1309)
NOTCH_AIM = 18.44        # degrees, direction the wedge opens
NOTCH_FLARE = 21.96      # half angle of the wedge
NOTCH_NOSE = 0.0364      # rounding of the apex
NOTCH_REACH = 1.30       # how far past the apex the wedge runs
JOIN = 0.2537            # rounding where the notch breaks out through the rim

# Paint blobs. `cos`/`sin` are the harmonics of the outline radius about `at`,
# so each one keeps the lobed, spilled silhouette of a real squeeze of paint.
BLOBS = [
    {'name': 'blue', 'at': (-0.5372, 0.1223), 'rise': 0.1437,
     'cos': [0.2009, -0.0096, 0.0426, -0.0041, 0.0007, 0.0005, 0.0002, -0.0023, 0.0017],
     'sin': [0.0, -0.0164, 0.0111, -0.0174, 0.0148, -0.0043, 0.0057, -0.0023, 0.0035]},
    {'name': 'green', 'at': (-0.3956, -0.3121), 'rise': 0.1106,
     'cos': [0.1705, -0.0107, 0.0192, -0.0123, 0.005, -0.0015, 0.0037, -0.0035, 0.002],
     'sin': [0.0, -0.0169, 0.0008, -0.0145, 0.0135, -0.0066, 0.0029, -0.0037, 0.0018]},
    {'name': 'yellow', 'at': (0.1423, -0.4397), 'rise': 0.0950,
     'cos': [0.148, -0.0109, 0.03, -0.0048, 0.0032, -0.0043, 0.0043, -0.0032, 0.0007],
     'sin': [0.0, -0.0494, -0.0005, -0.0293, 0.0072, -0.0082, 0.0043, -0.0072, 0.0012]},
    {'name': 'purple', 'at': (0.0794, 0.3542), 'rise': 0.1480,
     'cos': [0.1977, -0.0129, 0.0369, -0.0031, 0.0098, 0.0009, 0.0071, -0.0021, 0.0035],
     'sin': [0.0, -0.0164, -0.0071, -0.02, 0.0018, -0.0031, -0.0009, 0.0015, -0.0008]},
    {'name': 'red', 'at': (0.7053, -0.2431), 'rise': 0.0860,
     'cos': [0.1574, -0.0073, 0.0386, -0.0069, 0.0049, 0.0009, -0.0001, 0.0012, -0.0005],
     'sin': [0.0, -0.0189, 0.0111, -0.0165, 0.0144, -0.009, 0.0072, -0.0052, 0.0033]},
]
BLOB_RINGS = 30
BLOB_SEGMENTS = 88
BLOB_SINK = 0.010    # how far the foot sits inside the board
BLOB_CALM = 0.42     # how much of the outline's lobing survives at the apex


# --- signed distance field -------------------------------------------------

def sd_super(p, a, b, n=2.0):
    """Gradient-normalised superellipse field; exact at the boundary, smooth nearby."""
    ax, az = abs(p[0] / a), abs(p[1] / b)
    if ax < 1e-9 and az < 1e-9:
        return -min(a, b)
    power = ax ** n + az ** n
    value = power ** (1 / n) - 1
    scale = power ** (1 / n - 1)
    gx = scale * ax ** (n - 1) * (1 if p[0] >= 0 else -1) / a
    gz = scale * az ** (n - 1) * (1 if p[1] >= 0 else -1) / b
    gradient = math.hypot(gx, gz)
    return value / gradient if gradient > 1e-12 else value


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
    return smax(sd_super(p, 1.0, WAIST, ROUND), -sd_notch(p), JOIN)


def _gradient(p, h=2e-5):
    return ((sd_board((p[0] + h, p[1])) - sd_board((p[0] - h, p[1]))) / (2 * h),
            (sd_board((p[0], p[1] + h)) - sd_board((p[0], p[1] - h))) / (2 * h))


def _settle(p, level=0.0):
    for _ in range(6):
        d = sd_board(p) - level
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


def hole_outline(count, grow=0.0):
    """The bore, optionally pushed out along its own normal for the rounded lip."""
    cos, sin = math.cos(math.radians(HOLE_TILT)), math.sin(math.radians(HOLE_TILT))
    ring = []
    for i in range(count):
        a = i * math.tau / count
        x, z = HOLE_R[0] * math.cos(a), HOLE_R[1] * math.sin(a)
        nx, nz = HOLE_R[1] * math.cos(a), HOLE_R[0] * math.sin(a)
        n = math.hypot(nx, nz) or 1.0
        x, z = x + nx / n * grow, z + nz / n * grow
        ring.append((HOLE[0] + x * cos - z * sin, HOLE[1] + x * sin + z * cos))
    return ring


def erode(points, distance):
    """Pull a traced outline in along the field's own normal, then re-settle on it."""
    if distance <= 1e-9:
        return list(points)
    out = []
    for p in points:
        g = _gradient(p)
        length = math.hypot(*g) or 1.0
        out.append(_settle((p[0] - g[0] / length * distance, p[1] - g[1] / length * distance), -distance))
    return out


# --- board -----------------------------------------------------------------

def rim_profile():
    """Half the slab section: a quarter round from the flat face out to the wall.

    Each entry is (how far the outline is eaten back, height). Index 0 is where
    the round meets the vertical wall, the last is the flat face itself.
    """
    return [(RIM * (1 - math.cos(a)), THICK / 2 - RIM + RIM * math.sin(a))
            for a in (i * math.pi / 2 / RIM_STEPS for i in range(RIM_STEPS + 1))]


def build_board(material):
    section = rim_profile()
    outer = board_outline(OUTLINE)
    rings = [erode(outer, cut) for cut, _ in section]
    bores = [hole_outline(HOLE_SEGMENTS, cut) for cut, _ in section]
    # top face, down the rounded rim, straight across the wall, and back out
    # underneath: one continuous skin, so the highlight never breaks at a seam.
    levels = list(reversed(range(len(section)))) + list(range(len(section)))
    heights = [section[i][1] for i in reversed(range(len(section)))]
    heights += [-section[i][1] for i in range(len(section))]

    bm = bmesh.new()
    def band(source):
        loops = []
        for level, y in zip(levels, heights):
            ring = source[level]
            loops.append([bm.verts.new((x * SPAN, -z * SPAN, y * SPAN)) for x, z in ring])
        for a, b in zip(loops, loops[1:]):
            for i in range(len(a)):
                j = (i + 1) % len(a)
                bm.faces.new((a[i], a[j], b[j], b[i]))
        return loops[0], loops[-1]

    top_outer, bottom_outer = band(rings)
    top_bore, bottom_bore = band(bores)
    for face, bore in ((top_outer, top_bore), (bottom_outer, bottom_bore)):
        edges = [e for loop in (face, bore) for e in
                 (bm.edges.get((loop[i], loop[(i + 1) % len(loop)])) for i in range(len(loop))) if e]
        filled = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False,
                                         edges=edges, normal=(0, 0, 1))
        if not filled['geom']:
            raise ValueError('Board face did not fill; the outline probably self-intersects')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    data = bpy.data.meshes.new('palette-board')
    bm.to_mesh(data)
    bm.free()
    data.update()
    for polygon in data.polygons:
        polygon.use_smooth = True
    board = bpy.data.objects.new('palette-board', data)
    bpy.context.collection.objects.link(board)
    board['material_key'] = material
    return board


# --- paint blobs -----------------------------------------------------------

def blob_radius(blob, angle):
    """Outline radius in the board plane. Harmonics, so the curve cannot kink."""
    r = 0.0
    for k, (cosine, sine) in enumerate(zip(blob['cos'], blob['sin'])):
        r += cosine * math.cos(k * angle) + sine * math.sin(k * angle)
    return r


FULL, DOME = 2.9, 2.15     # superellipse section: |t|^FULL + |width|^DOME = 1


def blob_sections():
    """Heights and widths of the lofted rings: tight at the foot, even over the dome."""
    def flare(t):              # the foot spreads into a meniscus where the paint wets the board
        return 0.022 * (1.0 - t / 0.12) ** 1.8 if t < 0.12 else 0.0

    sections = []
    for t in (0.0, 0.006, 0.016, 0.032, 0.056):
        sections.append(((1.0 - t ** FULL) ** (1 / DOME) + flare(t), t))
    start = math.asin(0.056 ** (FULL / 2))
    steps = BLOB_RINGS - len(sections)
    for i in range(1, steps + 1):
        angle = start + (math.pi / 2 - start) * i / (steps + 0.55)
        sections.append((math.cos(angle) ** (2 / DOME) + flare(math.sin(angle) ** (2 / FULL)),
                         math.sin(angle) ** (2 / FULL)))
    return sections


def build_blob(blob):
    cx, cz = blob['at']
    mean = blob['cos'][0]
    base = []
    for i in range(BLOB_SEGMENTS):
        a = i * math.tau / BLOB_SEGMENTS
        r = blob_radius(blob, a)
        if r <= 0:
            raise ValueError('Blob %s has a non-positive radius' % blob['name'])
        base.append((math.cos(a), math.sin(a), r))
    rings = []
    for width, lift in blob_sections():
        y = THICK / 2 - BLOB_SINK + lift * blob['rise']
        # Surface tension pulls the top of a drop round: the lobes live at the
        # foot and fade out as the dome closes, so the crown carries one highlight.
        calm = BLOB_CALM + (1 - BLOB_CALM) * (1 - lift) ** 1.3
        rings.append([((cx + dx * (mean + (r - mean) * calm) * width) * SPAN, y * SPAN,
                       (cz + dz * (mean + (r - mean) * calm) * width) * SPAN)
                      for dx, dz, r in base])
    obj = loft('paint-%s' % blob['name'], rings, cap=True, levels=1, material=blob['name'])
    return obj


def build(parameters):
    board_material = parameters.get('board', 'board')
    if not isinstance(board_material, str) or not board_material:
        raise ValueError('board must be a material name')
    return [build_board(board_material)] + [build_blob(blob) for blob in BLOBS]
