import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function run(executable: string, args: string[], timeout = 300_000): Promise<string> {
  return new Promise((accept, reject) => {
    execFile(executable, args, { timeout, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }, (error, stdout, stderr) => {
      if (error) {
        // A timeout arrives as an ordinary "Command failed" with a SIGTERM, so
        // without this the log tail looks like a crash mid-frame and says
        // nothing about the budget that actually ended it.
        const timedOut = (error as { killed?: boolean }).killed === true
        const reason = timedOut
          ? `timed out after ${timeout < 60_000 ? `${Math.round(timeout / 1000)}s` : `${Math.round(timeout / 60_000)} min`}. Raise BLENDER_RENDER_TIMEOUT_MS (final renders) or BLENDER_BUILD_TIMEOUT_MS (asset builds), or shorten the clip. A long-running dev server keeps the budget it started with — restart it after changing these.`
          : error.message
        reject(Object.assign(new Error(`${executable}: ${reason}\n${(stdout + stderr).slice(-6000)}`), { code: timedOut ? 'E_BLENDER_TIMEOUT' : undefined }))
      } else accept(stdout)
    })
  })
}
/**
 * Reads a timeout override in milliseconds.
 *
 * The defaults are tuned on a developer machine. A CI runner with fewer cores
 * needs a longer leash for the same scene, so each budget is adjustable
 * without changing what a local run does.
 */
export function timeoutFrom(variable: string, fallback: number): number {
  const raw = process.env[variable]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${variable} must be a positive number of milliseconds; got "${raw}"`)
  return value
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
