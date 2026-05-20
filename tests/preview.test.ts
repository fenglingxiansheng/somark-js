import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoMarkDown, resolveSoMarkDownExport, somarkdownFs, _resetSoMarkDownCache } from '../src/somarkdown'
import { SoMarkDown as SoMarkDownIndex } from '../src/index'
import { Command } from 'commander'
import * as http from 'http'
import {
  findVendorLocation,
  previewFs,
  previewHttp,
  previewVendorPaths,
  SoMarkDownPreview,
  validateVendorLocation,
} from '../src/resources/preview'
import { registerPreviewCommand } from '../src/cli/commands/preview'

function writeVendorFiles(rootDir: string): void {
  fs.mkdirSync(path.join(rootDir, 'vendor/somarkdown-viewer/lib'), { recursive: true })
  fs.mkdirSync(path.join(rootDir, 'vendor/somarkdown-viewer/style'), { recursive: true })
  fs.writeFileSync(path.join(rootDir, 'vendor/somarkdown-viewer/index.html'), '<!doctype html><html><body>viewer</body></html>')
  fs.writeFileSync(path.join(rootDir, 'vendor/somarkdown-viewer/lib/viewer.js'), 'console.log("viewer")')
  fs.writeFileSync(path.join(rootDir, 'vendor/somarkdown-viewer/style/viewer.css'), 'body { color: black; }')
}

class MockServer extends EventEmitter {
  private readonly boundPort: number

  constructor(port = 9123) {
    super()
    this.boundPort = port
  }

  listen(_port: number, _host: string, callback: () => void): void {
    callback()
  }

  address(): { port: number } {
    return { port: this.boundPort }
  }

  close(callback: (err?: Error | null) => void): void {
    callback(null)
  }
}

async function readResponse(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  requestUrl: string
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  const req = { url: requestUrl } as http.IncomingMessage
  const resStream = new PassThrough()
  const originalEnd = resStream.end.bind(resStream)
  const headers: Record<string, string> = {}
  let statusCode = 200

  const res = Object.assign(resStream, {
    writeHead(code: number, headerValues: Record<string, string>) {
      statusCode = code
      Object.assign(headers, headerValues)
      return res
    },
    end(chunk?: string) {
      if (chunk) resStream.write(chunk)
      originalEnd()
      return res
    },
  }) as unknown as http.ServerResponse

  handler(req, res)
  const chunks: Buffer[] = []
  for await (const chunk of resStream) {
    chunks.push(Buffer.from(chunk))
  }

  return {
    statusCode,
    headers,
    body: Buffer.concat(chunks).toString('utf-8'),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SoMarkDownPreview', () => {
  it('prefers package preview assets before the cwd development checkout', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    const packageRoot = path.join(tempDir, 'package')
    const cwdRoot = path.join(tempDir, 'cwd')
    writeVendorFiles(packageRoot)
    writeVendorFiles(cwdRoot)
    vi.spyOn(process, 'cwd').mockReturnValue(cwdRoot)
    vi.spyOn(previewVendorPaths, 'packageVendorDir').mockReturnValue(path.join(packageRoot, 'vendor/somarkdown-viewer'))

    const location = findVendorLocation()

    expect(location).toEqual({
      dir: path.join(packageRoot, 'vendor/somarkdown-viewer'),
      source: 'package',
    })
  })

  it('falls back to the cwd development checkout when package assets are absent', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    writeVendorFiles(tempDir)
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    vi.spyOn(previewVendorPaths, 'packageVendorDir').mockReturnValue(path.join(tempDir, 'missing-package-viewer'))

    const location = findVendorLocation()

    expect(location).toEqual({
      dir: path.join(tempDir, 'vendor/somarkdown-viewer'),
      source: 'development',
    })
  })

  it('does not suggest doctor fix for incomplete package assets', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    const packageViewer = path.join(tempDir, 'package', 'vendor/somarkdown-viewer')
    fs.mkdirSync(packageViewer, { recursive: true })
    vi.spyOn(previewVendorPaths, 'packageVendorDir').mockReturnValue(packageViewer)

    expect(() => validateVendorLocation(findVendorLocation())).toThrow(/Reinstall the package/)
  })

  it('throws a helpful error when the vendor viewer is missing', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    const realExistsSync = previewFs.existsSync
    vi.spyOn(previewFs, 'existsSync').mockImplementation((target: fs.PathLike) => {
      const value = String(target)
      if (value.includes('vendor/somarkdown-viewer')) return false
      return realExistsSync(target)
    })

    const resource = new SoMarkDownPreview()
    await expect(resource.start({ openBrowser: false })).rejects.toThrow(/somark doctor fix/)
  })

  it('serves viewer assets and preview files from the allowed file tree', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    writeVendorFiles(tempDir)

    const docsDir = path.join(tempDir, 'docs', 'assets')
    fs.mkdirSync(docsDir, { recursive: true })
    const mainFile = path.join(tempDir, 'docs', 'main.smd')
    fs.writeFileSync(mainFile, '# Preview\n![asset](assets/info.txt)\n')
    fs.writeFileSync(path.join(docsDir, 'info.txt'), 'asset payload')
    fs.writeFileSync(path.join(tempDir, 'outside.txt'), 'outside payload')

    let requestHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null = null
    vi.spyOn(previewHttp, 'createServer').mockImplementation((handler: http.RequestListener) => {
      requestHandler = handler
      return new MockServer() as unknown as http.Server
    })

    const resource = new SoMarkDownPreview()
    const server = await resource.start({ file: mainFile, port: 0, openBrowser: false })

    expect(server.port).toBe(9123)
    const fileTarget = new URL(new URL(server.fileUrl).searchParams.get('file') ?? '')
    expect(requestHandler).not.toBeNull()

    const indexResponse = await readResponse(requestHandler!, '/')
    expect(indexResponse.statusCode).toBe(200)
    expect(indexResponse.body).toContain('viewer')

    const assetResponse = await readResponse(requestHandler!, '/lib/viewer.js')
    expect(assetResponse.statusCode).toBe(200)
    expect(assetResponse.headers['Content-Type']).toContain('application/javascript')

    const fileResponse = await readResponse(requestHandler!, fileTarget.pathname)
    expect(fileResponse.statusCode).toBe(200)
    expect(fileResponse.body).toContain('# Preview')

    const relativeResponse = await readResponse(requestHandler!, '/_preview/file/assets/info.txt')
    expect(relativeResponse.statusCode).toBe(200)
    expect(relativeResponse.body).toBe('asset payload')

    const deniedResponse = await readResponse(requestHandler!, '/_preview/file/%2E%2E/outside.txt')
    expect(deniedResponse.statusCode).toBe(403)

    await server.stop()
  })

  it('rejects unsupported preview file types', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    writeVendorFiles(tempDir)

    const badFile = path.join(tempDir, 'notes.txt')
    fs.writeFileSync(badFile, 'bad')

    const resource = new SoMarkDownPreview()
    await expect(resource.start({ file: badFile, openBrowser: false })).rejects.toThrow(/Use \.md or \.smd/)
  })

  it('reports a port conflict clearly', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    writeVendorFiles(tempDir)

    const error = Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' })
    vi.spyOn(previewHttp, 'createServer').mockImplementation(() => {
      const server = new MockServer(7878)
      server.listen = (_port: number, _host: string, _callback: () => void) => {
        setImmediate(() => server.emit('error', error))
      }
      return server as unknown as http.Server
    })

    const resource = new SoMarkDownPreview()
    await expect(resource.start({ port: 7878, openBrowser: false })).rejects.toThrow(/already in use/)
  })
})

describe('preview CLI', () => {
  it('exits with a non-zero code when preview cannot start', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-preview-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)
    const realExistsSync = previewFs.existsSync
    vi.spyOn(previewFs, 'existsSync').mockImplementation((target: fs.PathLike) => {
      const value = String(target)
      if (value.includes('vendor/somarkdown-viewer')) return false
      return realExistsSync(target)
    })

    const program = new Command()
    registerPreviewCommand(program)

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`)
    }) as never)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(program.parseAsync(['node', 'somark', 'preview'])).rejects.toThrow('exit:1')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/somark doctor fix/))
  })
})

describe('SoMarkDown SDK', () => {
  beforeEach(() => {
    _resetSoMarkDownCache()
  })

  it('renders strings through the vendor UMD bundle', () => {
    const html = new SoMarkDown().render('Inline: $e^{i\\\\pi}+1=0$')
    expect(html).toContain('<')
    expect(html).toContain('>')
    expect(html.length).toBeGreaterThan(0)
  })

  it('throws a descriptive error when the UMD bundle cannot be found', () => {
    vi.spyOn(somarkdownFs, 'existsSync').mockReturnValue(false)
    expect(() => {
      new SoMarkDown().render('test')
    }).toThrow(/SoMarkDown UMD not found/)
  })

  it('caches the loaded class — existsSync is only called during the first construction', () => {
    // Warm-up: populate cache (no spy yet)
    new SoMarkDown().render('first')
    // Second construction must be a cache hit — no new fs calls
    const spy = vi.spyOn(somarkdownFs, 'existsSync')
    new SoMarkDown().render('second')
    expect(spy).not.toHaveBeenCalled()
  })

  it('is re-exported from the SDK index entry point (src/index.ts)', () => {
    expect(SoMarkDownIndex).toBe(SoMarkDown)
    const html = new SoMarkDownIndex().render('Inline: **bold**')
    expect(html).toContain('<')
  })

  it('resolves supported UMD export shapes', () => {
    class Renderer {
      render(): string {
        return '<p>ok</p>'
      }
    }

    expect(resolveSoMarkDownExport(Renderer)).toBe(Renderer)
    expect(resolveSoMarkDownExport({ default: Renderer })).toBe(Renderer)
    expect(resolveSoMarkDownExport({ SoMarkDown: Renderer })).toBe(Renderer)
    expect(resolveSoMarkDownExport({ default: { SoMarkDown: Renderer } })).toBe(Renderer)
    expect(() => resolveSoMarkDownExport({ default: {} })).toThrow(/not a constructable renderer/)
  })
})
