import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const contractPath = path.resolve(__dirname, '../docs/sdk_parity_contract.md')

describe('SDK parity contract', () => {
  it('covers required public behavior topics', () => {
    const contract = fs.readFileSync(contractPath, 'utf-8')
    const requiredHeadings = [
      '## Config',
      '## Parse Output Formats',
      '## Element Formats',
      '## File Lists',
      '## Batch Parse',
      '## Task Lifecycle',
      '## Warnings',
      '## Save Behavior',
      '## Preview',
      '## PDF Helpers',
    ]

    for (const heading of requiredHeadings) {
      expect(contract).toContain(heading)
    }
  })

  it('records decided public values', () => {
    const contract = fs.readFileSync(contractPath, 'utf-8')
    expect(contract).toContain('`md`, `markdown`, `json`, and `zip`')
    expect(contract).toContain('`image`: `url`, `base64`, `file`, `none`')
    expect(contract).toContain('`smd` and `somarkdown` are not accepted parse output formats')
    expect(contract).toContain('SDKs must prevalidate that all files exist before sending parse')
    expect(contract).toContain('`SOMARK_PARSE_MAX_CONCURRENCY` controls the')
    expect(contract).toContain('API warnings are collected from the top-level `warnings` array only')
    expect(contract).toContain('Saving `zip` downloads the ZIP archive')
    expect(contract).toContain('SDK save helpers should not\nsilently create missing parent directories')
    expect(contract).toContain("Relative paths inside the manifest resolve against the caller's current working")
    expect(contract).toContain('Requests that escape the vendor root or preview root are denied')
    expect(contract).toContain('Missing optional/runtime PDF dependencies must return\nan unsuccessful result')
  })

  it('documents final release verification commands', () => {
    const releaseGate = fs.readFileSync(path.resolve(__dirname, '../docs/release_gate.md'), 'utf-8')
    expect(releaseGate).toContain('Generated package artifacts are local build outputs and should not be\n  committed')
    expect(releaseGate).toContain('Do not delete unrelated untracked local files')
    expect(releaseGate).toContain('npm test')
    expect(releaseGate).toContain('npm run build')
    expect(releaseGate).toContain('PACK_TGZ="$(npm pack --silent)"')
    expect(releaseGate).toContain('npm --prefix "$SMOKE_DIR" install --ignore-scripts --package-lock=false "$PWD/$PACK_TGZ"')
    expect(releaseGate).toContain('node -e "import(\'$SMOKE_DIR/node_modules/somark-js/dist/index.mjs\').then((m) => { if (!m.SoMark) process.exit(1) })"')
  })
})
