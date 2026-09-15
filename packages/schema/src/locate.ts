/**
 * Maps a JSON path (e.g. ["nodes", 0, "radius"]) to a line/column in the raw
 * source text, so validation errors can point at `file:line:col`. Written by
 * hand rather than pulled in as a dependency because it is small and the CLI's
 * error quality is load-bearing for the agent loop.
 */
export type Loc = { offset: number; line: number; column: number }

type Entry = { path: (string | number)[]; offset: number }

function index(text: string): Entry[] {
  const out: Entry[] = []
  let i = 0
  const ws = () => {
    while (i < text.length && /[\s,]/.test(text[i]!)) i++
  }
  const str = (): string => {
    // assumes text[i] === '"'
    let s = ''
    i++
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') {
        s += text[i]! + (text[i + 1] ?? '')
        i += 2
      } else s += text[i++]
    }
    i++
    try {
      return JSON.parse(`"${s}"`)
    } catch {
      return s
    }
  }
  const value = (path: (string | number)[]) => {
    ws()
    out.push({ path, offset: i })
    const c = text[i]
    if (c === '{') {
      i++
      ws()
      while (i < text.length && text[i] !== '}') {
        ws()
        if (text[i] !== '"') break
        const key = str()
        ws()
        if (text[i] === ':') i++
        value([...path, key])
        ws()
      }
      i++
    } else if (c === '[') {
      i++
      ws()
      let n = 0
      while (i < text.length && text[i] !== ']') {
        value([...path, n++])
        ws()
      }
      i++
    } else if (c === '"') {
      str()
    } else {
      while (i < text.length && !/[\s,\]}]/.test(text[i]!)) i++
    }
  }
  value([])
  return out
}

export function locate(text: string, path: (string | number)[]): Loc | undefined {
  const entries = index(text)
  const key = JSON.stringify(path)
  // Walk from the deepest requested path outward, so a missing leaf still
  // points at its containing object rather than at the top of the file.
  for (let depth = path.length; depth >= 0; depth--) {
    const want = JSON.stringify(path.slice(0, depth))
    const hit = entries.find((e) => JSON.stringify(e.path) === want)
    if (hit) {
      const before = text.slice(0, hit.offset)
      const line = before.split('\n').length
      const column = hit.offset - before.lastIndexOf('\n')
      return { offset: hit.offset, line, column }
    }
    void key
  }
  return undefined
}
