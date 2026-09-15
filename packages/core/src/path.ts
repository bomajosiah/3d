/**
 * SVG path data → flattened 2D polylines.
 *
 * The schema promises authors can write `d` strings for lathe profiles and
 * extrude outlines, so this has to run everywhere buildScene does — including
 * plain Node for `3d outline` and `3d validate`. That rules out three's
 * SVGLoader, which needs a DOM, so the parser is owned here.
 */
import * as THREE from 'three'

export type Point = { x: number; y: number }
export type SubPath = { points: Point[]; closed: boolean }

const NUMBER = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g
const COMMANDS = 'MmLlHhVvCcSsQqTtAaZz'

function tokenize(d: string): { command: string; args: number[] }[] {
  const out: { command: string; args: number[] }[] = []
  let i = 0
  while (i < d.length) {
    const ch = d[i]!
    if (COMMANDS.includes(ch)) {
      let j = i + 1
      while (j < d.length && !COMMANDS.includes(d[j]!)) j++
      const raw = d.slice(i + 1, j)
      if (raw.replace(NUMBER, '').replace(/[\s,]/g, '')) throw new Error(`Invalid SVG path near ${raw}`)
      const args = (raw.match(NUMBER) ?? []).map(Number)
      if (args.some(v => !Number.isFinite(v))) throw new Error('Path coordinates must be finite')
      const arity = ARITY[ch.toUpperCase()]!
      if ((arity === 0 && args.length) || (arity > 0 && (!args.length || args.length % arity))) throw new Error(`Invalid SVG ${ch}: expected groups of ${arity} coordinates`)
      out.push({ command: ch, args })
      i = j
    } else if (/[\s,]/.test(ch)) i++
    else throw new Error(`Invalid SVG path character ${ch}`)
  }
  return out
}

/** Arity per command, used to repeat implicit subsequent commands. */
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
/** De Casteljau subdivision bounds chord length AND deviation, including loops. */
function flatten(points: Point[], tolerance: number, emit: (p: Point) => void, depth = 0): void {
  const first = points[0]!, last = points.at(-1)!
  const polygon = points.slice(1).reduce((sum, p, i) => sum + distance(points[i]!, p), 0)
  if (polygon <= tolerance) { emit(last); return }
  if (depth >= 20) throw new Error('Curve subdivision budget exceeded; increase tolerance')
  const left = [first], right = [last]
  let row = points
  while (row.length > 1) {
    row = row.slice(1).map((p, i) => mid(row[i]!, p))
    left.push(row[0]!); right.unshift(row.at(-1)!)
  }
  flatten(left, tolerance, emit, depth + 1)
  flatten(right, tolerance, emit, depth + 1)
}

/** Endpoint-parameterised elliptical arc → centre form, per the SVG spec. */
function arcPoints(
  from: Point,
  rxIn: number,
  ryIn: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
  tolerance: number,
): Point[] {
  if (from.x === to.x && from.y === to.y) return []
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0) return [to]

  const phi = (rotation * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx2 = (from.x - to.x) / 2
  const dy2 = (from.y - to.y) / 2
  const x1p = cosPhi * dx2 + sinPhi * dy2
  const y1p = -sinPhi * dx2 + cosPhi * dy2

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }

  const sign = largeArc === sweep ? -1 : 1
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const co = sign * Math.sqrt(Math.max(0, num / den))
  const cxp = (co * rx * y1p) / ry
  const cyp = (-co * ry * x1p) / rx
  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    const a = Math.acos(Math.min(1, Math.max(-1, dot / len)))
    return ux * vy - uy * vx < 0 ? -a : a
  }
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI

  const n = Math.max(6, Math.ceil((Math.abs(delta) / (Math.PI / 2)) * Math.max(8, (rx + ry) / 2 / Math.max(tolerance, 1e-6))))
  if (n > 100000) throw new Error('Arc subdivision budget exceeded; increase tolerance')
  const pts: Point[] = []
  for (let i = 1; i <= n; i++) {
    const t = theta1 + (delta * i) / n
    pts.push({
      x: cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi,
      y: cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi,
    })
  }
  return pts
}

/**
 * Parses `d` into flattened subpaths. `tolerance` is the maximum chord length
 * used when flattening curves, in the same units as the path.
 */
export function parsePath(d: string, tolerance = 0.01): SubPath[] {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Path tolerance must be positive')
  const tokens = tokenize(d)
  if (tokens[0]?.command.toUpperCase() !== 'M') throw new Error('SVG path must begin with M')
  const subpaths: SubPath[] = []
  let current: SubPath | undefined
  let cursor: Point = { x: 0, y: 0 }
  let start: Point = { x: 0, y: 0 }
  let lastCubicControl: Point | undefined
  let lastQuadControl: Point | undefined

  const push = (p: Point) => {
    if (!current) {
      current = { points: [{ ...cursor }], closed: false }
      subpaths.push(current)
    }
    const last = current.points[current.points.length - 1]
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) current.points.push({ ...p })
    cursor = { ...p }
  }

  for (const token of tokens) {
    const upper = token.command.toUpperCase()
    const relative = token.command !== upper
    const arity = ARITY[upper] ?? 0

    if (upper === 'Z') {
      if (current) {
        current.closed = true
        cursor = { ...start }
      }
      current = undefined
      lastCubicControl = undefined
      lastQuadControl = undefined
      continue
    }

    // A command may carry several coordinate sets; repeats are implicit.
    const groups = arity > 0 ? Math.max(1, Math.floor(token.args.length / arity)) : 1
    for (let g = 0; g < groups; g++) {
      const a = token.args.slice(g * arity, g * arity + arity)
      if (a.length < arity) break
      const rx = relative ? cursor.x : 0
      const ry = relative ? cursor.y : 0

      if (upper === 'M') {
        const p = { x: a[0]! + rx, y: a[1]! + ry }
        // Only the first pair is a move; the rest behave as line-tos.
        if (g === 0) {
          cursor = p
          start = { ...p }
          current = { points: [{ ...p }], closed: false }
          subpaths.push(current)
        } else push(p)
        lastCubicControl = undefined
        lastQuadControl = undefined
        continue
      }

      if (upper === 'L') {
        push({ x: a[0]! + rx, y: a[1]! + ry })
        lastCubicControl = lastQuadControl = undefined
        continue
      }
      if (upper === 'H') {
        push({ x: a[0]! + rx, y: cursor.y })
        lastCubicControl = lastQuadControl = undefined
        continue
      }
      if (upper === 'V') {
        push({ x: cursor.x, y: a[0]! + ry })
        lastCubicControl = lastQuadControl = undefined
        continue
      }

      if (upper === 'C' || upper === 'S') {
        const p0 = { ...cursor }
        const c1 =
          upper === 'C'
            ? { x: a[0]! + rx, y: a[1]! + ry }
            : lastCubicControl
              ? { x: 2 * p0.x - lastCubicControl.x, y: 2 * p0.y - lastCubicControl.y }
              : { ...p0 }
        const c2 = upper === 'C' ? { x: a[2]! + rx, y: a[3]! + ry } : { x: a[0]! + rx, y: a[1]! + ry }
        const p3 = upper === 'C' ? { x: a[4]! + rx, y: a[5]! + ry } : { x: a[2]! + rx, y: a[3]! + ry }
        flatten([p0, c1, c2, p3], tolerance, push)
        lastCubicControl = c2
        lastQuadControl = undefined
        continue
      }

      if (upper === 'Q' || upper === 'T') {
        const p0 = { ...cursor }
        const c =
          upper === 'Q'
            ? { x: a[0]! + rx, y: a[1]! + ry }
            : lastQuadControl
              ? { x: 2 * p0.x - lastQuadControl.x, y: 2 * p0.y - lastQuadControl.y }
              : { ...p0 }
        const p2 = upper === 'Q' ? { x: a[2]! + rx, y: a[3]! + ry } : { x: a[0]! + rx, y: a[1]! + ry }
        flatten([p0, c, p2], tolerance, push)
        lastQuadControl = c
        lastCubicControl = undefined
        continue
      }

      if (upper === 'A') {
        if (![0, 1].includes(a[3]!) || ![0, 1].includes(a[4]!)) throw new Error('Arc flags must be 0 or 1')
        const to = { x: a[5]! + rx, y: a[6]! + ry }
        for (const p of arcPoints({ ...cursor }, a[0]!, a[1]!, a[2]!, a[3]! !== 0, a[4]! !== 0, to, tolerance)) {
          push(p)
        }
        lastCubicControl = lastQuadControl = undefined
      }
    }
  }

  return subpaths.filter((s) => s.points.length > 1)
}

export const signedArea = (points: Point[]): number => {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/**
 * Builds a THREE.Shape from parsed subpaths. The subpath enclosing the largest
 * area becomes the outline and the rest become holes, which is what lets an
 * author cut fork slots by simply adding more subpaths to one `d` string.
 */
export function toShape(subpaths: SubPath[]): THREE.Shape {
  if (!subpaths.length) throw new Error('path has no drawable subpaths')
  const ranked = [...subpaths].sort((a, b) => Math.abs(signedArea(b.points)) - Math.abs(signedArea(a.points)))
  const outer = ranked[0]!
  const shape = new THREE.Shape(outer.points.map((p) => new THREE.Vector2(p.x, p.y)))
  for (const hole of ranked.slice(1)) {
    shape.holes.push(new THREE.Path(hole.points.map((p) => new THREE.Vector2(p.x, p.y))))
  }
  return shape
}

/** Lathe profiles revolve around x = 0, so negative radii are a modelling error. */
export function toProfile(subpaths: SubPath[]): THREE.Vector2[] {
  const points = subpaths.flatMap((s) => s.points)
  if (points.some(p => p.x < 0)) throw new Error('Lathe radii must be non-negative; fix the profile instead of clamping it')
  return points.map((p) => new THREE.Vector2(p.x, p.y))
}
