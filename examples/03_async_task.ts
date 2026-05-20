/**
 * 03_async_task.ts — Async task submission + polling
 *
 * Demonstrates parser.create() which submits an async job and returns a Task.
 * Then calls task.wait() to poll until completion.
 *
 * Run:
 *   npx tsx examples/03_async_task.ts
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

  console.log('Submitting async task for:', FILE)

  const task = await client.parser.create({
    file: FILE,
    formats: ['md'],
  })

  console.log(`Task ID:  ${task.id}`)
  console.log(`Status:   ${task.status}`)
  console.log('Polling for completion...\n')

  const result = await task.wait({
    pollInterval: 3,   // seconds between polls
    timeout: 120,      // max seconds to wait
  })

  console.log(`Final status: ${task.status}`)
  console.log(`Pages parsed: ${result.pages}`)
  console.log()

  if (result.md) {
    console.log('--- Markdown preview (first 400 chars) ---')
    console.log(result.md.slice(0, 400))
    console.log('...\n')
  }

  const outPath = path.join(__dirname, 'output_03.md')
  await result.save(outPath, 'md')
  console.log(`Saved to: ${outPath}`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
