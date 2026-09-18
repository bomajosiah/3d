import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { RENDERER_SETTINGS } from '@3d/core'
import { parseSceneText } from '@3d/schema'
import { compareImages, renderFrames } from '../src/index.ts'

const doc = () => parseSceneText(readFileSync('packages/render/test/fixtures/rounded-cube.scene.json', 'utf8'), 'x')

/**
 * Regression guard. three only honours renderer.toneMapping when the current
 * render target is null, so an earlier version that drew into an offscreen
 * WebGLRenderTarget silently applied NO tone mapping — while the browser
 * viewport, which draws to the canvas, applied it. Exports and the editor
 * disagreed and nothing failed. These assert the setting reaches real pixels.
 */
describe('tone mapping reaches the headless output', () => {
  it('uses the setting shared with the browser viewport', async () => {
    const { stats } = await renderFrames(doc(), [{ time: 0 }], { width: 96, height: 96 })
    expect(stats.toneMapping).toBe(RENDERER_SETTINGS.toneMapping)
  })

  it('changes the pixels when the mapping changes', async () => {
    const opts = { width: 128, height: 128 }
    const neutral = await renderFrames(doc(), [{ time: 0.4 }], opts)
    const none = await renderFrames(doc(), [{ time: 0.4 }], {
      ...opts,
      toneMapping: THREE.NoToneMapping,
    })
    const diff = await compareImages(neutral.frames[0]!.png, none.frames[0]!.png)
    // If tone mapping were being dropped, both renders would be byte-identical.
    expect(diff.changed).toBeGreaterThan(0.05)
  })
})
