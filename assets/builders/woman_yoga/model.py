"""Soft sculpted yoga figure: lotus pose, mudra hands and swept golden hair."""
import math
import bpy
from modeling import mesh, loft, sweep, bevel, subdivision

TAU=math.tau


def ellipsoid(name,center,radii,material,lon=48,lat=24):
    cx,cy,cz=center;rx,ry,rz=radii
    vertices=[(cx,cy+ry,cz),(cx,cy-ry,cz)]
    for j in range(1,lat):
        a=math.pi*j/lat
        vertices.extend((cx+rx*math.sin(a)*math.cos(i*TAU/lon),cy+ry*math.cos(a),cz+rz*math.sin(a)*math.sin(i*TAU/lon)) for i in range(lon))
    faces=[(0,2+i,2+(i+1)%lon) for i in range(lon)]
    for j in range(lat-2):
        a=2+j*lon;b=a+lon
        faces.extend((a+i,b+i,b+(i+1)%lon,a+(i+1)%lon) for i in range(lon))
    last=2+(lat-2)*lon
    faces.extend((1,last+(i+1)%lon,last+i) for i in range(lon))
    return mesh(name,vertices,faces,material)


def curve(start,spans,steps=10):
    result=[start]
    for a,b,end in spans:
        origin=result[-1]
        for i in range(1,steps+1):
            t=i/steps
            result.append(tuple((1-t)**3*origin[j]+3*(1-t)**2*t*a[j]+3*(1-t)*t*t*b[j]+t**3*end[j] for j in range(len(start))))
    if math.dist(result[0],result[-1])<1e-7:result.pop()
    return result


def cushion(name,outline,z,depth,material):
    # Concentric front/back rings produce a domed closed sculpted lock of hair.
    cx=sum(x for x,y in outline)/len(outline);cy=sum(y for x,y in outline)/len(outline)
    vertices=[];rings=[];n=len(outline)
    for scale,offset in [(0,-depth),(.35,-depth*.92),(.7,-depth*.65),(1,0),(.88,depth*.50),(.62,depth*.86),(.3,depth*.98),(0,depth)]:
        if scale==0:
            rings.append([len(vertices)]);vertices.append((cx,cy,z+offset))
        else:
            rings.append(list(range(len(vertices),len(vertices)+n)))
            vertices.extend((cx+(x-cx)*scale,cy+(y-cy)*scale,z+offset) for x,y in outline)
    faces=[]
    for a,b in zip(rings,rings[1:]):
        for i in range(n):
            j=(i+1)%n
            if len(a)==1:faces.append((a[0],b[i],b[j]))
            elif len(b)==1:faces.append((a[i],b[0],a[j]))
            else:faces.append((a[i],b[i],b[j],a[j]))
    return subdivision(mesh(name,vertices,faces,material),1)


def merge_skin(name,parts,voxel=.0013):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    # Apply the control-cage subdivision before fusing the organic joins.
    for obj in parts:
        bpy.context.view_layer.objects.active=obj
        for mod in list(obj.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join();obj=parts[0];obj.name=name
    remesh=obj.modifiers.new('Continuous organic joins','REMESH');remesh.mode='VOXEL';remesh.voxel_size=voxel;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=obj.modifiers.new('Soft sculpted skin','SMOOTH');smooth.factor=1.0;smooth.iterations=4
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=obj.modifiers.new('UI mesh density','DECIMATE');decimate.ratio=.48
    obj['material_key']='skin'
    return obj


def body_loft(name,rows,material,levels=2):
    rings=[[(rx*math.cos(i*TAU/40),y,z+rz*math.sin(i*TAU/40)) for i in range(40)] for y,rx,rz,z in rows]
    return loft(name,rings,levels=levels,material=material)


def torso():
    body=body_loft('torso-and-neck',[(.076,.035,.021,-.006),(.092,.049,.027,-.007),(.133,.041,.026,-.005),(.178,.046,.029,-.003),(.202,.058,.026,-.002),(.219,.049,.023,-.001),(.227,.027,.018,0),(.239,.017,.017,0),(.258,.018,.017,0)],'skin')
    head=ellipsoid('soft-oval-face',(0,.306,.004),(.056,.063,.047),'skin')
    return [merge_skin('continuous-face-neck-and-torso',[body,head])]


def shirt():
    # Open scoop neckline: shoulder straps rise above the low curved front.
    rows=[(.086,.059,.034),(.090,.058,.034),(.110,.050,.031),(.138,.046,.031),(.163,.049,.034),(.180,.054,.034),(.196,.051,.030),(.219,.047,.025)]
    rings=[]
    count=64
    for layer in (0,1):
        ordered=rows if layer==0 else list(reversed(rows))
        for row,(y,rx,rz) in enumerate(ordered):
            top=(layer==0 and row==len(rows)-1) or (layer==1 and row==0)
            near=(layer==0 and row==len(rows)-2) or (layer==1 and row==1)
            ring=[]
            for i in range(count):
                a=i*TAU/count;front=max(0,math.sin(a))
                yy=y-(.033 if top else .010 if near else 0)*front**2
                ring.append(((rx-layer*.0015)*math.cos(a),yy,-.002+(rz-layer*.0015)*math.sin(a)))
            rings.append(ring)
    rings.append(rings[0])
    # Close the annulus explicitly rather than duplicating coincident end rings.
    vertices=[p for ring in rings[:-1] for p in ring];faces=[];nr=len(rings)-1
    for row in range(nr):
        nxt=(row+1)%nr
        for i in range(count):
            j=(i+1)%count;faces.append((row*count+i,row*count+j,nxt*count+j,nxt*count+i))
    from modeling import subdivision
    return [subdivision(mesh('pink-scoop-neck-tank',vertices,faces,'pink'),1)]


def legs():
    back=sweep('left-folded-leg',[(-.027,.075,-.012),(-.070,.065,-.005),(-.117,.040,.005),(-.124,.022,.028),(-.100,.016,.054),(-.056,.025,.072),(.003,.045,.073),(.048,.064,.065),(.077,.077,.051),(.089,.076,.044)],[.025,.029,.029,.028,.026,.025,.021,.017,.014,.004],segments=24,levels=2)
    front=sweep('right-folded-leg',[(.028,.075,-.013),(.070,.064,-.002),(.120,.041,.009),(.129,.023,.038),(.111,.016,.070),(.067,.020,.088),(.015,.038,.091),(-.023,.062,.084),(-.061,.079,.063),(-.086,.078,.046),(-.092,.073,.042)],[.025,.029,.030,.029,.027,.026,.023,.020,.016,.013,.003],segments=24,levels=2)
    back['material_key']=front['material_key']='skin'
    shorts=ellipsoid('blue-yoga-shorts',(0,.073,-.010),(.061,.030,.039),'blue')
    return [shorts,back,front]


def arms():
    result=[]
    for side in (-1,1):
        tag='left' if side<0 else 'right'
        points=[(side*x,y,z) for x,y,z in [(.047,.208,-.002),(.064,.205,-.003),(.074,.182,-.001),(.084,.149,.004),(.090,.132,.010),(.107,.112,.020),(.131,.091,.026),(.148,.086,.026)]]
        arm=sweep(tag+'-arm',points,[.019,.021,.020,.017,.016,.015,.014,.012],segments=20,levels=2)
        palm=ellipsoid(tag+'-palm',(side*.153,.084,.026),(.018,.012,.014),'skin',32,16)
        # Joined index-and-thumb loop; its central hole remains open.
        centers=[]
        for i in range(49):
            angle=i*TAU/48
            centers.append((side*(.157+.010*math.cos(angle)-.003*math.sin(angle)),.097+.014*math.sin(angle),.027))
        ring=sweep(tag+'-thumb-index-circle',centers,[.0045]*len(centers),segments=12,levels=1)
        finger=sweep(tag+'-relaxed-outer-fingers',[(side*.147,.078,.028),(side*.164,.079,.028),(side*.176,.088,.030),(side*.180,.101,.031),(side*.179,.105,.031)],[.008,.009,.008,.006,.002],segments=16,levels=2)
        result.append(merge_skin(tag+'-continuous-mudra-hand-and-arm',[arm,palm,ring,finger],.0010))
    return result


def feature(name,outline,material):
    # Every feature follows the face curvature and sits just above the skin.
    def surface(x,y):return .004+.047*math.sqrt(max(.05,1-(x/.056)**2-((y-.306)/.063)**2))
    n=len(outline);vertices=[]
    for h in (.0003,.0020):vertices.extend((x,y,surface(x,y)+h) for x,y in outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    return bevel(mesh(name,vertices,faces,material),.00065,3)


def face():
    result=[]
    for side in (-1,1):
        center=side*.025
        outline=curve((center-.015,.304),[
            ((center-.009,.299),(center+.005,.297),(center+.015,.304)),
            ((center+.019,.304),(center+.012,.293),(center+.002,.293)),
            ((center-.008,.292),(center-.016,.297),(center-.015,.304))])
        outline=[(center+(x-center)*1.08,y+.008) for x,y in outline]
        result.append(feature(('left' if side<0 else 'right')+'-closed-eye',outline,'face'))
    mouth=curve((-.014,.274),[((-.006,.270),(.007,.270),(.014,.274)),((.015,.269),(.007,.264),(0,.264)),((-.007,.264),(-.014,.269),(-.014,.274))])
    result.append(feature('peaceful-smile',[(x,y+.004) for x,y in mouth],'face'))
    result.append(ellipsoid('small-rounded-nose',(0,.287,.052),(.007,.004,.0045),'skin',32,16))
    return result


def hair():
    result=[ellipsoid('back-of-blonde-hair',(0,.317,-.013),(.062,.071,.045),'hair')]
    right=curve((-.026,.368),[
        ((-.012,.391),(.045,.379),(.062,.351)),
        ((.078,.328),(.066,.299),(.052,.286)),
        ((.060,.310),(.048,.317),(.027,.327)),
        ((.003,.338),(-.025,.352),(-.026,.368))])
    left=curve((-.024,.369),[
        ((-.052,.365),(-.070,.338),(-.062,.318)),
        ((-.060,.310),(-.055,.306),(-.050,.303)),
        ((-.055,.322),(-.021,.334),(-.020,.357)),
        ((-.020,.365),(-.022,.368),(-.024,.369))])
    tail=curve((-.048,.309),[
        ((-.051,.285),(-.056,.274),(-.080,.270)),
        ((-.081,.266),(-.075,.263),(-.069,.263)),
        ((-.073,.260),(-.078,.260),(-.081,.259)),
        ((-.071,.245),(-.039,.248),(-.026,.263)),
        ((-.026,.281),(-.035,.302),(-.048,.309))])
    pony=curve((-.028,.372),[
        ((-.069,.367),(-.081,.392),(-.064,.417)),
        ((-.052,.442),(-.022,.436),(-.013,.422)),
        ((-.004,.406),(-.010,.389),(-.028,.372))])
    result.extend([cushion('left-flowing-hair-tail',tail,-.004,.015,'hair'),cushion('high-blonde-ponytail',pony,-.019,.020,'hair'),ellipsoid('pink-ponytail-band',(-.023,.391,-.004),(.018,.010,.014),'pink'),cushion('large-side-swept-lock',right,.035,.015,'hair'),cushion('small-left-swept-lock',left,.032,.012,'hair')])
    return result


def build(parameters):
    part=parameters.get('part','upper')
    if part=='upper':
        skin=merge_skin('continuous-shoulders-neck-face-and-arms',torso()+arms(),.0012)
        return [skin]+shirt()+face()+hair()
    if part=='legs':return legs()
    raise ValueError('part must be upper or legs')
