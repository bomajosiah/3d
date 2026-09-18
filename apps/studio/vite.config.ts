import { readFileSync, readdirSync, createReadStream, realpathSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { prepareAssets } from '../../packages/blender/src/build.ts'
import { compiledAssets } from '../../packages/core/src/assets.ts'
import { parseSceneText, ValidationError } from '../../packages/schema/src/index.ts'
import { exporters } from './exporters.ts'
import type { ExportFormatId } from './src/exportFormats.ts'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '../..')
const SCENE_DIRS = [join(ROOT, 'scenes')]
const isScene = (file: string) => file.endsWith('.scene.json')

type ExportJob = {
  id: string
  scene: string
  format: ExportFormatId
  status: 'queued' | 'running' | 'complete' | 'failed'
  progress: number
  stage: string
  output?: string
  error?: string
}

const readJson = async (req: import('node:http').IncomingMessage): Promise<unknown> => {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 64_000) throw new Error('Request body is too large')
  }
  return JSON.parse(body || '{}')
}

/**
 * Watches scene files and pushes parsed documents over the HMR socket. The page
 * never reloads, so camera pose and playhead survive an edit — which is what
 * makes watching an agent work on a scene pleasant rather than seasick.
 */
function scenePlugin(): Plugin {
  const exportJobs = new Map<string, ExportJob>()
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

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        if (url.pathname === '/__3d/exports' && req.method === 'POST') {
          res.setHeader('content-type', 'application/json')
          try {
            const body = await readJson(req) as { path?: unknown; format?: unknown; settings?: unknown }
            if (typeof body.path !== 'string' || !list().some((entry) => entry.path === body.path)) throw new Error('Unknown scene path')
            if (typeof body.format !== 'string' || !(body.format in exporters)) throw new Error('Unknown export format')
            const format = body.format as ExportFormatId
            const running = [...exportJobs.values()].find((job) => job.scene === body.path && job.format === format && (job.status === 'queued' || job.status === 'running'))
            if (running) {
              res.statusCode = 202
              res.end(JSON.stringify(running))
              return
            }

            const job: ExportJob = { id: randomUUID(), scene: body.path, format, status: 'queued', progress: 0, stage: 'Queued' }
            exportJobs.set(job.id, job)
            res.statusCode = 202
            res.end(JSON.stringify(job))

            void exporters[format](body.path, body.settings && typeof body.settings === 'object' ? body.settings as Record<string, unknown> : {}, (update) => {
              Object.assign(job, update, { status: 'running' as const })
            }).then((result) => {
              Object.assign(job, { status: 'complete' as const, progress: 100, stage: 'Export complete', output: result.output })
            }).catch((error) => {
              Object.assign(job, { status: 'failed' as const, stage: 'Export failed', error: error instanceof Error ? error.message : String(error) })
            })
          } catch (error) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          }
          return
        }

        const jobMatch = url.pathname.match(/^\/__3d\/exports\/([^/]+)$/)
        if (jobMatch && req.method === 'GET') {
          res.setHeader('content-type', 'application/json')
          const job = exportJobs.get(jobMatch[1]!)
          if (!job) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Export job not found' }))
          } else res.end(JSON.stringify(job))
          return
        }
        next()
      })

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
