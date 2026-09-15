import { prepareAssets } from '@3d/blender'
import { compiledAssets } from '@3d/core'
import { loadScene, sceneFile, writeOut } from '../io.ts'
import type { CommandSpec } from '../spec.ts'
export const build: CommandSpec = {
  name: 'build', summary: 'Compile local procedural assets to evaluated meshes, GLB, and editable Blender files.',
  args: [{ name: 'scene', description: 'Scene JSON file.', required: true }], options: [],
  async run(ctx) {
    const file = sceneFile(ctx.args[0])
    const doc = await prepareAssets(loadScene(file).doc, file)
    const assets = Object.values(compiledAssets(doc))
    const out = writeOut('.3d/out/build.json', JSON.stringify({ file, assets: assets.map(({ hash, glb, report }) => ({ hash, glb, report })) }, null, 2))
    console.log(ctx.json ? JSON.stringify({ ok: true, out, assets: assets.map(({ hash, glb, report }) => ({ hash, glb, report })) }) : `built ${assets.length} asset(s) → ${out}`)
    return 0
  },
}
