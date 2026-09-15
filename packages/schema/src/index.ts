import { z } from 'zod'
import { SceneDocument, type SceneDocumentInput } from './scene.ts'
import { locate } from './locate.ts'

export * from './primitives.ts'
export * from './nodes.ts'
export * from './scene.ts'
export { locate } from './locate.ts'
export type { Loc } from './locate.ts'

export type Diagnostic = {
  code: string
  message: string
  path: (string | number)[]
  line?: number
  column?: number
  hint?: string
}

export class ValidationError extends Error {
  diagnostics: Diagnostic[]
  file?: string
  constructor(diagnostics: Diagnostic[], file?: string) {
    super(`${diagnostics.length} validation error(s)`)
    this.name = 'ValidationError'
    this.diagnostics = diagnostics
    this.file = file
  }
}

const levenshtein = (a: string, b: string): number => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) m[0]![j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i]![j] = Math.min(
        m[i - 1]![j]! + 1,
        m[i]![j - 1]! + 1,
        m[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
  return m[a.length]![b.length]!
}

/** "did you mean" — cheap, and it turns a dead end into a one-line fix. */
export function suggest(given: string, options: readonly string[]): string | undefined {
  const scored = options
    .map((o) => ({ o, d: levenshtein(given.toLowerCase(), o.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
  const best = scored[0]
  if (best && best.d <= Math.max(2, Math.floor(given.length / 2))) return best.o
  return undefined
}

function toDiagnostics(err: z.ZodError, text?: string): Diagnostic[] {
  return err.issues.map((issue) => {
    const path = issue.path as (string | number)[]
    const loc = text ? locate(text, path) : undefined
    let hint: string | undefined
    if (issue.code === 'invalid_value' && 'values' in issue) {
      const values = (issue.values as unknown[]).filter((v): v is string => typeof v === 'string')
      const received = (issue as { received?: unknown }).received
      if (typeof received === 'string' && values.length) hint = suggest(received, values)
    }
    if (issue.code === 'invalid_union' && path.at(-1) !== 'type') {
      hint ??= 'check the `type` field — it selects which fields are allowed'
    }
    return {
      code: issue.code,
      message: issue.message,
      path,
      line: loc?.line,
      column: loc?.column,
      ...(hint ? { hint: `did you mean "${hint}"?` } : {}),
    }
  })
}

export function parseScene(input: unknown, opts: { text?: string; file?: string } = {}): SceneDocument {
  const result = SceneDocument.safeParse(input)
  if (!result.success) throw new ValidationError(toDiagnostics(result.error, opts.text), opts.file)
  return result.data
}

export function parseSceneText(text: string, file?: string): SceneDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new ValidationError(
      [{ code: 'invalid_json', message: (e as Error).message, path: [] }],
      file,
    )
  }
  return parseScene(raw, { text, file })
}

export type { SceneDocument, SceneDocumentInput }
export { SceneDocument as SceneDocumentSchema }

/** JSON Schema for editor completion and for the generated docs. */
export const jsonSchema = () => z.toJSONSchema(SceneDocument, { io: 'input' })
