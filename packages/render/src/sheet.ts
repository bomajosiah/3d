import sharp, { type OverlayOptions } from 'sharp'
import type { Frame } from './renderer.ts'

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

export type SheetOptions = {
  columns?: number
  /** Checkerboard behind each tile, so transparent output is legible. */
  checker?: boolean
  label?: (frame: Frame, index: number) => string
}

/**
 * Packs several frames into ONE image. An agent gets one image per read, so
 * six timeline samples or four orthographic views in a single PNG is the
 * difference between one iteration and six.
 */
export async function contactSheet(frames: Frame[], opts: SheetOptions = {}): Promise<Buffer> {
  if (!frames.length) throw new Error('contactSheet needs at least one frame')
  const first = await sharp(frames[0]!.png).metadata()
  const tileW = first.width ?? 512
  const tileH = first.height ?? 512
  const label = opts.label ?? ((f: Frame) => (f.view ? f.view : `t=${f.time.toFixed(2)}s`))

  const cols = opts.columns ?? Math.min(frames.length, Math.ceil(Math.sqrt(frames.length)))
  const rows = Math.ceil(frames.length / cols)
  const pad = 8
  const bar = 26
  const cellW = tileW + pad * 2
  const cellH = tileH + pad + bar
  const width = cols * cellW
  const height = rows * cellH

  const checkerSvg = Buffer.from(
    `<svg width="${tileW}" height="${tileH}" xmlns="http://www.w3.org/2000/svg">
       <defs><pattern id="c" width="16" height="16" patternUnits="userSpaceOnUse">
         <rect width="16" height="16" fill="#ffffff"/>
         <rect width="8" height="8" fill="#e9e9ec"/>
         <rect x="8" y="8" width="8" height="8" fill="#e9e9ec"/>
       </pattern></defs>
       <rect width="100%" height="100%" fill="url(#c)"/>
     </svg>`,
  )

  const composites: OverlayOptions[] = []
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!
    const col = i % cols
    const row = Math.floor(i / cols)
    const left = col * cellW + pad
    const top = row * cellH + pad
    if (opts.checker !== false) composites.push({ input: checkerSvg, left, top })
    composites.push({ input: frame.png, left, top })
    const text = Buffer.from(
      `<svg width="${tileW}" height="${bar}" xmlns="http://www.w3.org/2000/svg">
         <text x="${tileW / 2}" y="17" font-family="-apple-system,Helvetica,Arial,sans-serif"
               font-size="14" fill="#3a3a3f" text-anchor="middle">${escapeXml(label(frame, i))}</text>
       </svg>`,
    )
    composites.push({ input: text, left, top: top + tileH + 2 })
  }

  return sharp({
    create: { width, height, channels: 4, background: { r: 246, g: 246, b: 248, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toBuffer()
}
