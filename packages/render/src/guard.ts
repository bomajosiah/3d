import type { SceneDocument } from '@3d/schema'
import type { Frame, SceneStats } from './renderer.ts'

export class RenderError extends Error {
  code: string
  detail: string[]
  fix?: string
  constructor(code: string, message: string, detail: string[] = [], fix?: string) {
    super(message)
    this.name = 'RenderError'
    this.code = code
    this.detail = detail
    this.fix = fix
  }
}

const fmt = (n: number) => (Math.abs(n) < 1e-4 ? '0' : n.toFixed(2))

/**
 * The single highest-value check in the tool. A near-empty frame is almost
 * always a framing mistake, but an agent reads it as "my geometry is broken"
 * and starts rewriting working code. Failing loudly with the exact fix command
 * turns a multi-turn dead end into one command.
 */
export function assertNotEmpty(
  doc: SceneDocument,
  frames: Frame[],
  stats: SceneStats,
  file: string,
): void {
  const best = frames.reduce((a, b) => (b.coverage > a.coverage ? b : a), frames[0]!)
  if (!best || best.coverage > 0.02) return

  const pct = (100 - best.coverage * 100).toFixed(1)
  const [minx, miny, minz, maxx, maxy, maxz] = stats.bounds
  const detail = [
    `Rendered frame is ${pct}% background.`,
  ]
  let fix: string

  if (stats.nodes === 0) {
    detail.push('The scene contains no nodes.')
    fix = `add one, e.g.  3d add ${file} box --name cube`
  } else if (doc.camera.position) {
    detail.push(
      `Scene bounds [${fmt(minx)},${fmt(miny)},${fmt(minz)}]..[${fmt(maxx)},${fmt(maxy)},${fmt(maxz)}] are outside the camera frustum.`,
      'The camera has an explicit `position`, so automatic framing is disabled.',
    )
    fix = `remove \`camera.position\` from ${file} so framing fits the scene automatically`
  } else {
    detail.push(
      `Scene bounds [${fmt(minx)},${fmt(miny)},${fmt(minz)}]..[${fmt(maxx)},${fmt(maxy)},${fmt(maxz)}] rendered nothing visible.`,
      'Check that nodes are `visible`, have non-zero scale, and that materials are not fully transparent.',
    )
    fix = `3d outline ${file}`
  }

  throw new RenderError('E_EMPTY_FRAME', `${file}: rendered frame is essentially empty`, detail, fix)
}
