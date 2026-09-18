"""Chunky running shoe icon: lugged outsole, wedge midsole, panelled grey upper.

One station table drives everything. Each row is a slice across the shoe at a
given x — heel at -x, toe at +x — listing the heights where the layers meet and
the half width there, so the sole, the upper and every panel laid on the upper
move together when a station moves. `at` reads the table back at any x with a
Catmull-Rom pass; linear interpolation puts a visible crease in the topline at
each knot, which on a glossy surface reads as a dent.

Panels (toe bumper, heel counter, stripes, eyestay) are separate solids that sit
*through* the upper's surface rather than on it: each one's inner face is sunk a
little below the surface it decorates, so the join is a clean silhouette edge
instead of two coincident faces fighting for the same pixels.
"""
import math

from modeling import bevel, loft, mesh, solidify, subdivision, sweep

# x, outsole bottom, outsole top, midsole top, upper top, half width — metres.
# Heights are measured from the ground. The run between the heel and the ball is
# flat; both ends lift, which is what gives the shoe its rocker.
STATIONS = [
    (-0.1400, 0.0400, 0.0480, 0.0620, 0.0980, 0.0190),
    (-0.1320, 0.0200, 0.0288, 0.0500, 0.1280, 0.0262),
    (-0.1180, 0.0060, 0.0150, 0.0400, 0.1500, 0.0316),
    (-0.0980, 0.0010, 0.0100, 0.0340, 0.1600, 0.0348),
    (-0.0700, 0.0000, 0.0090, 0.0310, 0.1580, 0.0368),
    (-0.0280, 0.0000, 0.0090, 0.0292, 0.1420, 0.0390),
    ( 0.0140, 0.0000, 0.0090, 0.0284, 0.1160, 0.0414),
    ( 0.0560, 0.0020, 0.0110, 0.0288, 0.0950, 0.0432),
    ( 0.0900, 0.0070, 0.0158, 0.0315, 0.0840, 0.0420),
    ( 0.1180, 0.0180, 0.0262, 0.0392, 0.0782, 0.0350),
    ( 0.1400, 0.0340, 0.0410, 0.0520, 0.0720, 0.0200),
]

OUTSOLE_SQ = 4.4       # cross-section squareness: the sole is nearly a slab
MIDSOLE_SQ = 3.6
UPPER_SQ = 2.9         # the upper is the roundest layer
UPPER_SCALE = 0.925    # the upper sits inside the midsole's edge

LUG_PITCH = 0.0233     # tread bars along the sole
LUG_DEPTH = 0.0036
LUG_FROM, LUG_TO = -0.1300, 0.1150


def at(x):
    """Read the station table at any x, smoothly (Catmull-Rom on each column)."""
    if x <= STATIONS[0][0]:
        return STATIONS[0]
    if x >= STATIONS[-1][0]:
        return STATIONS[-1]
    i = 0
    while STATIONS[i + 1][0] < x:
        i += 1
    p0 = STATIONS[max(0, i - 1)]
    p1, p2 = STATIONS[i], STATIONS[i + 1]
    p3 = STATIONS[min(len(STATIONS) - 1, i + 2)]
    t = (x - p1[0]) / (p2[0] - p1[0])
    out = [x]
    for k in range(1, 6):
        a, b, c, d = p0[k], p1[k], p2[k], p3[k]
        out.append(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                          + (3 * b - a - 3 * c + d) * t * t * t))
    return tuple(out)


def ring(x, y0, y1, half_w, squareness, count=30):
    """Superellipse section: rounder than a box, flatter than an ellipse."""
    yc, h = (y0 + y1) / 2, (y1 - y0) / 2
    e = 2 / squareness
    pts = []
    for i in range(count):
        a = math.tau * i / count
        cz, cy = math.cos(a), math.sin(a)
        pts.append((x, yc + h * math.copysign(abs(cy) ** e, cy),
                    half_w * math.copysign(abs(cz) ** e, cz)))
    return pts


def surface_z(x, y, scale=UPPER_SCALE, squareness=UPPER_SQ):
    """Half width of the upper's outer surface at (x, y) — where panels sit."""
    _, _, _, mid, up, w = at(x)
    yc, h = (mid + up) / 2, (up - mid) / 2
    if h <= 1e-6:
        return 0.0
    t = min(1.0, abs((y - yc) / h))
    return w * scale * max(0.0, 1 - t ** squareness) ** (1 / squareness)


# --- sole ------------------------------------------------------------------

def lug_drop(x):
    """How far the tread bar at x hangs below the sole line."""
    if not LUG_FROM <= x <= LUG_TO:
        return 0.0
    phase = (x - LUG_FROM) / LUG_PITCH
    gap = abs(phase - round(phase)) * 2.0          # 0 mid-bar, 1 in the gap
    fade = min(1.0, (x - LUG_FROM) / 0.018, (LUG_TO - x) / 0.018)
    return LUG_DEPTH * fade * max(0.0, 1 - gap ** 2.6) ** 0.55


def build_outsole(material):
    rings = []
    x = STATIONS[0][0]
    while x <= STATIONS[-1][0] + 1e-9:
        _, lo, hi, _, _, w = at(x)
        rings.append(ring(x, lo - lug_drop(x), hi, w * 0.965, OUTSOLE_SQ))
        x += 0.0022
    return loft('shoe-outsole', rings, levels=1, material=material)


def build_midsole(material):
    rings = []
    x = STATIONS[0][0]
    while x <= STATIONS[-1][0] + 1e-9:
        _, _, lo, hi, _, w = at(x)
        rings.append(ring(x, lo, hi, w, MIDSOLE_SQ))
        x += 0.0035
    return loft('shoe-midsole', rings, levels=1, material=material)


def build_upper(material):
    rings = []
    x = STATIONS[0][0]
    while x <= STATIONS[-1][0] + 1e-9:
        _, _, _, lo, hi, w = at(x)
        rings.append(ring(x, lo - 0.004, hi, w * UPPER_SCALE, UPPER_SQ))
        x += 0.0035
    return loft('shoe-upper', rings, levels=1, material=material)


# --- ankle -----------------------------------------------------------------

COLLAR_AT = (-0.0715, 0.1390)   # centre of the ankle opening
COLLAR_R = (0.0455, 0.0292)     # half length, half width
COLLAR_TILT = 20                # degrees, nose-up along the shoe
COLLAR_TUBE = 0.0088


def collar_point(a):
    px, pz = COLLAR_R[0] * math.cos(a), COLLAR_R[1] * math.sin(a)
    return (COLLAR_AT[0] + px, COLLAR_AT[1] + px * math.tan(math.radians(COLLAR_TILT)), pz)


def build_collar(material):
    """Padded rim around the ankle opening."""
    centers = [collar_point(math.tau * i / 56) for i in range(56)]
    centers.append(centers[0])
    obj = sweep('shoe-collar', centers, [COLLAR_TUBE] * len(centers), segments=16, levels=1)
    obj['material_key'] = material
    return obj


def build_opening(material):
    """A dish sunk inside the collar. The upper is a closed sock, so without this
    the collar reads as a ring resting on a dome rather than the rim of a hole."""
    rings, steps = [], 10
    for i in range(steps):
        t = i / (steps - 1)
        scale = math.sqrt(max(1e-4, 1 - t * t))
        drop = 0.042 * t
        pts = []
        for j in range(30):
            a = math.tau * j / 30
            px, pz = COLLAR_R[0] * 0.96 * scale * math.cos(a), COLLAR_R[1] * 0.96 * scale * math.sin(a)
            pts.append((COLLAR_AT[0] + px,
                        COLLAR_AT[1] + px * math.tan(math.radians(COLLAR_TILT)) - drop, pz))
        rings.append(pts)
    return loft('shoe-opening', rings, levels=1, material=material)


def build_tongue(material):
    """Padded slab filling the throat, standing proud of the upper so the closed
    sock underneath does not swallow it."""
    rings = []
    for i in range(9):
        u = i / 8
        x = -0.1020 + 0.1150 * u
        _, _, _, _, up, _ = at(x)
        lift = 0.0125 * (1 - u) ** 0.7
        yc = up + 0.0015 + lift
        half = 0.0250 - 0.0070 * u ** 1.6
        thick = 0.0090 - 0.0030 * u
        pts = []
        for j in range(24):
            a = math.tau * j / 24
            pts.append((x, yc + thick * math.sin(a), half * math.cos(a)))
        rings.append(pts)
    return loft('shoe-tongue', rings, levels=2, material=material)


# --- panels laid on the upper ----------------------------------------------

def band(name, path, material, levels=2, count=22):
    """A rounded bar swept along `path` = [(x, y, z, radius), ...]."""
    obj = sweep(name, [(p[0], p[1], p[2]) for p in path], [p[3] for p in path],
                segments=count, levels=levels)
    obj['material_key'] = material
    return obj


TOE_FROM = 0.0520


def build_toe_cap(material):
    """White bumper round the toe. Its back edge sinks under the upper so the
    panel ends on a silhouette edge rather than a seam of coincident faces."""
    rings = []
    x = TOE_FROM
    while x <= 0.1400 + 1e-9:
        u = min(1.0, (x - TOE_FROM) / (0.1400 - TOE_FROM))
        _, _, _, mid, up, w = at(x)
        proud = -0.0016 + 0.0042 * min(1.0, u / 0.22)     # sunk at the back, proud ahead
        top = mid + (up - mid) * (0.42 + 0.62 * u ** 1.4)
        rings.append(ring(x, mid - 0.0055, min(top, up + 0.002),
                          w * UPPER_SCALE + proud, 2.7))
        x += 0.0032
    return loft('shoe-toe-cap', rings, levels=1, material=material)


def build_heel_counter(material):
    """The light cup around the heel, ending on a curved edge over the arch."""
    rings = []
    x = -0.1420
    while x <= -0.0480 + 1e-9:
        u = (x + 0.1420) / 0.0940
        _, _, _, mid, up, w = at(x)
        proud = 0.0034 * min(1.0, (1 - u) / 0.28) - 0.0014
        top = mid + (up - mid) * (0.94 - 0.42 * max(0.0, u - 0.25) ** 1.2)
        rings.append(ring(x, mid - 0.006, min(top, up - 0.004), w * UPPER_SCALE + proud, 2.8))
        x += 0.0030
    return loft('shoe-heel-counter', rings, levels=1, material=material)


STRIPES = ((-0.0330, 0.0080), (-0.0050, 0.0080), (0.0230, 0.0080))


def build_stripe(index, x0, half, material, side):
    """One of the three side bars: angled forward, laid along the upper's curve."""
    path = []
    steps = 14
    for i in range(steps + 1):
        t = i / steps
        x = x0 + 0.0400 * t
        _, _, _, mid, up, _ = at(x)
        y = mid + (up - mid) * (0.62 - 0.40 * t)
        path.append((x, y, side * (surface_z(x, y) - 0.0026), half))
    return band('shoe-stripe-%s%d' % ('r' if side > 0 else 'l', index), path, material)


def build_eyestay(index, material, side):
    """The lace panel: a flat tab riding the top of the throat, with two eyelets."""
    path = []
    steps = 10
    for i in range(steps + 1):
        t = i / steps
        x = -0.0530 + 0.0330 * t
        _, _, _, mid, up, _ = at(x)
        y = mid + (up - mid) * (0.90 - 0.10 * t)
        path.append((x, y, side * (surface_z(x, y) - 0.0030), 0.0105))
    return band('shoe-eyestay-%s%d' % ('r' if side > 0 else 'l', index), path, material)


def build_eyelet(index, x, material, side):
    _, _, _, mid, up, _ = at(x)
    y = mid + (up - mid) * 0.90
    z = surface_z(x, y) + 0.0044
    path = [(x, y, side * (z - 0.0030), 0.0030), (x, y, side * z, 0.0030)]
    return band('shoe-eyelet-%s%d' % ('r' if side > 0 else 'l', index), path,
                material, levels=1, count=14)


LACES = (-0.0180, 0.0090, 0.0360, 0.0620)


def build_lace(index, x, material):
    """One strand over the throat: it rises off one side, crosses, and tucks in."""
    path = []
    steps = 20
    reach = 0.0250 - 0.0030 * index
    for i in range(steps + 1):
        t = i / steps
        px = x + 0.0130 * (t - 0.5)
        _, _, _, _, up, _ = at(px)
        arc = math.sin(math.pi * t) ** 0.65
        pz = -reach + 2 * reach * t
        radius = 0.0068 * (0.62 + 0.38 * math.sin(math.pi * t) ** 0.4)
        path.append((px, up - 0.0075 + 0.0165 * arc, pz, radius))
    return band('shoe-lace%d' % index, path, material, count=16)


def build(parameters):
    parts = [
        build_outsole('outsole'),
        build_midsole('midsole'),
        build_upper('upper'),
        build_opening('interior'),
        build_toe_cap('trim'),
        build_heel_counter('trim'),
        build_collar('trim'),
        build_tongue('upper'),
    ]
    for side in (1, -1):
        for i, (x0, half) in enumerate(STRIPES):
            parts.append(build_stripe(i, x0, half, 'stripe', side))
        parts.append(build_eyestay(0, 'trim', side))
        for i, x in enumerate((-0.0455, -0.0330)):
            parts.append(build_eyelet(i, x, 'interior', side))
    for i, x in enumerate(LACES):
        parts.append(build_lace(i, x, 'trim'))
    return parts
