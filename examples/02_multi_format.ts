/**
 * 02_multi_format.ts — Multi-format export in a single parse call
 *
 * Demonstrates requesting md + json in one call, with custom element formats.
 *
 * Run:
 *   npx tsx examples/02_multi_format.ts
 *
 * Requires: SOMARK_API_KEY env var (or ~/.somark/config.toml)
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { SoMark } from 'somark-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, '5115_Attention_Guided_Alignmen.pdf')

async function main() {
  const client = new SoMark()

  console.log('Parsing:', FILE)
  console.log('Requesting formats: md + json\n')

  const response = await client.parser.parse({
    file: FILE,
    formats: ['md', 'json'],
    elementFormats: {
      formula: 'latex',
      table: 'markdown',
    },
  })

  console.log(`Pages parsed: ${response.pages}`)
  console.log(`File type:    ${response.fileType}`)
  console.log()

  // Show markdown snippet
  if (response.md) {
    console.log('--- Markdown (first 300 chars) ---')
    console.log(response.md.slice(0, 300))
    console.log('...\n')
  }

  // Show JSON structure (top-level keys)
  if (response.jsonOutput) {
    const keys = Object.keys(response.jsonOutput)
    console.log('--- JSON output top-level keys ---')
    console.log(keys)
    console.log()
  }

  // Save both formats
  const mdPath = path.join(__dirname, 'output_02.md')
  const jsonPath = path.join(__dirname, 'output_02.json')

  await response.save(mdPath, 'md')
  await response.save(jsonPath, 'json')

  console.log(`Saved markdown to: ${mdPath}`)
  console.log(`Saved JSON to:     ${jsonPath}`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
