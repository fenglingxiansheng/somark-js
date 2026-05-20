import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'
import { fileURLToPath } from 'url'

export interface PreviewServerHandle {
  url: string
  fileUrl: string
  host: string
  port: number
  stop(): Promise<void>
}

export interface PreviewOptions {
  file?: string
  host?: string
  port?: number
  openBrowser?: boolean
}

export type VendorSource = 'package' | 'development'

export interface VendorLocation {
  dir: string
  source: VendorSource
}

const SUPPORTED_PREVIEW_EXTS = new Set(['.md', '.smd'])
const VENDOR_FIX_HINT = 'Run: git submodule update --init --recursive or somark doctor fix'
export const previewHttp = {
  createServer: http.createServer,
}
export const previewFs = {
  createReadStream: fs.createReadStream,
  existsSync: fs.existsSync,
  statSync: fs.statSync,
}

interface ResolvedPreviewFile {
  absolutePath: string
  rootDir: string
  routePath: string
}

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.smd': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
}

function currentModuleDir(): string {
  if (typeof __dirname !== 'undefined') return __dirname
  return path.dirname(fileURLToPath(import.meta.url))
}

export const previewVendorPaths = {
  packageVendorDir(): string {
    return path.resolve(currentModuleDir(), '../vendor/somarkdown-viewer')
  },
  developmentVendorDir(): string {
    return path.resolve(process.cwd(), 'vendor/somarkdown-viewer')
  },
}

function vendorCandidates(): VendorLocation[] {
  const candidates: VendorLocation[] = [
    { dir: previewVendorPaths.packageVendorDir(), source: 'package' },
    { dir: previewVendorPaths.developmentVendorDir(), source: 'development' },
  ]
  const seen = new Set<string>()
  return candidates
    .map(candidate => ({ ...candidate, dir: path.resolve(candidate.dir) }))
    .filter(candidate => {
      if (seen.has(candidate.dir)) return false
      seen.add(candidate.dir)
      return true
    })
}

export function describeVendorSource(source: VendorSource): string {
  return source === 'package' ? 'package assets' : 'development checkout'
}

export function findVendorLocation(): VendorLocation | null {
  for (const candidate of vendorCandidates()) {
    if (previewFs.existsSync(candidate.dir) && previewFs.statSync(candidate.dir).isDirectory()) return candidate
  }
  return null
}

export function findVendorDir(): string | null {
  return findVendorLocation()?.dir ?? null
}

function missingVendorEntries(vendorDir: string): string[] {
  const required = [
    path.join(vendorDir, 'index.html'),
    path.join(vendorDir, 'lib'),
  ]
  return required
    .filter(candidate => !previewFs.existsSync(candidate))
    .map(item => path.basename(item))
}

export function validateVendorDir(vendorDir: string | null): string {
  if (!vendorDir) {
    throw new Error(`vendor/somarkdown-viewer not found. ${VENDOR_FIX_HINT}`)
  }

  const missing = missingVendorEntries(vendorDir)
  if (missing.length > 0) {
    throw new Error(`vendor/somarkdown-viewer is incomplete. Missing ${missing.join(', ')}. ${VENDOR_FIX_HINT}`)
  }

  return vendorDir
}

export function validateVendorLocation(vendorLocation: VendorLocation | null): VendorLocation {
  if (!vendorLocation) {
    throw new Error(`vendor/somarkdown-viewer not found. ${VENDOR_FIX_HINT}`)
  }

  const missing = missingVendorEntries(vendorLocation.dir)
  if (missing.length > 0) {
    if (vendorLocation.source === 'package') {
      throw new Error(`Installed preview assets are incomplete. Missing ${missing.join(', ')}. Reinstall the package or rebuild it with bundled viewer assets.`)
    }
    throw new Error(`vendor/somarkdown-viewer is incomplete. Missing ${missing.join(', ')}. ${VENDOR_FIX_HINT}`)
  }

  return vendorLocation
}

function validatePreviewFile(file: string): ResolvedPreviewFile {
  const absolutePath = path.resolve(file)
  if (!previewFs.existsSync(absolutePath) || !previewFs.statSync(absolutePath).isFile()) {
    throw new Error(`Preview file not found: ${absolutePath}`)
  }

  const ext = path.extname(absolutePath).toLowerCase()
  if (!SUPPORTED_PREVIEW_EXTS.has(ext)) {
    throw new Error(`Unsupported preview file type: ${ext || '(no extension)'}. Use .md or .smd.`)
  }

  return {
    absolutePath,
    rootDir: path.dirname(absolutePath),
    routePath: `/_preview/file/${encodeURIComponent(path.basename(absolutePath))}`,
  }
}

function normalizeRelativeRoute(routePathname: string): string | null {
  const prefix = '/_preview/file/'
  if (!routePathname.startsWith(prefix)) return null

  const raw = routePathname.slice(prefix.length)
  if (!raw) return null

  const decodedSegments = raw
    .split('/')
    .filter(Boolean)
    .map(segment => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return null
      }
    })

  if (decodedSegments.some(segment => !segment || segment === '.' || segment === '..')) {
    return null
  }

  return decodedSegments.join(path.sep)
}

function isPathInside(rootDir: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootDir, candidatePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

function sendFile(res: http.ServerResponse, filePath: string): void {
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' })
  previewFs.createReadStream(filePath).pipe(res)
}

function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(body)
}

export class SoMarkDownPreview {
  async start(opts: PreviewOptions = {}): Promise<PreviewServerHandle> {
    const host = opts.host ?? '127.0.0.1'
    const port = opts.port ?? 7878
    const openBrowser = opts.openBrowser ?? true

    const vendorLocation = validateVendorLocation(findVendorLocation())
    const vendorDir = vendorLocation.dir
    const previewFile = opts.file ? validatePreviewFile(opts.file) : null

    const server = previewHttp.createServer((req, res) => {
      const pathname = (req.url ?? '/').split('?')[0] || '/'

      if (pathname === '/') {
        sendFile(res, path.join(vendorDir, 'index.html'))
        return
      }

      const relativePreviewPath = normalizeRelativeRoute(pathname)
      if (pathname.startsWith('/_preview/file/')) {
        if (!previewFile) {
          sendText(res, 404, 'No preview file loaded.')
          return
        }
        if (!relativePreviewPath) {
          sendText(res, 403, 'Preview access denied.')
          return
        }

        const candidatePath = path.resolve(previewFile.rootDir, relativePreviewPath)
        if (
          candidatePath !== previewFile.absolutePath &&
          !isPathInside(previewFile.rootDir, candidatePath)
        ) {
          sendText(res, 403, 'Preview access denied.')
          return
        }
        if (!previewFs.existsSync(candidatePath) || !previewFs.statSync(candidatePath).isFile()) {
          sendText(res, 404, 'Preview file not found.')
          return
        }
        sendFile(res, candidatePath)
        return
      }

      const vendorPath = path.resolve(vendorDir, `.${pathname}`)
      const relativeVendorPath = path.relative(vendorDir, vendorPath)
      if (
        relativeVendorPath.startsWith('..') ||
        path.isAbsolute(relativeVendorPath) ||
        !previewFs.existsSync(vendorPath) ||
        !previewFs.statSync(vendorPath).isFile()
      ) {
        sendText(res, 404, 'Not found')
        return
      }
      sendFile(res, vendorPath)
    })

    server.on('clientError', (_err, socket) => {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    })

    await new Promise<void>((resolve, reject) => {
      server.listen(port, host, () => resolve())
      server.once('error', err => {
        if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use on ${host}.`))
          return
        }
        reject(err)
      })
    })

    const boundAddress = server.address()
    const boundPort =
      typeof boundAddress === 'object' && boundAddress
        ? boundAddress.port
        : port
    const serverUrl = `http://${host}:${boundPort}`
    const fileUrl = previewFile
      ? `${serverUrl}?file=${encodeURIComponent(`${serverUrl}${previewFile.routePath}`)}`
      : serverUrl

    if (openBrowser) {
      const open = await import('open').catch(() => null)
      if (open) await open.default(fileUrl)
    }

    let stopped = false
    return {
      url: serverUrl,
      fileUrl,
      host,
      port: boundPort,
      stop: () =>
        new Promise<void>((resolve, reject) => {
          if (stopped) {
            resolve()
            return
          }
          stopped = true
          server.close(err => (err ? reject(err) : resolve()))
        }),
    }
  }
}
