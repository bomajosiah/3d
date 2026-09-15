import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ENTRY = join(here, 'browser', 'entry.ts')
const PACKAGES = join(here, '..', '..')

/** Cheap change detection so repeated renders reuse the same bundle. */
function sourceStamp(): string {
  const hash = createHash('sha1')
  const walk = (dir: string) => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries.sort()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (name.endsWith('.ts')) hash.update(`${full}:${st.mtimeMs}`)
    }
  }
  for (const pkg of ['core', 'schema', 'render']) walk(join(PACKAGES, pkg, 'src'))
  return hash.digest('hex')
}

let cached: { stamp: string; code: string } | undefined

/**
 * Bundles the browser-side runtime (three + @3d/core + the entry) into one
 * IIFE we inject into the page. Bundling rather than serving over HTTP keeps
 * the renderer dependency-free at run time and makes the page deterministic.
 */
export async function browserBundle(): Promise<string> {
  const stamp = sourceStamp()
  if (cached && cached.stamp === stamp) return cached.code

  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    write: false,
    minify: false,
    sourcemap: false,
    logLevel: 'silent',
  })
  const code = result.outputFiles?.[0]?.text
  if (!code) throw new Error('browser bundle produced no output')
  cached = { stamp, code }
  return code
}
