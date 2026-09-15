import * as THREE from 'three'
import type { SceneDocument, View } from '@3d/schema'
import { resolve } from './selector.ts'

/** Unit view directions. `iso` is the three-quarter view people mean by "3D". */
export const VIEW_DIRECTIONS: Record<View, [number, number, number]> = {
  iso: [1, 0.75, 1],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
}

export function boundsOf(root: THREE.Object3D, selector = 'all'): THREE.Box3 {
  const box = new THREE.Box3()
  const targets = selector === 'all' ? [root] : resolve(root, selector)
  for (const t of targets.length ? targets : [root]) {
    t.updateWorldMatrix(true, true)
    t.traverseVisible(o => {
      if (!(o instanceof THREE.Mesh) || o.userData.isReference) return
      const geometry = o.geometry
      const position = geometry.getAttribute('position')
      const point = new THREE.Vector3()
      for (let i = 0; i < position.count; i++) box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld))
    })
  }
  return box
}

export type Framing = { position: THREE.Vector3; target: THREE.Vector3; radius: number }

/**
 * Places a camera around an ALREADY-CHOSEN bounding sphere. Kept separate from
 * measuring the scene so an animation can be framed once, over the union of
 * every frame's bounds — otherwise the camera chases the object and it appears
 * to pulse in size as it moves.
 */
export function frameFromSphere(
  doc: SceneDocument,
  sphere: THREE.Sphere,
  aspect: number,
  view?: View,
): Framing {
  if (doc.camera.framing.region) sphere = new THREE.Sphere(new THREE.Vector3(...doc.camera.framing.region.center), doc.camera.framing.region.radius)
  const explicitTarget = doc.camera.target.some((v) => v !== 0)
  const look = explicitTarget ? new THREE.Vector3(...doc.camera.target) : sphere.center.clone()

  if (doc.camera.position) {
    return {
      position: new THREE.Vector3(...doc.camera.position),
      target: look,
      radius: sphere.radius,
    }
  }

  const fovV = (doc.camera.fov * Math.PI) / 180
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect)
  const fit = Math.min(fovV, fovH)
  const padded = sphere.radius * (1 + doc.camera.framing.padding)
  const distance = padded / Math.sin(fit / 2)

  const dir = new THREE.Vector3(...VIEW_DIRECTIONS[view ?? doc.camera.framing.view]).normalize()
  return {
    position: look.clone().add(dir.multiplyScalar(distance)),
    target: look,
    radius: sphere.radius,
  }
}

/**
 * The bounding sphere that contains the scene at EVERY sampled moment of the
 * clip. Sampling rather than reasoning about the tracks keeps this correct for
 * any easing, including overshoot from `outBack` and friends.
 */
export function stableSphere(
  doc: SceneDocument,
  content: THREE.Object3D,
  evaluate: (t: number) => void,
  samples = 24,
): THREE.Sphere {
  const clip = doc.animation.clips[0]
  const box = new THREE.Box3()
  const union = (t: number) => {
    evaluate(t)
    content.updateMatrixWorld(true)
    const b = boundsOf(content, doc.camera.framing.fit)
    if (!b.isEmpty()) box.union(b)
  }

  if (!clip || !clip.tracks.length) union(0)
  else for (let i = 0; i <= samples; i++) union((clip.duration * i) / samples)

  const sphere = new THREE.Sphere()
  if (box.isEmpty()) {
    sphere.center.set(0, 0, 0)
    sphere.radius = 1
  } else box.getBoundingSphere(sphere)
  sphere.radius = Math.max(sphere.radius, 1e-3)
  return sphere
}

/**
 * Places the camera so the selected bounds fill the frame. Agents are poor at
 * camera placement, so declarative framing removes a whole class of failure —
 * and it is what `3d camera fit` writes back into the document.
 */
export function frameCamera(
  doc: SceneDocument,
  root: THREE.Object3D,
  aspect: number,
  view?: View,
): Framing {
  const box = boundsOf(root, doc.camera.framing.fit)
  const sphere = new THREE.Sphere()
  if (box.isEmpty()) {
    sphere.center.set(0, 0, 0)
    sphere.radius = 1
  } else box.getBoundingSphere(sphere)
  return frameFromSphere(doc, sphere, aspect, view)
}

/** Both preview renderers use the same projection settings as final output. */
export function makeCamera(doc: SceneDocument, aspect: number): THREE.PerspectiveCamera | THREE.OrthographicCamera {
  return doc.camera.type === 'orthographic'
    ? new THREE.OrthographicCamera(-aspect, aspect, 1, -1, .001, 1000)
    : new THREE.PerspectiveCamera(doc.camera.fov, aspect, .001, 1000)
}
export function applyFraming(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, doc: SceneDocument, sphere: THREE.Sphere, aspect: number, view?: View): Framing {
  const framing = frameFromSphere(doc, sphere, aspect, view)
  camera.position.copy(framing.position)
  camera.lookAt(framing.target)
  camera.near = Math.max(framing.radius * .01, .0001)
  camera.far = framing.position.distanceTo(framing.target) + framing.radius * 10
  if (camera instanceof THREE.PerspectiveCamera) { camera.fov = doc.camera.fov; camera.aspect = aspect }
  else {
    const half = framing.radius * (1 + doc.camera.framing.padding) / Math.min(aspect, 1)
    camera.top = half; camera.bottom = -half; camera.left = -half * aspect; camera.right = half * aspect
  }
  camera.updateProjectionMatrix()
  return framing
}
