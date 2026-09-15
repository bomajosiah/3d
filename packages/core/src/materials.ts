import * as THREE from 'three'
import type { Material as MaterialSpec } from '@3d/schema'

const DEFAULT: MaterialSpec = {
  type: 'physical',
  color: '#c9c4bb',
  roughness: 0.45,
  metalness: 0,
  opacity: 1,
  flatShading: false,
}

export function buildMaterial(spec: MaterialSpec = DEFAULT): THREE.Material {
  const common = {
    color: new THREE.Color(spec.color),
    transparent: spec.opacity < 1,
    opacity: spec.opacity,
    flatShading: spec.flatShading,
  }
  if (spec.type === 'unlit') return new THREE.MeshBasicMaterial(common)
  return new THREE.MeshStandardMaterial({
    ...common,
    roughness: spec.roughness,
    metalness: spec.metalness,
    ...(spec.emissive ? { emissive: new THREE.Color(spec.emissive) } : {}),
  })
}

export const defaultMaterial = (): MaterialSpec => ({ ...DEFAULT })
