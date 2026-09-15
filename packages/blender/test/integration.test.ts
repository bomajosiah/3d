import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { parseScene, parseSceneText } from '@3d/schema'
import { buildScene, compiledAssets } from '@3d/core'
import { renderFrames, compareImages } from '@3d/render'
import { prepareAssets } from '../src/build.ts'
import { renderFinal } from '../src/render.ts'

// Explicit opt-in: regular primitive CI does not require Blender installed.
describe.runIf(process.env.BLENDER_TESTS === '1')('Blender end-to-end', () => {
  it('builds closed connected cutlery, reuses cache, and renders shared animation', async () => {
    const file=resolve('scenes/cutlery.scene.json')
    const input=parseSceneText(readFileSync(file,'utf8'))
    const doc=await prepareAssets(input,file)
    for(const asset of Object.values(compiledAssets(doc))) {
      for(const r of asset.report as {components:number;boundaryEdges:number;nonManifoldEdges:number;degenerateFaces:number}[]) {
        expect(r.components).toBe(1);expect(r.boundaryEdges).toBe(0);expect(r.nonManifoldEdges).toBe(0);expect(r.degenerateFaces).toBe(0)
      }
    }
    const cached=await prepareAssets(input,file)
    expect(Object.values(compiledAssets(cached)).map(a=>a.hash)).toEqual(Object.values(compiledAssets(doc)).map(a=>a.hash))
    const built=buildScene(doc)
    expect(built.bounds.max.y).toBeGreaterThan(.22); expect(built.bounds.max.y).toBeLessThan(.24)
    expect(built.bounds.max.z-built.bounds.min.z).toBeLessThan(.05)
    const requests=[{time:0},{time:.9}]
    const preview=await renderFrames(doc,requests,{width:96,height:96,supersample:1})
    const final=await renderFinal(doc,requests,{width:96,height:96,samples:8})
    expect(preview.stats.triangles).toBe(final.stats.triangles)
    for(const result of [preview,final]) {
      expect(result.frames[0]!.png.length).toBeGreaterThan(1000)
      expect((await compareImages(result.frames[0]!.png,result.frames[1]!.png)).changed).toBeGreaterThan(.03)
    }
  },300_000)
  it('executes ordered modifiers and exports GLB in the same Y-up frame', async () => {
    const input=parseScene({nodes:[{type:'asset',name:'probe',builder:'../packages/blender/test/fixtures/modifiers.py'}]})
    const doc=await prepareAssets(input,resolve('scenes/helper-test.scene.json'))
    const asset=Object.values(compiledAssets(doc))[0]!
    const report=(asset.report as {components:number;nonManifoldEdges:number}[])[0]!
    expect(report.components).toBe(1);expect(report.nonManifoldEdges).toBe(0)
    const built=buildScene(doc)
    expect(built.bounds.min.x).toBeCloseTo(-.02,3)
    expect(built.bounds.max.x).toBeCloseTo(.02,3)
    expect(built.bounds.max.y).toBeCloseTo(.04,3)
    const bytes=readFileSync(asset.glb)
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
    gltf.scene.updateMatrixWorld(true)
    const glbBounds=new THREE.Box3().setFromObject(gltf.scene,true)
    for(const axis of ['x','y','z'] as const){
      expect(glbBounds.min[axis]).toBeCloseTo(built.bounds.min[axis],6)
      expect(glbBounds.max[axis]).toBeCloseTo(built.bounds.max[axis],6)
    }
  },180_000)
  it.each(['product-bottle','product-enclosure','product-furniture','desk-lamp'])('builds and previews %s independently of cutlery',async name=>{
    const file=resolve(`examples/${name}.scene.json`)
    const doc=await prepareAssets(parseSceneText(readFileSync(file,'utf8')),file)
    const built=buildScene(doc)
    expect(built.triangles).toBeGreaterThan(100)
    const result=await renderFrames(doc,[{time:0}],{width:64,height:64,supersample:1})
    expect(result.frames[0]!.png.length).toBeGreaterThan(500)
  },180_000)
})
