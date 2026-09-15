import { existsSync } from 'node:fs'
import { writeOut, c } from '../io.ts'
import { EXIT, type CommandSpec } from '../spec.ts'

const TEMPLATES: Record<string, (name: string) => unknown> = {
  icon: (name) => ({
    version: 1,
    name,
    environment: { preset: 'studio-soft', background: 'transparent' },
    camera: { fov: 30, framing: { fit: 'all', view: 'iso', padding: 0.12 } },
    materials: { body: { color: '#e2725b', roughness: 0.5 } },
    nodes: [{ type: 'box', name: 'body', size: 1, radius: 0.14, material: 'body' }],
    animation: {
      clips: [
        {
          name: 'spin',
          duration: 2,
          fps: 30,
          loop: 'forever',
          tracks: [{ target: 'body.transform.rotation.y', keys: [[0, 0], [2, 360]] }],
        },
      ],
    },
  }),
  object: (name) => ({
    version: 1,
    name,
    environment: { preset: 'product-white', background: 'transparent' },
    camera: { fov: 28, framing: { fit: 'all', view: 'iso', padding: 0.15 } },
    materials: { shell: { color: '#d8d3ca', roughness: 0.35 } },
    nodes: [{ type: 'cylinder', name: 'body', radius: 0.4, height: 1, material: 'shell' }],
  }),
  empty: (name) => ({ version: 1, name, nodes: [] }),
}

export const create: CommandSpec = {
  name: 'new',
  summary: 'Create a starter scene file.',
  args: [{ name: 'name', description: 'Scene name; becomes scenes/<name>.scene.json.', required: true }],
  options: [
    { name: 'template', type: 'string', description: `One of: ${Object.keys(TEMPLATES).join(', ')}.`, default: 'icon' },
    { name: 'out', type: 'string', description: 'Write here instead of scenes/<name>.scene.json.', placeholder: 'path' },
  ],
  examples: ['3d new bottle --template object'],
  async run({ args, options, json }) {
    const name = args[0]!
    const template = TEMPLATES[String(options.template)]
    if (!template) {
      console.error(c.red(`unknown template "${options.template}". Available: ${Object.keys(TEMPLATES).join(', ')}`))
      return EXIT.usage
    }
    const file = typeof options.out === 'string' ? options.out : `scenes/${name}.scene.json`
    if (existsSync(file)) {
      console.error(c.red(`${file} already exists — refusing to overwrite`))
      return EXIT.usage
    }
    const path = writeOut(file, `${JSON.stringify(template(name), null, 2)}\n`)
    if (json) console.log(JSON.stringify({ ok: true, file: path }))
    else console.log(`${c.bold('created')}  ${file}\n  next: 3d render ${file}`)
    return EXIT.ok
  },
}
