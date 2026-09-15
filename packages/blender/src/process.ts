import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function run(executable: string, args: string[], timeout = 300_000): Promise<string> {
  return new Promise((accept, reject) => {
    execFile(executable, args, { timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${executable}: ${error.message}\n${(stdout + stderr).slice(-6000)}`))
      else accept(stdout)
    })
  })
}
export async function blenderInfo(root = process.cwd()): Promise<{ executable: string; version: string }> {
  const candidates = process.env.BLENDER_BIN ? [process.env.BLENDER_BIN] : [
    resolve(root, '.3d/tools/Blender.app/Contents/MacOS/Blender'),
    '/Applications/Blender.app/Contents/MacOS/Blender', 'blender',
  ]
  for (const executable of candidates) {
    if (executable.includes('/') && !existsSync(executable)) continue
    try {
      const version = (await run(executable, ['--version'], 15_000)).split('\n')[0]!
      if (!/^Blender (4\.[5-9]|[5-9]\.)/.test(version)) throw new Error(`Blender 4.5+ required; found ${version}`)
      return { executable, version }
    } catch (e) { if (process.env.BLENDER_BIN) throw e }
  }
  throw Object.assign(new Error('Blender 4.5+ is required for procedural builds and final renders. Install Blender or set BLENDER_BIN to its executable. Primitive previews work without it.'), { code: 'E_BLENDER_MISSING' })
}
