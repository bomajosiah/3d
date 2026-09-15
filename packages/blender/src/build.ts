import { createHash } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync, renameSync, rmSync, realpathSync } from 'node:fs'
import { dirname, resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SceneDocument, SceneNode } from '@3d/schema'
import { assetKey, buildScene, type CompiledAsset, type CompiledAssets } from '@3d/core'
import { blenderInfo, run } from './process.ts'

export const PYTHON_DIR = fileURLToPath(new URL('../python/', import.meta.url))
export function projectRoot(file: string): string {
  let dir = dirname(resolve(file))
  while (dirname(dir) !== dir) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = dirname(dir)
  }
  return dirname(resolve(file))
}
export function localFile(base: string, path: string, root: string): string {
  const file = realpathSync(resolve(base, path))
  const rel = relative(realpathSync(root), file)
  if (rel.startsWith('..') || rel.startsWith('/')) throw new Error(`Asset path must stay inside project: ${path}`)
  return file
}
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`
  return JSON.stringify(v)
}
export function cacheHash(parameters: unknown, version: string, sources: { path: string; content: string }[]): string {
  return createHash('sha256').update(canonical({ parameters, version, sources: [...sources].sort((a, b) => a.path.localeCompare(b.path)) })).digest('hex')
}
function sourceTree(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.name.startsWith('.') || e.name === '__pycache__' ? [] : e.isDirectory() ? sourceTree(join(dir, e.name)) : e.name.endsWith('.py') ? [join(dir, e.name)] : [])
}
const pending = new Map<string, Promise<CompiledAsset>>()

/** Every builder is local executable project code. No Python is supplied by HTTP clients. */
export async function prepareAssets(doc: SceneDocument, sceneFile: string): Promise<SceneDocument> {
  const root = projectRoot(sceneFile)
  const assets: CompiledAssets = {}
  let info: Awaited<ReturnType<typeof blenderInfo>> | undefined
  async function visit(node: SceneNode): Promise<void> {
    if (node.type === 'asset') {
      const builder = localFile(dirname(sceneFile), node.builder, root)
      const files = [...new Set([builder, ...sourceTree(dirname(builder)), ...sourceTree(PYTHON_DIR),
        ...node.dependencies.map(p => localFile(dirname(sceneFile), p, root))])]
      const sources = files.map(path => ({ path: relative(root, path), content: readFileSync(path).toString('base64') }))
      // A portable cached asset may be viewed without Blender. Its recorded version is part of the key.
      const sourceKey = cacheHash(node.parameters, 'sources', sources)
      const index = join(root, '.3d/cache', `${sourceKey}.json`)
      let result: CompiledAsset | undefined
      try { info ??= await blenderInfo(root) } catch (e) {
        if ((e as {code?: string}).code !== 'E_BLENDER_MISSING' || !existsSync(index)) throw e
      }
      if (existsSync(index)) {
        const previous = JSON.parse(readFileSync(index, 'utf8')) as CompiledAsset
        if (existsSync(previous.glb) && (!info || previous.blenderVersion === info.version)) result = previous
      }
      if (!result) {
        info ??= await blenderInfo(root)
        const hash = cacheHash(node.parameters, info.version, sources)
        let work = pending.get(hash)
        if (!work) {
          work = (async () => {
            const output = join(root, '.3d/cache', hash)
            mkdirSync(dirname(output), { recursive: true })
            const staging = mkdtempSync(join(dirname(output), '.building-'))
            // Build the bytes we hashed, even if an agent edits a source during compilation.
            for (const [i, path] of files.entries()) {
              const destination = path.startsWith(PYTHON_DIR)
                ? join(staging, 'runtime', relative(PYTHON_DIR, path))
                : join(staging, 'project', relative(root, path))
              mkdirSync(dirname(destination), { recursive: true })
              writeFileSync(destination, Buffer.from(sources[i]!.content, 'base64'))
            }
            const request = join(staging, 'request.json')
            writeFileSync(request, JSON.stringify({ builder: join(staging, 'project', relative(root, builder)), parameters: node.parameters, output: staging, projectRoot: join(staging, 'project') }))
            try {
              await run(info!.executable, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', join(staging, 'runtime/worker.py'), '--', request])
              const compiled = JSON.parse(readFileSync(join(staging, 'mesh.json'), 'utf8'))
              if (!existsSync(output)) {
                try { renameSync(staging, output) }
                catch (error) { if (!existsSync(join(output, 'asset.glb'))) throw error }
              }
              const asset: CompiledAsset = { ...compiled, hash, blenderVersion: info!.version, glb: join(output, 'asset.glb') }
              const temp = `${index}.${process.pid}.tmp`
              writeFileSync(temp, JSON.stringify(asset)); renameSync(temp, index)
              return asset
            } catch (error) {
              throw Object.assign(new Error(`Build failed for ${node.name ?? node.builder}: ${(error as Error).message}`), { code: 'E_ASSET_BUILD' })
            } finally { rmSync(staging, { force: true, recursive: true }) }
          })()
          pending.set(hash, work)
          void work.finally(() => pending.delete(hash)).catch(() => {})
        }
        result = await work
      }
      assets[assetKey(node)] = result
    }
    if (node.type !== 'reference') for (const child of node.children) await visit(child)
  }
  for (const node of doc.nodes) await visit(node)
  const resolved = { ...doc, meta: { ...doc.meta, compiledAssets: assets } }
  buildScene(resolved) // Reject unusable compiled geometry before publishing a successful document.
  return resolved
}
