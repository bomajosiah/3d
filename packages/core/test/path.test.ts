import { describe, expect, it } from 'vitest'
import { parsePath, signedArea, toShape } from '../src/path.ts'

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

describe('svg path parsing', () => {
  it('parses absolute lines into a closed subpath', () => {
    const [sub] = parsePath('M0,0 L1,0 L1,1 L0,1 Z')
    expect(sub?.closed).toBe(true)
    expect(sub?.points).toHaveLength(4)
    expect(Math.abs(signedArea(sub!.points))).toBeCloseTo(1, 6)
  })

  it('treats lowercase commands as relative', () => {
    const [abs] = parsePath('M1,1 L3,1 L3,3 Z')
    const [rel] = parsePath('m1,1 l2,0 l0,2 z')
    expect(rel!.points.map((p) => [p.x, p.y])).toEqual(abs!.points.map((p) => [p.x, p.y]))
  })

  it('handles implicit repeated coordinate pairs', () => {
    const [sub] = parsePath('M0,0 L1,0 2,0 3,0')
    expect(sub?.points.at(-1)).toEqual({ x: 3, y: 0 })
  })

  it('supports H and V', () => {
    const [sub] = parsePath('M0,0 H2 V2 H0 Z')
    expect(Math.abs(signedArea(sub!.points))).toBeCloseTo(4, 6)
  })

  it('flattens a cubic through its endpoints', () => {
    const [sub] = parsePath('M0,0 C0,1 1,1 1,0', 0.01)
    expect(sub!.points[0]).toEqual({ x: 0, y: 0 })
    const last = sub!.points.at(-1)!
    expect(close(last.x, 1) && close(last.y, 0)).toBe(true)
    expect(sub!.points.length).toBeGreaterThan(8)
  })

  it('reflects the control point for S and T', () => {
    const smooth = parsePath('M0,0 C0,1 1,1 1,0 S2,-1 2,0', 0.02)[0]!
    expect(smooth.points.at(-1)!.x).toBeCloseTo(2, 6)
  })

  it('traces an elliptical arc', () => {
    // Half circle of radius 1 from (0,0) to (2,0) — apex should reach y = 1.
    const [sub] = parsePath('M0,0 A1,1 0 0 1 2,0', 0.01)
    const peak = Math.max(...sub!.points.map((p) => Math.abs(p.y)))
    expect(peak).toBeCloseTo(1, 1)
    expect(sub!.points.at(-1)!.x).toBeCloseTo(2, 6)
  })

  it('separates multiple subpaths and makes the smaller ones holes', () => {
    const subs = parsePath('M0,0 H10 V10 H0 Z M3,3 H6 V6 H3 Z')
    expect(subs).toHaveLength(2)
    const shape = toShape(subs)
    expect(shape.holes).toHaveLength(1)
    expect(Math.abs(signedArea(shape.holes[0]!.getPoints().map((p) => ({ x: p.x, y: p.y }))))).toBeCloseTo(9, 4)
  })

  it('ignores degenerate subpaths', () => {
    expect(parsePath('M5,5 M6,6 L7,7')).toHaveLength(1)
  })
})
