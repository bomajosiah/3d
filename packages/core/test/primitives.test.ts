import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { parseScene } from '@3d/schema'
import { buildGeometry, buildScene } from '../src/index.ts'

const geometryOf = (node: unknown) => {
  const doc = parseScene({ nodes: [node] })
  return buildGeometry(doc.nodes[0]!)!
}

const boundsOf = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('lathe', () => {
  it('revolves a profile into a solid of the right radius and height', () => {
    const g = geometryOf({ type: 'lathe', profile: { d: 'M0,0 L1,0 L1,2 L0,2 Z' }, segments: 32 })
    const b = boundsOf(g)
    expect(b.max.x).toBeCloseTo(1, 2)
    expect(b.min.x).toBeCloseTo(-1, 2)
    expect(b.max.y - b.min.y).toBeCloseTo(2, 3)
  })

  it('keeps three\'s seamless normals rather than recomputing them', () => {
    // Recomputing from faces breaks the match across the closing seam and
    // paints a visible crease down the revolved surface.
    const g = geometryOf({ type: 'lathe', profile: { d: 'M0,0 L1,0 L1,2 L0,2 Z' }, segments: 48 })
    const normals = g.getAttribute('normal')
    const first = new THREE.Vector3().fromBufferAttribute(normals, 0)
    const seam = new THREE.Vector3().fromBufferAttribute(normals, normals.count - 1)
    expect(first.length()).toBeCloseTo(1, 4)
    expect(seam.length()).toBeCloseTo(1, 4)
  })

  it('honours a partial sweep', () => {
    // three sweeps x = r·sin(phi), z = r·cos(phi), so a half revolution still
    // spans the full z range but only the positive half of x.
    const full = geometryOf({ type: 'lathe', profile: { d: 'M0,0 L1,0 L1,1' }, segments: 32 })
    const half = geometryOf({ type: 'lathe', profile: { d: 'M0,0 L1,0 L1,1' }, segments: 32, endAngle: 180 })
    expect(boundsOf(full).min.x).toBeCloseTo(-1, 2)
    expect(boundsOf(half).min.x).toBeCloseTo(0, 5)
    expect(boundsOf(half).max.x).toBeCloseTo(1, 2)
  })

  it('rejects negative radii instead of silently changing the profile', () => {
    expect(() => geometryOf({ type: 'lathe', profile: { d: 'M-0.5,0 L1,0 L1,1' }, segments: 16 })).toThrow('non-negative')
  })
})

describe('extrude', () => {
  it('extrudes an outline to the requested depth, centred on the origin', () => {
    const g = geometryOf({ type: 'extrude', path: { d: 'M0,0 H2 V1 H0 Z' }, depth: 0.5 })
    const b = boundsOf(g)
    expect(b.max.z - b.min.z).toBeCloseTo(0.5, 3)
    expect(b.max.z).toBeCloseTo(0.25, 3)
    expect(b.max.x - b.min.x).toBeCloseTo(2, 3)
  })

  it('keeps the outer depth when bevelling', () => {
    const g = geometryOf({ type: 'extrude', path: { d: 'M0,0 H2 V1 H0 Z' }, depth: 0.5, bevel: 0.05 })
    expect(boundsOf(g).max.z - boundsOf(g).min.z).toBeCloseTo(0.5, 2)
  })

  it('cuts extra subpaths out as holes', () => {
    const solid = geometryOf({ type: 'extrude', path: { d: 'M0,0 H10 V10 H0 Z' }, depth: 1 })
    const holed = geometryOf({
      type: 'extrude',
      path: { d: 'M0,0 H10 V10 H0 Z M3,3 H7 V7 H3 Z' },
      depth: 1,
    })
    // A hole adds wall geometry, so the holed solid has strictly more vertices.
    expect(holed.getAttribute('position').count).toBeGreaterThan(solid.getAttribute('position').count)
  })
})

describe('scene integration', () => {
  it('counts lathe and extrude triangles in the scene total', () => {
    const doc = parseScene({
      nodes: [
        { type: 'lathe', name: 'a', profile: { d: 'M0,0 L1,0 L1,1 Z' } },
        { type: 'extrude', name: 'b', path: { d: 'M0,0 H1 V1 H0 Z' }, depth: 0.2 },
      ],
    })
    expect(buildScene(doc).triangles).toBeGreaterThan(50)
  })
})
