/**
 * 08_error_handling.ts — Comprehensive error handling
 *
 * Demonstrates catching specific error types from the somark error hierarchy.
 * Parses a Chinese financial report image to show real API interaction,
 * then illustrates how each error type would be handled.
 *
 * Run:
 *   npx tsx examples/08_error_handling.ts
 *
 * Requires: SOMARK_API_KEY env var (or ~/.somark/config.toml)
 */

import path from 'path'
import { fileURLToPath } from 'url'
import {
  SoMark,
  SoMarkError,
  AuthenticationError,
  InsufficientBalanceError,
  RateLimitError,
  UnsupportedFileError,
  FileTooLargeError,
  ParseTimeoutError,
  ParseFailedError,
  InvalidParamError,
  APIError,
  ConnectionError,
  RequestTimeoutError,
} from 'somark-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const IMAGE_FILE = path.join(DATA_DIR, '研报1.png')

async function parseWithErrorHandling(client: SoMark, file: string) {
  try {
    const response = await client.parser.parse({
      file,
      formats: ['md'],
    })

    console.log(`Success! Pages: ${response.pages}`)
    if (response.md) {
      console.log('--- Markdown preview (first 300 chars) ---')
      console.log(response.md.slice(0, 300))
      console.log('...')
    }
    return response
  } catch (err) {
    if (err instanceof AuthenticationError) {
      console.error('[AuthenticationError] Invalid or missing API key.')
      console.error('  Set SOMARK_API_KEY env var or run: somark login')
    } else if (err instanceof InsufficientBalanceError) {
      console.error('[InsufficientBalanceError] Account has insufficient page balance.')
      console.error('  Visit https://somark.tech/workbench to top up.')
    } else if (err instanceof RateLimitError) {
      console.error('[RateLimitError] Too many requests. Slow down and retry.')
    } else if (err instanceof UnsupportedFileError) {
      console.error('[UnsupportedFileError] File format not supported by the API.')
    } else if (err instanceof FileTooLargeError) {
      console.error('[FileTooLargeError] File exceeds the maximum allowed size.')
    } else if (err instanceof ParseTimeoutError) {
      console.error('[ParseTimeoutError] The server timed out processing this file.')
    } else if (err instanceof ParseFailedError) {
      console.error('[ParseFailedError] The server failed to parse this file.')
      console.error(`  Code: ${(err as SoMarkError).code}`)
    } else if (err instanceof InvalidParamError) {
      console.error('[InvalidParamError] One or more request parameters are invalid.')
    } else if (err instanceof APIError) {
      console.error(`[APIError] Unexpected API error. Code: ${(err as SoMarkError).code}`)
    } else if (err instanceof ConnectionError) {
      console.error('[ConnectionError] Could not reach the SoMark API. Check your network.')
    } else if (err instanceof RequestTimeoutError) {
      console.error('[RequestTimeoutError] Request timed out. Try increasing the timeout.')
    } else if (err instanceof SoMarkError) {
      console.error(`[SoMarkError] code=${(err as SoMarkError).code}: ${(err as Error).message}`)
    } else {
      throw err  // re-throw unexpected errors
    }
    return null
  }
}

async function main() {
  const client = new SoMark()

  console.log('=== Example 1: Parse Chinese financial report image ===')
  console.log('File:', IMAGE_FILE)
  console.log()
  await parseWithErrorHandling(client, IMAGE_FILE)

  console.log()
  console.log('=== Example 2: Simulate AuthenticationError (bad key) ===')
  const badClient = new SoMark({ apiKey: 'invalid-key-for-demo' })
  await parseWithErrorHandling(badClient, IMAGE_FILE)

  console.log()
  console.log('Done.')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
