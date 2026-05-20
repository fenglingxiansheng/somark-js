/**
 * 09_pipeline.ts — End-to-end pipeline: parse → save Markdown → preview
 *
 * Demonstrates a realistic workflow:
 *   1. Parse a Chinese exam image with SoMark API
 *   2. Save the result as a .md file
 *   3. Start a local preview server and open in browser
 *
 * Run:
 *   npx tsx examples/09_pipeline.ts
 *
 * Requires: SOMARK_API_KEY env var (or ~/.somark/config.toml)
 * Note: Preview server requires the somarkdown-viewer vendor files.
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { SoMark } from 'somark-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const IMAGE_FILE = path.join(DATA_DIR, '中文试卷-page.png')

async function main() {
  const client = new SoMark()

  // Step 1: Parse image
  console.log('Step 1: Parsing Chinese exam image...')
  console.log('File:', IMAGE_FILE)
  console.log()

  const response = await client.parser.parse({
    file: IMAGE_FILE,
    formats: ['md'],
  })

  console.log(`Parsed ${response.pages} page(s)`)
  console.log()

  // Step 2: Save Markdown file
  const mdPath = path.join(__dirname, 'output_09.md')

  await response.save(mdPath, 'md')
  console.log(`Step 2: Saved MD to: ${mdPath}`)

  console.log()

  // Step 3: Preview server
  console.log('Step 3: Starting preview server...')
  try {
    const server = await client.preview.start({
      file: mdPath,
      port: 7878,
      openBrowser: true,
    })

    console.log(`Preview server: ${server.url}`)
    console.log(`File URL:       ${server.fileUrl}`)
    console.log()
    console.log('Press Ctrl+C to stop the preview server.')

    // Keep running until user interrupts
    await new Promise<void>((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\nStopping preview server...')
        await server.stop()
        resolve()
      })
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`Preview server unavailable: ${message}`)
    console.warn('Run `somark doctor fix` or initialize `vendor/somarkdown-viewer` if preview assets are missing.')
    console.warn('Markdown file has been saved successfully.')
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
