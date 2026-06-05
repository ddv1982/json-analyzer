import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(scriptDir, '..')
const repoRoot = resolve(frontendDir, '..')

const indexHtmlPath = resolve(frontendDir, 'index.html')
const tauriConfigPath = resolve(repoRoot, 'src-tauri', 'tauri.conf.json')

const indexHtml = readFileSync(indexHtmlPath, 'utf8')
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))

const inlineScripts = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]

if (inlineScripts.length !== 1) {
  console.error(`Expected exactly one inline script in ${indexHtmlPath}, found ${inlineScripts.length}.`)
  process.exitCode = 1
} else {
  const inlineScript = inlineScripts[0][1]
  const expectedHash = `sha256-${createHash('sha256').update(inlineScript, 'utf8').digest('base64')}`
  const csp = tauriConfig?.app?.security?.csp

  if (typeof csp !== 'string' || !csp.includes(`'${expectedHash}'`)) {
    console.error('Tauri CSP hash is out of sync with the inline theme bootstrap script.')
    console.error(`Expected ${tauriConfigPath} app.security.csp to include '${expectedHash}'.`)
    process.exitCode = 1
  }
}
