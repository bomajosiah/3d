import * as THREE from 'three'

/**
 * One selector grammar, used by the CLI, animation tracks and camera framing:
 *   chair/seat     name path (each segment unique among its siblings)
 *   #a7Kd91xQ      stable id
 *   @tag:metal     every node carrying a tag
 *   all            everything
 * A property suffix (`.transform.position.y`) is split off by `splitTarget`.
 */
export type Selector = string

const PROPERTY_ROOTS = new Set(['transform', 'material', 'visible'])

/** Splits "lid.transform.rotation.y" into the node part and the property path. */
export function splitTarget(target: string): { selector: string; property: string[] } {
  const parts = target.split('.')
  const cut = parts.findIndex((p) => PROPERTY_ROOTS.has(p))
  if (cut <= 0) return { selector: target, property: [] }
  return { selector: parts.slice(0, cut).join('.'), property: parts.slice(cut) }
}

const matches = (obj: THREE.Object3D, selector: Selector): boolean => {
  if (selector === 'all' || selector === '*') return true
  if (selector.startsWith('#')) return obj.userData.nodeId === selector.slice(1)
  if (selector.startsWith('@tag:')) {
    const tag = selector.slice(5)
    return Array.isArray(obj.userData.tags) && obj.userData.tags.includes(tag)
  }
  // Name path: match the trailing segments of the object's ancestry.
  const want = selector.split('/').filter(Boolean)
  let cursor: THREE.Object3D | null = obj
  for (let i = want.length - 1; i >= 0; i--) {
    if (!cursor || cursor.name !== want[i]) return false
    cursor = cursor.parent
  }
  return true
}

export function resolve(root: THREE.Object3D, selector: Selector): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj === root) return
    if (obj.userData.internal) return
    if (matches(obj, selector)) out.push(obj)
  })
  return out
}

export function resolveOne(root: THREE.Object3D, selector: Selector): THREE.Object3D | undefined {
  return resolve(root, selector)[0]
}
