import { basename } from 'node:path'
import { prepareAssets, exportModel, type ModelFormat } from '@3d/blender'
import { loadScene, sceneFile, ensureDir, c } from '../io.ts'
import { EXIT, UsageError, type CommandSpec } from '../spec.ts'

const FORMATS: ModelFormat[] = ['glb', 'usdz']

export const exportCommand: CommandSpec = {
  name: 'export',
  summary: 'Export the whole scene as a GLB or USDZ model for an app or AR viewer.',
  details: `Writes composed transforms, materials and the baked animation clip into one
file. GLB is the portable master — Android Scene Viewer, model-viewer, and
every engine read it. USDZ is what iOS AR Quick Look requires.

Use --format both to write the pair app stores usually want.
Use --static to leave the animation out and export the pose at t=0.`,
  args: [{ name: 'scene', description: 'Scene JSON file.', required: true }],
  options: [
    { name: 'format', type: 'string', description: 'glb, usdz, or both.', default: 'glb', placeholder: 'name' },
    { name: 'out', type: 'string', description: 'Output file, or directory when --format both.', placeholder: 'path' },
    { name: 'static', type: 'boolean', description: 'Export the t=0 pose without the animation.' },
  ],
  examples: [
    '3d export scenes/cutlery.scene.json --format both',
    '3d export scenes/cutlery.scene.json --format usdz --out dist/cutlery.usdz',
  ],
  async run(ctx) {
    const requested = String(ctx.options.format)
    const formats: ModelFormat[] = requested === 'both' ? FORMATS : [requested as ModelFormat]
    for (const format of formats) {
      if (!FORMATS.includes(format)) throw new UsageError(`unknown format "${requested}". Available: ${FORMATS.join(', ')}, both`)
    }
    const file = sceneFile(ctx.args[0])
    const name = basename(file).replace(/\.scene\.json$/, '')
    const out = ctx.options.out ? String(ctx.options.out) : undefined
    if (out && formats.length > 1 && /\.(glb|usdz)$/.test(out)) {
      throw new UsageError('--format both writes two files; pass --out as a directory, or export one format at a time')
    }
    const doc = await prepareAssets(loadScene(file).doc, file)

    const results = []
    for (const format of formats) {
      const output = ensureDir(out && formats.length === 1 ? out : `${out ?? '.3d/out'}/${name}.${format}`.replace(/\/+/g, '/'))
      results.push(await exportModel(doc, { format, output, animation: ctx.options.static !== true }))
    }
    if (ctx.json) console.log(JSON.stringify({ ok: true, exports: results }))
    else for (const r of results) {
      const kb = (r.bytes / 1024).toFixed(0)
      const motion = r.frames > 1 ? `${r.frames} frames` : 'static'
      console.log(`exported ${c.bold(r.format)}  ${r.triangles} tris  ${motion}  ${kb} KB  →  ${r.output}`)
    }
    return EXIT.ok
  },
}
