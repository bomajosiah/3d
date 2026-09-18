/**
 * Resolves the workflow's free-text scene input into a validated matrix.
 *
 * Runs before any expensive job so a typo fails in seconds rather than after
 * Blender has installed. Names are constrained to the slug shape real scene
 * files use, which also keeps them safe to interpolate into later `run:` steps.
 */
import { existsSync, readdirSync } from 'node:fs'
import { appendFileSync } from 'node:fs'

const SLUG = /^[a-z0-9][a-z0-9._-]*$/i

const requested = [...new Set((process.env.SCENES ?? '').split(/[\s,]+/).filter(Boolean))]
if (!requested.length) {
  console.error('no scenes given. Pass names like: dice compass coffee-cup')
  process.exit(64)
}

const available = readdirSync('scenes')
  .filter(name => name.endsWith('.scene.json'))
  .map(name => name.replace(/\.scene\.json$/, ''))
  .sort()

const problems = []
for (const name of requested) {
  if (!SLUG.test(name)) problems.push(`"${name}" is not a scene name`)
  else if (!existsSync(`scenes/${name}.scene.json`)) problems.push(`"${name}" has no scenes/${name}.scene.json`)
}
if (problems.length) {
  for (const problem of problems) console.error(problem)
  console.error(`\navailable scenes:\n  ${available.join('\n  ')}`)
  process.exit(1)
}

console.error(`exporting ${requested.length} scene(s): ${requested.join(', ')}`)
appendFileSync(process.env.GITHUB_OUTPUT, `scenes=${JSON.stringify(requested)}\n`)
