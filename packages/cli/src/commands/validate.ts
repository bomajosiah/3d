import { prepareAssets } from '@3d/blender'
import { ValidationError } from '@3d/schema'
import { buildScene } from '@3d/core'
import { loadScene, reportValidation, sceneFile, c } from '../io.ts'
import { EXIT, type CommandSpec } from '../spec.ts'

export const validate: CommandSpec = {
  name: 'validate',
  summary: 'Check a scene against the schema and report errors with file:line:col.',
  details: 'Exits 1 on any error. Warnings (unknown material, empty scene) do not fail.',
  args: [{ name: 'scene', description: 'Path to a .scene.json file.', required: true }],
  options: [],
  examples: ['3d validate scenes/bottle.scene.json'],
  async run({ args, json }) {
    let file: string
    try {
      file = sceneFile(args[0])
    } catch (e) {
      if (json) console.log(JSON.stringify({ ok: false, code: 'E_SCENE_NOT_FOUND', message: (e as Error).message }))
      else console.error(c.red((e as Error).message))
      return EXIT.validation
    }

    try {
      const doc = await prepareAssets(loadScene(file).doc, file)
      const built = buildScene(doc)
      if (json) {
        console.log(JSON.stringify({ ok: true, file, nodes: doc.nodes.length, triangles: built.triangles, warnings: built.warnings }, null, 2))
      } else {
        console.log(`${c.bold('ok')}  ${file}  ${doc.nodes.length} node(s), ${built.triangles} triangles`)
        for (const w of built.warnings) console.log(`  ${c.yellow('warning:')} ${w}`)
      }
      return EXIT.ok
    } catch (e) {
      if (e instanceof ValidationError) return reportValidation(e, json)
      throw e
    }
  },
}
