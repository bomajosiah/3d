import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { blenderInfo, run } from './process.ts'
import { PYTHON_DIR } from './build.ts'

export type VideoFormat = 'mp4' | 'webm'

/**
 * Encodes rendered frames into a video. Takes PNGs rather than a scene, so the
 * clip is exactly the frames you already inspected — preview or Cycles alike.
 */
export async function encodeVideo(pngs: Buffer[], options: { output: string; fps: number; width: number; height: number; format: VideoFormat; crf?: string; root?: string }): Promise<{ output: string; frames: number; bytes: number }> {
  if (!pngs.length) throw Object.assign(new Error('nothing to encode: no frames were rendered'), { code: 'E_EMPTY_VIDEO' })
  const info = await blenderInfo(options.root)
  const directory = mkdtempSync(join(tmpdir(), '3d-video-'))
  try {
    const frameDir = join(directory, 'frames')
    const staging = join(directory, 'staging')
    mkdirSync(frameDir); mkdirSync(staging)
    const frames = pngs.map((png, i) => {
      const path = join(frameDir, `${String(i + 1).padStart(5, '0')}.png`)
      writeFileSync(path, png)
      return path
    })
    mkdirSync(dirname(options.output), { recursive: true })
    writeFileSync(join(directory, 'request.json'), JSON.stringify({ frames, staging, output: options.output,
      fps: options.fps, width: options.width, height: options.height, format: options.format, crf: options.crf ?? 'HIGH' }))
    await run(info.executable, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(PYTHON_DIR, 'encode.py'), '--', join(directory, 'request.json')], 900_000)
    return { output: options.output, frames: frames.length, bytes: statSync(options.output).size }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
