"""Low-top running shoe: lofted outsole, midsole and upper over one station table."""
import math
from modeling import loft, sweep, mesh, subdivision


# x, outsole bottom, outsole top, midsole top, upper top, half width.
# Heel at -x, toe at +x. The ground run is flat between the heel and the ball;
# both ends lift, which is what gives a shoe its rocker.
STATIONS = [
    (-0.135, 0.024, 0.033, 0.062, 0.098, 0.0230),
    (-0.122, 0.010, 0.020, 0.058, 0.118, 0.0300),
    (-0.100, 0.001, 0.011, 0.053, 0.126, 0.0345),
    (-0.070, 0.000, 0.010, 0.046, 0.118, 0.0378),
    (-0.030, 0.000, 0.010, 0.040, 0.102, 0.0408),
    ( 0.010, 0.000, 0.010, 0.036, 0.088, 0.0442),
    ( 0.050, 0.000, 0.010, 0.034, 0.075, 0.0470),
    ( 0.085, 0.001, 0.011, 0.033, 0.063, 0.0452),
    ( 0.110, 0.006, 0.015, 0.034, 0.054, 0.0400),
    ( 0.128, 0.013, 0.021, 0.037, 0.048, 0.0330),
    ( 0.141, 0.021, 0.028, 0.040, 0.044, 0.0205),
]


def ring(x, y0, y1, half_w, squareness=3.2, count=28):
    """Superellipse cross-section: rounder than a box, flatter than an ellipse,
    which is what a shoe section looks like."""
    yc, h = (y0 + y1) / 2, (y1 - y0) / 2
    pts = []
    for i in range(count):
        a = math.tau * i / count
        cz, cy = math.cos(a), math.sin(a)
        e = 2 / squareness
        pts.append((x,
                    yc + h * math.copysign(abs(cy) ** e, cy),
                    half_w * math.copysign(abs(cz) ** e, cz)))
    return pts


def layer(name, lo, hi, scale, material, squareness=3.2, levels=2, stations=None):
    rings = []
    for x, sole, out, mid, up, w in (stations or STATIONS):
        bands = {'sole': sole, 'out': out, 'mid': mid, 'up': up}
        rings.append(ring(x, bands[lo], bands[hi], w * scale, squareness))
    return loft(name, rings, levels=levels, material=material)


def collar(name, material):
    """Padded rim around the ankle opening: a tube swept round a tilted ellipse."""
    cx, cy, cz = -0.068, 0.114, 0.0
    ax, az, tilt = 0.050, 0.032, math.radians(18)
    centers, radii = [], []
    for i in range(48):
        a = math.tau * i / 48
        px, pz = ax * math.cos(a), az * math.sin(a)
        centers.append((cx + px, cy + px * math.tan(tilt), cz + pz))
        radii.append(0.0072)
    centers.append(centers[0]); radii.append(radii[0])
    obj = sweep(name, centers, radii, segments=14, levels=1)
    obj['material_key'] = material
    return obj


def opening(name, material):
    """A recessed dome inside the collar. The upper is a closed loft, so without
    this the collar reads as a ring lying on a dome rather than the rim of a hole."""
    cx, cy, tilt = -0.068, 0.108, math.radians(18)
    rings = []
    steps = 9
    for i in range(steps):
        t = i / (steps - 1)
        scale = math.sqrt(max(1e-4, 1 - t * t))
        drop = 0.030 * t
        pts = []
        for j in range(28):
            a = math.tau * j / 28
            px, pz = 0.044 * scale * math.cos(a), 0.027 * scale * math.sin(a)
            pts.append((cx + px, cy + px * math.tan(tilt) - drop, pz))
        rings.append(pts)
    obj = loft(name, rings, levels=1, material=material)
    return obj


def at(x):
    """Interpolate the station table, so details can be placed by x alone."""
    for i in range(len(STATIONS) - 1):
        a, b = STATIONS[i], STATIONS[i + 1]
        if a[0] <= x <= b[0]:
            t = (x - a[0]) / (b[0] - a[0])
            return tuple(a[k] + (b[k] - a[k]) * t for k in range(6))
    return STATIONS[0] if x < STATIONS[0][0] else STATIONS[-1]


def toe_cap(name, material):
    """White cap wrapping the toe, proud of the upper so it reads as a separate
    panel rather than a paint change."""
    rings = []
    for x in (0.045, 0.070, 0.095, 0.115, 0.130, 0.141):
        _, _, _, mid, up, w = at(x)
        top = mid + (up - mid) * (0.95 if x > 0.11 else 0.62)
        rings.append(ring(x, mid - 0.002, top, w * 0.945, 3.0))
    return loft(name, rings, levels=2, material=material)


def tongue(name, material):
    """Fills the front of the ankle opening. Must sit above the upper's surface
    or the closed loft simply swallows it."""
    rings = []
    for t in range(7):
        u = t / 6
        x = -0.062 + 0.070 * u
        _, _, _, mid, up, w = at(x)
        yc = up + 0.001 - 0.006 * u
        half = 0.023 - 0.005 * u
        pts = []
        for j in range(22):
            a = math.tau * j / 22
            pts.append((x, yc + 0.007 * math.sin(a), half * math.cos(a)))
        rings.append(pts)
    return loft(name, rings, levels=2, material=material)


def lace(name, x, material, span=0.019, lift=0.016, sign=1):
    """One strand crossing the instep, arcing clear of the upper."""
    centers, radii = [], []
    steps = 16
    for i in range(steps + 1):
        t = i / steps
        px = x - span + 2 * span * t
        _, _, _, _, up, _ = at(px)
        arc = math.sin(math.pi * t)
        pz = sign * (-0.022 + 0.044 * t)
        centers.append((px, up - 0.006 + lift * arc, pz))
        radii.append(0.0062)
    obj = sweep(name, centers, radii, segments=12, levels=1)
    obj['material_key'] = material
    return obj


def stripe(name, x, material):
    """Angled side bar, embedded into the upper so it sits on the curve."""
    centers, radii = [], []
    steps = 14
    for i in range(steps + 1):
        t = i / steps
        px = x + 0.052 * t
        _, _, _, mid, up, w = at(px)
        y = mid + (up - mid) * (0.46 - 0.26 * t)
        centers.append((px, y, w * 0.93))
        radii.append(0.0070)
    obj = sweep(name, centers, radii, segments=12, levels=1)
    obj['material_key'] = material
    return obj


def build(parameters):
    parts = [
        layer('outsole', 'sole', 'out', 0.95, 'outsole', squareness=4.2),
        layer('midsole', 'out', 'mid', 1.00, 'midsole', squareness=3.4),
        layer('upper', 'mid', 'up', 0.92, 'upper', squareness=2.9),
        opening('opening', 'interior'),
        collar('collar', 'trim'),
        toe_cap('toe-cap', 'trim'),
        tongue('tongue', 'trim'),
    ]
    for i, x in enumerate((-0.006, 0.024, 0.054)):
        parts.append(lace(f'lace-a{i}', x, 'trim', sign=1))
        parts.append(lace(f'lace-b{i}', x, 'trim', sign=-1))
    for i, x in enumerate((-0.028, 0.002, 0.032)):
        parts.append(stripe(f'stripe{i}', x, 'stripe'))
    return parts
