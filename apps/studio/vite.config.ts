import { readFileSync, readdirSync, createReadStream, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { prepareAssets } from '../../packages/blender/src/build.ts'
import { compiledAssets } from '../../packages/core/src/assets.ts'
import { parseSceneText, ValidationError } from '../../packages/schema/src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '../..')
const SCENE_DIRS = [join(ROOT, 'scenes'), join(ROOT, 'examples')]
const isScene = (file: string) => file.endsWith('.scene.json')

/**
 * Watches scene files and pushes parsed documents over the HMR socket. The page
 * never reloads, so camera pose and playhead survive an edit — which is what
 * makes watching an agent work on a scene pleasant rather than seasick.
 */
function scenePlugin(): Plugin {
  const read = async (file: string) => {
    try {
      if (!list().some(entry => entry.path === file)) throw new Error('Unknown scene path')
      const text = readFileSync(file, 'utf8')
      const doc = await prepareAssets(parseSceneText(text, file), file)
      for (const asset of Object.values(compiledAssets(doc))) {
        asset.glb = `/__3d/asset?path=${encodeURIComponent(asset.glb)}`
        asset.meshes = [] // The browser loads the evaluated GLB, not a second mesh representation.
      }
      const rewrite = (nodes: typeof doc.nodes) => {
        for (const n of nodes) {
          if (n.type === 'reference') n.image = `/__3d/asset?path=${encodeURIComponent(resolve(ROOT, n.image))}`
          else rewrite(n.children)
        }
      }
      rewrite(doc.nodes)
      return { ok: true as const, path: file, name: basename(file), doc }
    } catch (e) {
      const diagnostics =
        e instanceof ValidationError ? e.diagnostics : [{ message: String(e), path: [] as (string | number)[] }]
      return { ok: false as const, path: file, name: basename(file), diagnostics }
    }
  }

  const list = () =>
    SCENE_DIRS.flatMap((dir) => {
      try {
        return readdirSync(dir).filter(isScene).map((f) => ({ path: join(dir, f), name: f }))
      } catch {
        return []
      }
    })

  return {
    name: '3d-scene-watch',
    configureServer(server) {
      // chokidar 4 (bundled with Vite 8) dropped glob support, so watch the
      // directories and filter here rather than passing a glob pattern.
      server.watcher.add([...SCENE_DIRS, join(ROOT, 'assets'), join(ROOT, 'references'), join(ROOT, 'packages/blender/python')])
      const revisions = new Map<string, number>()
      const push = async (file: string) => {
        if (!isScene(file) && !file.endsWith('.py') && !file.startsWith(join(ROOT, 'references'))) return
        for (const target of isScene(file) ? [file] : list().map(s => s.path)) {
          const revision = (revisions.get(target) ?? 0) + 1
          revisions.set(target, revision)
          const data = await read(target)
          if (revisions.get(target) === revision) server.ws.send({ type: 'custom', event: '3d:scene', data })
        }
      }
      server.watcher.on('change', push)
      server.watcher.on('add', push)

      server.middlewares.use('/__3d/scenes', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(list()))
      })

      server.middlewares.use('/__3d/asset', (req, res) => {
        try {
          const path = new URL(req.url ?? '', 'http://localhost').searchParams.get('path')
          if (!path) throw new Error('Missing path')
          const file = realpathSync(path)
          if (![join(ROOT, '.3d/cache/'), join(ROOT, 'references/')].some(root => file.startsWith(realpathSync(root) + '/'))) throw new Error('Invalid asset path')
          if (!/\.(glb|png|jpe?g|webp)$/i.test(file)) throw new Error('Unsupported asset')
          res.setHeader('content-type', file.endsWith('.glb') ? 'model/gltf-binary' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg')
          createReadStream(file).pipe(res)
        } catch { res.statusCode = 404; res.end('Asset not found') }
      })
      server.middlewares.use('/__3d/scene', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        const file = url.searchParams.get('path')
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(file ? await read(file) : { ok: false, diagnostics: [{ message: 'no path given', path: [] }] }))
      })
    },
  }
}

export default defineConfig({
  root: here,
  plugins: [react(), scenePlugin()],
  server: { port: 5174, fs: { allow: [ROOT] } },
})
