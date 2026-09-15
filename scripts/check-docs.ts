/** CI gate: generated docs must match what the code would produce right now. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const FILES = ['docs/agent/schema.md', 'docs/agent/cli.md']
const before = FILES.map((f) => readFileSync(f, 'utf8'))
execFileSync(process.execPath, ['scripts/gen-docs.ts'], { stdio: 'ignore' })
const after = FILES.map((f) => readFileSync(f, 'utf8'))

const stale = FILES.filter((_, i) => before[i] !== after[i])
if (stale.length) {
  console.error(`generated docs are out of date:\n${stale.map((f) => `  ${f}`).join('\n')}`)
  console.error('\nThey have been regenerated. Commit the result.')
  process.exit(1)
}
console.log(`docs up to date (${FILES.length} files)`)
