import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { pathToFileURL } from 'url'
import { describe, expect, it } from 'vitest'

const rootDir = process.cwd()
const node = process.execPath
const distEsmUrl = pathToFileURL(path.join(rootDir, 'dist', 'index.mjs')).href
const distCjsPath = path.join(rootDir, 'dist', 'index.cjs')

function runScript(filename: string, source: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-format-'))
  const scriptPath = path.join(tempDir, filename)
  fs.writeFileSync(scriptPath, source)
  try {
    return execFileSync(node, [scriptPath], { encoding: 'utf-8', cwd: rootDir })
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('built package module formats', () => {
  it('starts CLI help from the ESM bin', () => {
    const output = execFileSync(node, [path.join(rootDir, 'dist', 'cli.mjs'), '--help'], {
      encoding: 'utf-8',
      cwd: rootDir,
    })
    expect(output).toContain('Usage: somark')
  })

  it('imports the ESM SDK and exposes usage without a request', () => {
    const output = runScript('esm-import.mjs', `
      import { SoMark } from ${JSON.stringify(distEsmUrl)}
      const client = new SoMark({ apiKey: 'sk-test' })
      console.log(typeof client.usage.get)
    `)
    expect(output.trim()).toBe('function')
  })

  it('starts preview from ESM and serves viewer HTML', () => {
    const output = runScript('esm-preview.mjs', `
      import { SoMarkDownPreview } from ${JSON.stringify(distEsmUrl)}
      const server = await new SoMarkDownPreview().start({ port: 0, openBrowser: false })
      const response = await fetch(server.fileUrl)
      const body = await response.text()
      await server.stop()
      console.log(response.status, body.includes('<html'))
    `)
    expect(output.trim()).toBe('200 true')
  })

  it('starts preview from CJS and serves viewer HTML', () => {
    const output = runScript('cjs-preview.cjs', `
      const { SoMarkDownPreview } = require(${JSON.stringify(distCjsPath)})
      ;(async () => {
        const server = await new SoMarkDownPreview().start({ port: 0, openBrowser: false })
        const response = await fetch(server.fileUrl)
        const body = await response.text()
        await server.stop()
        console.log(response.status, body.includes('<html'))
      })().catch((err) => {
        console.error(err)
        process.exit(1)
      })
    `)
    expect(output.trim()).toBe('200 true')
  })

  it('renders SoMarkDown strings from ESM and CJS', () => {
    const esmOutput = runScript('esm-render.mjs', `
      import { SoMarkDown } from ${JSON.stringify(distEsmUrl)}
      const html = new SoMarkDown().render('Inline: $e^{i\\\\\\\\pi}+1=0$')
      console.log(typeof html, html.length > 0, /<[^>]+>/.test(html))
    `)
    expect(esmOutput.trim()).toBe('string true true')

    const cjsOutput = runScript('cjs-render.cjs', `
      const { SoMarkDown } = require(${JSON.stringify(distCjsPath)})
      const html = new SoMarkDown().render('Inline: $e^{i\\\\\\\\pi}+1=0$')
      console.log(typeof html, html.length > 0, /<[^>]+>/.test(html))
    `)
    expect(cjsOutput.trim()).toBe('string true true')
  })
})
