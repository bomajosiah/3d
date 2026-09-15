import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as THREE from 'three'
import type { SceneDocument, View } from '@3d/schema'
import { buildScene, stableSphere, evaluateAt, frameFromSphere, RENDERER_SETTINGS } from '@3d/core'
import type { Frame, SceneStats } from '@3d/render'
import { blenderInfo, run } from './process.ts'
import { PYTHON_DIR } from './build.ts'

export async function renderFinal(doc: SceneDocument, requests: { time: number; view?: View }[], options: { width: number; height: number; samples?: number; root?: string }): Promise<{ frames: Frame[]; stats: SceneStats; warnings: string[] }> {
  const info = await blenderInfo(options.root)
  const built = buildScene(doc)
  const sphere = stableSphere(doc, built.content, t => evaluateAt(doc, built.content, t))
  const meshes: { positions: number[]; normals: number[]; indices: number[]; material: unknown; name: string }[] = []
  const objects: THREE.Mesh[] = []
  built.content.traverse(o => {
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
  if (!objects.length) throw new Error('E_EMPTY_FRAME: no exportable geometry')
  const directory = mkdtempSync(join(tmpdir(), '3d-final-'))
  try {
    const frames = requests.map((req, i) => {
      evaluateAt(doc, built.content, req.time)
      built.content.updateMatrixWorld(true)
      const framing = frameFromSphere(doc, sphere, options.width / options.height, req.view)
      return { ...req, output: join(directory, `${i}.png`), camera: { position: framing.position.toArray(), target: framing.target.toArray(), fov: doc.camera.fov, type: doc.camera.type, orthoScale: framing.radius * 2 * (1 + doc.camera.framing.padding) / Math.min(options.width / options.height, 1) },
        objects: objects.map(o => {
          let visible = true
          for (let p: THREE.Object3D | null = o; p; p = p.parent) visible &&= p.visible
          return { matrix: o.matrixWorld.toArray(), visible }
        }) }
    })
    writeFileSync(join(directory, 'request.json'), JSON.stringify({ meshes, frames, environment: doc.environment,
      width: options.width, height: options.height, samples: options.samples ?? 64,
      bounds: [built.bounds.min.toArray(), built.bounds.max.toArray()], center: sphere.center.toArray(), radius: sphere.radius }))
    await run(info.executable, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(PYTHON_DIR, 'render.py'), '--', join(directory, 'request.json')], 900_000)
    return { frames: frames.map(f => ({ time: f.time, view: f.view, png: readFileSync(f.output), coverage: 1 }) as Frame),
      stats: { bounds: [...built.bounds.min.toArray(), ...built.bounds.max.toArray()] as SceneStats['bounds'], radius: sphere.radius, triangles: built.triangles, nodes: built.content.children.length, toneMapping: RENDERER_SETTINGS.toneMapping }, warnings: built.warnings }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
