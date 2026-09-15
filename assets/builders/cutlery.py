"""Continuous product cutlery. Parameters: kind, width, bowl_depth, subdivision.
Each utensil is one closed surface; no intersecting handle/head assemblies.
"""
import math
from modeling import loft, mesh, subdivision


def spoon(p):
    # y, half width, edge height, top rise, bowl depth, lower thickness
    sections = [
      (.001,.002,0,.001,0,.001), (.003,.010,0,.003,0,.003),
      (.008,.014,0,.004,0,.004), (.018,.0147,0,.0044,0,.0044),
      (.035,.0135,0,.0044,0,.0044), (.060,.011,0,.004,0,.004),
      (.090,.008,0,.0035,0,.0035), (.115,.0065,0,.003,0,.003),
      (.132,.0065,.001,.0027,0,.0027), (.142,.008,.002,.0025,.001,.0025),
      (.152,.016,.004,.003,.006,.003), (.166,.028,.006,.0035,.012,.003),
      (.184,.032,.008,.004,.015,.003), (.200,.030,.010,.004,.013,.003),
      (.214,.025,.012,.003,.008,.003), (.224,.019,.013,.002,.003,.002),
      (.231,.011,.013,.001,.001,.001), (.234,.002,.013,.0004,0,.0004),
    ]
    rings = []
    for y,w,z,rise,depth,thickness in sections:
        if y < .132: rise *= 1.65; thickness *= 1.65; w *= 1.18
        if y >= .152: rise *= p.get('rim_strength',2)
        ring=[]
        for i in range(32):
            t=math.tau*i/32
            c,s=math.cos(t),math.sin(t)
            surface = z + (rise*s if s>=0 else thickness*s) - depth*s*s*p.get('bowl_depth',1.2)
            ring.append((w*c*p.get('width',1), y, surface))
        rings.append(ring)
    return loft('spoon',rings,levels=int(p.get('subdivision',2)))


def fork(p):
    # Quad top/bottom patches with shared edge vertices; branch four fingers
    # from a single palm. Subdivision rounds the slots and transitions.
    xs=[-1,-.84,-.68,-.44,-.28,-.12,.12,.28,.44,.68,.84,1]
    rows=[(.001,.006,.002),(.004,.012,.003),(.010,.014,.004),(.023,.0147,.0044),
          (.05,.012,.004),(.085,.0085,.0036),(.115,.0065,.003),(.132,.0065,.003),
          (.143,.010,.0035),(.153,.020,.004),(.164,.023,.0042),(.174,.024,.004),
          (.180,.024,.0038),(.188,.0238,.0034),(.21,.0226,.0028),(.223,.0217,.0024),(.227,.0213,.0018),(.229,.0213,.0009)]
    vertices=[]
    for side in [1,-1]:
        for row,(y,w,h) in enumerate(rows):
            w *= 1.18 if y < .132 else 1.08
            for col,x in enumerate(xs):
                if row == len(rows)-1:
                    start = (col // 3)*3
                    center = xs[start+1]
                    x = center + (x-center)*.35

                # Rounded across the palm; thickness varies into the neck.
                z=side*h*(1.65 if y < .132 else 1)*(.55+.45*math.sqrt(max(0,1-x*x)))
                vertices.append((x*w*p.get('width',1),y,z))
    n=len(xs); offset=len(rows)*n
    faces=[]
    edges={}
    # Gap intervals: 2,5,8. Removing top quads creates three slots.
    for row in range(len(rows)-1):
        for col in range(n-1):
            if row>=11 and col in [2,5,8]: continue
            a=row*n+col; b=a+1; c=b+n; d=a+n
            faces.append((a,b,c,d)); faces.append((a+offset,d+offset,c+offset,b+offset))
            for u,v in [(a,b),(b,c),(c,d),(d,a)]:
                key=tuple(sorted((u,v)))
                if key in edges: del edges[key]
                else: edges[key]=(u,v)
    for u,v in edges.values(): faces.append((v,u,u+offset,v+offset))
    # Remove unused grid vertices inside slots.
    used=sorted({v for face in faces for v in face}); remap={v:i for i,v in enumerate(used)}
    obj=mesh('fork',[vertices[i] for i in used],[tuple(remap[i] for i in f) for f in faces])
    return subdivision(obj,int(p.get('subdivision',3)))


def build(parameters):
    kind=parameters.get('kind','spoon')
    if kind not in ['spoon','fork']: raise ValueError('kind must be spoon or fork')
    obj = spoon(parameters) if kind=='spoon' else fork(parameters)
    # Move mesh coordinates to a central animation pivot, in Blender Z (scene Y).
    for v in obj.data.vertices:
        if kind == 'spoon': v.co.z *= .978
        v.co.z -= .115
    return [obj]
