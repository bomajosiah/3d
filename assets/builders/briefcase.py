"""Soft, compact travel briefcase with wraparound leather trim and stickers."""
import math
from modeling import bevel, mesh, sweep, loft


TAU = math.tau


def rounded_box(name, center, size, radius, material, segments=6):
    cx, cy, cz = center
    sx, sy, sz = size
    radius = min(radius, min(sx, sy, sz) * 0.4)
    vertices = [
        (cx + x * sx / 2, cy + y * sy / 2, cz + z * sz / 2)
        for z in (-1, 1)
        for y in (-1, 1)
        for x in (-1, 1)
    ]
    faces = [
        (0, 1, 3, 2), (4, 6, 7, 5),
        (0, 4, 5, 1), (2, 3, 7, 6),
        (0, 2, 6, 4), (1, 5, 7, 3),
    ]
    return bevel(mesh(name, vertices, faces, material), radius, segments)


def prism(name, outline, z, depth, material, bevel_width=0.0, segments=3):
    clean = []
    for point in outline:
        if not clean or math.dist(point, clean[-1]) > 1e-7:
            clean.append(point)
    if len(clean) > 2 and math.dist(clean[0], clean[-1]) < 1e-7:
        clean.pop()
    outline = clean
    count = len(outline)
    vertices = [(x, y, z - depth / 2) for x, y in outline]
    vertices += [(x, y, z + depth / 2) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, j + count, i + count))
    obj = mesh(name, vertices, faces, material)
    return bevel(obj, bevel_width, segments) if bevel_width else obj


def ellipse(name, center, radii, z, depth, material, segments=48, bevel_width=0.0):
    cx, cy = center
    rx, ry = radii
    outline = [
        (cx + rx * math.cos(i * TAU / segments), cy + ry * math.sin(i * TAU / segments))
        for i in range(segments)
    ]
    return prism(name, outline, z, depth, material, bevel_width, 3)


def rounded_rect_outline(center, size, radius, corner_segments=5):
    cx, cy = center
    width, height = size
    r = min(radius, width / 2, height / 2)
    result = []
    for ox, oy, start in (
        (width / 2 - r, height / 2 - r, 0),
        (-width / 2 + r, height / 2 - r, math.pi / 2),
        (-width / 2 + r, -height / 2 + r, math.pi),
        (width / 2 - r, -height / 2 + r, 3 * math.pi / 2),
    ):
        for i in range(corner_segments + 1):
            angle = start + i * math.pi / 2 / corner_segments
            result.append((cx + ox + r * math.cos(angle), cy + oy + r * math.sin(angle)))
    return result


def rotated_outline(points, center, degrees):
    cx, cy = center
    angle = math.radians(degrees)
    c, s = math.cos(angle), math.sin(angle)
    return [(cx + x * c - y * s, cy + x * s + y * c) for x, y in points]


def curves(start, segments, steps=12):
    """Sample cubic Beziers; artwork stays editable instead of baked pixels."""
    points = [start]
    for a, b, end in segments:
        origin = points[-1]
        for i in range(1, steps + 1):
            t = i / steps
            points.append(tuple((1-t)**3*origin[j] + 3*(1-t)**2*t*a[j] +
                                3*(1-t)*t*t*b[j] + t**3*end[j] for j in (0, 1)))
    return points


def clip_convex(subject, boundary):
    # Clip printed illustrations to their die-cut sky, including curved hills.
    for a, b in zip(boundary, boundary[1:] + boundary[:1]):
        def side(p):
            return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])
        output = []
        if not subject:
            break
        previous = subject[-1]
        for current in subject:
            p, q = side(previous), side(current)
            if (p >= 0) != (q >= 0):
                t = p / (p-q)
                output.append(tuple(previous[j]+t*(current[j]-previous[j]) for j in (0,1)))
            if q >= 0:
                output.append(current)
            previous = current
        subject = output
    return subject


def wrap_band(name, x, width, material, height=.270, depth=.142):
    # One continuous rounded band wraps the front, top, back and bottom.
    rings = []
    for dx, inset in [(-width/2,.003),(-width/2+.002,0),
                      (width/2-.002,0),(width/2,.003)]:
        outline = rounded_rect_outline((.143,0), (height-2*inset,depth-2*inset), .034, 9)
        rings.append([(x+dx, y, z) for y,z in outline])
    return loft(name, rings, levels=2, material=material)


def collar(name, x):
    rings=[]
    for y, r in [(.276,.016),(.278,.020),(.285,.020),(.290,.017)]:
        rings.append([(x+r*math.cos(i*TAU/32),y,.005+r*.82*math.sin(i*TAU/32)) for i in range(32)])
    return loft(name,rings,levels=2,material='gold')


def build_stickers():
    parts=[]
    def badge(name, outline, center, size, material, layer=0, angle=0, clip=None):
        if clip is not None:
            outline=clip_convex(outline,clip)
        transformed=rotated_outline([(x*size[0]/2,y*size[1]/2) for x,y in outline],center,angle)
        depth=.0022 if layer==0 else .00035
        z=.0653 + (.0012 if layer else 0) + layer*.0004
        obj=prism(name,transformed,z,depth,material,.00065 if layer==0 else 0,4)
        # Printed faces must stay planar; smooth normals would invent dents.
        for face in obj.data.polygons:
            face.use_smooth=False
        parts.append(obj)
    oval=[(math.cos(i*TAU/96),math.sin(i*TAU/96)) for i in range(96)]
    center=(-.024,.207); size=(.091,.065)
    badge('scenic-white-border',oval,center,size,'sticker_white')
    sky=[(x*.84,y*.79) for x,y in oval]
    badge('scenic-cyan-sky',sky,center,size,'sky',1)
    sun=[(.34+.175*x,.34+.25*y) for x,y in oval]
    badge('scenic-yellow-sun',sun,center,size,'sun',2,clip=sky)
    mountain=curves((-.95,-.38),[
        ((-.79,-.14),(-.51,.50),(-.41,.48)),
        ((-.35,.48),(-.05,.08),(.25,-.38)),
        ((-.05,-.65),(-.70,-.65),(-.95,-.38))])
    badge('scenic-slate-mountain',mountain,center,size,'mountain',2,clip=sky)
    hill=curves((-1,-.4),[
        ((-.62,-.18),(-.32,-.26),(.08,-.48)),
        ((.38,-.68),(.65,-.84),(1,-1)),
        ((.4,-1.2),(-.6,-1.2),(-1,-.4))])
    right=curves((-.15,-.63),[
        ((.11,-.26),(.60,-.20),(1,-.25)),
        ((1,-.70),(.8,-.90),(.5,-1)),
        ((.2,-1),(.03,-.77),(-.15,-.63))])
    badge('scenic-right-green-hill',right,center,size,'green',3,clip=sky)
    badge('scenic-left-lime-hill',hill,center,size,'green_light',4,clip=sky)
    # A narrow turquoise foreground follows the lower ellipse, as in the reference.
    water=curves((-1,-.54),[((-.5,-.57),(.1,-.69),(1,-.67)),((1,-1.1),(-1,-1.1),(-1,-.54))])
    badge('scenic-turquoise-water',water,center,size,'water',5,clip=sky)

    center=(-.049,.137); size=(.050,.059)
    triangle=curves((-.97,-.34),[
        ((-.99,-.22),(-.80,-.03),(.20,.94)),
        ((.32,1.06),(.46,1.05),(.52,.83)),
        ((.65,.30),(.87,-.60),(.96,-.87)),
        ((1,-1.07),(.82,-1.00),(.69,-.94)),
        ((.12,-.71),(-.57,-.45),(-.87,-.39)),
        ((-.93,-.37),(-.96,-.36),(-.97,-.34))])
    triangle.reverse()
    badge('beach-white-border',triangle,center,size,'sticker_white')
    inner=[(x*.76,y*.78) for x,y in triangle]
    badge('beach-blue-sky',inner,center,size,'beach_sky',1)
    sand=curves((-1,-.30),[((-.5,-.10),(.18,-.36),(1,-.53)),((1,-1.3),(-1,-1.3),(-1,-.30))])
    badge('beach-golden-sand',sand,center,size,'sand',2,clip=inner)
    trunk=curves((-.22,-.59),[((-.15,-.25),(-.04,.07),(.13,.30)),((.20,.35),(.25,.27),(.20,.14)),((.07,-.03),(-.03,-.36),(-.06,-.67)),((-.12,-.66),(-.18,-.62),(-.22,-.59))])
    badge('palm-curved-trunk',trunk,center,size,'palm_trunk',3,clip=inner)
    leaves=[
      curves((.12,.22),[((-.03,.62),(-.30,.62),(-.28,.44)),((-.16,.41),(-.01,.36),(.12,.22))]),
      curves((.12,.22),[((-.17,.48),(-.56,.31),(-.53,.15)),((-.32,.20),(-.08,.22),(.12,.22))]),
      curves((.12,.22),[((.23,.55),(.50,.39),(.59,.12)),((.40,.23),(.25,.26),(.12,.22))]),
      curves((.12,.22),[((.50,.16),(.51,-.12),(.35,-.29)),((.30,-.33),(.26,-.01),(.12,.22))]),
      curves((.12,.22),[((.08,.44),(.16,.57),(.25,.60)),((.40,.41),(.23,.29),(.12,.22))]),
    ]
    for i,leaf in enumerate(leaves):
        badge('palm-frond-'+str(i),leaf,center,size,'palm_green',4,clip=inner)

    center=(.013,.117); size=(.046,.073); angle=12
    outer=rounded_rect_outline((0,0),(2,2),.20,8)
    inner=rounded_rect_outline((0,0),(1.56,1.66),.10,8)
    def tower(name,shape,material,layer):
        badge(name,shape,center,size,material,layer,angle,inner if layer>1 else None)
    tower('lighthouse-white-border',outer,'sticker_white',0)
    tower('lighthouse-blue-sky',inner,'beach_sky',1)
    tower('lighthouse-tapered-red-tower',[(-.53,-.68),(.52,-.68),(.27,.13),(-.25,.13)],'red',2)
    base=curves((-.76,-.84),[((-.79,-.57),(-.66,-.43),(-.47,-.43)),((-.1,-.44),(.30,-.42),(.43,-.44)),((.63,-.45),(.76,-.65),(.77,-.84)),((.3,-.86),(-.3,-.86),(-.76,-.84))])
    tower('lighthouse-rounded-red-foot',base,'red_light',3)
    tower('lighthouse-lantern',[(-.22,.17),(.24,.17),(.24,.39),(-.22,.39)],'lantern',3)
    tower('lighthouse-slate-gallery',rounded_rect_outline((0,.16),(.88,.15),.035,4),'mountain',4)
    roof=curves((-.35,.40),[((-.29,.48),(-.08,.69),(-.025,.70)),((.02,.74),(.28,.48),(.35,.40)),((.14,.37),(-.14,.37),(-.35,.40))])
    tower('lighthouse-red-roof',roof,'red_light',4)
    return parts


def build_body():
    parts=[rounded_box('orange-shell',(0,.143,0),(.354,.268,.128),.034,'orange',12)]
    for side,x in [('left',-.145),('right',.145)]:
        parts.append(wrap_band(side+'-rounded-end-guard',x,.035,'leather',.272,.139))
    for side,x in [('left',-.084),('right',.084)]:
        parts.append(wrap_band(side+'-continuous-strap',x,.034,'leather'))
        # Gold button follows the top shoulder, with its face tilted upward.
        rivet=ellipse(side+'-gold-rivet',(x,.268),(.008,.0055),.068,.003,'gold',48,.0008)
        for vertex in rivet.data.vertices:
            y,z=vertex.co.z-.268,-vertex.co.y-.068
            angle=math.radians(42)
            vertex.co.z=.268+y*math.cos(angle)-z*math.sin(angle)
            vertex.co.y=-(.068+y*math.sin(angle)+z*math.cos(angle))
        parts.append(rivet)
    parts.extend([collar('left-gold-handle-collar',-.046),collar('right-gold-handle-collar',.046)])
    return parts+build_stickers()


def build_handle():
    centers=[(-.046,.284,.005),(-.046,.305,.005),(-.043,.323,.005),
             (-.033,.336,.005),(-.016,.340,.005),(.016,.340,.005),
             (.033,.336,.005),(.043,.323,.005),(.046,.305,.005),(.046,.284,.005)]
    handle=sweep('rounded-leather-handle',centers,[.014]*len(centers),segments=24,levels=2)
    handle['material_key']='leather'
    return [handle]


def build(parameters):
    part=parameters.get('part','body')
    if part=='body':
        return build_body()
    if part=='handle':
        return build_handle()
    raise ValueError('part must be body or handle')
