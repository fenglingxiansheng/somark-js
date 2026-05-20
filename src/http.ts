import { raiseForCode, APIError, ConnectionError, RequestTimeoutError } from './errors.js'

const RETRY_CODES = new Set([1101, 1124])
const RETRY_HTTP_STATUSES = new Set([500, 502, 503, 504])

export interface HttpClientOptions {
  apiKey: string | undefined
  baseUrl: string
  timeout: number
  maxRetries: number
}

export class HttpClient {
  private apiKey: string | undefined
  private baseUrl: string
  private timeoutMs: number
  private maxRetries: number

  constructor(opts: HttpClientOptions) {
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.timeoutMs = opts.timeout * 1000
    this.maxRetries = opts.maxRetries
  }

  getApiKey(): string | undefined {
    return this.apiKey
  }

  private buildFormData(data: Record<string, string | string[] | undefined>): FormData {
    const form = new FormData()
    if (this.apiKey) form.append('api_key', this.apiKey)
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue
      if (Array.isArray(v)) {
        for (const item of v) form.append(k, item)
      } else {
        form.append(k, v)
      }
    }
    return form
  }

  async post(
    path: string,
    data: Record<string, string | string[] | undefined> = {},
    file?: { name: string; buffer: Buffer; mimeType: string },
  ): Promise<Record<string, unknown>> {
    const url = this.baseUrl + path
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const form = this.buildFormData(data)
        if (file) {
          const blob = new Blob([file.buffer], { type: file.mimeType })
          form.append('file', blob, file.name)
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.timeoutMs)

        let response: Response
        try {
          response = await fetch(url, { method: 'POST', body: form, signal: controller.signal })
        } finally {
          clearTimeout(timer)
        }

        if (RETRY_HTTP_STATUSES.has(response.status) && attempt < this.maxRetries) {
          await sleep(Math.pow(2, attempt) * 1000)
          continue
        }

        if (!response.ok) {
          throw new APIError(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = (await response.json()) as Record<string, unknown>
        const code = (result.code as number) ?? -1
        if (code !== 0) {
          if (RETRY_CODES.has(code) && attempt < this.maxRetries) {
            await sleep(Math.pow(2, attempt) * 1000)
            continue
          }
          raiseForCode(code, ((result.message ?? result.msg) as string) || '')
        }
        return result
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new RequestTimeoutError('Request timed out')
        } else if (err instanceof TypeError && err.message.includes('fetch')) {
          lastError = new ConnectionError(err.message)
        } else if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
          lastError = new ConnectionError(err.message)
        } else {
          throw err // Don't retry on API logic errors
        }
        if (attempt < this.maxRetries) await sleep(Math.pow(2, attempt) * 1000)
      }
    }
    throw lastError ?? new APIError('Request failed after retries')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
