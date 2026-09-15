import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import { ValidationError, parseSceneText, type SceneDocument } from '@3d/schema'
import { EXIT } from './spec.ts'

export const OUT_DIR = '.3d/out'

export function sceneFile(arg: string | undefined): string {
  if (!arg) throw new Error('no scene file given')
  const candidates = [arg, `${arg}.scene.json`, `scenes/${arg}.scene.json`]
  for (const c of candidates) if (existsSync(c)) return c
  const listed = candidates.map((c) => `  ${c}`).join('\n')
  const err = new Error(`scene file not found. Looked for:\n${listed}`)
  ;(err as { code?: string }).code = 'E_SCENE_NOT_FOUND'
  throw err
}

export function loadScene(file: string): { doc: SceneDocument; text: string } {
  const text = readFileSync(file, 'utf8')
  return { doc: parseSceneText(text, file), text }
}

export function ensureDir(file: string): string {
  mkdirSync(dirname(file), { recursive: true })
  return file
}

export function writeOut(file: string, data: Buffer | string): string {
  ensureDir(file)
  writeFileSync(file, data)
  return resolvePath(file)
}

const GREY = '\x1b[90m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const tty = process.stdout.isTTY === true
export const c = {
  dim: (s: string) => (tty ? `${GREY}${s}${RESET}` : s),
  red: (s: string) => (tty ? `${RED}${s}${RESET}` : s),
  yellow: (s: string) => (tty ? `${YELLOW}${s}${RESET}` : s),
  bold: (s: string) => (tty ? `${BOLD}${s}${RESET}` : s),
}

/**
 * Validation output is the agent's main repair signal, so it leads with
 * `file:line:col`, states the rule that failed, and offers a concrete fix.
 */
export function reportValidation(err: ValidationError, json: boolean): number {
  if (json) {
    console.log(JSON.stringify({ ok: false, code: 'E_INVALID_SCENE', errors: err.diagnostics }, null, 2))
    return EXIT.validation
  }
  const file = err.file ?? 'scene'
  console.error(c.red(`${err.diagnostics.length} validation error(s) in ${file}`))
  for (const d of err.diagnostics) {
    const at = d.line ? `${file}:${d.line}:${d.column}` : file
    const path = d.path.length ? c.dim(` at /${d.path.join('/')}`) : ''
    console.error(`  ${at}  ${d.message}${path}`)
    if (d.hint) console.error(`    ${c.yellow(d.hint)}`)
  }
  return EXIT.validation
}

export function fail(code: string, message: string, detail: string[] = [], fix?: string, json = false): number {
  if (json) {
    console.log(JSON.stringify({ ok: false, code, message, detail, fix }, null, 2))
    return EXIT.render
  }
  console.error(c.red(`${code}  ${message}`))
  for (const line of detail) console.error(`  ${line}`)
  if (fix) console.error(`  ${c.bold('Fix:')} ${fix}`)
  return EXIT.render
}
