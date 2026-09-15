import { EXIT, UsageError, parseArgs, renderHelp, type CommandSpec } from './spec.ts'
import { c } from './io.ts'
import { validate } from './commands/validate.ts'
import { outline } from './commands/outline.ts'
import { render, sheet } from './commands/render.ts'
import { fmt } from './commands/fmt.ts'
import { create } from './commands/create.ts'
import { inspect } from './commands/inspect.ts'
import { build } from './commands/build.ts'
import { doctor } from './commands/doctor.ts'

export const COMMANDS: CommandSpec[] = [create, build, inspect, outline, validate, render, sheet, fmt, doctor]

function topLevelHelp(): string {
  const width = Math.max(...COMMANDS.map((cmd) => cmd.name.length)) + 2
  const lines = [
    '3d — model and animate 3D objects, driven from the command line.',
    '',
    'Usage:  3d <command> [options]',
    '',
    'Commands:',
    ...COMMANDS.map((cmd) => `  ${cmd.name.padEnd(width)}  ${cmd.summary}`),
    '',
    `Run ${c.bold('3d help <command>')} for details, and read AGENTS.md first.`,
  ]
  return lines.join('\n')
}

export async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv

  if (!name || name === '--help' || name === '-h' || name === 'help') {
    const target = name === 'help' ? rest[0] : undefined
    if (target) {
      const cmd = COMMANDS.find((cm) => cm.name === target)
      if (!cmd) {
        console.error(c.red(`unknown command "${target}"`))
        return EXIT.usage
      }
      console.log(renderHelp(cmd))
      return EXIT.ok
    }
    console.log(topLevelHelp())
    return EXIT.ok
  }

  const command = COMMANDS.find((cmd) => cmd.name === name)
  if (!command) {
    console.error(c.red(`unknown command "${name}"`))
    console.error(`\n${topLevelHelp()}`)
    return EXIT.usage
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(renderHelp(command))
    return EXIT.ok
  }

  try {
    return (await command.run(parseArgs(command, rest))) ?? EXIT.ok
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(c.red(`${e.message}\n`))
      console.error(renderHelp(command))
      return EXIT.usage
    }
    const err = e as Error & { code?: string }
    if (rest.includes('--json')) console.log(JSON.stringify({ok:false,code:err.code ?? 'E_UNEXPECTED',message:err.message}))
    else console.error(c.red(`${err.code ?? 'E_UNEXPECTED'}  ${err.message}`))
    if (process.env.DEBUG) console.error(err.stack)
    return EXIT.render
  }
}
