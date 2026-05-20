/**
 * 07_pdf_to_images.ts — Convert PDF pages to images locally
 *
 * Uses pdf.toImages() which renders locally via @hyzyla/pdfium.
 * No API key required for this operation.
 *
 * Run:
 *   npx tsx examples/07_pdf_to_images.ts
 *
 * PDF support is included with somark-js.
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { SoMark } from 'somark-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const FILE = path.join(DATA_DIR, '5115_Attention_Guided_Alignmen.pdf')
const OUT_DIR = path.join(__dirname, 'output_07_images')

async function main() {
  // No API key needed for local PDF rendering
  const client = new SoMark()

  console.log('Converting PDF pages to images...')
  console.log('Input:', FILE)
  console.log('Output dir:', OUT_DIR)
  console.log()

  const result = await client.pdf.toImages({
    file: FILE,
    out: OUT_DIR,
    dpi: 150,
    filenameFormat: '{name}-page-{n}.png',
  })

  if (!result.ok) {
    console.error('Error converting PDF:', result.error)
    process.exit(1)
  }

  console.log(`Rendered ${result.files.length} page(s):`)
  for (const f of result.files) {
    console.log(' ', f)
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  if (err.message.includes('pdfium') || err.message.includes('Cannot find module')) {
    console.error('\nHint: install somark-js again:')
    console.error('  npm install somark-js')
  }
  process.exit(1)
})
