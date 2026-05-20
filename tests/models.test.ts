import { afterEach, describe, it, expect, vi } from 'vitest'
import { ParseResponse, Usage } from '../src/models'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const mockParseData = {
  code: 0, message: '任务成功',
  data: {
    task_id: 'abc123',
    error: null,
    metadata: { page_num: 5, file_type: '.pdf' },
    result: {
      file_name: 'test.pdf',
      imgs: ['http://example.com/img1.png'],
      outputs: {
        markdown: '# Hello World\n\nTest content.',
        json: { pages: [] },
        zip: null,
      },
    },
  },
}

const mockUsageData = {
  code: 0, message: '',
  data: {
    remaining_paid_pages: 104410,
    remaining_free_pages_today: 295,
    remaining_free_pages_this_month: 578,
    dashboard_url: 'https://somark.tech/workbench',
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ParseResponse', () => {
  it('creates from API response', () => {
    const r = ParseResponse.fromApi(mockParseData as Record<string, unknown>)
    expect(r.ok).toBe(true)
    expect(r.taskId).toBe('abc123')
    expect(r.pages).toBe(5)
    expect(r.md).toBe('# Hello World\n\nTest content.')
    expect(r.warnings).toEqual([])
    expect(r.sourceFileName).toBe('test.pdf')
  })

  it('reads API warnings', () => {
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      const r = ParseResponse.fromApi({
        ...mockParseData,
        warning: 'ignored old shape',
        warnings: ['top warning', '', 'top warning', 123],
        data: { ...mockParseData.data, warnings: ['ignored nested warning'] },
      } as Record<string, unknown>)
      expect(r.warnings).toEqual(['top warning'])
      expect(r.toJSON().warnings).toEqual(['top warning'])
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('ignores malformed API warnings', () => {
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      const r = ParseResponse.fromApi({ ...mockParseData, warnings: { message: 'ignored' } } as Record<string, unknown>)
      expect(r.warnings).toEqual([])
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('saves markdown to file', async () => {
    const r = ParseResponse.fromApi(mockParseData as Record<string, unknown>)
    const tmpFile = path.join(os.tmpdir(), `somark-test-${Date.now()}.md`)
    await r.save(tmpFile)
    expect(fs.readFileSync(tmpFile, 'utf-8')).toBe(r.md)
    fs.unlinkSync(tmpFile)
  })

  it('saves JSON to file', async () => {
    const r = ParseResponse.fromApi(mockParseData as Record<string, unknown>)
    const tmpFile = path.join(os.tmpdir(), `somark-test-${Date.now()}.json`)
    await r.save(tmpFile, 'json')
    const parsed = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'))
    expect(parsed).toEqual(r.jsonOutput)
    fs.unlinkSync(tmpFile)
  })

  it('downloads ZIP output to file', async () => {
    const r = ParseResponse.fromApi({
      ...mockParseData,
      data: {
        ...mockParseData.data,
        result: {
          ...mockParseData.data.result,
          outputs: { ...mockParseData.data.result.outputs, zip: 'https://example.com/output.zip' },
        },
      },
    } as Record<string, unknown>)
    const tmpFile = path.join(os.tmpdir(), `somark-test-${Date.now()}.zip`)
    const zipBytes = Buffer.from('PK\x03\x04zip payload')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await r.save(tmpFile, 'zip')
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/output.zip', expect.objectContaining({ redirect: 'follow' }))
    expect(fs.readFileSync(tmpFile)).toEqual(zipBytes)
    fs.unlinkSync(tmpFile)
  })

  it('saves multiple formats to an existing directory', async () => {
    const r = ParseResponse.fromApi(mockParseData as Record<string, unknown>)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-save-'))
    try {
      await r.save(dir, ['md', 'json'])
      expect(fs.readFileSync(path.join(dir, 'test.md'), 'utf-8')).toBe(r.md)
      expect(fs.existsSync(path.join(dir, 'test.json'))).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects multiple formats to a file path', async () => {
    const r = ParseResponse.fromApi(mockParseData as Record<string, unknown>)
    const tmpFile = path.join(os.tmpdir(), `somark-test-${Date.now()}.md`)
    await expect(r.save(tmpFile, ['md', 'json'])).rejects.toThrow(/multiple formats require --out to be an existing directory/)
  })

  it('rejects missing output parent directory', async () => {
    const r = ParseResponse.fromApi(mockParseData as Record<string, unknown>)
    const tmpFile = path.join(os.tmpdir(), `missing-${Date.now()}`, 'output.md')
    await expect(r.save(tmpFile, 'md')).rejects.toThrow(/output parent directory does not exist/)
  })

  it.each(['smd', 'somarkdown'])('does not save %s output', async (formatName) => {
    const r = ParseResponse.fromApi(mockParseData as Record<string, unknown>)
    const tmpFile = path.join(os.tmpdir(), `somark-test-${Date.now()}.smd`)
    await expect(r.save(tmpFile, formatName)).rejects.toThrow(/Unsupported output format/)
  })
})

describe('Usage', () => {
  it('creates from API response', () => {
    const u = Usage.fromApi(mockUsageData as Record<string, unknown>)
    expect(u.ok).toBe(true)
    expect(u.remainingPaidPages).toBe(104410)
    expect(u.remainingFreePagesToday).toBe(295)
    expect(u.remainingFreePagesThisMonth).toBe(578)
    expect(u.dashboardUrl).toContain('somark.tech')
  })

  it('reads API warnings', () => {
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      const u = Usage.fromApi({ ...mockUsageData, warnings: ['usage warning'] } as Record<string, unknown>)
      expect(u.warnings).toEqual(['usage warning'])
      expect(u.toJSON().warnings).toEqual(['usage warning'])
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
