/**
 * A tiny arg parser whose command specs double as the source for the generated
 * CLI reference. One definition, two consumers — so `docs/agent/cli.md` cannot
 * drift from what the binary actually accepts.
 */
export type OptionSpec = {
  name: string
  short?: string
  type: 'string' | 'number' | 'boolean'
  description: string
  default?: string | number | boolean
  placeholder?: string
}

export type ArgSpec = { name: string; description: string; required?: boolean; variadic?: boolean }

export type CommandSpec = {
  name: string
  summary: string
  /** Longer prose for `3d help <command>`. */
  details?: string
  args: ArgSpec[]
  options: OptionSpec[]
  examples?: string[]
  run: (ctx: ParsedArgs) => Promise<number | void>
}

export type ParsedArgs = {
  args: string[]
  options: Record<string, string | number | boolean>
  json: boolean
}

export const EXIT = { ok: 0, validation: 1, render: 2, export: 3, usage: 64 } as const

export class UsageError extends Error {}

const GLOBAL_OPTIONS: OptionSpec[] = [
  { name: 'json', type: 'boolean', description: 'Emit machine-readable JSON on stdout.' },
  { name: 'quiet', short: 'q', type: 'boolean', description: 'Suppress the human summary.' },
]

export function parseArgs(spec: CommandSpec, argv: string[]): ParsedArgs {
  const known = new Map<string, OptionSpec>()
  for (const o of [...spec.options, ...GLOBAL_OPTIONS]) {
    known.set(o.name, o)
    if (o.short) known.set(o.short, o)
  }

  const args: string[] = []
  const options: Record<string, string | number | boolean> = {}
  for (const o of [...spec.options, ...GLOBAL_OPTIONS]) {
    if (o.default !== undefined) options[o.name] = o.default
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (token === '--') {
      args.push(...argv.slice(i + 1))
      break
    }
    if (!token.startsWith('-')) {
      args.push(token)
      continue
    }
    const eq = token.indexOf('=')
    const rawName = (eq === -1 ? token : token.slice(0, eq)).replace(/^--?/, '')
    const option = known.get(rawName)
    if (!option) {
      const names = [...new Set([...known.values()].map((o) => o.name))]
      throw new UsageError(`unknown option "${token}". Available: ${names.map((n) => `--${n}`).join(', ')}`)
    }
    if (option.type === 'boolean') {
      options[option.name] = eq === -1 ? true : token.slice(eq + 1) !== 'false'
      continue
    }
    const value = eq === -1 ? argv[++i] : token.slice(eq + 1)
    if (value === undefined) throw new UsageError(`option --${option.name} needs a value`)
    options[option.name] = option.type === 'number' ? Number(value) : value
    if (option.type === 'number' && Number.isNaN(options[option.name])) {
      throw new UsageError(`option --${option.name} expects a number, got "${value}"`)
    }
  }

  const required = spec.args.filter((a) => a.required)
  if (args.length < required.length) {
    const missing = required[args.length]!
    throw new UsageError(`missing required argument <${missing.name}>`)
  }

  return { args, options, json: options.json === true }
}

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))

export function renderHelp(spec: CommandSpec): string {
  const usageArgs = spec.args
    .map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`) + (a.variadic ? '...' : ''))
    .join(' ')
  const lines = [
    `3d ${spec.name} ${usageArgs}`.trim(),
    '',
    `  ${spec.summary}`,
  ]
  if (spec.details) lines.push('', ...spec.details.trim().split('\n').map((l) => `  ${l}`))
  if (spec.args.length) {
    lines.push('', 'Arguments:')
    const w = Math.max(...spec.args.map((a) => a.name.length)) + 2
    for (const a of spec.args) lines.push(`  ${pad(a.name, w)}  ${a.description}`)
  }
  const options = [...spec.options, ...GLOBAL_OPTIONS]
  if (options.length) {
    lines.push('', 'Options:')
    const labels = options.map((o) => `--${o.name}${o.type === 'boolean' ? '' : ` <${o.placeholder ?? o.type}>`}`)
    const w = Math.max(...labels.map((l) => l.length)) + 2
    options.forEach((o, i) => {
      const def = o.default !== undefined ? ` (default: ${o.default})` : ''
      lines.push(`  ${pad(labels[i]!, w)}  ${o.description}${def}`)
    })
  }
  if (spec.examples?.length) {
    lines.push('', 'Examples:')
    for (const e of spec.examples) lines.push(`  ${e}`)
  }
  return lines.join('\n')
}
