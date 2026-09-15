import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { SceneDocument } from '@3d/schema'

/**
 * Ground-truth ambient occlusion.
 *
 * An environment map lights crevices as brightly as open surfaces, so narrow
 * features — the slots between fork tines, the inside of a bowl, the seam where
 * a head meets a handle — render flat and the shapes read as fused. AO is what
 * puts contact darkening back, and it is the difference between "a shape" and
 * "an object".
 *
 * Tone mapping and colour-space conversion move to OutputPass here: the
 * composer's intermediate targets are not the default framebuffer, so the
 * renderer would otherwise skip them entirely.
 */
export type Composer = {
  render: () => void
  setSize: (width: number, height: number) => void
  dispose: () => void
}

export function createComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  doc: SceneDocument,
  width: number,
  height: number,
): Composer | undefined {
  const strength = doc.environment.ao
  if (strength <= 0) return undefined

  // Alpha must survive every intermediate target or transparent exports come
  // back with an opaque black background.
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    // No MSAA on the composer target: SwiftShader's multisample resolve is not
    // bit-reproducible across contexts, which made renders differ run to run
    // and golden-image tests flaky. Edge quality comes from supersampling.
    samples: 0,
  })
  const composer = new EffectComposer(renderer, target)
  composer.setSize(width, height)

  composer.addPass(new RenderPass(scene, camera))

  const ao = new GTAOPass(scene, camera, width, height)
  ao.output = GTAOPass.OUTPUT.Default
  // Radius is in world units and the scenes are in metres, so it is scaled to
  // the object rather than left at the default, which assumes a large scene.
  ao.updateGtaoMaterial({
    radius: Math.max(doc.environment.aoRadius, 1e-4),
    distanceExponent: 1,
    thickness: 1,
    scale: strength,
    samples: 16,
    distanceFallOff: 1,
    screenSpaceRadius: false,
  })
  composer.addPass(ao)

  composer.addPass(new OutputPass())

  return {
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    dispose: () => {
      composer.dispose()
      target.dispose()
    },
  }
}
