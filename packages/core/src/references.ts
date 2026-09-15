import * as THREE from 'three'

const loaded = new WeakMap<THREE.Mesh, Promise<void>>()

/** Only the studio loads image planes. Exports never fetch or include references. */
export async function loadReferences(root: THREE.Object3D): Promise<void> {
  const tasks: Promise<void>[] = []
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.userData.isReference) return
    let task = loaded.get(o)
    if (!task) task = (async () => {
      const texture = await new THREE.TextureLoader().loadAsync(o.userData.referenceImage)
      texture.colorSpace = THREE.SRGBColorSpace
      const material = o.material as THREE.MeshBasicMaterial
      material.map = texture
      material.needsUpdate = true
      // Scale geometry, not node transforms, so document scale remains authoritative.
      o.geometry.scale(texture.image.width / texture.image.height, 1, 1)
      const rotation: Record<string, [number, number, number]> = {
        front: [0,0,0], back: [0,Math.PI,0], left: [0,-Math.PI/2,0], right: [0,Math.PI/2,0],
        top: [-Math.PI/2,0,0], bottom: [Math.PI/2,0,0],
      }
      const [x,y,z] = rotation[o.userData.referenceView] ?? [0,0,0]
      o.geometry.rotateX(x); o.geometry.rotateY(y); o.geometry.rotateZ(z)
    })()
    loaded.set(o, task)
    tasks.push(task)
  })
  await Promise.all(tasks)
}
