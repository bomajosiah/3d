import * as THREE from 'three'
import type { SceneDocument } from '@3d/schema'

/**
 * Procedural studio environments.
 *
 * Metals have almost no diffuse response — they are nearly pure reflection — so
 * with analytic lights alone `metalness` above ~0.4 just goes dark and gold
 * reads as brown plastic. An environment map is what gives metal something to
 * reflect. These are generated rather than loaded so the repo ships no HDR
 * assets and renders stay byte-deterministic.
 */
type Panel = {
  position: [number, number, number]
  /** Width, height of the emissive quad. */
  size: [number, number]
  /** Direction the quad faces; it is oriented to look at this point. */
  lookAt?: [number, number, number]
  color: string
  intensity: number
}

type EnvSpec = { room: string; floor: string; panels: Panel[] }

const ENVIRONMENTS: Record<string, EnvSpec> = {
  'studio-soft': {
    room: '#b8b8bd',
    floor: '#8e8a84',
    panels: [
      { position: [0, 4, 1.4], size: [6, 3], color: '#ffffff', intensity: 4.2 },
      { position: [-3.4, 1.2, 1.8], size: [3, 4], color: '#dfe8ff', intensity: 1.8 },
      { position: [3.2, 1.6, -1.6], size: [3, 3], color: '#fff3e2', intensity: 2.2 },
    ],
  },
  'studio-contrast': {
    room: '#4b4b52',
    floor: '#2f2f35',
    panels: [
      { position: [1.4, 4, 1.2], size: [3.4, 2.4], color: '#ffffff', intensity: 8 },
      { position: [-3.6, 0.6, 0.8], size: [2, 3], color: '#9fb4e8', intensity: 1.2 },
    ],
  },
  'product-white': {
    room: '#e9e9ec',
    floor: '#d6d3ce',
    panels: [
      { position: [0, 4.2, 0.6], size: [7, 4], color: '#ffffff', intensity: 4.6 },
      { position: [-3.6, 1.4, 1.6], size: [4, 4], color: '#ffffff', intensity: 2.6 },
      { position: [3.6, 1.4, 1.6], size: [4, 4], color: '#ffffff', intensity: 2.6 },
      { position: [0, 0.4, -3.6], size: [5, 3], color: '#ffffff', intensity: 1.6 },
    ],
  },
  'warm-key': {
    room: '#6a5a4a',
    floor: '#3d3228',
    panels: [
      { position: [2.2, 3.6, 1.4], size: [3.4, 3], color: '#ffd9a0', intensity: 7 },
      { position: [-3.2, 0.8, -1.2], size: [3, 3], color: '#7f9bff', intensity: 1.6 },
    ],
  },
  'rim-dark': {
    room: '#26262d',
    floor: '#17171c',
    panels: [
      { position: [-2.6, 2.2, -3.2], size: [3, 3], color: '#ffffff', intensity: 9 },
      { position: [3.4, 1.4, -2.6], size: [2.6, 3], color: '#7fc6ff', intensity: 5 },
      { position: [0, 4, 2.4], size: [4, 2], color: '#ffffff', intensity: 1.1 },
    ],
  },
  'flat-icon': {
    room: '#d8d8dc',
    floor: '#cccccf',
    panels: [{ position: [0, 4, 2], size: [8, 6], color: '#ffffff', intensity: 3 }],
  },
}

/**
 * Authored lights become emissive panels too, not just analytic lights. Metal is
 * nearly pure reflection, so a rig that exists only as analytic lights leaves
 * metal reflecting the preset room and looking untouched by the rig.
 *
 * The environment is scale-free while authored lights are in scene units, so
 * each panel is placed along its light's direction at a fixed radius, sized by
 * the angle the light subtends, and given the radiance P / (4*pi*size^2).
 */
const ENV_RADIUS = 3.6
const ENV_POWER_SCALE = 0.62

function customPanels(doc: SceneDocument): Panel[] {
  return doc.environment.lights.map((l) => {
    const from = new THREE.Vector3(...l.position)
    const to = new THREE.Vector3(...l.target)
    const distance = Math.max(from.distanceTo(to), 1e-4)
    const dir = from.clone().sub(to).normalize()
    const span = Math.max((l.size / distance) * ENV_RADIUS, 0.2)
    return {
      position: [dir.x * ENV_RADIUS, dir.y * ENV_RADIUS, dir.z * ENV_RADIUS] as [number, number, number],
      size: [span, span] as [number, number],
      lookAt: [0, 0, 0] as [number, number, number],
      color: l.color,
      intensity: (l.power / (4 * Math.PI * l.size * l.size)) * ENV_POWER_SCALE,
    }
  })
}

function buildEnvironmentScene(doc: SceneDocument): THREE.Scene {
  const preset = doc.environment.preset
  const custom = doc.environment.lights.length > 0
  const base = ENVIRONMENTS[preset] ?? ENVIRONMENTS['studio-soft']!
  // A flat dim room when the rig is authored, so the panels carry the look —
  // the final renderer's world is likewise a dim flat grey behind its lights.
  const spec: EnvSpec = custom
    ? { room: '#4a4a4d', floor: '#3a3a3d', panels: customPanels(doc) }
    : base
  const scene = new THREE.Scene()

  // An inverted box is the room itself: it sets what the object reflects in
  // every direction the panels do not cover.
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(14, 14, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.room), side: THREE.BackSide }),
  )
  scene.add(room)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.floor) }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -6.9
  scene.add(floor)

  for (const panel of spec.panels) {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(panel.size[0], panel.size[1]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(panel.color).multiplyScalar(panel.intensity) }),
    )
    light.position.set(...panel.position)
    light.lookAt(new THREE.Vector3(...(panel.lookAt ?? [0, 0, 0])))
    scene.add(light)
  }

  return scene
}

// A PMREM texture belongs to the WebGL renderer/context that produced it. The
// Studio replaces its Canvas (and therefore its renderer) while changing
// projects, so a preset-only cache can hand the new renderer a texture backed
// by the previous, already-disposed context. Include the renderer in the cache
// identity even when the two projects use the same preset.
let cache: { renderer: THREE.WebGLRenderer; key: string; texture: THREE.Texture } | undefined

/**
 * Builds (and caches) the prefiltered environment for a document and attaches
 * it to the scene. Both renderers call this, so the editor and the export
 * reflect the same world.
 */
export function applyEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  doc: SceneDocument,
): void {
  const rotation = doc.environment.rotation
  // Authored lights change the map, so they belong in the cache identity.
  const key = doc.environment.lights.length
    ? `custom:${JSON.stringify(doc.environment.lights)}`
    : doc.environment.preset

  if (!cache || cache.renderer !== renderer || cache.key !== key) {
    cache?.texture.dispose()
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    const envScene = buildEnvironmentScene(doc)
    const target = pmrem.fromScene(envScene, 0.04)
    envScene.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose?.()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose?.()
    })
    pmrem.dispose()
    cache = { renderer, key, texture: target.texture }
  }

  scene.environment = cache.texture
  scene.environmentIntensity = doc.environment.intensity
  scene.environmentRotation = new THREE.Euler(0, (rotation * Math.PI) / 180, 0)
}

/** Frees the cached environment; call when tearing a renderer down. */
export function disposeEnvironment(): void {
  cache?.texture.dispose()
  cache = undefined
}
