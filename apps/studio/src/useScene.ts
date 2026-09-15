import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { SceneDocument } from '@3d/schema'
import { compiledAssets, type MeshData } from '@3d/core'

export type Diagnostic = { message: string; path: (string | number)[]; line?: number; column?: number }
export type SceneState =
  | { status: 'loading' }
  | { status: 'ok'; name: string; doc: SceneDocument; stale?: boolean; diagnostics?: Diagnostic[] }
  | { status: 'invalid'; name: string; diagnostics: Diagnostic[] }
type Payload = { ok: boolean; path: string; name: string; doc?: SceneDocument; diagnostics?: Diagnostic[] }

async function hydrate(doc: SceneDocument): Promise<SceneDocument> {
  await Promise.all(Object.values(compiledAssets(doc)).map(async asset => {
    const gltf = await new GLTFLoader().loadAsync(asset.glb)
    gltf.scene.updateMatrixWorld(true)
    const meshes: MeshData[] = []
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld)
      meshes.push({ name: o.name, material: o.userData.material_key,
        positions: Array.from(g.getAttribute('position').array), normals: Array.from(g.getAttribute('normal').array),
        indices: g.index ? Array.from(g.index.array) : Array.from({ length: g.getAttribute('position').count }, (_, i) => i) })
      g.dispose(); o.geometry.dispose()
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose()
    })
    if (!meshes.length) throw new Error('Compiled GLB contained no meshes')
    asset.meshes = meshes
  }))
  return doc
}

/** Fetch and HMR share one sequence counter: slow obsolete builds cannot replace newer edits. */
export function useScene(path: string | undefined): SceneState {
  const [state, setState] = useState<SceneState>({ status: 'loading' })
  useEffect(() => {
    if (!path) return
    let cancelled = false, generation = 0
    setState({ status: 'loading' })
    const accept = async (payload: Payload) => {
      if (payload.path !== path || cancelled) return
      const ticket = ++generation
      try {
        if (!payload.ok || !payload.doc) throw payload.diagnostics ?? [{ message: 'Scene load failed', path: [] }]
        const doc = await hydrate(payload.doc)
        if (!cancelled && ticket === generation) setState({ status: 'ok', name: payload.name, doc })
      } catch (error) {
        if (cancelled || ticket !== generation) return
        const diagnostics: Diagnostic[] = Array.isArray(error) ? error : [{ message: String(error), path: [] }]
        setState(previous => previous.status === 'ok'
          ? { ...previous, stale: true, diagnostics }
          : { status: 'invalid', name: payload.name, diagnostics })
      }
    }
    fetch(`/__3d/scene?path=${encodeURIComponent(path)}`).then(r => r.json()).then(accept).catch(error => accept({ ok: false, path, name: path, diagnostics: [{ message: String(error), path: [] }] }))
    import.meta.hot?.on('3d:scene', accept)
    return () => { cancelled = true; import.meta.hot?.off('3d:scene', accept) }
  }, [path])
  return state
}
