import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const BIN = join(process.cwd(), 'packages/cli/bin/3d.mjs')

/** Runs the real binary, so the agent-facing contract is what gets tested. */
async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], { cwd: process.cwd() })
    return { code: 0, stdout, stderr }
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string }
    return { code: err.code ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' }
  }
}

describe('cli contract', () => {
  it('lists commands with no arguments', async () => {
    const { code, stdout } = await cli([])
    expect(code).toBe(0)
    expect(stdout).toContain('3d <command>')
    expect(stdout).toContain('render')
  })

  it('outlines an example as machine-readable JSON', async () => {
    const { code, stdout } = await cli(['outline', 'examples/side-table.scene.json', '--json'])
    expect(code).toBe(0)
    const payload = JSON.parse(stdout)
    expect(payload.ok).toBe(true)
    expect(payload.triangles).toBeGreaterThan(0)
    expect(payload.bounds.size).toHaveLength(3)
  })

  it('exits 1 with located diagnostics on an invalid scene', async () => {
    const dir = mkdtempSync(join(tmpdir(), '3d-cli-'))
    const file = join(dir, 'bad.scene.json')
    writeFileSync(file, JSON.stringify({ nodes: [{ type: 'bocks' }] }, null, 2))
    const { code, stdout } = await cli(['validate', file, '--json'])
    expect(code).toBe(1)
    const payload = JSON.parse(stdout)
    expect(payload.ok).toBe(false)
    expect(payload.errors[0].line).toBeGreaterThan(0)
  })

  it('exits 64 on an unknown option and says what is available', async () => {
    const { code, stderr } = await cli(['render', 'examples/rounded-cube.scene.json', '--sise', '10'])
    expect(code).toBe(64)
    expect(stderr).toContain('unknown option')
  })

  it('assigns stable ids with fmt and is idempotent', async () => {
    const dir = mkdtempSync(join(tmpdir(), '3d-fmt-'))
    const file = join(dir, 'x.scene.json')
    writeFileSync(file, JSON.stringify({ name: 'x', nodes: [{ type: 'box', name: 'a' }] }))
    const first = JSON.parse((await cli(['fmt', file, '--json'])).stdout)
    expect(first.idsAdded).toBe(1)
    const second = JSON.parse((await cli(['fmt', file, '--json'])).stdout)
    expect(second.idsAdded).toBe(0)
    expect(second.changed).toBe(false)
  })
})
