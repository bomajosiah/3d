import { c } from '../io.ts'

/** 1×1 transparent PNG, used to prove the image pipeline runs. */
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
import { EXIT, type CommandSpec } from '../spec.ts'

type Check = { name: string; ok: boolean; detail: string; fix?: string }

export const doctor: CommandSpec = {
  name: 'doctor',
  summary: 'Check that everything rendering needs is installed.',
  details: 'Run this first if a render fails for reasons that look environmental.',
  args: [],
  options: [],
  examples: ['3d doctor'],
  async run({ json }) {
    const checks: Check[] = []

    const [major] = process.versions.node.split('.').map(Number)
    checks.push({
      name: 'node',
      ok: (major ?? 0) >= 22,
      detail: `v${process.versions.node}`,
      fix: 'install Node 22 or newer — the CLI runs TypeScript directly',
    })

    // Exercise the real render path rather than probing for an executable.
    // Playwright installs only the headless shell by default, so a path check
    // reports a false failure on a setup that renders perfectly well — and this
    // proves the thing the agent actually depends on.
    let renderer = 'not checked'
    let rendererOk = false
    try {
      const { renderFrames } = await import('@3d/render')
      const { parseScene } = await import('@3d/schema')
      const doc = parseScene({ name: 'doctor', nodes: [{ type: 'box', name: 'probe' }] })
      const started = Date.now()
      const { frames } = await renderFrames(doc, [{ time: 0 }], { width: 64, height: 64 })
      const coverage = frames[0]?.coverage ?? 0
      rendererOk = coverage > 0.02
      renderer = rendererOk
        ? `rendered a test frame in ${Date.now() - started}ms`
        : `rendered, but the frame was empty (coverage ${coverage.toFixed(3)})`
    } catch (e) {
      renderer = (e as Error).message.split('\n')[0] ?? 'render failed'
    }
    checks.push({
      name: 'renderer',
      ok: rendererOk,
      detail: renderer,
      fix: 'install the browser: node packages/render/node_modules/playwright/cli.js install chromium',
    })

    let sheetOk = false
    let sheetDetail = 'not checked'
    try {
      const { contactSheet } = await import('@3d/render')
      const probe = await contactSheet(
        [{ time: 0, png: Buffer.from(TINY_PNG, 'base64'), coverage: 1 }],
        { checker: false },
      )
      sheetDetail = `image pipeline ok (${probe.length} bytes)`
      sheetOk = probe.length > 0
    } catch (e) {
      sheetDetail = (e as Error).message.split('\n')[0] ?? 'failed'
    }
    checks.push({ name: 'images', ok: sheetOk, detail: sheetDetail, fix: 'pnpm install' })
    try {
      const { blenderInfo } = await import('@3d/blender')
      const info = await blenderInfo()
      checks.push({ name: 'blender', ok: true, detail: info.version })
    } catch (e) {
      checks.push({ name: 'blender', ok: false, detail: (e as Error).message, fix: 'Set BLENDER_BIN for procedural assets and final rendering; primitive previews remain available.' })
    }
    const ok = checks.every((ch) => ch.ok)
    if (json) {
      console.log(JSON.stringify({ ok, checks }, null, 2))
      return ok ? EXIT.ok : EXIT.render
    }
    for (const ch of checks) {
      const mark = ch.ok ? '✓' : c.red('✗')
      console.log(`  ${mark} ${ch.name.padEnd(9)} ${c.dim(ch.detail)}`)
      if (!ch.ok && ch.fix) console.log(`      ${c.bold('Fix:')} ${ch.fix}`)
    }
    console.log(ok ? `\n${c.bold('ready')}` : `\n${c.red('not ready')}`)
    return ok ? EXIT.ok : EXIT.render
  },
}
