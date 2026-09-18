"""Rounded ivory die with real recessed, lacquered pips on all six faces."""
import math
import bpy
import bmesh
from mathutils import Vector
from modeling import mesh, bevel, xyz


def pip_positions(number):
    a=.038
    return {
        1:[(0,0)], 2:[(-a,a),(a,-a)],
        3:[(-a,-a),(0,0),(a,a)],
        4:[(-a,-a),(-a,a),(a,-a),(a,a)],
        5:[(-a,-a),(-a,a),(0,0),(a,-a),(a,a)],
        6:[(-a,-a),(-a,0),(-a,a),(a,-a),(a,0),(a,a)],
    }[number]


def apply(obj, modifier):
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def recessed_pip(name, center, u, v, n, radius, sphere_radius, material):
    distance=math.sqrt(sphere_radius*sphere_radius-radius*radius)
    vertices=[];rings=[]
    # Front is a shallow spherical dish, not a raised dot glued to the cube.
    profile=[(0,distance-sphere_radius+.0003)]
    for i in range(1,13):
        r=(radius-.00035)*i/12
        profile.append((r,distance-math.sqrt(sphere_radius*sphere_radius-r*r)+.0003))
    profile.extend([(radius-.00035,-.002),(0,distance-sphere_radius-.001)])
    segments=64
    for r,h in profile:
        if r==0:
            rings.append([len(vertices)]);vertices.append(tuple(center+n*h))
        else:
            rings.append(list(range(len(vertices),len(vertices)+segments)))
            vertices.extend(tuple(center+n*h+r*(u*math.cos(i*math.tau/segments)+v*math.sin(i*math.tau/segments))) for i in range(segments))
    faces=[]
    for a,b in zip(rings,rings[1:]+rings[:1]):
        if len(a)==len(b)==1:continue
        for i in range(segments):
            j=(i+1)%segments
            if len(a)==1:faces.append((a[0],b[i],b[j]))
            elif len(b)==1:faces.append((a[i],b[0],a[j]))
            else:faces.append((a[i],b[i],b[j],a[j]))
    return mesh(name,vertices,faces,material)


def build(parameters):
    half=.09
    verts=[(x*half,y*half,z*half) for z in (-1,1) for y in (-1,1) for x in (-1,1)]
    faces=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]
    body=mesh('rounded-ivory-die',verts,faces,'ivory')
    bevel(body,.033,16)
    apply(body,body.modifiers[-1])
    cutters=bpy.data.collections.new('pip-cutters')
    bpy.context.scene.collection.children.link(cutters)
    inserts=[]
    cavities=[]
    # Opposite sides sum to seven. Rest pose shows red 1, black 2 and black 3.
    sides=[('top',1,(0,1,0),(1,0,0),(0,0,-1)),
           ('left',2,(-1,0,0),(0,0,1),(0,1,0)),
           ('front',3,(0,0,1),(1,0,0),(0,1,0)),
           ('back',4,(0,0,-1),(-1,0,0),(0,1,0)),
           ('right',5,(1,0,0),(0,0,-1),(0,1,0)),
           ('bottom',6,(0,-1,0),(1,0,0),(0,0,1))]
    for label,number,normal,tangent,up in sides:
        n,u,v=Vector(normal),Vector(tangent),Vector(up)
        radius=.025 if number==1 else .023
        sphere_radius=.038 if number==1 else .035
        distance=math.sqrt(sphere_radius*sphere_radius-radius*radius)
        for index,(x,y) in enumerate(pip_positions(number)):
            center=n*half+u*x+v*y
            cavities.append((Vector(xyz(center+n*distance)),sphere_radius))
            bpy.ops.mesh.primitive_uv_sphere_add(segments=80,ring_count=40,radius=sphere_radius,location=xyz(center+n*distance))
            cutter=bpy.context.object
            cutter.name=f'cut-{label}-{index}'
            for collection in list(cutter.users_collection):collection.objects.unlink(cutter)
            cutters.objects.link(cutter)
            inserts.append(recessed_pip(f'{label}-pip-{index+1}',center,u,v,n,radius,sphere_radius,'red' if number==1 else 'black'))
    boolean=body.modifiers.new('True recessed pip sockets','BOOLEAN')
    boolean.operation='DIFFERENCE';boolean.operand_type='COLLECTION';boolean.collection=cutters;boolean.solver='EXACT'
    apply(body,boolean)
    for cutter in list(cutters.objects):bpy.data.objects.remove(cutter,do_unlink=True)
    bpy.data.collections.remove(cutters)
    lip=body.modifiers.new('Soft pip lips','BEVEL');lip.width=.00055;lip.segments=3;lip.limit_method='ANGLE';lip.angle_limit=.40
    apply(body,lip)
    cleanup=bmesh.new();cleanup.from_mesh(body.data)
    bmesh.ops.remove_doubles(cleanup,verts=list(cleanup.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(cleanup,edges=list(cleanup.edges),dist=1e-6)
    bmesh.ops.recalc_face_normals(cleanup,faces=list(cleanup.faces))
    cleanup.to_mesh(body.data);cleanup.free();body.data.update()
    normals=body.modifiers.new('Polished continuous face normals','WEIGHTED_NORMAL')
    normals.keep_sharp=True
    normals.weight=50
    return [body,*inserts]
