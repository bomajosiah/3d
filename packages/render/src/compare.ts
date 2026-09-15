import sharp from 'sharp'

export type ImageDiff = {
  width: number
  height: number
  /** Fraction of pixels differing by more than `threshold` on any channel. */
  changed: number
  maxChannelDelta: number
  meanChannelDelta: number
}

const raw = async (png: Buffer, prefilter = 0) => {
  let pipeline = sharp(png).ensureAlpha()
  if (prefilter > 0) {
    // Averaging over a small neighbourhood before comparing. Ambient occlusion
    // is not bit-reproducible across GPU contexts: the mean difference between
    // two runs is ~0.08/255, but isolated silhouette pixels flip outright.
    // Comparing raw pixels therefore reports drift when nothing changed, while
    // a perceptual comparison still catches any real shift in colour or shape.
    const meta = await sharp(png).metadata()
    pipeline = pipeline
      .resize(Math.max(1, Math.round((meta.width ?? 1) / prefilter)), undefined, { kernel: 'lanczos3' })
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/**
 * Tolerance-based image comparison. Renders here are byte-deterministic, but
 * comparing hashes would make every three.js upgrade a wall of failures with
 * no signal about whether anything actually looks different.
 */
export async function compareImages(
  a: Buffer,
  b: Buffer,
  threshold = 6,
  prefilter = 0,
): Promise<ImageDiff> {
  const [x, y] = await Promise.all([raw(a, prefilter), raw(b, prefilter)])
  if (x.width !== y.width || x.height !== y.height) {
    throw new Error(`size mismatch: ${x.width}×${x.height} vs ${y.width}×${y.height}`)
  }
  let changed = 0
  let max = 0
  let total = 0
  for (let i = 0; i < x.data.length; i += 4) {
    let worst = 0
    for (let ch = 0; ch < 4; ch++) {
      const d = Math.abs(x.data[i + ch]! - y.data[i + ch]!)
      if (d > worst) worst = d
      total += d
    }
    if (worst > max) max = worst
    if (worst > threshold) changed++
  }
  const pixels = x.width * x.height
  return {
    width: x.width,
    height: x.height,
    changed: changed / pixels,
    maxChannelDelta: max,
    meanChannelDelta: total / (pixels * 4),
  }
}

/** Side-by-side plus an amplified difference map, for eyeballing a regression. */
export async function diffSheet(a: Buffer, b: Buffer): Promise<Buffer> {
  const [x, y] = await Promise.all([raw(a), raw(b)])
  const out = Buffer.alloc(x.data.length)
  for (let i = 0; i < x.data.length; i += 4) {
    let worst = 0
    for (let ch = 0; ch < 4; ch++) worst = Math.max(worst, Math.abs(x.data[i + ch]! - y.data[i + ch]!))
    const v = Math.min(255, worst * 8)
    out[i] = v
    out[i + 1] = Math.max(0, 60 - v)
    out[i + 2] = Math.max(0, 60 - v)
    out[i + 3] = 255
  }
  const diff = await sharp(out, { raw: { width: x.width, height: x.height, channels: 4 } }).png().toBuffer()
  return sharp({
    create: { width: x.width * 3, height: x.height, channels: 4, background: { r: 20, g: 20, b: 22, alpha: 1 } },
  })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: b, left: x.width, top: 0 },
      { input: diff, left: x.width * 2, top: 0 },
    ])
    .png()
    .toBuffer()
}
