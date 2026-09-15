import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { SceneNode } from '@3d/schema'
import { parsePath, toProfile, toShape } from './path.ts'

/**
 * Parametric geometry builders. Nothing here is ever persisted — the document
 * stores parameters, tessellation happens at evaluate time. That is what keeps
 * scene files small, diffable, and editable by an agent that reasons about
 * numbers rather than vertex buffers.
 */
export function buildGeometry(node: SceneNode): THREE.BufferGeometry | undefined {
  switch (node.type) {
    case 'box': {
      const [w, h, d] = node.size
      // RoundedBoxGeometry needs a positive radius and enough room for it.
      const maxR = Math.min(w, h, d) / 2
      const r = Math.min(node.radius, maxR * 0.999)
      if (r <= 1e-6) return new THREE.BoxGeometry(w, h, d)
      return new RoundedBoxGeometry(w, h, d, node.segments, r)
    }
    case 'sphere':
      return new THREE.SphereGeometry(node.radius, node.segments, Math.max(4, node.segments >> 1))
    case 'cylinder':
      return new THREE.CylinderGeometry(
        node.radiusTop ?? node.radius,
        node.radius,
        node.height,
        node.radialSegments,
        1,
      )
    case 'lathe': {
      const profile = toProfile(parsePath(node.profile.d, node.tolerance))
      if (profile.length < 2) throw new Error(`lathe "${node.name ?? node.id}" profile needs at least 2 points`)
      const start = (node.startAngle * Math.PI) / 180
      const sweep = ((node.endAngle - node.startAngle) * Math.PI) / 180
      // LatheGeometry already derives normals analytically and matches them
      // across the closing seam. Recomputing them from faces breaks that match
      // and paints a visible crease down the revolved surface.
      return new THREE.LatheGeometry(profile, node.segments, start, sweep)
    }
    case 'extrude': {
      if (node.bevel * 2 >= node.depth) throw new Error(`Extrude ${node.name ?? ''}: bevel must be less than half the depth`)
      const shape = toShape(parsePath(node.path.d, node.tolerance))
      const bevelled = node.bevel > 0
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(node.depth - (bevelled ? node.bevel * 2 : 0), 1e-4),
        curveSegments: node.curveSegments,
        bevelEnabled: bevelled,
        bevelThickness: node.bevel,
        bevelSize: node.bevel,
        bevelOffset: 0,
        bevelSegments: node.bevelSegments,
      })
      // ExtrudeGeometry builds around z = 0..depth; centre it so the node's
      // transform.position means the middle of the solid, like every other type.
      if (node.origin === 'path') {
        geometry.computeBoundingBox()
        const b = geometry.boundingBox!
        geometry.translate(0, 0, -(b.min.z + b.max.z) / 2)
      } else geometry.center()
      return geometry
    }
    default:
      return undefined
  }
}

/** Triangle count, for the budget lint and the `outline` stats. */
export const triangleCount = (g: THREE.BufferGeometry): number => {
  const index = g.getIndex()
  if (index) return index.count / 3
  const pos = g.getAttribute('position')
  return pos ? pos.count / 3 : 0
}
