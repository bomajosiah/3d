import * as THREE from 'three'
import type { SceneDocument, SceneNode } from '@3d/schema'
import { buildGeometry, triangleCount } from './geometry.ts'
import { buildMaterial, defaultMaterial } from './materials.ts'
import { assetKey, compiledAssets, meshGeometry } from './assets.ts'
import { buildEnvironment } from './environment.ts'

const DEG = Math.PI / 180

export type BuildResult = {
  root: THREE.Group
  /** Everything the author authored — excludes lights, ground and references. */
  content: THREE.Group
  bounds: THREE.Box3
  radius: number
  triangles: number
  warnings: string[]
}

function applyTransform(obj: THREE.Object3D, node: SceneNode): void {
  const t = node.transform
  obj.position.set(t.position[0], t.position[1], t.position[2])
  obj.rotation.set(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG)
  obj.scale.set(t.scale[0], t.scale[1], t.scale[2])
}

function buildNode(
  node: SceneNode,
  doc: SceneDocument,
  state: { triangles: number; warnings: string[]; index: number },
): THREE.Object3D {
  let obj: THREE.Object3D

  if (node.modifiers.length) throw new Error('Scene modifiers are unsupported; use a procedural builder')
  if (node.type === 'asset') {
    const asset = compiledAssets(doc)[assetKey(node)]
    if (!asset) throw new Error(`Asset ${node.name ?? node.builder} has not been built. Run 3d build first.`)
    obj = new THREE.Group()
    for (const data of asset.meshes) {
      const material = node.material ?? data.material
      const mesh = new THREE.Mesh(meshGeometry(data), buildMaterial(material ? doc.materials[material] : undefined))
      mesh.name = data.name
      mesh.userData.internal = true // Asset parts inherit the scene node transform; never animate twice.
      mesh.castShadow = mesh.receiveShadow = true
      state.triangles += triangleCount(mesh.geometry)
      obj.add(mesh)
    }
  } else if (node.type === 'reference') {
    // A blueprint plane: visible while modelling, never present in an export.
    const geo = new THREE.PlaneGeometry(node.height, node.height)
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: node.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0xffffff,
    })
    obj = new THREE.Mesh(geo, mat)
    obj.userData.isReference = true
    obj.userData.referenceImage = node.image
    obj.userData.referenceView = node.view
  } else {
    const geometry = buildGeometry(node)
    if (geometry) {
      const spec = (node.material && doc.materials[node.material]) || defaultMaterial()
      if (node.material && !doc.materials[node.material]) {
        state.warnings.push(
          `node "${node.name ?? node.type}" references material "${node.material}", which is not defined`,
        )
      }
      const mesh = new THREE.Mesh(geometry, buildMaterial(spec))
      mesh.castShadow = true
      mesh.receiveShadow = true
      state.triangles += triangleCount(geometry)
      obj = mesh
    } else {
      obj = new THREE.Group()
    }
  }

  obj.name = node.name ?? `${node.type}-${state.index++}`
  obj.visible = node.visible
  obj.userData.nodeId = node.id
  obj.userData.nodeType = node.type
  obj.userData.tags = node.tags
  applyTransform(obj, node)

  if (node.type !== 'reference') {
    for (const child of node.children) obj.add(buildNode(child, doc, state))
  }
  return obj
}

/**
 * The single document → three.js converter. Both the browser viewport and the
 * headless renderer call this, on the same `three` version, so what the agent
 * sees in a PNG and what the human sees in the editor cannot drift apart.
 */
export function buildScene(doc: SceneDocument): BuildResult {
  const root = new THREE.Group()
  root.name = '__root'
  const content = new THREE.Group()
  content.name = '__content'
  root.add(content)

  const state = { triangles: 0, warnings: [] as string[], index: 0 }
  for (const node of doc.nodes) content.add(buildNode(node, doc, state))

  // Bounds drive lighting distance, shadow extents and camera framing, so they
  // are measured before anything non-authored joins the scene.
  //
  // The explicit update is load-bearing: Box3.setFromObject only refreshes the
  // object's OWN world matrix, not its ancestors', so without this every node
  // inside a moved group is measured at its local position and the group's
  // offset silently vanishes from the bounds.
  content.updateMatrixWorld(true)
  const bounds = new THREE.Box3()
  content.traverse((o) => {
    if (o.userData.isReference) return
    if (!(o instanceof THREE.Mesh)) return
    const position = o.geometry.getAttribute('position')
    const point = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) bounds.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld))
  })
  if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1))

  const sphere = new THREE.Sphere()
  bounds.getBoundingSphere(sphere)
  const radius = Math.max(sphere.radius, 1e-3)

  const env = buildEnvironment(doc, radius)
  env.userData.internal = true
  root.add(env)

  // A shadow-catcher keeps contact shadows on a transparent background, which
  // is most of what makes a floating 3D icon read as solid rather than pasted.
  const ground = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(
    // Kept close to the object: a huge catcher turns a contact shadow into a
    // long rake across the frame, which reads as a mistake at icon scale.
    new THREE.PlaneGeometry(radius * 6, radius * 6),
    new THREE.ShadowMaterial({ opacity: 0.18, transparent: true }),
  )
  ground.visible = doc.environment.floor.mode !== 'none'
  if (doc.environment.floor.mode === 'solid') ground.material = new THREE.MeshStandardMaterial({ color: doc.environment.floor.color, roughness: 0.85 })
  ground.rotation.x = -Math.PI / 2
  // Sit just below the lowest geometry: coplanar with it z-fights into a
  // bright seam that reads as a modelling error rather than a renderer one.
  ground.position.y = bounds.min.y - radius * 0.002
  ground.receiveShadow = true
  ground.name = '__ground'
  ground.userData.internal = true
  root.add(ground)

  if (!doc.nodes.length) state.warnings.push('scene has no nodes — every render will be empty')

  return { root, content, bounds, radius, triangles: state.triangles, warnings: state.warnings }
}
