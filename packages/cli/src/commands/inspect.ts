import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prepareAssets, projectRoot, renderFinal } from '@3d/blender'
import { renderFrames, contactSheet, type Frame } from '@3d/render'
import type { SceneDocument, View, Vec3 } from '@3d/schema'
import { loadScene, sceneFile, writeOut } from '../io.ts'
import type { CommandSpec } from '../spec.ts'
import sharp from 'sharp'

export const inspect: CommandSpec = {
  name:'inspect', summary:'Create a reference, silhouette, clay, beauty, and detail comparison sheet.',
  args:[{name:'scene',description:'Scene JSON.',required:true}],
  options:[{name:'reference',type:'string',description:'Reference image path relative to project root.'},
    {name:'quality',type:'string',description:'preview or final for beauty/detail tiles.',default:'preview'},
    {name:'size',type:'number',description:'Tile width and height.',default:512},
    {name:'out',type:'string',description:'Output PNG.',default:'.3d/out/inspection.png'}],
  async run(ctx) {
    const file=sceneFile(ctx.args[0]), root=projectRoot(file), size=Number(ctx.options.size)
    if (!Number.isInteger(size) || size < 64 || size > 4096) throw new Error('size must be 64–4096')
    if (!['preview','final'].includes(String(ctx.options.quality))) throw new Error('quality must be preview or final')
    const doc=await prepareAssets(loadScene(file).doc,file)
    const frames: Frame[]=[], labels: string[]=[]
    const reference=ctx.options.reference ?? doc.meta?.reference
    if (typeof reference==='string') {
      const png=await sharp(readFileSync(resolve(root,reference))).resize(size,size,{fit:'contain',background:'#f7f5f2'}).png().toBuffer()
      frames.push({time:0,png,coverage:1});labels.push('Reference')
    }
    const render=async(d:SceneDocument,views:View[],label:string,final=false)=>{
      const requests=views.map(view=>({time:0,view}))
      const result=await (final?renderFinal(d,requests,{width:size,height:size,root}):renderFrames(d,requests,{width:size,height:size}))
      for(const f of result.frames){frames.push(f);labels.push(`${label} · ${f.view}`)}
    }
    // One geometry preparation is reused for every pass.
    const pass=(silhouette:boolean):SceneDocument=>{
      const d={...doc,materials:{...doc.materials}}
      d.materials.__inspection={type:silhouette?'unlit':'physical',color:silhouette?'#202020':'#999999',roughness:.65,metalness:0,opacity:1,flatShading:false}
      const nodes=(ns:SceneDocument['nodes']):SceneDocument['nodes']=>ns.map(n=>n.type==='reference'?n:{...n,material:'__inspection',children:nodes(n.children)})
      d.nodes=nodes(doc.nodes); return d
    }
    await render(pass(true),['front'],'Silhouette')
    await render(pass(false),['front','right','iso'],'Clay')
    await render(doc,['front'],'Beauty',ctx.options.quality==='final')
    const regions=(doc.meta?.inspection ?? []) as {label:string;center:Vec3;radius:number}[]
    for(const r of regions){
      if(!Array.isArray(r.center)||r.center.length!==3||!r.center.every(Number.isFinite)||!Number.isFinite(r.radius)||r.radius<=0) throw new Error('Invalid meta.inspection region')
      const detail={...doc,camera:{...doc.camera,target:[0,0,0] as Vec3,framing:{...doc.camera.framing,region:{center:r.center,radius:r.radius}}}}
      await render(detail,['front'],r.label,ctx.options.quality==='final')
    }
    const png=await contactSheet(frames,{columns:3,checker:false,label:(_,i)=>labels[i]!})
    const out=writeOut(String(ctx.options.out),png)
    const iteration=`.3d/out/iterations/${Date.now()}-inspection`
    writeOut(`${iteration}.png`,png)
    writeOut(`${iteration}.json`,JSON.stringify({source:file,doc,options:ctx.options,labels},null,2))
    console.log(ctx.json?JSON.stringify({ok:true,out,labels}):`inspection → ${out}`)
    return 0
  },
}
