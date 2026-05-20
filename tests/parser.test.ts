import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentParser } from '../src/resources/parser'
import { buildParseData, resolveCliFileInputs, runLimited } from '../src/resources/parse-core'
import { HttpClient } from '../src/http'
import type { ElementFormats } from '../src/models'
import { AuthenticationError, InvalidParamError } from '../src/errors'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createMockHttp(apiKey: string | undefined): HttpClient {
  return {
    getApiKey: () => apiKey,
    post: vi.fn(),
  } as unknown as HttpClient
}

const mockParseApiResponse = {
  code: 0, message: '任务成功',
  data: {
    task_id: 'abc123',
    error: null,
    metadata: { page_num: 5, file_type: '.pdf' },
    result: {
      file_name: 'test.pdf',
      imgs: [],
      outputs: { markdown: '# Test', json: {}, zip: null },
    },
  },
}

describe('DocumentParser', () => {
  let tmpFile: string

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.pdf`)
    fs.writeFileSync(tmpFile, Buffer.from('%PDF-1.0 test'))
  })

  it('throws AuthenticationError without apiKey', async () => {
    const http = createMockHttp(undefined)
    const parser = new DocumentParser(http)
    await expect(parser.parse({ file: tmpFile })).rejects.toThrow(AuthenticationError)
  })

  it('parse returns ParseResponse', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
    const parser = new DocumentParser(http)
    const response = await parser.parse({ file: tmpFile })
    expect(response.ok).toBe(true)
    expect(response.taskId).toBe('abc123')
    const [endpoint] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(endpoint).toBe('/parse/sync')
  })

  it('parse sends feature_config as JSON string', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
    const parser = new DocumentParser(http)
    await parser.parse({ file: tmpFile, extractConfig: { enableTitleLevelRecognition: true } })
    const [, data] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(typeof data.feature_config).toBe('string')
    const fc = JSON.parse(data.feature_config)
    expect(fc.enable_title_level_recognition).toBe(true)
  })

  it('parse core builds request data', () => {
    const data = buildParseData({
      formats: ['md', 'json'],
      elementFormats: { image: 'file', cs: 'image' },
      extractConfig: { enableTitleLevelRecognition: true },
    })
    expect(data.output_formats).toEqual(['markdown', 'json'])
    expect(JSON.parse(data.element_formats as string)).toEqual({ image: 'file', cs: 'image' })
    expect(JSON.parse(data.feature_config as string).enable_title_level_recognition).toBe(true)
  })

  it('parse core resolves CLI file-list entries from cwd', () => {
    const dir = path.join(process.cwd(), `.tmp-somark-core-list-${Date.now()}`)
    try {
      const dataDir = path.join(dir, 'data')
      fs.mkdirSync(dataDir, { recursive: true })
      const pdf = path.join(dataDir, 'a.pdf')
      fs.writeFileSync(pdf, Buffer.from('%PDF-1.0 a'))
      const manifest = path.join(dir, 'files.txt')
      fs.writeFileSync(manifest, `${path.relative(process.cwd(), pdf)}\n\n`, 'utf-8')
      const resolved = resolveCliFileInputs(['direct.pdf'], manifest)
      expect(resolved.files).toEqual(['direct.pdf', pdf])
      expect(resolved.isBatch).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('parse core runLimited preserves order and reports concurrency', async () => {
    const previous = process.env.SOMARK_PARSE_MAX_CONCURRENCY
    process.env.SOMARK_PARSE_MAX_CONCURRENCY = '2'
    try {
      const batch = await runLimited(['a', 'b', 'c'], async item => item.toUpperCase())
      expect(batch.results).toEqual(['A', 'B', 'C'])
      expect(batch.concurrency).toBe(2)
      expect(batch.warnings[0]).toContain('SOMARK_PARSE_MAX_CONCURRENCY is set to 2')
    } finally {
      if (previous === undefined) delete process.env.SOMARK_PARSE_MAX_CONCURRENCY
      else process.env.SOMARK_PARSE_MAX_CONCURRENCY = previous
    }
  })

  it('parse sends element_formats as JSON string', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
    const parser = new DocumentParser(http)
    await parser.parse({ file: tmpFile, elementFormats: { image: 'base64', formula: 'latex', cs: 'image' } })
    const [, data] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(typeof data.element_formats).toBe('string')
    const ef = JSON.parse(data.element_formats)
    expect(ef.image).toBe('base64')
    expect(ef.formula).toBe('latex')
    expect(ef.cs).toBe('image')
  })

  it('parse accepts image=file element format', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
    const parser = new DocumentParser(http)
    const elementFormats = { image: 'file' } as unknown as ElementFormats
    await parser.parse({ file: tmpFile, elementFormats })
    const [, data] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]
    const ef = JSON.parse(data.element_formats)
    expect(ef.image).toBe('file')
  })

  it('rejects invalid output formats', async () => {
    const http = createMockHttp('sk-test')
    const parser = new DocumentParser(http)
    await expect(parser.parse({ file: tmpFile, formats: ['docx'] })).rejects.toThrow(InvalidParamError)
  })

  it.each([
    [['md'], ['markdown']],
    [['markdown'], ['markdown']],
    [['json'], ['json']],
    [['zip'], ['zip']],
  ])('accepts supported output format %s', async (requested, sent) => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
    const parser = new DocumentParser(http)
    await parser.parse({ file: tmpFile, formats: requested })
    const [, data] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(data.output_formats).toEqual(sent)
  })

  it.each(['smd', 'somarkdown'])('rejects %s output format', async (formatName) => {
    const http = createMockHttp('sk-test')
    const parser = new DocumentParser(http)
    await expect(parser.parse({ file: tmpFile, formats: [formatName] })).rejects.toThrow(/Valid formats: md, markdown, json, zip/)
  })

  it('create returns Task with correct id', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0, message: '任务已提交',
      data: { task_id: 'task-xyz', status: 'queuing' }
    })
    const parser = new DocumentParser(http)
    const task = await parser.create({ file: tmpFile })
    expect(task.id).toBe('task-xyz')
    expect(task.completed).toBe(false)
    const [endpoint] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(endpoint).toBe('/parse/async')
  })

  it('task refresh emits API warnings', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockParseApiResponse,
      warnings: ['task warning'],
    })
    const parser = new DocumentParser(http)
    const task = parser.task('task-123')
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      await task.refresh()
      expect(task.warnings).toEqual(['task warning'])
      expect(spy).toHaveBeenCalledWith('task warning', { type: 'SoMarkWarning' })
    } finally {
      spy.mockRestore()
    }
  })

  it('successful task emits each warning once', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockParseApiResponse,
      warnings: ['task warning', 'task warning'],
      data: { ...mockParseApiResponse.data, status: 'success' },
    })
    const parser = new DocumentParser(http)
    const task = parser.task('task-123')
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      await task.refresh()
      expect(task.result().warnings).toEqual(['task warning'])
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith('task warning', { type: 'SoMarkWarning' })
    } finally {
      spy.mockRestore()
    }
  })

  it('parse accepts multiple files and preserves order', async () => {
    const first = path.join(os.tmpdir(), `test-a-${Date.now()}.pdf`)
    const second = path.join(os.tmpdir(), `test-b-${Date.now()}.pdf`)
    fs.writeFileSync(first, Buffer.from('%PDF-1.0 a'))
    fs.writeFileSync(second, Buffer.from('%PDF-1.0 b'))
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
    const parser = new DocumentParser(http)
    const responses = await parser.parse({ file: [first, second] })
    expect(responses.map(response => response.taskId)).toEqual(['abc123', 'abc123'])
    expect(http.post).toHaveBeenCalledTimes(2)
  })

  it('parse batch attaches concurrency warning', async () => {
    const previous = process.env.SOMARK_PARSE_MAX_CONCURRENCY
    process.env.SOMARK_PARSE_MAX_CONCURRENCY = '2'
    const first = path.join(os.tmpdir(), `warn-a-${Date.now()}.pdf`)
    const second = path.join(os.tmpdir(), `warn-b-${Date.now()}.pdf`)
    try {
      fs.writeFileSync(first, Buffer.from('%PDF-1.0 a'))
      fs.writeFileSync(second, Buffer.from('%PDF-1.0 b'))
      const http = createMockHttp('sk-test')
      ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
      const parser = new DocumentParser(http)
      const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
      const responses = await parser.parse({ file: [first, second] })
      expect(responses.every(response => response.warnings.some(warning => warning.includes('SOMARK_PARSE_MAX_CONCURRENCY is set to 2')))).toBe(true)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SOMARK_PARSE_MAX_CONCURRENCY is set to 2'), { type: 'SoMarkWarning' })
      spy.mockRestore()
    } finally {
      if (previous === undefined) delete process.env.SOMARK_PARSE_MAX_CONCURRENCY
      else process.env.SOMARK_PARSE_MAX_CONCURRENCY = previous
      fs.rmSync(first, { force: true })
      fs.rmSync(second, { force: true })
    }
  })

  it('create accepts multiple files', async () => {
    const first = path.join(os.tmpdir(), `task-a-${Date.now()}.pdf`)
    const second = path.join(os.tmpdir(), `task-b-${Date.now()}.pdf`)
    fs.writeFileSync(first, Buffer.from('%PDF-1.0 a'))
    fs.writeFileSync(second, Buffer.from('%PDF-1.0 b'))
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ code: 0, message: '', data: { task_id: 'task-a' } })
      .mockResolvedValueOnce({ code: 0, message: '', data: { task_id: 'task-b' } })
    const parser = new DocumentParser(http)
    const tasks = await parser.create({ file: [first, second] })
    expect(tasks.map(task => task.id)).toEqual(['task-a', 'task-b'])
  })

  it('create batch attaches concurrency warning', async () => {
    const previous = process.env.SOMARK_PARSE_MAX_CONCURRENCY
    process.env.SOMARK_PARSE_MAX_CONCURRENCY = '2'
    const first = path.join(os.tmpdir(), `task-warn-a-${Date.now()}.pdf`)
    const second = path.join(os.tmpdir(), `task-warn-b-${Date.now()}.pdf`)
    try {
      fs.writeFileSync(first, Buffer.from('%PDF-1.0 a'))
      fs.writeFileSync(second, Buffer.from('%PDF-1.0 b'))
      const http = createMockHttp('sk-test')
      ;(http.post as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ code: 0, message: '', data: { task_id: 'task-a' } })
        .mockResolvedValueOnce({ code: 0, message: '', data: { task_id: 'task-b' } })
      const parser = new DocumentParser(http)
      const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
      const tasks = await parser.create({ file: [first, second] })
      expect(tasks.every(task => task.warnings.some(warning => warning.includes('SOMARK_PARSE_MAX_CONCURRENCY is set to 2')))).toBe(true)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SOMARK_PARSE_MAX_CONCURRENCY is set to 2'), { type: 'SoMarkWarning' })
      spy.mockRestore()
    } finally {
      if (previous === undefined) delete process.env.SOMARK_PARSE_MAX_CONCURRENCY
      else process.env.SOMARK_PARSE_MAX_CONCURRENCY = previous
      fs.rmSync(first, { force: true })
      fs.rmSync(second, { force: true })
    }
  })

  it('parse reads fileList entries relative to cwd', async () => {
    const dir = path.join(process.cwd(), `.tmp-somark-list-${Date.now()}`)
    try {
      const dataDir = path.join(dir, 'data')
      fs.mkdirSync(dataDir, { recursive: true })
      const pdf = path.join(dataDir, 'a.pdf')
      fs.writeFileSync(pdf, Buffer.from('%PDF-1.0 a'))
      const manifestDir = path.join(dir, 'lists')
      fs.mkdirSync(manifestDir)
      const manifest = path.join(manifestDir, 'files.txt')
      fs.writeFileSync(manifest, `${path.relative(process.cwd(), pdf)}\n\n`, 'utf-8')
      const http = createMockHttp('sk-test')
      ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockParseApiResponse)
      const parser = new DocumentParser(http)
      const responses = await parser.parse({ file: manifest, fileList: true })
      expect(responses).toHaveLength(1)
      const [, , sentFile] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(sentFile.name).toBe('a.pdf')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('parse multiple files prevalidates missing files', async () => {
    const existing = path.join(os.tmpdir(), `exists-${Date.now()}.pdf`)
    const missing = path.join(os.tmpdir(), `missing-${Date.now()}.pdf`)
    fs.writeFileSync(existing, Buffer.from('%PDF-1.0 a'))
    const http = createMockHttp('sk-test')
    const parser = new DocumentParser(http)
    await expect(parser.parse({ file: [existing, missing] })).rejects.toThrow(InvalidParamError)
    expect(http.post).not.toHaveBeenCalled()
  })
})
