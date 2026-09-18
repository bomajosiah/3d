import { basename } from 'node:path'
import { prepareAssets, projectRoot, renderFinal, encodeVideo, type VideoFormat } from '@3d/blender'
import { VIEWS, type View } from '@3d/schema'
import { durationOf, selectClip } from '@3d/core'
import { renderFrames } from '@3d/render'
import { OUT_DIR, ensureDir, loadScene, sceneFile, c } from '../io.ts'
import { EXIT, UsageError, type CommandSpec } from '../spec.ts'

const FORMATS: VideoFormat[] = ['mp4', 'webm']
// H.264 requires even dimensions; odd ones fail deep inside the encoder.
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export const video: CommandSpec = {
  name: 'video',
  summary: 'Render the animation clip to an MP4 or WebM video.',
  details: `Renders every frame of the scene's clip and encodes it with Blender's FFmpeg.

--quality preview uses the fast headless renderer; --quality final uses Cycles
and is much slower but matches 3d render --quality final.

A clip that loops plays seamlessly: the last frame is one step before the
first, so the video can be looped without a duplicated frame.`,
  args: [{ name: 'scene', description: 'Scene JSON file.', required: true }],
  options: [
    { name: 'size', type: 'number', description: 'Height in pixels; width follows --aspect.', default: 720 },
    { name: 'aspect', type: 'string', description: 'Frame aspect, e.g. 1:1, 16:9, 9:16.', default: '1:1', placeholder: 'w:h' },
    { name: 'quality', type: 'string', description: 'preview or final.', default: 'preview' },
    { name: 'format', type: 'string', description: 'mp4 or webm.', default: 'mp4' },
    { name: 'fps', type: 'number', description: 'Frames per second; defaults to the clip fps.' },
    { name: 'view', type: 'string', description: `Camera view: ${VIEWS.join(', ')}.` },
    { name: 'bg', type: 'string', description: 'Background colour; video carries no alpha.', default: '#ffffff', placeholder: 'hex' },
    { name: 'out', type: 'string', description: 'Output file.', placeholder: 'path' },
    { name: 'supersample', type: 'number', description: 'Preview supersampling factor.', default: 2 },
  ],
  examples: [
    '3d video scenes/cutlery.scene.json',
    '3d video scenes/cutlery.scene.json --quality final --size 1080 --aspect 9:16',
  ],
  async run(ctx) {
    const format = String(ctx.options.format) as VideoFormat
    if (!FORMATS.includes(format)) throw new UsageError(`unknown format "${format}". Available: ${FORMATS.join(', ')}`)
    const quality = String(ctx.options.quality)
    if (quality !== 'preview' && quality !== 'final') throw new UsageError('quality must be preview or final')
    const size = Number(ctx.options.size)
    if (!Number.isInteger(size) || size < 64 || size > 2160) throw new UsageError('size must be an integer from 64 to 2160')
    const ratio = String(ctx.options.aspect).split(':').map(Number)
    if (ratio.length !== 2 || ratio.some(n => !Number.isFinite(n) || n <= 0)) throw new UsageError('aspect must look like 1:1, 16:9 or 9:16')
    const view = ctx.options.view === undefined ? undefined : String(ctx.options.view)
    if (view !== undefined && !(VIEWS as readonly string[]).includes(view)) throw new UsageError(`unknown view "${view}". Use one of: ${VIEWS.join(', ')}`)

    const height = even(size)
    const width = even(size * (ratio[0]! / ratio[1]!))
    const file = sceneFile(ctx.args[0])
    const name = basename(file).replace(/\.scene\.json$/, '')
    const doc = await prepareAssets(loadScene(file).doc, file)
    // Neither H.264 nor our WebM profile carries alpha, so a transparent scene
    // would composite against black. Always flatten onto an explicit colour.
    const bg = String(ctx.options.bg)
    doc.environment.background = bg
    const duration = durationOf(doc)
    if (!duration) throw Object.assign(new Error(`${file} has no animation to record. Add an animation clip, or use 3d render for a still.`), { code: 'E_NO_ANIMATION' })
    const fps = ctx.options.fps !== undefined ? Number(ctx.options.fps) : (selectClip(doc)?.fps ?? 30)
    if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new UsageError('fps must be an integer from 1 to 120')

    // Half-open sampling: a looping clip must not end on a repeat of frame 0.
    const count = Math.max(1, Math.round(duration * fps))
    const requests = Array.from({ length: count }, (_, i) => ({ time: (duration * i) / count, view: view as View | undefined }))

    const { frames } = await (quality === 'final'
      ? renderFinal(doc, requests, { width, height, root: projectRoot(file) })
      : renderFrames(doc, requests, { width, height, supersample: Number(ctx.options.supersample), transparent: false, background: bg }))

    const output = ensureDir(ctx.options.out ? String(ctx.options.out) : `${OUT_DIR}/${name}.${format}`)
    const result = await encodeVideo(frames.map(f => f.png), { output, fps, width, height, format, root: projectRoot(file) })

    if (ctx.json) console.log(JSON.stringify({ ok: true, file, ...result, fps, width, height, quality, format }))
    else console.log(`encoded ${c.bold(format)}  ${width}×${height}  ${result.frames} frames @ ${fps}fps  ${(result.bytes / 1024).toFixed(0)} KB  →  ${result.output}`)
    return EXIT.ok
  },
}
