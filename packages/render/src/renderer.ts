import sharp from 'sharp'
import { chromium, type Browser, type Page } from 'playwright'
import type { SceneDocument, View } from '@3d/schema'
import { browserBundle } from './bundle.ts'

export type RenderOptions = {
  width?: number
  height?: number
  transparent?: boolean
  background?: string
  clip?: string
  /** Override the shared tone-mapping setting from @3d/core. */
  toneMapping?: number
  /**
   * Render at this multiple of the target size and downsample. MSAA only
   * antialiases geometry edges; supersampling also cleans up specular
   * shimmer and thin features like fork tines. 1 disables it.
   */
  supersample?: number
}

export type Frame = { time: number; view?: View; png: Buffer; coverage: number }

/**
 * Lanczos downsample of a supersampled frame. Done here rather than in the
 * browser because canvas drawImage uses a cheaper filter, and the alpha is
 * already straight (un-premultiplied) by this point, so resizing cannot
 * reintroduce edge halos.
 */
const downsample = (png: Buffer, width: number, height: number): Promise<Buffer> =>
  sharp(png).resize(width, height, { kernel: 'lanczos3', fit: 'fill' }).png().toBuffer()

export type SceneStats = {
  bounds: [number, number, number, number, number, number]
  radius: number
  triangles: number
  nodes: number
  toneMapping: number
}

export type RenderSession = {
  frames(requests: { time: number; view?: View }[]): Promise<Frame[]>
  stats(): Promise<SceneStats>
  warnings: string[]
  close(): Promise<void>
}

/**
 * Headless Chromium is used for its real WebGL implementation, but we never
 * take a page screenshot — frames come out of an offscreen render target. That
 * distinction is what avoids the well-known black-frame failure where canvas
 * presentation never reaches the headless compositor.
 */
export async function openSession(
  doc: SceneDocument,
  options: RenderOptions = {},
): Promise<RenderSession> {
  const width = options.width ?? 512
  const height = options.height ?? width
  const ss = Math.max(1, Math.min(4, Math.round(options.supersample ?? 2)))
  const transparent = options.transparent ?? doc.environment.background === 'transparent'
  const background = transparent ? undefined : (options.background ?? doc.environment.background as string)

  const browser: Browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-lcd-text',
      '--force-color-profile=srgb',
      '--disable-partial-raster',
      '--deterministic-mode',
    ],
  })

  const page: Page = await browser.newPage({ viewport: { width: 64, height: 64 } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: await browserBundle() })

  const init = await page.evaluate(
    (args) => window.__3d.init(args),
    { doc, width: width * ss, height: height * ss, transparent, background, toneMapping: options.toneMapping },
  )
  if (errors.length) {
    await browser.close()
    throw new Error(`render page failed: ${errors.join('; ')}`)
  }

  return {
    warnings: init.warnings,
    async stats() {
      return (await page.evaluate(() => window.__3d.stats())) as SceneStats
    },
    async frames(requests) {
      const out: Frame[] = []
      for (const req of requests) {
        const r = await page.evaluate((a) => window.__3d.frame(a), {
          time: req.time,
          view: req.view,
          clip: options.clip,
        })
        const raw = Buffer.from(r.png, 'base64')
        out.push({
          time: req.time,
          view: req.view,
          png: ss === 1 ? raw : await downsample(raw, width, height),
          coverage: r.coverage,
        })
      }
      return out
    },
    async close() {
      await browser.close()
    },
  }
}

/** One-shot convenience for the common "render these times" case. */
export async function renderFrames(
  doc: SceneDocument,
  requests: { time: number; view?: View }[],
  options: RenderOptions = {},
): Promise<{ frames: Frame[]; stats: SceneStats; warnings: string[] }> {
  const session = await openSession(doc, options)
  try {
    const stats = await session.stats()
    const frames = await session.frames(requests)
    return { frames, stats, warnings: session.warnings }
  } finally {
    await session.close()
  }
}
