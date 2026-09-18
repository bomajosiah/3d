"""Soft sculpted yoga figure: lotus pose, mudra hands and swept golden hair."""
import math
import bpy
from modeling import mesh, loft, sweep, bevel, subdivision

TAU=math.tau

# The reference head is a size larger than the skull the body was built around.
# Growing it about the base of the skull keeps the neck join welded.
HEAD=1.11
NECK=.243
HEAD_AT=(0,NECK+(.306-NECK)*HEAD,.004*HEAD)
HEAD_R=(.056*HEAD,.063*HEAD,.047*HEAD)


def grow_head(objects):
    """Uniform scale about the base of the skull, so hair stays registered to the face."""
    for obj in objects:
        for v in obj.data.vertices:
            v.co.x*=HEAD;v.co.y*=HEAD;v.co.z=NECK+(v.co.z-NECK)*HEAD
    return objects


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
    head=ellipsoid('soft-oval-face',HEAD_AT,HEAD_R,'skin')
    return [merge_skin('continuous-face-neck-and-torso',[body,head])]


def shirt():
    """Racer tank: one hem, and a rim that dips at the chest and climbs the shoulders."""
    profile=[(.078,.066,.037),(.090,.065,.037),(.110,.057,.034),(.138,.052,.034),
             (.163,.055,.037),(.180,.060,.037),(.196,.057,.033),(.219,.052,.027),(.244,.049,.026)]

    def section(y):
        for (y0,rx0,rz0),(y1,rx1,rz1) in zip(profile,profile[1:]):
            if y<=y1 or (y1,rx1,rz1)==profile[-1]:
                t=0 if y1==y0 else max(0,min(1,(y-y0)/(y1-y0)))
                return rx0+(rx1-rx0)*t,rz0+(rz1-rz0)*t
        return profile[-1][1],profile[-1][2]

    hem=profile[0][0]

    def rim(a):
        """Top edge: a scoop across the chest, a little higher round the back."""
        lift=math.cos(a)**2
        return .182+.014*lift+.028*max(0,-math.sin(a))*(1-lift)

    count=72
    steps=[i/12 for i in range(13)]
    rings=[]
    for layer in (0,1):
        for t in (steps if layer==0 else list(reversed(steps))):
            ring=[]
            for i in range(count):
                a=i*TAU/count
                y=hem+t*(rim(a)-hem)
                rx,rz=section(y)
                ring.append(((rx-layer*.0016)*math.cos(a),y,-.002+(rz-layer*.0016)*math.sin(a)))
            rings.append(ring)
    vertices=[p for ring in rings for p in ring];faces=[];nr=len(rings)
    for row in range(nr):
        nxt=(row+1)%nr
        for i in range(count):
            j=(i+1)%count;faces.append((row*count+i,row*count+j,nxt*count+j,nxt*count+i))
    body=subdivision(mesh('pink-scoop-neck-tank',vertices,faces,'pink'),1)

    # Straps ride the slope of the shoulder; a tube rim alone can only spike upward.
    straps=[]
    for side in (-1,1):
        tag='left' if side<0 else 'right'
        path=[(side*.030,.166,.031),(side*.034,.194,.030),(side*.037,.220,.010),
              (side*.036,.204,-.020),(side*.033,.184,-.034)]
        strap=sweep(tag+'-tank-strap',path,[.010,.011,.011,.010,.009],segments=18,levels=2)
        strap['material_key']='pink'
        straps.append(strap)
    return [body]+straps



def legs():
    """Lotus: each thigh sweeps out to the knee, the shin folds back across the
    centre, and the foot rests on the opposite thigh. Sections are fat enough
    that thigh and shin fuse into one mass instead of leaving a loop of daylight."""
    back=sweep('left-folded-leg',
        [(-.030,.078,-.010),(-.072,.068,-.002),(-.108,.050,.006),(-.127,.034,.026),
         (-.126,.022,.052),(-.092,.018,.074),(-.044,.022,.086),(.008,.032,.084),
         (.050,.044,.072),(.076,.052,.058)],
        [.028,.030,.030,.029,.028,.027,.026,.024,.022,.016],segments=28,levels=2)
    front=sweep('right-folded-leg',
        [(.031,.078,-.011),(.073,.067,-.001),(.111,.050,.010),(.130,.034,.034),
         (.129,.022,.062),(.094,.018,.086),(.046,.022,.098),(-.006,.034,.096),
         (-.050,.046,.084),(-.078,.054,.070)],
        [.028,.030,.030,.029,.028,.027,.026,.024,.022,.016],segments=28,levels=2)
    back['material_key']=front['material_key']='skin'
    # Soles turned up in the lap; without them each shin tapers away to nothing.
    left_foot=ellipsoid('left-sole-on-thigh',(.082,.054,.052),(.019,.013,.018),'skin',32,16)
    right_foot=ellipsoid('right-sole-on-thigh',(-.084,.056,.064),(.019,.013,.018),'skin',32,16)
    shorts=ellipsoid('blue-yoga-shorts',(0,.072,-.006),(.068,.031,.044),'blue')
    return [shorts,merge_skin('crossed-legs-and-feet',[back,front,left_foot,right_foot],.0016)]


def arms():
    result=[]
    for side in (-1,1):
        tag='left' if side<0 else 'right'
        points=[(side*x,y,z) for x,y,z in [(.047,.208,-.002),(.064,.205,-.003),(.074,.182,-.001),(.084,.149,.004),(.090,.132,.010),(.107,.112,.020),(.131,.091,.026),(.148,.086,.026)]]
        arm=sweep(tag+'-arm',points,[.021,.023,.022,.019,.018,.017,.016,.013],segments=20,levels=2)
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
    def surface(x,y):return HEAD_AT[2]+HEAD_R[2]*math.sqrt(max(.05,1-(x/HEAD_R[0])**2-((y-HEAD_AT[1])/HEAD_R[1])**2))
    n=len(outline);vertices=[]
    for h in (.0003,.0020):vertices.extend((x,y,surface(x,y)+h) for x,y in outline)
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    return bevel(mesh(name,vertices,faces,material),.00065,3)


def face():
    result=[]
    for side in (-1,1):
        center=side*.0294
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
    result=[ellipsoid('back-of-blonde-hair',(0,.320,-.013),(.065,.074,.047),'hair')]
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
    tail=curve((-.052,.318),[
        ((-.058,.290),(-.064,.276),(-.090,.271)),
        ((-.092,.266),(-.085,.262),(-.078,.262)),
        ((-.083,.258),(-.089,.258),(-.093,.256)),
        ((-.080,.238),(-.040,.243),(-.025,.262)),
        ((-.025,.285),(-.037,.308),(-.052,.318))])
    pony=curve((-.070,.368),[
        ((-.076,.392),(-.072,.412),(-.052,.420)),
        ((-.036,.426),(-.018,.418),(-.016,.404)),
        ((-.014,.391),(-.016,.376),(-.026,.370)),
        ((-.040,.363),(-.058,.361),(-.070,.368))])
    result.extend([cushion('left-flowing-hair-tail',tail,-.004,.018,'hair'),cushion('high-blonde-ponytail',pony,-.016,.023,'hair'),ellipsoid('pink-ponytail-band',(-.021,.389,-.004),(.016,.0105,.015),'pink'),cushion('large-side-swept-lock',right,.034,.019,'hair'),cushion('small-left-swept-lock',left,.031,.016,'hair')])
    return result


def build(parameters):
    part=parameters.get('part','upper')
    if part=='upper':
        skin=merge_skin('continuous-shoulders-neck-face-and-arms',torso()+arms(),.0012)
        return [skin]+shirt()+face()+grow_head(hair())
    if part=='legs':return legs()
    raise ValueError('part must be upper or legs')
