import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { parseScene } from '@3d/schema'
import { parsePath, buildScene, boundsOf, buildGeometry, evaluateAt, assetKey, meshGeometry } from '../src/index.ts'

describe('quality contracts', () => {
  it('subdivides looping cubics even when their endpoints coincide', () => {
    const points = parsePath('M0,0 C2,3 -2,3 0,0', .02)[0]!.points
    expect(Math.max(...points.map(p => p.y))).toBeGreaterThan(2)
    for (let i=1;i<points.length;i++) expect(Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.y-points[i-1]!.y)).toBeLessThanOrEqual(.020001)
  })
  it.each(['M0,0 C1,2', 'M0,0 X2,3', 'L0,0 L1,1', 'M0,0 A1,1 0 2 0 2,2'])('rejects invalid SVG %s', path => {
    expect(() => parsePath(path)).toThrow()
  })
  it('rejects unsupported modifiers with a useful instruction', () => {
    expect(() => parseScene({ nodes: [{ type:'box', modifiers:[{type:'bevel'}] }] })).toThrow()
  })
  it('retains authored XY in path-origin extrusions, keeping the legacy default', () => {
    const make = (origin?: string) => {
      const doc = parseScene({ nodes:[{type:'extrude', origin, path:{d:'M2,3 H4 V6 H2 Z'},depth:.2}] })
      const g=buildGeometry(doc.nodes[0]!)!; g.computeBoundingBox(); return g.boundingBox!
    }
    expect(make().getCenter(new THREE.Vector3()).length()).toBeCloseTo(0)
    expect(make('path').min.toArray()).toEqual([2,3,expect.closeTo(-.1)])
  })
  it('references never affect framing, including nested references', () => {
    const doc=parseScene({nodes:[{type:'box',children:[{type:'reference',image:'x.png',height:100}]}]})
    const built=buildScene(doc)
    expect(boundsOf(built.content).getSize(new THREE.Vector3()).toArray()).toEqual([1,1,1])
    expect(built.bounds.getSize(new THREE.Vector3()).toArray()).toEqual([1,1,1])
  })
  it('never applies scene animation twice to same-named asset parts', () => {
    const doc=parseScene({nodes:[{type:'asset',name:'part',builder:'part.py'}],animation:{clips:[{tracks:[{target:'part.transform.position.x',keys:[[0,2]]}]}]}})
    const node=doc.nodes[0]!
    if(node.type!=='asset') throw new Error('asset expected')
    doc.meta={compiledAssets:{[assetKey(node)]:{meshes:[{name:'part',positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],indices:[0,1,2]}]}}}
    const built=buildScene(doc); evaluateAt(doc,built.content,0)
    expect(built.content.children[0]!.position.x).toBe(2)
    expect(built.content.children[0]!.children[0]!.position.x).toBe(0)
  })
  it('rejects corrupt compiled geometry', () => {
    expect(()=>meshGeometry({name:'bad',positions:[NaN,0,0],normals:[0,1,0],indices:[0,1,2]})).toThrow('Invalid compiled mesh')
  })
})

it('keeps orthographic framing consistent with region inspection', async () => {
  const { makeCamera, applyFraming } = await import('../src/framing.ts')
  const doc=parseScene({camera:{type:'orthographic',framing:{region:{center:[1,2,3],radius:.25},padding:0}}})
  const camera=makeCamera(doc,2)
  const frame=applyFraming(camera,doc,new THREE.Sphere(new THREE.Vector3(),1),2)
  expect(frame.target.toArray()).toEqual([1,2,3])
  expect(camera).toBeInstanceOf(THREE.OrthographicCamera)
  if(camera instanceof THREE.OrthographicCamera){expect(camera.top).toBe(.25);expect(camera.right).toBe(.5)}
})


it('loads reference aspect and orientation only once across effect replays', async () => {
  const {loadReferences}=await import('../src/references.ts')
  const texture=new THREE.Texture({width:200,height:100} as HTMLImageElement)
  const mock=vi.spyOn(THREE.TextureLoader.prototype,'loadAsync').mockResolvedValue(texture)
  try {
    const doc=parseScene({nodes:[{type:'reference',image:'reference.png',view:'right',height:1}]})
    const root=buildScene(doc).content
    await Promise.all([loadReferences(root),loadReferences(root)])
    const plane=root.children[0] as THREE.Mesh
    plane.geometry.computeBoundingBox()
    const size=plane.geometry.boundingBox!.getSize(new THREE.Vector3())
    expect(size.z).toBeCloseTo(2);expect(size.y).toBeCloseTo(1);expect(size.x).toBeCloseTo(0)
    expect(mock).toHaveBeenCalledTimes(1)
  } finally {mock.mockRestore()}
})
