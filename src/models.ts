import * as fs from 'fs'
import * as path from 'path'
import { ParseFailedError, ParseTimeoutError } from './errors.js'
import { SoMarkWarning, collectApiWarnings } from './warnings.js'
export type { SoMarkWarning } from './warnings.js'

export interface ExtractConfig {
  enableTextCrossPage?: boolean
  enableTableCrossPage?: boolean
  enableTitleLevelRecognition?: boolean
  enableInlineImage?: boolean
  enableTableImage?: boolean
  enableImageUnderstanding?: boolean
  keepHeaderFooter?: boolean
}

export interface ElementFormats {
  image?: 'url' | 'base64' | 'file' | 'none'
  formula?: 'latex' | 'mathml' | 'ascii'
  table?: 'markdown' | 'html' | 'image'
  cs?: 'image'
}

export interface SoMarkResponseData {
  ok: boolean
  code: number
  message: string
  warnings?: SoMarkWarning[]
}

export interface ParseResponseData extends SoMarkResponseData {
  taskId: string
  pages: number
  fileType: string
  imgs: string[]
  md?: string
  jsonOutput?: Record<string, unknown>
  zipUrl?: string
  sourceFileName?: string
}

export interface OutputTarget {
  format: string
  path?: string
  stdout: boolean
}

export interface OutputPlan {
  formats: string[]
  targets: OutputTarget[]
  stdout: boolean
}

export class ParseResponse implements ParseResponseData {
  ok: boolean
  code: number
  message: string
  warnings: SoMarkWarning[]
  taskId: string
  pages: number
  fileType: string
  imgs: string[]
  md?: string
  jsonOutput?: Record<string, unknown>
  zipUrl?: string
  sourceFileName?: string

  constructor(data: ParseResponseData) {
    this.ok = data.ok
    this.code = data.code
    this.message = data.message
    this.warnings = data.warnings ?? []
    this.taskId = data.taskId
    this.pages = data.pages
    this.fileType = data.fileType
    this.imgs = data.imgs
    this.md = data.md
    this.jsonOutput = data.jsonOutput
    this.zipUrl = data.zipUrl
    this.sourceFileName = data.sourceFileName
  }

  async save(targetPath: string, format?: string | string[]): Promise<void> {
    const plan = planOutput(this.sourceFileName, targetPath, format, { allowStdout: false })
    for (const target of plan.targets) {
      if (target.stdout || !target.path) throw new Error('save path is required')
      await this.saveFormat(target.path, target.format)
    }
  }

  contentForFormat(format: string): string {
    const fmt = normalizeOutputFormat(format)
    if (fmt === 'json') return JSON.stringify(this.jsonOutput ?? {}, null, 2)
    if (fmt === 'md') return this.md ?? ''
    if (fmt === 'zip') {
      if (!this.zipUrl) throw new Error('ZIP output URL was not returned by the API.')
      return this.zipUrl
    }
    throw new Error(`Unsupported output format: ${fmt}. Valid formats: md, markdown, json, zip.`)
  }

  private async saveFormat(targetPath: string, format: string): Promise<void> {
    const fmt = normalizeOutputFormat(format)
    if (fmt === 'zip') {
      if (!this.zipUrl) throw new Error('ZIP output URL was not returned by the API.')
      await downloadOutputFile(targetPath, this.zipUrl)
      return
    }
    fs.writeFileSync(targetPath, this.contentForFormat(fmt), 'utf-8')
  }

  toJSON(): ParseResponseData {
    return {
      ok: this.ok,
      code: this.code,
      message: this.message,
      warnings: this.warnings,
      taskId: this.taskId,
      pages: this.pages,
      fileType: this.fileType,
      imgs: this.imgs,
      md: this.md,
      jsonOutput: this.jsonOutput,
      zipUrl: this.zipUrl,
      sourceFileName: this.sourceFileName,
    }
  }

  static fromApi(data: Record<string, unknown>): ParseResponse {
    // API response: {code, message, data: {task_id, metadata: {page_num, file_type}, result: {imgs, outputs: {markdown, json, zip}}}}
    const apiData = (data.data as Record<string, unknown>) ?? {}
    const metadata = (apiData.metadata as Record<string, unknown>) ?? {}
    const result = (apiData.result as Record<string, unknown>) ?? {}
    const outputs = (result.outputs as Record<string, unknown>) ?? {}
    const warnings = collectApiWarnings(data)
    return new ParseResponse({
      ok: (data.code as number) === 0,
      code: (data.code as number) ?? -1,
      message: ((data.message ?? data.msg) as string) ?? '',
      warnings,
      taskId: (apiData.task_id as string) ?? '',
      pages: (metadata.page_num as number) ?? 0,
      fileType: (metadata.file_type as string) ?? '',
      imgs: (result.imgs as string[]) ?? [],
      md: outputs.markdown as string | undefined,
      jsonOutput: outputs.json as Record<string, unknown> | undefined,
      zipUrl: outputs.zip as string | undefined,
      sourceFileName: (result.file_name as string | undefined) ?? (apiData.file_name as string | undefined),
    })
  }
}

export function normalizeOutputFormat(format: string): string {
  const fmt = format.trim().toLowerCase()
  return ({ markdown: 'md' } as Record<string, string>)[fmt] ?? fmt
}

export function normalizeSaveFormats(format: string | string[] | undefined, targetPath?: string): string[] {
  const rawFormats = Array.isArray(format)
    ? format
    : typeof format === 'string'
      ? format.split(',').map(item => item.trim())
      : [path.extname(targetPath ?? '').replace(/^\./, '') || 'md']
  const formats = rawFormats.map(normalizeOutputFormat).filter(Boolean)
  const normalized = formats.length ? formats : ['md']
  const invalid = normalized.filter(fmt => !['md', 'json', 'zip'].includes(fmt))
  if (invalid.length) {
    throw new Error(`Unsupported output format: ${invalid.join(', ')}. Valid formats: md, markdown, json, zip.`)
  }
  return normalized
}

export function planOutput(
  sourceFileName: string | undefined,
  out: string | undefined,
  format?: string | string[],
  opts: { allowStdout?: boolean; batch?: boolean } = {},
): OutputPlan {
  const formats = normalizeSaveFormats(format, out)
  if (opts.batch) {
    if (!out || !isExistingDirectory(out)) {
      throw new Error('batch parse requires --out to be an existing directory')
    }
    return directoryOutputPlan(sourceFileName, out, formats)
  }

  if (!out) {
    if (formats.length > 1) throw new Error('multiple formats require --out to be an existing directory')
    if (!opts.allowStdout) throw new Error('output path is required')
    return { formats, targets: [{ format: formats[0], stdout: true }], stdout: true }
  }

  if (isExistingDirectory(out)) return directoryOutputPlan(sourceFileName, out, formats)
  if (formats.length > 1) throw new Error('multiple formats require --out to be an existing directory')
  if (looksLikeDirectoryPath(out)) throw new Error(`output directory does not exist: ${out}`)
  const parent = path.dirname(path.resolve(out))
  if (!isExistingDirectory(parent)) throw new Error(`output parent directory does not exist: ${parent}`)
  return { formats, targets: [{ format: formats[0], path: out, stdout: false }], stdout: false }
}

function directoryOutputPlan(sourceFileName: string | undefined, directory: string, formats: string[]): OutputPlan {
  const stem = sourceStem(sourceFileName)
  if (!stem) throw new Error('saving to a directory requires a source file name')
  return {
    formats,
    targets: formats.map(fmt => ({
      format: fmt,
      path: path.join(directory, `${stem}.${formatExt(fmt)}`),
      stdout: false,
    })),
    stdout: false,
  }
}

function formatExt(format: string): string {
  return normalizeOutputFormat(format) === 'md' ? 'md' : normalizeOutputFormat(format)
}

function sourceStem(fileName?: string): string | undefined {
  if (!fileName) return undefined
  return path.basename(fileName, path.extname(fileName))
}

function isExistingDirectory(target: string): boolean {
  return fs.existsSync(target) && fs.statSync(target).isDirectory()
}

function looksLikeDirectoryPath(target: string): boolean {
  return target.endsWith(path.sep) || target.endsWith('/')
}

async function downloadOutputFile(targetPath: string, url: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) })
  } catch (err) {
    throw new Error(`failed to download ZIP output: ${(err as Error).message}`)
  }
  if (!response.ok) {
    throw new Error(`failed to download ZIP output: HTTP ${response.status}: ${response.statusText}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(targetPath, bytes)
}

export interface UsageData extends SoMarkResponseData {
  remainingPaidPages: number
  remainingFreePagesToday: number
  remainingFreePagesThisMonth: number
  dashboardUrl: string
}

export class Usage implements UsageData {
  ok: boolean
  code: number
  message: string
  warnings: SoMarkWarning[]
  remainingPaidPages: number
  remainingFreePagesToday: number
  remainingFreePagesThisMonth: number
  dashboardUrl: string

  constructor(data: UsageData) {
    this.ok = data.ok
    this.code = data.code
    this.message = data.message
    this.warnings = data.warnings ?? []
    this.remainingPaidPages = data.remainingPaidPages
    this.remainingFreePagesToday = data.remainingFreePagesToday
    this.remainingFreePagesThisMonth = data.remainingFreePagesThisMonth
    this.dashboardUrl = data.dashboardUrl
  }

  toJSON(): UsageData {
    return {
      ok: this.ok, code: this.code, message: this.message,
      warnings: this.warnings,
      remainingPaidPages: this.remainingPaidPages,
      remainingFreePagesToday: this.remainingFreePagesToday,
      remainingFreePagesThisMonth: this.remainingFreePagesThisMonth,
      dashboardUrl: this.dashboardUrl,
    }
  }

  static fromApi(data: Record<string, unknown>): Usage {
    const apiData = (data.data as Record<string, unknown>) ?? {}
    const warnings = collectApiWarnings(data)
    return new Usage({
      ok: (data.code as number) === 0,
      code: (data.code as number) ?? -1,
      message: ((data.message ?? data.msg) as string) ?? '',
      warnings,
      remainingPaidPages: (apiData.remaining_paid_pages as number) ?? 0,
      remainingFreePagesToday: (apiData.remaining_free_pages_today as number) ?? 0,
      remainingFreePagesThisMonth: (apiData.remaining_free_pages_this_month as number) ?? 0,
      dashboardUrl: (apiData.dashboard_url as string) ?? 'https://somark.tech/workbench',
    })
  }
}

export interface ToImagesResult {
  ok: boolean
  files: string[]
  error?: string
}

export type TaskStatus = 'queuing' | 'processing' | 'success' | 'failed'

export type TaskRefreshHandler = (taskId: string, timeout?: number) => Promise<Record<string, unknown>>

export class Task {
  id: string
  completed: boolean = false
  status: TaskStatus = 'queuing'
  recordId?: number
  fileName?: string
  pages?: number
  warnings: string[]
  private refreshHandler?: TaskRefreshHandler
  private _result?: ParseResponse

  constructor(taskId: string, refreshHandler?: TaskRefreshHandler, warnings: string[] = []) {
    this.id = taskId
    this.refreshHandler = refreshHandler
    this.warnings = warnings
  }

  async refresh(timeout?: number): Promise<void> {
    if (!this.refreshHandler) {
      throw new Error('Task cannot refresh without a parser resource. Use client.parser.task(taskId).')
    }
    const data = await this.refreshHandler(this.id, timeout)
    this.applyApi(data)
  }

  private applyApi(data: Record<string, unknown>): void {
    this.warnings = collectApiWarnings(data)
    const apiData = (data.data as Record<string, unknown>) ?? {}
    const rawStatus = (apiData.status as string) ?? this.status
    this.status = rawStatus.toLowerCase() as TaskStatus
    this.recordId = apiData.record_id as number | undefined
    this.fileName = apiData.file_name as string | undefined
    const metadata = (apiData.metadata as Record<string, unknown>) ?? {}
    this.pages = metadata.page_num as number | undefined
    if (this.status === 'success' || this.status === 'failed') {
      this.completed = true
      if (this.status === 'success') {
        this._result = ParseResponse.fromApi(data)
      }
    }
  }

  async wait(opts: { pollInterval?: number; timeout?: number } = {}): Promise<ParseResponse> {
    const pollInterval = (opts.pollInterval ?? 3) * 1000
    const timeout = (opts.timeout ?? 120) * 1000
    const deadline = performance.now() + timeout
    while (!this.completed) {
      const remaining = deadline - performance.now()
      if (remaining <= 0) {
        throw new ParseTimeoutError(`Task ${this.id} timed out`)
      }
      await sleep(Math.min(pollInterval, remaining))
      const requestTimeout = deadline - performance.now()
      if (requestTimeout <= 0) throw new ParseTimeoutError(`Task ${this.id} timed out`)
      await this.refresh(requestTimeout / 1000)
      if (performance.now() >= deadline) throw new ParseTimeoutError(`Task ${this.id} timed out`)
    }
    if (this.status === 'failed') throw new ParseFailedError(`Task ${this.id} failed`)
    return this._result!
  }

  result(): ParseResponse {
    if (!this._result) throw new Error('Task not completed. Call wait() first.')
    return this._result
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
