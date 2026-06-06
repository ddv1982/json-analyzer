#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const trackedExtensions = new Set(['.rs', '.ts', '.tsx', '.js', '.mjs', '.css', '.json', '.toml', '.md'])
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  '.vite',
  'artifacts',
  'prompt-exports',
  'src-tauri/gen',
  'src-tauri/target',
])

function run(command, args, fallback = 'unavailable') {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return fallback
  }
}

function isIgnored(path) {
  return path
    .split('/')
    .some((part, index, parts) => ignoredDirectories.has(parts.slice(0, index + 1).join('/')) || ignoredDirectories.has(part))
}

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name)
    const repoPath = relative(repoRoot, absolutePath).replaceAll('\\', '/')
    if (isIgnored(repoPath)) {
      continue
    }
    if (entry.isDirectory()) {
      walk(absolutePath, files)
      continue
    }
    if (entry.isFile() && trackedExtensions.has(extname(entry.name))) {
      files.push(absolutePath)
    }
  }
  return files
}

function countLines(path) {
  const text = readFileSync(path, 'utf8')
  return text.length === 0 ? 0 : text.split('\n').length
}

function packageScripts(path) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  return Object.entries(manifest.scripts ?? {})
    .map(([name, command]) => `- ${name}: \`${command}\``)
    .join('\n')
}

const files = walk(repoRoot).map((path) => ({
  path: relative(repoRoot, path).replaceAll('\\', '/'),
  lines: countLines(path),
  bytes: statSync(path).size,
}))

const largestFiles = [...files]
  .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path))
  .slice(0, 15)

const totalLines = files.reduce((total, file) => total + file.lines, 0)
const gitSha = run('git', ['rev-parse', '--short', 'HEAD'])
const gitStatus = run('git', ['status', '--short'], 'unavailable')

console.log(`# JSON Analyzer Baseline

Generated: ${new Date().toISOString()}
Revision: ${gitSha}
Worktree: ${gitStatus.length === 0 ? 'clean' : 'dirty'}

## Inventory

- Tracked source/docs files scanned: ${files.length}
- Total scanned lines: ${totalLines}

## Largest Files

| Lines | Bytes | File |
| ---: | ---: | --- |
${largestFiles.map((file) => `| ${file.lines} | ${file.bytes} | \`${file.path}\` |`).join('\n')}

## Root Scripts

${packageScripts(join(repoRoot, 'package.json'))}

## Frontend Scripts

${packageScripts(join(repoRoot, 'frontend/package.json'))}

## Verification Commands

- Full suite: \`pnpm check\`
- Static baseline: \`pnpm baseline\`
- Opt-in service perf baseline: \`cargo test --test service performance_baseline -- --ignored --nocapture\`
`)
