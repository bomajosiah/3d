import { prepareAssets, projectRoot, renderFinal } from '@3d/blender'
import { ValidationError, VIEWS, type View } from '@3d/schema'
import { durationOf } from '@3d/core'
import { assertNotEmpty, contactSheet, renderFrames, RenderError } from '@3d/render'
import { OUT_DIR, fail, loadScene, reportValidation, sceneFile, writeOut, c } from '../io.ts'
import { EXIT, type CommandSpec, type ParsedArgs } from '../spec.ts'

const parseView = (v: unknown): View | undefined => {
  if (typeof v !== 'string' || !v) return undefined
  if (!(VIEWS as readonly string[]).includes(v)) {
    throw new Error(`unknown view "${v}". Use one of: ${VIEWS.join(', ')}`)
  }
  return v as View
}

async function run(ctx: ParsedArgs, mode: 'render' | 'sheet'): Promise<number> {
  const file = sceneFile(ctx.args[0])
  const size = Number(ctx.options.size)
  const json = ctx.json
  if (!Number.isInteger(size) || size < 64 || size > 4096) throw new Error('size must be an integer from 64 to 4096')
  if (ctx.options.frames !== undefined && (!Number.isInteger(Number(ctx.options.frames)) || Number(ctx.options.frames) < 1 || Number(ctx.options.frames) > 120)) throw new Error('frames must be an integer from 1 to 120')

  try {
    const doc = await prepareAssets(loadScene(file).doc, file)
    const quality = ctx.options.quality
    if (quality !== 'preview' && quality !== 'final') throw new Error('quality must be preview or final')
    if (typeof ctx.options.bg === 'string') doc.environment.background = ctx.options.bg
    const pass = ctx.options.pass
    if (!['beauty', 'clay', 'silhouette'].includes(String(pass))) throw new Error('pass must be beauty, clay, or silhouette')
    if (pass !== 'beauty') {
      doc.materials.__inspection = { type: pass === 'silhouette' ? 'unlit' : 'physical', color: pass === 'silhouette' ? '#222222' : '#b8b8b8', metalness: 0, roughness: .6, opacity: 1, flatShading: false }
      const assign = (nodes: typeof doc.nodes) => { for (const n of nodes) if (n.type !== 'reference') { n.material = '__inspection'; assign(n.children) } }
      assign(doc.nodes)
    }
    if (typeof ctx.options.fit === 'string') doc.camera.framing.fit = ctx.options.fit
    const duration = durationOf(doc)

    // Build the request list: explicit views, or samples across the clip.
    let requests: { time: number; view?: View }[]
    const viewsOpt = ctx.options.views
    if (mode === 'sheet' && typeof viewsOpt === 'string' && viewsOpt) {
      const at = Number(ctx.options.at) || 0
      requests = viewsOpt.split(',').map((v) => ({ time: at, view: parseView(v.trim()) }))
    } else if (mode === 'sheet') {
      const n = Math.max(1, Number(ctx.options.frames))
      const view = parseView(ctx.options.view)
      // Sample the half-open interval so a looping clip does not repeat frame 0.
      requests = Array.from({ length: n }, (_, i) => ({ time: (duration * i) / n, view }))
    } else {
      requests = [{ time: Number(ctx.options.at) || 0, view: parseView(ctx.options.view) }]
    }

    const { frames, stats, warnings } = await (quality === 'final' ? renderFinal(doc, requests, { width: size, height: size, root: projectRoot(file) }) : renderFrames(doc, requests, {
      width: size,
      height: size,
      supersample: Number(ctx.options.supersample),
      ...(typeof ctx.options.bg === 'string' && ctx.options.bg
        ? { transparent: false, background: ctx.options.bg }
        : {}),
    }))

    assertNotEmpty(doc, frames, stats, file)

    const explicit = typeof ctx.options.out === 'string' ? ctx.options.out : undefined
    const data =
      mode === 'sheet'
        ? await contactSheet(frames, { checker: ctx.options.checker !== false })
        : frames[0]!.png

    const target = explicit ?? `${OUT_DIR}/${mode === 'sheet' ? 'sheet' : 'last'}.png`
    const path = writeOut(target, data)
    const iteration = `${OUT_DIR}/iterations/${Date.now()}-${mode}`
    writeOut(`${iteration}.png`, data)
    writeOut(`${iteration}.json`, JSON.stringify({ source: file, doc, quality, pass, size, requests }, null, 2))
    // Always leave a copy at the predictable path so the next Read is obvious.
    if (explicit) writeOut(`${OUT_DIR}/last.png`, data)

    if (json) {
      console.log(JSON.stringify({
        ok: true, file, out: path, frames: frames.map((f) => ({ time: f.time, view: f.view, coverage: f.coverage })),
        triangles: stats.triangles, warnings,
      }, null, 2))
    } else if (!ctx.options.quiet) {
      const what = mode === 'sheet' ? `${frames.length} frames` : `t=${frames[0]!.time}s`
      console.log(`${c.bold('rendered')} ${what}  ${stats.triangles} tris  →  ${path}`)
      for (const w of warnings) console.log(`  ${c.yellow('warning:')} ${w}`)
    }
    return EXIT.ok
  } catch (e) {
    if (e instanceof ValidationError) return reportValidation(e, json)
    if (e instanceof RenderError) return fail(e.code, e.message, e.detail, e.fix, json)
    throw e
  }
}

export const render: CommandSpec = {
  name: 'render',
  summary: 'Render one frame to a PNG you can look at.',
  details:
    'Always also writes .3d/out/last.png and prints the absolute path, so the\nfollow-up read is predictable. Fails loudly if the frame is essentially empty.',
  args: [{ name: 'scene', description: 'Path to a .scene.json file.', required: true }],
  options: [
    { name: 'quality', type: 'string', description: 'preview or final (Blender Cycles).', default: 'preview' },
    { name: 'pass', type: 'string', description: 'beauty, clay, or silhouette.', default: 'beauty' },
    { name: 'fit', type: 'string', description: 'Frame a node selector for close inspection.' },
    { name: 'at', type: 'number', description: 'Time in seconds to render.', default: 0 },
    { name: 'size', type: 'number', description: 'Output size in pixels (square).', default: 512 },
    { name: 'view', type: 'string', description: `Override the camera view: ${VIEWS.join(', ')}.` },
    { name: 'out', type: 'string', description: 'Write the PNG here instead.', placeholder: 'path' },
    { name: 'bg', type: 'string', description: 'Solid background colour instead of transparent.', placeholder: 'hex' },
    { name: 'supersample', type: 'number', description: 'Render at N× and downsample. Cleans up thin features.', default: 2 },
  ],
  examples: ['3d render scenes/bottle.scene.json --at 0.5 --view front'],
  run: (ctx) => run(ctx, 'render'),
}

export const sheet: CommandSpec = {
  name: 'sheet',
  summary: 'Render several frames or views into ONE labelled image.',
  details:
    'You get one image per read, so this is the cheapest way to see a whole\nanimation or four sides of an object in a single look.',
  args: [{ name: 'scene', description: 'Path to a .scene.json file.', required: true }],
  options: [
    { name: 'quality', type: 'string', description: 'preview or final (Blender Cycles).', default: 'preview' },
    { name: 'pass', type: 'string', description: 'beauty, clay, or silhouette.', default: 'beauty' },
    { name: 'fit', type: 'string', description: 'Frame a node selector for close inspection.' },
    { name: 'frames', type: 'number', description: 'How many moments to sample across the clip.', default: 6 },
    { name: 'views', type: 'string', description: 'Comma-separated views instead of times, e.g. iso,front,side.', placeholder: 'list' },
    { name: 'at', type: 'number', description: 'Time to use when rendering --views.', default: 0 },
    { name: 'view', type: 'string', description: 'Camera view for time samples.' },
    { name: 'size', type: 'number', description: 'Tile size in pixels.', default: 256 },
    { name: 'out', type: 'string', description: 'Write the sheet here instead.', placeholder: 'path' },
    { name: 'checker', type: 'boolean', description: 'Checkerboard behind transparent pixels.', default: true },
    { name: 'supersample', type: 'number', description: 'Render at N× and downsample.', default: 2 },
  ],
  examples: [
    '3d sheet scenes/bottle.scene.json --frames 6',
    '3d sheet scenes/bottle.scene.json --views iso,front,right,top',
  ],
  run: (ctx) => run(ctx, 'sheet'),
}
