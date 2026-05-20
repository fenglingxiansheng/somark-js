/**
 * 01_basic_parse.ts — Basic synchronous PDF parsing
 *
 * Demonstrates the simplest path: PDF → markdown via parser.parse()
 *
 * Run:
 *   npx tsx examples/01_basic_parse.ts
 *
 * Requires: SOMARK_API_KEY env var (or ~/.somark/config.toml)
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { SoMark } from 'somark-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, '2010.02399v1.pdf')

async function main() {
  const client = new SoMark()

  console.log('Parsing:', FILE)
  console.log('Sending to SoMark API (sync)...\n')

  const response = await client.parser.parse({
    file: FILE,
    formats: ['md'],
  })

  console.log(`Pages parsed: ${response.pages}`)
  console.log(`File type:    ${response.fileType}`)
  console.log()

  if (response.md) {
    const preview = response.md.slice(0, 500)
    console.log('--- Markdown preview (first 500 chars) ---')
    console.log(preview)
    console.log('...')
    console.log()
  }

  const outPath = path.join(__dirname, 'output_01.md')
  await response.save(outPath, 'md')
  console.log(`Saved to: ${outPath}`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
