import { resolveConfig } from './config.js'
import { HttpClient } from './http.js'
import { DocumentParser } from './resources/parser.js'
import { UsageClient } from './resources/usage.js'
import { PDFProcessor } from './resources/pdf.js'
import { SoMarkDownPreview } from './resources/preview.js'

export interface SoMarkOptions {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
}

export class SoMark {
  parser: DocumentParser
  usage: UsageClient
  pdf: PDFProcessor
  preview: SoMarkDownPreview
  private _http: HttpClient

  constructor(opts: SoMarkOptions = {}) {
    const cfg = resolveConfig(opts)
    this._http = new HttpClient({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      timeout: cfg.timeout,
      maxRetries: cfg.maxRetries,
    })
    this.parser = new DocumentParser(this._http)
    this.usage = new UsageClient(this._http)
    this.pdf = new PDFProcessor()
    this.preview = new SoMarkDownPreview()
  }

  toString(): string {
    const key = this._http.getApiKey()
    const masked = key && key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : (key ? 'set' : 'not set')
    return `SoMark(apiKey=${masked})`
  }
}
