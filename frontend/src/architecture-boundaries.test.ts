import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMANDS } from './lib/commands/command-names'

const FRONTEND_SRC = resolve(process.cwd(), 'src')
const REPO_ROOT = resolve(process.cwd(), '..')

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return sourceFilesUnder(fullPath)
    }

    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

function quotedStrings(source: string): string[] {
  return [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1])
}

function tomlArrayValues(source: string, key: string): string[] {
  const match = source.match(new RegExp(`${key.replace('.', '\\.')}\\s*=\\s*\\[([\\s\\S]*?)\\]`))
  return match ? quotedStrings(match[1]) : []
}

function generateHandlerCommands(source: string): string[] {
  const match = source.match(/generate_handler!\s*\[([\s\S]*?)\]/)
  if (!match) {
    return []
  }

  return [...match[1].matchAll(/\b[a-z][a-z0-9_]*\b/g)].map((handler) => handler[0])
}

describe('architecture boundaries', () => {
  it('keeps raw Tauri invoke usage inside the command adapter', () => {
    const allowedFiles = new Set([
      'lib/commands/invoke-client.ts',
      'lib/commands.browser-fallback.test.ts',
      'lib/commands.invoke.test.ts',
    ])

    const offenders = sourceFilesUnder(FRONTEND_SRC)
      .filter((filePath) => !filePath.endsWith('architecture-boundaries.test.ts'))
      .filter((filePath) => {
        const source = readFileSync(filePath, 'utf8')
        return source.includes('@tauri-apps/api/core') || /\binvoke\s*\(/.test(source)
      })
      .map((filePath) => relative(FRONTEND_SRC, filePath))
      .filter((filePath) => !allowedFiles.has(filePath))

    expect(offenders).toEqual([])
  })

  it('keeps frontend command names aligned with Tauri permissions and required command tests', () => {
    const frontendCommands: string[] = Object.values(COMMANDS)
    const permissionsSource = readFileSync(
      resolve(REPO_ROOT, 'src-tauri/permissions/json-analyzer-commands.toml'),
      'utf8',
    )
    const commandsSource = readFileSync(resolve(REPO_ROOT, 'src-tauri/src/commands.rs'), 'utf8')
    const mainSource = readFileSync(resolve(REPO_ROOT, 'src-tauri/src/main.rs'), 'utf8')

    expect(tomlArrayValues(permissionsSource, 'commands.allow')).toEqual(frontendCommands)
    expect(quotedStrings(commandsSource).filter((value) => frontendCommands.includes(value))).toEqual(
      frontendCommands,
    )
    expect(generateHandlerCommands(mainSource)).toEqual(frontendCommands)
  })
})
