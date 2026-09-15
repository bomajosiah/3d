import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { ValidationError, parseSceneText } from '@3d/schema'
import { loadScene, reportValidation, sceneFile, c } from '../io.ts'
import { EXIT, type CommandSpec } from '../spec.ts'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const newId = (): string => {
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

const KEY_ORDER = [
  'version', 'name', '$schema', 'environment', 'camera', 'materials', 'nodes', 'animation', 'exports', 'meta',
  'type', 'id', 'image', 'view', 'size', 'radius', 'radiusTop', 'height', 'segments', 'radialSegments',
  'profile', 'opacity', 'material', 'transform', 'modifiers', 'tags', 'visible', 'children',
]

const round = (n: number) => (Number.isInteger(n) ? n : Number(n.toFixed(4)))

function canonical(value: unknown): unknown {
  if (typeof value === 'number') return round(value)
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const keys = Object.keys(src).sort((a, b) => {
      const ia = KEY_ORDER.indexOf(a)
      const ib = KEY_ORDER.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
    const out: Record<string, unknown> = {}
    for (const k of keys) out[k] = canonical(src[k])
    return out
  }
  return value
}

/** Stamps ids onto every node that lacks one, in place, without reordering. */
function stampIds(nodes: unknown, seen: Set<string>): number {
  if (!Array.isArray(nodes)) return 0
  let added = 0
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const n = node as Record<string, unknown>
    if (typeof n.id !== 'string' || seen.has(n.id)) {
      let id = newId()
      while (seen.has(id)) id = newId()
      n.id = id
      added++
    }
    seen.add(n.id as string)
    added += stampIds(n.children, seen)
  }
  return added
}

export const fmt: CommandSpec = {
  name: 'fmt',
  summary: 'Canonicalise a scene file: fill in ids, order keys, round numbers.',
  details:
    'Run this after hand-editing. Ids are assigned once and never regenerated,\nbecause animation tracks and editor selection reference them.',
  args: [{ name: 'scene', description: 'Path to a .scene.json file.', required: true }],
  options: [{ name: 'check', type: 'boolean', description: 'Do not write; exit 1 if formatting would change the file.' }],
  examples: ['3d fmt scenes/bottle.scene.json'],
  async run({ args, options, json }) {
    const file = sceneFile(args[0])
    try {
      const text = readFileSync(file, 'utf8')
      parseSceneText(text, file) // fail early on an invalid document
      const raw = JSON.parse(text) as Record<string, unknown>
      const added = stampIds(raw.nodes, new Set<string>())
      const formatted = `${JSON.stringify(canonical(raw), null, 2)}\n`
      const changed = formatted !== text

      if (options.check) {
        if (json) console.log(JSON.stringify({ ok: !changed, file, changed }))
        else console.log(changed ? c.yellow(`${file} needs formatting`) : `ok  ${file}`)
        return changed ? EXIT.validation : EXIT.ok
      }

      if (changed) writeFileSync(file, formatted)
      if (json) console.log(JSON.stringify({ ok: true, file, changed, idsAdded: added }))
      else console.log(`${changed ? c.bold('formatted') : 'unchanged'}  ${file}${added ? `  ${added} id(s) added` : ''}`)
      return EXIT.ok
    } catch (e) {
      if (e instanceof ValidationError) return reportValidation(e, json)
      throw e
    }
  },
}
