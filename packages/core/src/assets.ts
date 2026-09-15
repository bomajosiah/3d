import * as THREE from 'three'
import type { SceneDocument, SceneNode } from '@3d/schema'

export type AssetNode = Extract<SceneNode, { type: 'asset' }>
export type MeshData = {
  name: string
  positions: number[]
  normals: number[]
  indices: number[]
  material?: string
}
export type CompiledAsset = { meshes: MeshData[]; hash: string; glb: string; report: unknown; blenderVersion: string }
export type CompiledAssets = Record<string, CompiledAsset>
export const assetKey = (node: AssetNode): string => JSON.stringify([node.builder, node.parameters, node.dependencies])
export const compiledAssets = (doc: SceneDocument): CompiledAssets => (doc.meta?.compiledAssets ?? {}) as CompiledAssets

export function meshGeometry(mesh: MeshData): THREE.BufferGeometry {
  if (!mesh.positions.length || mesh.positions.length % 3 || mesh.indices.length % 3 ||
      mesh.normals.length !== mesh.positions.length ||
      [...mesh.positions, ...mesh.normals].some(n => !Number.isFinite(n)) ||
      mesh.indices.some(i => !Number.isInteger(i) || i < 0 || i >= mesh.positions.length / 3)) {
    throw new Error(`Invalid compiled mesh: ${mesh.name}`)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3))
  g.setIndex(mesh.indices)
  return g
}
