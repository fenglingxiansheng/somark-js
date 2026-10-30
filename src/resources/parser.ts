import * as fs from 'fs'
import * as path from 'path'
import { HttpClient } from '../http.js'
import { ParseResponse, ExtractConfig, ElementFormats, Task } from '../models.js'
export { Task } from '../models.js'
import { AuthenticationError } from '../errors.js'
import { collectApiWarnings, emitWarnings } from '../warnings.js'
import {
  attachWarnings,
  buildParseData,
  ensureFilesExist,
  resolveFileInputs,
  runLimited,
} from './parse-core.js'

export interface ParseOptions {
  file: string | string[]
  formats?: string[]
  elementFormats?: ElementFormats
  extractConfig?: ExtractConfig
  fileList?: boolean
}

export class DocumentParser {
  private _http: HttpClient

  constructor(http: HttpClient) {
    this._http = http
  }

  private checkApiKey(): void {
    if (!this._http.getApiKey()) {
      throw new AuthenticationError('apiKey is required for parser operations.')
    }
  }

  private async pollTask(taskId: string, timeout?: number): Promise<Record<string, unknown>> {
    this.checkApiKey()
    const data = timeout === undefined
      ? await this._http.post('/parse/async_check', { task_id: taskId })
      : await this._http.post('/parse/async_check', { task_id: taskId }, undefined, timeout * 1000)
    emitWarnings(collectApiWarnings(data))
    return data
  }

  task(taskId: string): Task {
    return new Task(taskId, id => this.pollTask(id))
  }

  private async parseOne(opts: Omit<ParseOptions, 'file' | 'fileList'> & { file: string }): Promise<ParseResponse> {
    this.checkApiKey()
    const data = buildParseData({ formats: opts.formats ?? ['md'], elementFormats: opts.elementFormats, extractConfig: opts.extractConfig })
    const buffer = fs.readFileSync(opts.file)
    const fileName = path.basename(opts.file)
    const result = await this._http.post('/parse/sync', data, { name: fileName, buffer, mimeType: 'application/octet-stream' })
    const response = ParseResponse.fromApi(result)
    emitWarnings(response.warnings)
    response.sourceFileName = fileName
    return response
  }

  async parse(opts: ParseOptions & { file: string; fileList?: false }): Promise<ParseResponse>
  async parse(opts: ParseOptions & { file: string[] }): Promise<ParseResponse[]>
  async parse(opts: ParseOptions & { fileList: true }): Promise<ParseResponse[]>
  async parse(opts: ParseOptions): Promise<ParseResponse | ParseResponse[]> {
    this.checkApiKey()
    const { files, isBatch } = resolveFileInputs(opts.file, opts.fileList)
    ensureFilesExist(files)
    const { results: responses, warnings } = await runLimited(files, file => this.parseOne({ ...opts, file }))
    if (isBatch) {
      emitWarnings(warnings)
      attachWarnings(responses, warnings)
    }
    return isBatch ? responses : responses[0]
  }

  private async createOne(opts: Omit<ParseOptions, 'file' | 'fileList'> & { file: string }): Promise<Task> {
    this.checkApiKey()
    const data = buildParseData({ formats: opts.formats ?? ['md'], elementFormats: opts.elementFormats, extractConfig: opts.extractConfig })
    const buffer = fs.readFileSync(opts.file)
    const fileName = path.basename(opts.file)
    const result = await this._http.post('/parse/async', data, { name: fileName, buffer, mimeType: 'application/octet-stream' })
    const taskId = ((result.data as Record<string, unknown>)?.task_id as string) ?? ''
    const warnings = collectApiWarnings(result)
    emitWarnings(warnings)
    return new Task(taskId, id => this.pollTask(id), warnings)
  }

  async create(opts: ParseOptions & { file: string; fileList?: false }): Promise<Task>
  async create(opts: ParseOptions & { file: string[] }): Promise<Task[]>
  async create(opts: ParseOptions & { fileList: true }): Promise<Task[]>
  async create(opts: ParseOptions): Promise<Task | Task[]> {
    this.checkApiKey()
    const { files, isBatch } = resolveFileInputs(opts.file, opts.fileList)
    ensureFilesExist(files)
    const { results: tasks, warnings } = await runLimited(files, file => this.createOne({ ...opts, file }))
    if (isBatch) {
      emitWarnings(warnings)
      attachWarnings(tasks, warnings)
    }
    return isBatch ? tasks : tasks[0]
  }
}
