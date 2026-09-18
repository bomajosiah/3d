import { mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { SceneDocument } from '@3d/schema'
import { buildScene, evaluateAt, selectClip } from '@3d/core'
import { collectMeshes } from './collect.ts'
import { blenderInfo, run } from './process.ts'
import { PYTHON_DIR } from './build.ts'

export type ModelFormat = 'glb' | 'usdz'

/**
 * Writes the whole scene — composed transforms, materials and the baked
 * animation clip — as one file a phone can open. GLB is the portable master
 * (Android Scene Viewer, model-viewer, engines); USDZ is what iOS AR Quick
 * Look requires.
 */
export async function exportModel(doc: SceneDocument, options: { format: ModelFormat; output: string; animation?: boolean; root?: string }): Promise<{ output: string; format: ModelFormat; frames: number; triangles: number; bytes: number }> {
  const info = await blenderInfo(options.root)
  const built = buildScene(doc)
  const { meshes, objects } = collectMeshes(built.content)
  if (!objects.length) throw Object.assign(new Error('nothing to export: the scene has no geometry'), { code: 'E_EMPTY_EXPORT' })

  const clip = selectClip(doc)
  const wantsAnimation = options.animation !== false && !!clip && clip.duration > 0
  const fps = clip?.fps ?? 30
  // Sample [0, duration) so a looping clip does not repeat its first pose.
  const times = wantsAnimation ? Array.from({ length: Math.max(1, Math.round(clip!.duration * fps)) }, (_, i) => i / fps) : [0]

  const frames = times.map(time => {
    evaluateAt(doc, built.content, time)
    built.content.updateMatrixWorld(true)
    return { time, objects: objects.map(o => {
      let visible = true
      for (let p: import('three').Object3D | null = o; p; p = p.parent) visible &&= p.visible
      return { matrix: o.matrixWorld.toArray(), visible }
    }) }
  })

  mkdirSync(dirname(options.output), { recursive: true })
  const directory = mkdtempSync(join(tmpdir(), '3d-export-'))
  try {
    writeFileSync(join(directory, 'request.json'), JSON.stringify({ meshes, frames, fps, clip: clip?.name, format: options.format, output: options.output }))
    await run(info.executable, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(PYTHON_DIR, 'export.py'), '--', join(directory, 'request.json')], 900_000)
    return { output: options.output, format: options.format, frames: frames.length, triangles: built.triangles, bytes: statSync(options.output).size }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
