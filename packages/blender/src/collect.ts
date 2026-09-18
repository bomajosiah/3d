import * as THREE from 'three'

export type CollectedMesh = { name: string; positions: number[]; normals: number[]; indices: number[]; material: unknown }

/**
 * Local-space geometry plus the objects it came from, in one traversal order so
 * a caller can zip per-frame world matrices onto it. Shared by the Cycles
 * renderer and the model exporter so both see exactly the same scene.
 */
export function collectMeshes(content: THREE.Object3D): { meshes: CollectedMesh[]; objects: THREE.Mesh[] } {
  const meshes: CollectedMesh[] = []
  const objects: THREE.Mesh[] = []
  content.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.userData.isReference) return
    const g = o.geometry
    const material = o.material as THREE.MeshStandardMaterial
    meshes.push({ name: o.name, positions: Array.from(g.getAttribute('position').array),
      normals: Array.from(g.getAttribute('normal').array),
      indices: g.index ? Array.from(g.index.array) : Array.from({ length: g.getAttribute('position').count }, (_, i) => i),
      material: { color: `#${material.color.getHexString()}`, metalness: material.metalness ?? 0, roughness: material.roughness ?? .5,
        opacity: material.opacity, unlit: material.type === 'MeshBasicMaterial' } })
    objects.push(o)
  })
  return { meshes, objects }
}
