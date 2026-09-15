import { prepareAssets } from '@3d/blender'
import { buildScene, triangleCount } from '@3d/core'
import { ValidationError, type SceneNode } from '@3d/schema'
import { loadScene, reportValidation, sceneFile, c } from '../io.ts'
import { EXIT, type CommandSpec } from '../spec.ts'

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''))

function describe(node: SceneNode): string {
  switch (node.type) {
    case 'box':
      return `size ${node.size.map(fmt).join('×')}${node.radius ? ` radius ${fmt(node.radius)}` : ''}`
    case 'sphere':
      return `radius ${fmt(node.radius)}`
    case 'cylinder':
      return `radius ${fmt(node.radius)} height ${fmt(node.height)}`
    case 'reference':
      return `${node.image} (${node.view})`
    default:
      return ''
  }
}

function lines(nodes: SceneNode[], prefix: string, out: string[]): void {
  nodes.forEach((node, i) => {
    const last = i === nodes.length - 1
    const branch = last ? '└─ ' : '├─ '
    const name = node.name ?? node.type
    const detail = describe(node)
    const mat = 'material' in node && node.material ? c.dim(` [${node.material}]`) : ''
    const hidden = node.visible ? '' : c.dim(' (hidden)')
    out.push(`${prefix}${branch}${name}  ${c.dim(node.type)}${detail ? c.dim(' · ' + detail) : ''}${mat}${hidden}`)
    if (node.type !== 'reference' && node.children.length) {
      lines(node.children, prefix + (last ? '   ' : '│  '), out)
    }
  })
}

export const outline: CommandSpec = {
  name: 'outline',
  summary: 'Print a compact tree and scene stats without reading the whole file.',
  details:
    'Cheap orientation for a scene you did not just write. Use this instead of\nreading the JSON when you only need to know what is in it.',
  args: [{ name: 'scene', description: 'Path to a .scene.json file.', required: true }],
  options: [],
  examples: ['3d outline scenes/bottle.scene.json'],
  async run({ args, json }) {
    const file = sceneFile(args[0])
    try {
      const doc = await prepareAssets(loadScene(file).doc, file)
      const built = buildScene(doc)
      const b = built.bounds
      const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]

      if (json) {
        console.log(JSON.stringify({
          ok: true, file, name: doc.name, nodes: doc.nodes.length, triangles: built.triangles,
          bounds: { min: b.min.toArray(), max: b.max.toArray(), size },
          materials: Object.keys(doc.materials),
          clips: doc.animation.clips.map((cl) => ({ name: cl.name, duration: cl.duration, fps: cl.fps, loop: cl.loop, tracks: cl.tracks.length })),
          environment: doc.environment.preset, warnings: built.warnings,
        }, null, 2))
        return EXIT.ok
      }

      const out: string[] = []
      out.push(`${c.bold(doc.name)}  ${c.dim(file)}`)
      lines(doc.nodes, '', out)
      out.push('')
      out.push(`${c.dim('bounds')}    ${size.map(fmt).join(' × ')}  (centre ${[(b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2].map(fmt).join(', ')})`)
      out.push(`${c.dim('triangles')} ${built.triangles}`)
      out.push(`${c.dim('materials')} ${Object.keys(doc.materials).join(', ') || '(none defined — using default)'}`)
      out.push(`${c.dim('lighting')}  ${doc.environment.preset}`)
      for (const clip of doc.animation.clips) {
        out.push(`${c.dim('clip')}      ${clip.name}  ${clip.duration}s @ ${clip.fps}fps ${clip.loop}  ${clip.tracks.length} track(s)`)
        for (const t of clip.tracks) out.push(`            ${c.dim('·')} ${t.target}  ${t.keys.length} keys`)
      }
      if (!doc.animation.clips.length) out.push(`${c.dim('clip')}      (none — static scene)`)
      for (const w of built.warnings) out.push(`${c.yellow('warning')}   ${w}`)
      console.log(out.join('\n'))
      return EXIT.ok
    } catch (e) {
      if (e instanceof ValidationError) return reportValidation(e, json)
      throw e
    }
  },
}
