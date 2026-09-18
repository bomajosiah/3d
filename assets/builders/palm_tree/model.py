"""Palm tree icon: a spiral-banded trunk and thirteen lofted fronds.

The trunk is one cylindrical grid whose radius carries a periodic *helical*
ridge, so the scar bands are a single continuous spiral rather than a stack of
overlapping cones. Radius is single valued in height everywhere - the lip's
undercut comes from the band falling inward faster than it falls in height, so
the short face under each lip turns down and reads as the dark line.

Each frond is a closed cross section lofted along its own arc. The cross section
carries the blade's half thickness, the raised midrib and a pillow that narrows
with the local width, and it wraps around a semicircular rim whose radius is
half the local edge thickness, so no bevel modifier is involved.

Leaflet slots would be impossible if the loft's stations ran square across the
blade: a slot that slants outward toward the tip has both its walls leaning the
same way, and tracing one inward means running *backward* along the blade.
Stations are therefore chevrons - station `s` sits at arclength `s + SLANT|w|` -
so a plain V notch cut into the half-width profile lands as a slanted slot with
near parallel walls. The chevron map is injective and orientation preserving for
any width profile (its Jacobian is the width itself), so the notch walls can be
as steep as they like without folding the surface.
"""
import math
from functools import lru_cache

from mathutils import Vector
from modeling import loft

TAU = math.tau

# --- trunk -----------------------------------------------------------------

TRUNK_H = 0.2155       # to the crown hub; the top third hides inside the fronds
TRUNK_R = 0.0424       # radius of the base cone, measured at a band lip
TRUNK_BOW = 0.020      # how far the trunk bows out of plumb at mid height
TRUNK_SEG = 60         # angular samples
TRUNK_FOOT = 0.033     # quarter round where the trunk meets the ground

BAND_PITCH = 0.0285    # rise of one turn of the scar spiral
BAND_ROWS = 44         # rows of the grid per turn
BAND_DEPTH = 0.088     # how far the band is cut in, as a fraction of the radius
BAND_LIP = 0.895       # phase of the lip; the rest of the turn is the undercut
BAND_HAND = -1.0       # sign of the spiral; bands fall to the right at the front


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def band(phase):
    """Radius factor around one turn: 0 just under a lip, 1 at the next lip."""
    if phase < BAND_LIP:
        return 0.04 + 0.96 * smoothstep(phase / BAND_LIP)
    return 0.04 + 0.96 * (1 - smoothstep((phase - BAND_LIP) / (1 - BAND_LIP)))


def trunk_radius(y):
    t = min(max(y / TRUNK_H, 0.0), 1.0)
    r = TRUNK_R * (1 - 0.38 * t - 0.66 * t ** 6.4)
    r = max(r, 0.0105)  # the top is inside the crown; never let it pinch shut
    if y < TRUNK_FOOT:
        drop = (TRUNK_FOOT - y) / TRUNK_FOOT
        r -= TRUNK_FOOT * (1 - math.sqrt(max(0.0, 1 - drop * drop)))
    return max(r, 0.0016)


def trunk_centre(y):
    return TRUNK_BOW * math.sin(math.pi * min(y / TRUNK_H, 1.0) ** 0.85)


def trunk_rows():
    """Even rows up the trunk, crowded at the foot where the round turns fastest."""
    step = BAND_PITCH / BAND_ROWS
    ys = [0.006 * (k / 9.0) ** 2 for k in range(9)]
    y = 0.0
    while y < TRUNK_H - step * 0.5:
        ys.append(y)
        y += step
    ys.append(TRUNK_H)
    ys.sort()
    return [y for i, y in enumerate(ys) if i == 0 or y - ys[i - 1] > 2e-5]


def build_trunk(material):
    rings = []
    for y in trunk_rows():
        base, cx = trunk_radius(y), trunk_centre(y)
        ring = []
        for i in range(TRUNK_SEG):
            a = i * TAU / TRUNK_SEG
            phase = ((TRUNK_H - y) / BAND_PITCH + BAND_HAND * a / TAU) % 1.0
            r = base * (1 - BAND_DEPTH * (1 - band(phase)))
            ring.append((cx + r * math.cos(a), y, r * math.sin(a)))
        rings.append(ring)
    return loft('palm-trunk', rings, cap=True, levels=0, material=material)


# --- frond blade -----------------------------------------------------------

BLADE_W = 0.200        # widest half width, as a fraction of the frond's length
BLADE_TH = 0.0150      # half thickness, same units
BLADE_RIB = 0.0265     # height of the midrib above the blade
BLADE_RIB_W = 0.170    # midrib width, as a fraction of the local half width
BLADE_RIB_CUT = 0.45   # how deep the gutter beside the midrib runs, in rib heights
BLADE_DOME = 0.0145    # pillow height over a leaflet
BLADE_CURL = 0.14      # how far the blade's edge falls below its midrib
SLANT = 0.60           # chevron: arclength gained per unit of width
SLANT_EASE = 0.26      # rounds the chevron's apex, in half widths

NOTCH_DEPTH = 0.56     # slot depth, as a fraction of the local half width
NOTCH_HALF = 0.0090    # half length of the V in the width profile
NOTCH_NOSE = 0.34      # rounding of the V's apex
NOTCHES = tuple((0.295 + 0.088 * k, 1 if k % 2 == 0 else -1) for k in range(8))

RINGS = 26             # stations spread over the blade, before notch refinement
RIM = 7                # samples around the rounded edge
# Across the blade, biased toward the midrib so the rib keeps its own samples,
# and toward the rim so the pillow does not flatten before it turns over.
CROSS = (0.0, 0.032, 0.068, 0.112, 0.168, 0.238, 0.322, 0.42, 0.53, 0.65, 0.775, 0.895, 1.0)


def blade_width(sigma):
    """Lanceolate outline: widest a little over a third along, pointed at the tip."""
    x = min(max(sigma, 0.0), 1.0)
    return ((x + 0.05) ** 0.42) * ((1 - x) ** 0.95) / 0.45954


@lru_cache(maxsize=4096)
def smooth_width(sigma):
    """Undo the chevron's shift, so the outline itself stays symmetric.

    Returned in fractions of the frond's length, like every other blade length.
    """
    w = BLADE_W * blade_width(sigma)
    for _ in range(14):
        w = 0.5 * w + 0.5 * BLADE_W * blade_width(sigma + SLANT * w)
    return w


def notch_cut(sigma, side, blunt=1.0, phase=0.0):
    """Depth of the V cut into one edge, in half-width units."""
    cut = 0.0
    for at, edge in NOTCHES:
        if edge != side:
            continue
        u = abs(sigma - at - phase) / (NOTCH_HALF * blunt)
        u = math.sqrt(u * u + NOTCH_NOSE ** 2) - NOTCH_NOSE
        if u < 1:
            fade = min(1.0, (1.03 - at - phase) / 0.13)
            # The V's walls stay straight, but its mouth lands on the outline with
            # a level tangent; a corner there reads as a spike on the silhouette.
            mouth = 1.0 if u <= 0.72 else 1 - ((u - 0.72) / 0.28) ** 2
            cut += NOTCH_DEPTH * fade * mouth * (1 - u) / blunt ** 0.5
    return cut


def half_width(sigma, side, phase=0.0):
    base = smooth_width(sigma)
    return max(base * (1 - notch_cut(sigma, side, phase=phase)), base * 0.30, 1e-4)


def dome_width(sigma, side, phase=0.0):
    """A softened copy of the outline: the pillow sinks into a valley at each slot."""
    base = smooth_width(sigma)
    cut = notch_cut(sigma, side, blunt=3.2, phase=phase)
    return max(base * (1 - 0.82 * cut), base * 0.26, 1e-4)


def blade_thickness(sigma):
    """Half thickness, never more than the blade can carry as it runs out at the tip."""
    thick = BLADE_TH * (0.55 + 0.45 * smoothstep(min(1.0, (1 - sigma) / 0.22)))
    return min(thick, 0.55 * smooth_width(sigma))


def surfaces(sigma, side, phase=0.0):
    """Top and bottom of the blade as functions of the across-blade offset."""
    span = smooth_width(sigma)
    dome_span = dome_width(sigma, side, phase)
    thick = blade_thickness(sigma)
    rib = BLADE_RIB * (0.35 + 0.65 * (1 - sigma) ** 0.8)
    rib_span = max(BLADE_RIB_W * span, 1e-4)
    dome = BLADE_DOME * (0.4 + 0.6 * math.sin(math.pi * min(1.0, sigma / 0.92) ** 0.8))

    def mid(w):
        return -BLADE_CURL * w * w / max(span, 1e-4)

    def ridge(w):
        """Midrib: a raised tube with a shallow gutter each side, so it reads as a
        separate part of the leaf rather than as the summit of one broad dome."""
        u = w / rib_span
        return rib * (math.exp(-u * u) - BLADE_RIB_CUT * math.exp(-(u / 1.8) ** 2)) / (1 - BLADE_RIB_CUT)

    def top(w):
        pillow = max(0.0, 1 - (w / dome_span) ** 2) ** 0.75
        return mid(w) + thick + ridge(w) + dome * pillow

    def bot(w):
        return mid(w) - thick - 0.30 * ridge(w)

    return top, bot


def cross_section(sigma, phase=0.0):
    """One closed ring: top out to the right rim, under and back over the left."""
    out = []
    edges = {}
    for side in (1, -1):
        span = half_width(sigma, side, phase)
        top, bot = surfaces(sigma, side, phase)
        thick = blade_thickness(sigma)
        inner = max(span - min(thick, span * 0.92), span * 0.08)
        centre = 0.5 * (top(inner) + bot(inner))
        radius = 0.5 * (top(inner) - bot(inner))
        edges[side] = (span, inner, centre, radius, top, bot)

    span, inner, centre, radius, top, bot = edges[1]
    out.extend((inner * t, top(inner * t)) for t in CROSS)
    for k in range(1, RIM + 1):
        a = math.pi / 2 - math.pi * k / (RIM + 1)
        out.append((inner + radius * math.cos(a), centre + radius * math.sin(a)))
    out.extend((inner * t, bot(inner * t)) for t in reversed(CROSS))

    span, inner, centre, radius, top, bot = edges[-1]
    out.extend((-inner * t, bot(-inner * t)) for t in CROSS[1:])
    for k in range(1, RIM + 1):
        a = -math.pi / 2 + math.pi * k / (RIM + 1)
        out.append((-(inner + radius * math.cos(a)), centre + radius * math.sin(a)))
    out.extend((-inner * t, top(-inner * t)) for t in reversed(CROSS[1:]))
    return out


# --- frond placement -------------------------------------------------------

# Ten arching fronds evenly around the crown, longest toward the viewer's left,
# then three older ones that leave the crown already falling. Without the last
# three the canopy is a vase and daylight shows between the leaves and the trunk.
FRONDS = (
    {'turn': 0, 'length': 0.181, 'rise': 75, 'fall': -151, 'droop': 0.94, 'sweep': 11, 'wide': 1.03, 'phase': 0.023},
    {'turn': 36, 'length': 0.173, 'rise': 79, 'fall': -145, 'droop': 1.11, 'sweep': -9, 'wide': 0.99, 'phase': -0.022},
    {'turn': 72, 'length': 0.178, 'rise': 71, 'fall': -151, 'droop': 0.92, 'sweep': 11, 'wide': 0.97, 'phase': -0.017},
    {'turn': 108, 'length': 0.195, 'rise': 82, 'fall': -138, 'droop': 1.05, 'sweep': -9, 'wide': 1.03, 'phase': 0.026},
    {'turn': 144, 'length': 0.217, 'rise': 74, 'fall': -147, 'droop': 0.90, 'sweep': 11, 'wide': 1.01, 'phase': 0.011},
    {'turn': 180, 'length': 0.236, 'rise': 78, 'fall': -142, 'droop': 1.09, 'sweep': -9, 'wide': 0.96, 'phase': -0.029},
    {'turn': 216, 'length': 0.244, 'rise': 74, 'fall': -154, 'droop': 0.95, 'sweep': 11, 'wide': 1.01, 'phase': -0.004},
    {'turn': 252, 'length': 0.238, 'rise': 82, 'fall': -142, 'droop': 1.08, 'sweep': -9, 'wide': 1.03, 'phase': 0.030},
    {'turn': 288, 'length': 0.222, 'rise': 71, 'fall': -147, 'droop': 0.89, 'sweep': 11, 'wide': 0.97, 'phase': -0.004},
    {'turn': 324, 'length': 0.200, 'rise': 79, 'fall': -138, 'droop': 1.06, 'sweep': -9, 'wide': 0.99, 'phase': -0.029},
    {'turn': 54, 'length': 0.112, 'rise': 26, 'fall': -112, 'droop': 0.88, 'sweep': 9, 'wide': 0.94, 'phase': -0.020},
    {'turn': 162, 'length': 0.118, 'rise': 20, 'fall': -119, 'droop': 0.88, 'sweep': -7, 'wide': 0.94, 'phase': 0.000},
    {'turn': 270, 'length': 0.109, 'rise': 14, 'fall': -126, 'droop': 0.88, 'sweep': 9, 'wide': 0.94, 'phase': 0.020},
)
# Icon fronds are read from one side, so each blade banks about its own arc until
# its face turns toward the viewer; without it the side fronds show only an edge.
BANK = 78              # degrees of bank at the fronds pointing left and right
ROLL = 14              # extra twist at the base, unwinding toward the tip
CROWN_R = 0.011        # the fronds root around the crown shaft, not at one point
CROWN_Y = -0.007       # and a little below the top of the trunk
SPINE_STEPS = 240


def spine_of(cfg):
    """Arc of the rachis, plus the yaw at every sample.

    The yaw is kept because the blade's across-axis is the horizontal normal of
    the frond's own vertical plane. Deriving that axis from the tangent instead
    would flip it the moment the arc passes through vertical, and the blade would
    turn over - midrib underneath - within a few millimetres of the crown.
    """
    rise, fall = math.radians(cfg['rise']), math.radians(cfg['fall'])
    sweep, droop = math.radians(cfg['sweep']), cfg['droop']
    step = cfg['length'] / SPINE_STEPS
    points, yaws = [Vector((0.0, 0.0, 0.0))], [0.0]
    for i in range(SPINE_STEPS):
        a = (i + 0.5) / SPINE_STEPS
        pitch = rise + (fall - rise) * a ** droop
        yaw = sweep * a ** 1.4
        points.append(points[-1] + step * Vector((
            math.cos(pitch) * math.cos(yaw), math.sin(pitch), math.cos(pitch) * math.sin(yaw))))
        yaws.append(yaw)
    return points, yaws, step


def frame_at(points, yaws, step, length, s, bank=0.0):
    """Position and blade axes at arclength s, extended straight past either end."""
    t = min(max(s / step, 0.0), len(points) - 1.001)
    i = int(t)
    f = t - i
    p = points[i].lerp(points[i + 1], f)
    tangent = (points[i + 1] - points[i]).normalized()
    if s < 0:
        p = points[0] + tangent * s
    elif s > length:
        p = points[-1] + (points[-1] - points[-2]).normalized() * (s - length)
    yaw = yaws[i] + (yaws[i + 1] - yaws[i]) * f
    across = Vector((-math.sin(yaw), 0.0, math.cos(yaw)))
    up = across.cross(tangent).normalized()
    roll = bank + math.radians(ROLL) * max(0.0, 1 - s / (length * 0.55)) ** 2
    c, sn = math.cos(roll), math.sin(roll)
    return p, across * c + up * sn, up * c - across * sn


def stations(phase=0.0):
    out = [i / RINGS for i in range(RINGS + 1)]
    for at, _ in NOTCHES:
        at += phase
        for k in (-1.4, -1.03, -0.6, -0.18, 0.18, 0.6, 1.03, 1.4):
            out.append(at + k * NOTCH_HALF)
    out = sorted(v for v in out if 0.0 <= v <= 1.0)
    keep = [out[0]]
    for v in out[1:]:
        if v - keep[-1] > 3e-4:
            keep.append(v)
    return keep


def build_frond(index, material):
    cfg = FRONDS[index]
    length = cfg['length']
    points, yaws, step = spine_of(cfg)
    turn = math.radians(cfg['turn'])
    spin, spun = math.cos(turn), math.sin(turn)
    scale = cfg['wide'] * length
    ease = SLANT_EASE * BLADE_W * length
    bank = -math.radians(BANK) * math.cos(turn)

    rings = []
    for sigma in stations(cfg['phase']):
        section = cross_section(sigma, cfg['phase'])
        ring = []
        for w, h in section:
            w, h = w * scale, h * scale
            shift = SLANT * (math.sqrt(w * w + ease * ease) - ease)
            p, across, up = frame_at(points, yaws, step, length, sigma * length + shift, bank)
            q = p + across * w + up * h
            x, y, z = q.x + CROWN_R, q.y + CROWN_Y, q.z
            ring.append((x * spin - z * spun, y, x * spun + z * spin))
        rings.append(ring)
    return loft('palm-frond-%d' % index, rings, cap=True, levels=0, material=material)


def build(parameters):
    part = parameters.get('part', 'all')
    leaf = parameters.get('leaf', 'leaf')
    bark = parameters.get('bark', 'bark')
    if part == 'trunk':
        return [build_trunk(bark)]
    if part in ('fronds-a', 'fronds-b'):
        first = 0 if part == 'fronds-a' else 1
        return [build_frond(i, leaf) for i in range(first, len(FRONDS), 2)]
    if part == 'all':
        return [build_trunk(bark)] + [build_frond(i, leaf) for i in range(len(FRONDS))]
    raise ValueError('part must be trunk, fronds-a, fronds-b or all; got %r' % (part,))
