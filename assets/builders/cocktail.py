"""Stylized cocktail coupe with a thick glass shell, drink, and olive pick."""
import math
from modeling import mesh, sweep


TAU = math.tau


def lathe(name, profile, material, segments=96):
    """Closed revolution with welded axis poles, never a pinhole down the stem."""
    vertices=[]; rings=[]
    for radius,height in profile:
        if radius < 1e-8:
            rings.append([len(vertices)]);vertices.append((0,height,0))
        else:
            rings.append(list(range(len(vertices),len(vertices)+segments)))
            vertices.extend((radius*math.cos(i*TAU/segments),height,radius*math.sin(i*TAU/segments)) for i in range(segments))
    faces=[]
    for a,b in zip(rings,rings[1:]+rings[:1]):
        if len(a)==len(b)==1:
            continue
        for i in range(segments):
            j=(i+1)%segments
            if len(a)==1: faces.append((a[0],b[j],b[i]))
            elif len(b)==1: faces.append((a[i],a[j],b[0]))
            else: faces.append((a[i],a[j],b[j],b[i]))
    return mesh(name,vertices,faces,material)


def profile_curve(start, spans, steps=8):
    points=[start]
    for a,b,end in spans:
        origin=points[-1]
        for i in range(1,steps+1):
            t=i/steps
            points.append(tuple((1-t)**3*origin[j]+3*(1-t)**2*t*a[j]+3*(1-t)*t*t*b[j]+t**3*end[j] for j in (0,1)))
    return points


def torus(name, center, major_radius, tube_radius, material, major_segments=96, minor_segments=20):
    cx, cy, cz = center
    vertices = []
    for i in range(major_segments):
        a = i * TAU / major_segments
        for j in range(minor_segments):
            b = j * TAU / minor_segments
            radius = major_radius + tube_radius * math.cos(b)
            vertices.append((
                cx + radius * math.cos(a),
                cy + tube_radius * math.sin(b),
                cz + radius * math.sin(a),
            ))
    faces = []
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            faces.append((i * minor_segments + j, ni * minor_segments + j, ni * minor_segments + nj, i * minor_segments + nj))
    return mesh(name, vertices, faces, material)


def ellipsoid(name, center, radii, material, longitude=64, latitude=32):
    cx, cy, cz = center
    rx, ry, rz = radii
    vertices = [(cx, cy + ry, cz), (cx, cy - ry, cz)]
    for lat in range(1, latitude):
        phi = math.pi * lat / latitude
        sin_phi = math.sin(phi)
        vertices.extend(
            (
                cx + rx * sin_phi * math.cos(lon * TAU / longitude),
                cy + ry * math.cos(phi),
                cz + rz * sin_phi * math.sin(lon * TAU / longitude),
            )
            for lon in range(longitude)
        )
    faces = []
    first_ring = 2
    faces.extend((0, first_ring + i, first_ring + (i + 1) % longitude) for i in range(longitude))
    for lat in range(latitude - 2):
        ring = first_ring + lat * longitude
        next_ring = ring + longitude
        for i in range(longitude):
            j = (i + 1) % longitude
            faces.append((ring + i, next_ring + i, next_ring + j, ring + j))
    last_ring = first_ring + (latitude - 2) * longitude
    faces.extend((1, last_ring + (i + 1) % longitude, last_ring + i) for i in range(longitude))
    return mesh(name, vertices, faces, material)


def build_glass():
    foot_stem=profile_curve((0,.003),[
        ((.030,.003),(.072,.003),(.083,.007)),
        ((.095,.009),(.096,.021),(.085,.027)),
        ((.074,.034),(.047,.035),(.033,.036)),
        ((.030,.036),(.035,.039),(.030,.043)),
        ((.019,.048),(.017,.054),(.017,.071)),
        ((.016,.085),(.016,.107),(.019,.119)),
        ((.020,.127),(.027,.135),(.029,.145)),
        ((.020,.146),(.007,.146),(0,.146)),
    ])
    # Smooth thin wall, separate optical material from the heavy opaque foot.
    bowl=profile_curve((.021,.131),[
        ((.023,.137),(.032,.144),(.041,.154)),
        ((.068,.183),(.107,.223),(.137,.253)),
        ((.142,.258),(.143,.263),(.140,.267)),
        ((.138,.270),(.133,.270),(.131,.266)),
        ((.129,.262),(.127,.257),(.123,.253)),
        ((.101,.229),(.060,.187),(.033,.159)),
        ((.022,.148),(.016,.140),(.016,.133)),
        ((.016,.130),(.019,.129),(.021,.131)),
    ])[:-1]
    drink=profile_curve((0,.147),[
        ((.012,.147),(.019,.150),(.028,.159)),
        ((.050,.182),(.096,.226),(.121,.251)),
        ((.123,.253),(.124,.255),(.121,.256)),
        ((.096,.255),(.035,.255),(0,.255)),
    ])
    # Match the reference's slender stem and compact foot.
    foot_stem=[(r*(.92 if y<.044 else (.86 if y<.12 else 1.0)),y) for r,y in foot_stem]
    bowl=[(r*.95,y) for r,y in bowl]
    drink=[(r*.95,y) for r,y in drink]
    return [lathe('solid-foot-and-flowing-stem',foot_stem,'glass_solid'),
            lathe('thin-blue-glass-bowl',bowl,'glass'),
            lathe('pink-cocktail',drink,'drink'),
            torus('polished-rolled-rim',(0,.264,0),.1297,.0070,'glass_solid',128,20)]


def orient(obj, center, normal):
    from mathutils import Vector
    n=Vector(normal).normalized()
    u=Vector((0,1,0)).cross(n).normalized()
    v=u.cross(n).normalized()
    for vertex in obj.data.vertices:
        local=vertex.co.copy()
        point=Vector(center)+u*local.x+n*local.z+v*(-local.y)
        vertex.co=(point.x,-point.z,point.y)
    return obj


def build_garnish():
    # One straight capsule runs through the olive; the lower end is submerged.
    a=(.021,.223,.023); b=(.153,.383,.023)
    axis=tuple(b[i]-a[i] for i in range(3))
    length=math.sqrt(sum(x*x for x in axis))
    pick_profile=profile_curve((0,0),[
        ((.002,0),(.004,.001),(.004,.004)),
        ((.0045,.04),(.007,length-.03),(.008,length-.010)),
        ((.008,length-.004),(.005,length),(0,length)),
    ])
    pick=orient(lathe('single-rounded-golden-pick',pick_profile,'wood',48),a,axis)
    center=(.082,.303,.025); normal=(-.56,.28,.78)
    # The olive has a real rolled opening and recessed pimento socket.
    olive_profile=[(0,-.044)]
    for i in range(1,43):
        angle=math.pi-(math.pi-.42)*i/42
        olive_profile.append((.046*math.sin(angle),.044*math.cos(angle)))
    olive_profile+=profile_curve(olive_profile[-1],[
        ((.016,.042),(.0135,.040),(.0135,.035)),
        ((.0135,.030),(.007,.029),(0,.029)),
    ],6)[1:]
    olive_profile=[(r*.95,y*.95) for r,y in olive_profile]
    olive=orient(lathe('olive-with-recessed-socket',olive_profile,'olive',80),center,normal)
    pimento_profile=profile_curve((0,.030),[
        ((.008,.030),(.0125,.032),(.013,.035)),
        ((.013,.039),(.008,.040),(0,.040)),
    ])
    pimento_profile=[(r*.95,y*.95) for r,y in pimento_profile]
    pimento=orient(lathe('recessed-red-pimento',pimento_profile,'pimento',64),center,normal)
    return [pick,olive,pimento]


def build(parameters):
    part=parameters.get('part','glass')
    if part=='glass': return build_glass()
    if part=='garnish': return build_garnish()
    raise ValueError('part must be glass or garnish')
