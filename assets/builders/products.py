"""Worked examples: bottle shell, rounded enclosure, furniture assembly."""
import math
from modeling import loft, mesh, bevel, sweep


def rings(profile, segments=48):
    return [[(r*math.cos(i*math.tau/segments),y,r*math.sin(i*math.tau/segments)) for i in range(segments)] for y,r in profile]


def box(name, size, center=(0,0,0), radius=.006, material=None):
    x,y,z=[v/2 for v in size]
    points=[(a+center[0],b+center[1],c+center[2]) for a,b,c in [(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]]
    obj=mesh(name,points,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)],material)
    bevel(obj,radius,6)
    mod=obj.modifiers.new('Planar face normals','WEIGHTED_NORMAL')
    mod.keep_sharp=True
    return obj


def build(p):
    kind=p.get('kind','bottle')
    if kind=='bottle':
        profile=[(.002,.025),(.004,.029),(.01,.03),(.08,.03),(.09,.029),(.10,.024),(.11,.015),(.118,.014),(.14,.014),(.143,.014),(.144,.011),(.141,.0105),(.118,.0105),(.109,.011),(.099,.022),(.089,.026),(.01,.027),(.006,.024)]
        return [loft('bottle-shell',rings(profile),levels=2)]
    if kind=='enclosure':
        return [box('enclosure',(.12,.035,.08),center=(0,.018,0),radius=.01)]
    if kind=='furniture':
        objects=[box('top',(.44,.035,.32),center=(0,.44,0),radius=.012,material='wood')]
        for i,(x,z) in enumerate([(-.17,-.11),(.17,-.11),(-.17,.11),(.17,.11)]):
            leg=sweep(f'leg-{i}',[(x*1.15,.008,z*1.15),(x*1.15,.018,z*1.15),(x,.39,z),(x,.425,z)],[.012]*4,segments=12,levels=2)
            leg['material_key']='steel';objects.append(leg)
        return objects
    raise ValueError('kind must be bottle, enclosure, or furniture')
