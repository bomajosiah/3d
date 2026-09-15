import * as THREE from 'three'
import { makeCamera, applyFraming, applyEnvironment, applyRendererSettings, buildScene, createComposer, evaluateAt, frameFromSphere, stableSphere, VIEW_DIRECTIONS, type Composer } from '@3d/core'
import type { SceneDocument, View } from '@3d/schema'

type InitOptions = {
  doc: SceneDocument
  width: number
  height: number
  transparent: boolean
  background?: string
  /** Override the shared setting. Mainly so tests can prove it reaches output. */
  toneMapping?: number
}

type FrameOptions = { time: number; view?: View; clip?: string }

type Session = {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  scene: THREE.Scene
  composer?: Composer
  built: ReturnType<typeof buildScene>
  opts: InitOptions
  sphere: THREE.Sphere
  canvas: OffscreenCanvas
  ctx: OffscreenCanvasRenderingContext2D
}

let session: Session | undefined

function init(opts: InitOptions): { triangles: number; warnings: string[] } {
  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(1) // determinism: never inherit the device ratio
  renderer.setSize(opts.width, opts.height, false)
  applyRendererSettings(renderer)
  if (opts.toneMapping !== undefined) renderer.toneMapping = opts.toneMapping as THREE.ToneMapping

  const built = buildScene(opts.doc)
  built.content.traverse(o => { if (o.userData.isReference) o.visible = false })
  const camera = makeCamera(opts.doc, opts.width / opts.height)

  // Frame once over the whole animation. Re-framing per frame makes a moving
  // object appear to pulse in size as the camera chases it.
  const sphere = stableSphere(opts.doc, built.content, (t) =>
    evaluateAt(opts.doc, built.content, t),
  )

  const scene = new THREE.Scene()
  scene.add(built.root)
  if (!opts.transparent && opts.background) scene.background = new THREE.Color(opts.background)
  applyEnvironment(renderer, scene, opts.doc)

  const composer = createComposer(renderer, scene, camera, opts.doc, opts.width, opts.height)

  const off = new OffscreenCanvas(opts.width, opts.height)
  const ctx = off.getContext('2d', { willReadFrequently: false }) as OffscreenCanvasRenderingContext2D

  session = { renderer, camera, scene, composer, built, opts, sphere, canvas: off, ctx }
  return { triangles: built.triangles, warnings: built.warnings }
}

async function frame(o: FrameOptions): Promise<{ png: string; coverage: number }> {
  if (!session) throw new Error('init() first')
  const { renderer, camera, scene, composer, built, opts, ctx } = session

  evaluateAt(opts.doc, built.content, o.time, o.clip)

  applyFraming(camera, opts.doc, session.sphere, opts.width / opts.height, o.view)

  renderer.setClearColor(0x000000, opts.transparent ? 0 : 1)

  // Render to the DEFAULT framebuffer, not an offscreen target. three only
  // applies renderer.toneMapping when currentRenderTarget === null, so drawing
  // into a target silently disabled tone mapping and made every export differ
  // from the editor. Reading the drawing buffer with readPixels still bypasses
  // the headless compositor, so the black-frame hazard stays avoided.
  renderer.setRenderTarget(null)
  renderer.clear()
  if (composer) composer.render()
  else renderer.render(scene, camera)

  const { width, height } = opts
  const buf = new Uint8Array(width * height * 4)
  const gl = renderer.getContext()
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf)

  // WebGL reads bottom-up; ImageData is top-down. Flip while copying, and
  // un-premultiply so transparent edges do not darken (the classic halo bug).
  const out = new Uint8ClampedArray(width * height * 4)
  let opaque = 0
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4
    const dst = y * width * 4
    for (let x = 0; x < width * 4; x += 4) {
      const a = buf[src + x + 3]!
      if (a > 8) opaque++
      if (a === 0 || a === 255) {
        out[dst + x] = buf[src + x]!
        out[dst + x + 1] = buf[src + x + 1]!
        out[dst + x + 2] = buf[src + x + 2]!
      } else {
        const inv = 255 / a
        out[dst + x] = Math.min(255, buf[src + x]! * inv)
        out[dst + x + 1] = Math.min(255, buf[src + x + 1]! * inv)
        out[dst + x + 2] = Math.min(255, buf[src + x + 2]! * inv)
      }
      out[dst + x + 3] = a
    }
  }

  ctx.putImageData(new ImageData(out, width, height), 0, 0)
  const blob = await session.canvas.convertToBlob({ type: 'image/png' })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return { png: btoa(binary), coverage: opaque / (width * height) }
}

/** Scene facts the empty-frame guard needs, measured on the built scene. */
function stats(): {
  bounds: number[]
  radius: number
  triangles: number
  nodes: number
  toneMapping: number
} {
  if (!session) throw new Error('init() first')
  const b = session.built.bounds
  return {
    toneMapping: session.renderer.toneMapping,
    bounds: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z],
    radius: session.built.radius,
    triangles: session.built.triangles,
    nodes: session.built.content.children.length,
  }
}

declare global {
  interface Window {
    __3d: { init: typeof init; frame: typeof frame; stats: typeof stats; VIEWS: typeof VIEW_DIRECTIONS }
  }
}

window.__3d = { init, frame, stats, VIEWS: VIEW_DIRECTIONS }
