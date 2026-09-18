import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import sharp from 'sharp'
import { durationOf } from '@3d/core'
import { parseSceneText } from '@3d/schema'
import { prepareAssets, projectRoot } from './build.ts'
import { renderFinal } from './render.ts'

export type IconExportProgress = { progress: number; stage: string }
export type IconExportResult = { output: string; name: string; frames: number; fps: number; sizes: number[] }
export type IconExportOptions = { output?: string; onProgress?: (update: IconExportProgress) => void }

/** Render and package the current Flutter UI icon deliverable. */
export async function exportFlutterIcon(scenePath: string, options: IconExportOptions = {}): Promise<IconExportResult> {
  const sceneFile = resolve(scenePath)
  const name = basename(sceneFile).replace(/\.scene\.json$/, '')
  const outputRoot = resolve(options.output ?? join(projectRoot(sceneFile), 'dist', 'icons', name))
  const report = options.onProgress ?? (() => {})

  report({ progress: 3, stage: 'Preparing scene' })
  const source = readFileSync(sceneFile, 'utf8')
  const doc = await prepareAssets(parseSceneText(source, sceneFile), sceneFile)
  const clip = doc.animation.clips[0]
  if (!clip) throw new Error('UI icon export needs an animation clip')

  const fps = Math.min(24, clip.fps)
  const duration = durationOf(doc)
  const frameCount = Math.max(2, Math.round(duration * fps))
  const times = Array.from({ length: frameCount }, (_, index) => duration * index / frameCount)
  const masterSize = 1536
  const sizes = [
    { scale: 1, pixels: 256, directory: outputRoot },
    { scale: 2, pixels: 512, directory: join(outputRoot, '2.0x') },
    { scale: 3, pixels: 768, directory: join(outputRoot, '3.0x') },
  ]

  mkdirSync(outputRoot, { recursive: true })
  report({ progress: 8, stage: `Rendering ${frameCount} frames` })
  const rendered = await renderFinal(doc, times.map((time) => ({ time })), {
    width: masterSize,
    height: masterSize,
    samples: 24,
    root: projectRoot(sceneFile),
  })

  report({ progress: 82, stage: 'Packaging 1× assets' })
  const temporary = mkdtempSync(join(tmpdir(), `${name}-icon-`))
  try {
    for (const [variantIndex, variant] of sizes.entries()) {
      mkdirSync(variant.directory, { recursive: true })
      const frames = await Promise.all(rendered.frames.map((frame) =>
        sharp(frame.png)
          .resize(variant.pixels, variant.pixels, { fit: 'fill', kernel: 'lanczos3' })
          .png({ compressionLevel: 9 })
          .toBuffer(),
      ))

      const cols = Math.ceil(Math.sqrt(frameCount))
      const rows = Math.ceil(frameCount / cols)
      const atlas = await sharp({
        create: {
          width: cols * variant.pixels,
          height: rows * variant.pixels,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      }).composite(frames.map((input, index) => ({
        input,
        left: (index % cols) * variant.pixels,
        top: Math.floor(index / cols) * variant.pixels,
      }))).png({ compressionLevel: 9 }).toBuffer()

      writeFileSync(join(variant.directory, `${name}.png`), frames[0]!)
      writeFileSync(join(variant.directory, `${name}.atlas.png`), atlas)
      writeFileSync(join(variant.directory, `${name}.atlas.json`), JSON.stringify({
        frames: frameCount,
        fps,
        cols,
        rows,
        width: variant.pixels,
        height: variant.pixels,
      }, null, 2) + '\n')

      const frameDirectory = join(temporary, String(variant.scale))
      mkdirSync(frameDirectory, { recursive: true })
      const framePaths = frames.map((frame, index) => {
        const path = join(frameDirectory, `${String(index).padStart(3, '0')}.png`)
        writeFileSync(path, frame)
        return path
      })
      const delay = Math.round(1000 / fps)
      const animation = join(variant.directory, `${name}.webp`)
      const args = ['-loop', '0', '-lossless']
      for (const path of framePaths) args.push('-d', String(delay), path)
      args.push('-o', animation)
      const encoded = spawnSync('img2webp', args, { encoding: 'utf8' })
      if (encoded.status !== 0) throw new Error(encoded.stderr || `img2webp exited ${encoded.status}`)

      report({ progress: 82 + Math.round(((variantIndex + 1) / sizes.length) * 17), stage: `Packaged ${variant.scale}× assets` })
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }

  report({ progress: 100, stage: 'Export complete' })
  return { output: outputRoot, name, frames: frameCount, fps, sizes: sizes.map((variant) => variant.pixels) }
}
