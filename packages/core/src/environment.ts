import * as THREE from 'three'
import type { SceneDocument } from '@3d/schema'

type LightSpec = {
  kind: 'ambient' | 'hemisphere' | 'directional'
  color: string
  ground?: string
  intensity: number
  position?: [number, number, number]
  shadow?: boolean
}

/**
 * A preset installs a whole rig, not a single light. This is deliberate: an
 * agent asking for "studio-soft" gets professional lighting without reasoning
 * about placement, which is the single highest-leverage quality lever we have.
 * Positions are unit directions; the rig is scaled to the scene at build time.
 */
export const ENVIRONMENT_RIGS: Record<string, LightSpec[]> = {
  'studio-soft': [
    { kind: 'hemisphere', color: '#ffffff', ground: '#b9b2a6', intensity: 1.1 },
    { kind: 'directional', color: '#fff6e8', intensity: 2.2, position: [0.7, 2.6, 0.9], shadow: true },
    { kind: 'directional', color: '#dce7ff', intensity: 0.7, position: [-1.2, 0.6, 0.8] },
    { kind: 'directional', color: '#ffffff', intensity: 0.5, position: [-0.4, 0.5, -1.4] },
  ],
  'studio-contrast': [
    { kind: 'ambient', color: '#6f7480', intensity: 0.5 },
    { kind: 'directional', color: '#ffffff', intensity: 3.6, position: [0.9, 2.4, 0.7], shadow: true },
    { kind: 'directional', color: '#8fa6d8', intensity: 0.5, position: [-1.4, 0.3, -0.8] },
  ],
  'product-white': [
    { kind: 'hemisphere', color: '#ffffff', ground: '#ededed', intensity: 1.6 },
    { kind: 'directional', color: '#ffffff', intensity: 1.8, position: [0.5, 2.8, 0.8], shadow: true },
    { kind: 'directional', color: '#ffffff', intensity: 1.0, position: [-1, 0.8, 0.6] },
    { kind: 'directional', color: '#ffffff', intensity: 0.8, position: [0, 0.4, -1.3] },
  ],
  'warm-key': [
    { kind: 'ambient', color: '#5b4636', intensity: 0.7 },
    { kind: 'directional', color: '#ffd9a0', intensity: 2.1, position: [1.0, 2.2, 0.6], shadow: true },
    { kind: 'directional', color: '#6b8cff', intensity: 0.5, position: [-1, 0.4, -0.9] },
  ],
  'rim-dark': [
    { kind: 'ambient', color: '#2a2e3a', intensity: 0.6 },
    { kind: 'directional', color: '#ffffff', intensity: 2.6, position: [-0.8, 0.9, -1.4] },
    { kind: 'directional', color: '#7fc6ff', intensity: 1.4, position: [1.4, 0.4, -1.0] },
    { kind: 'directional', color: '#ffffff', intensity: 0.4, position: [0.3, 2.4, 0.8], shadow: true },
  ],
  'flat-icon': [
    { kind: 'ambient', color: '#ffffff', intensity: 2.0 },
    { kind: 'directional', color: '#ffffff', intensity: 1.2, position: [0.6, 1.2, 1.0] },
  ],
}

/**
 * The environment map now supplies ambient and fill light, so the analytic rig
 * is scaled back to avoid double-counting: ambient/hemisphere terms exist only
 * as a small floor, and directionals are kept mainly for shaping and shadows.
 */
const AMBIENT_SCALE = 0.18
const DIRECTIONAL_SCALE = 0.5

export function buildEnvironment(doc: SceneDocument, radius: number): THREE.Group {
  const group = new THREE.Group()
  group.name = '__environment'
  const rig = ENVIRONMENT_RIGS[doc.environment.preset] ?? ENVIRONMENT_RIGS['studio-soft']!
  const distance = Math.max(radius * 4, 1)

  for (const spec of rig) {
    const balance = spec.kind === 'directional' ? DIRECTIONAL_SCALE : AMBIENT_SCALE
    const intensity = spec.intensity * doc.environment.intensity * balance
    if (spec.kind === 'ambient') {
      group.add(new THREE.AmbientLight(new THREE.Color(spec.color), intensity))
      continue
    }
    if (spec.kind === 'hemisphere') {
      group.add(
        new THREE.HemisphereLight(
          new THREE.Color(spec.color),
          new THREE.Color(spec.ground ?? '#888888'),
          intensity,
        ),
      )
      continue
    }
    const light = new THREE.DirectionalLight(new THREE.Color(spec.color), intensity)
    const [x, y, z] = spec.position ?? [1, 1, 1]
    light.position.set(x, y, z).normalize().multiplyScalar(distance)
    if (spec.shadow) {
      light.castShadow = true
      light.shadow.mapSize.set(2048, 2048)
      const cam = light.shadow.camera
      const extent = radius * 1.8
      cam.left = -extent
      cam.right = extent
      cam.top = extent
      cam.bottom = -extent
      cam.near = 0.01
      cam.far = distance * 3
      light.shadow.bias = -0.0008
      light.shadow.normalBias = radius * 0.02
      // A wide PCF radius is what turns a hard cast shadow into the soft
      // contact shadow that makes a floating icon read as solid.
      light.shadow.radius = 6
    }
    group.add(light)
  }

  // Environment rotation spins the whole rig, so relighting is one number.
  group.rotation.y = (doc.environment.rotation * Math.PI) / 180
  return group
}
