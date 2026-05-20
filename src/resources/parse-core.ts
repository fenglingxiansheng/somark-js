import * as fs from 'fs'
import * as path from 'path'
import { normalizeOutputFormat, type ExtractConfig, type ElementFormats } from '../models.js'
import { InvalidParamError } from '../errors.js'
import { parseMaxConcurrency } from '../warnings.js'

export interface ParseOptionsCore {
  formats?: string[]
  elementFormats?: ElementFormats
  extractConfig?: ExtractConfig
}

export interface ResolvedFileInputs {
  files: string[]
  isBatch: boolean
}

export interface BatchRunResult<T> {
  results: T[]
  warnings: string[]
  concurrency: number
}

const FMT_MAP: Record<string, string> = { md: 'markdown', zip: 'zip', json: 'json' }
const VALID_API_FORMATS = new Set(['markdown', 'json', 'zip'])
const VALID_FORMAT_HINT = 'md, markdown, json, zip'

export function buildParseData(opts: ParseOptionsCore): Record<string, string | string[] | undefined> {
  const data: Record<string, string | string[] | undefined> = {}
  if (opts.formats?.length) {
    const mapped = opts.formats.map(f => {
      const normalized = normalizeOutputFormat(f)
      return FMT_MAP[normalized] ?? normalized
    })
    const invalid = mapped.filter(f => !VALID_API_FORMATS.has(f))
    if (invalid.length) {
      throw new InvalidParamError(`Unsupported output format: ${invalid.join(', ')}. Valid formats: ${VALID_FORMAT_HINT}.`)
    }
    data.output_formats = mapped
  }
  if (opts.elementFormats) {
    const ef = opts.elementFormats
    const efObj: Record<string, string> = {}
    if (ef.image) efObj.image = ef.image
    if (ef.formula) efObj.formula = ef.formula
    if (ef.table) efObj.table = ef.table
    if (ef.cs) efObj.cs = ef.cs
    if (Object.keys(efObj).length) data.element_formats = JSON.stringify(efObj)
  }
  if (opts.extractConfig) {
    const ec = opts.extractConfig
    const fcObj: Record<string, boolean> = {}
    if (ec.enableTextCrossPage !== undefined) fcObj.enable_text_cross_page = ec.enableTextCrossPage
    if (ec.enableTableCrossPage !== undefined) fcObj.enable_table_cross_page = ec.enableTableCrossPage
    if (ec.enableTitleLevelRecognition !== undefined) fcObj.enable_title_level_recognition = ec.enableTitleLevelRecognition
    if (ec.enableInlineImage !== undefined) fcObj.enable_inline_image = ec.enableInlineImage
    if (ec.enableTableImage !== undefined) fcObj.enable_table_image = ec.enableTableImage
    if (ec.enableImageUnderstanding !== undefined) fcObj.enable_image_understanding = ec.enableImageUnderstanding
    if (ec.keepHeaderFooter !== undefined) fcObj.keep_header_footer = ec.keepHeaderFooter
    if (Object.keys(fcObj).length) data.feature_config = JSON.stringify(fcObj)
  }
  return data
}

export function readFileList(file: string): string[] {
  if (!fs.existsSync(file)) throw new InvalidParamError(`File list not found: ${file}`)
  return fs.readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(item => path.isAbsolute(item) ? item : path.resolve(item))
}

export function resolveFileInputs(file: string | string[], fileList = false): ResolvedFileInputs {
  if (fileList) {
    const manifests = Array.isArray(file) ? file : [file]
    return { files: manifests.flatMap(readFileList), isBatch: true }
  }
  if (Array.isArray(file)) return { files: file, isBatch: true }
  return { files: [file], isBatch: false }
}

export function resolveCliFileInputs(files: string[], fileList?: string): ResolvedFileInputs {
  const resolved = [...files]
  if (fileList) resolved.push(...readFileList(fileList))
  return { files: resolved, isBatch: resolved.length > 1 || fileList !== undefined }
}

export function ensureFilesExist(files: string[]): void {
  const missing = files.filter(file => !fs.existsSync(file) || !fs.statSync(file).isFile())
  if (missing.length) throw new InvalidParamError(`File not found: ${missing.join(', ')}`)
}

export function parseBatchSettings(itemCount: number): { concurrency: number; warnings: string[] } {
  const { value, warnings } = parseMaxConcurrency(process.env.SOMARK_PARSE_MAX_CONCURRENCY)
  return { concurrency: Math.min(value, itemCount) || 1, warnings }
}

export async function runLimited<T>(
  files: string[],
  worker: (file: string) => Promise<T>,
  onResult?: (index: number, result: T) => void,
): Promise<BatchRunResult<T>> {
  const { concurrency, warnings } = parseBatchSettings(files.length)
  const results = new Array<T>(files.length)
  let next = 0

  async function runWorker(): Promise<void> {
    while (next < files.length) {
      const index = next++
      const result = await worker(files[index])
      results[index] = result
      onResult?.(index, result)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()))
  return { results, warnings, concurrency }
}

export function attachWarnings<T extends { warnings?: string[] }>(items: T[], warnings: string[]): void {
  if (!warnings.length) return
  for (const item of items) {
    item.warnings = [...(item.warnings ?? []), ...warnings]
  }
}
