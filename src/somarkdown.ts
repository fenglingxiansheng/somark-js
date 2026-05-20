import * as path from 'path'
import * as fs from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

export const somarkdownFs = {
  existsSync: fs.existsSync,
}

type SoMarkDownConstructor = new (...args: unknown[]) => {
  render(markdown: string, ...args: unknown[]): string
}

let _SoMarkDown: SoMarkDownConstructor | null = null

export function _resetSoMarkDownCache(): void {
  _SoMarkDown = null
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function currentModuleDir(): string {
  if (typeof __dirname !== 'undefined') return __dirname
  return path.dirname(fileURLToPath(import.meta.url))
}

export function resolveSoMarkDownExport(mod: unknown): SoMarkDownConstructor {
  const candidates = [
    mod,
    (mod as { default?: unknown } | null | undefined)?.default,
    (mod as { SoMarkDown?: unknown } | null | undefined)?.SoMarkDown,
    ((mod as { default?: { SoMarkDown?: unknown } } | null | undefined)?.default)?.SoMarkDown,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      const proto = (candidate as { prototype?: { render?: unknown } }).prototype
      if (typeof proto?.render === 'function') return candidate as SoMarkDownConstructor
    }
  }

  throw new Error('SoMarkDown UMD export is not a constructable renderer.')
}

function loadCommonJsFile(filePath: string): unknown {
  const code = fs.readFileSync(filePath, 'utf-8')
  const module = { exports: {} as unknown }
  const localRequire = createRequire(filePath)
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', code)
  fn.call(globalThis, module, module.exports, localRequire, filePath, path.dirname(filePath))
  return module.exports
}

function loadSoMarkDown(): SoMarkDownConstructor {
  if (_SoMarkDown) return _SoMarkDown

  const moduleDir = currentModuleDir()
  const candidates = unique([
    path.resolve(process.cwd(), 'vendor/somarkdown-viewer/lib/somarkdown/somarkdown.umd.min.js'),
    path.resolve(moduleDir, 'vendor/somarkdown-viewer/lib/somarkdown/somarkdown.umd.min.js'),
    path.resolve(moduleDir, '../vendor/somarkdown-viewer/lib/somarkdown/somarkdown.umd.min.js'),
    path.resolve(moduleDir, '../../vendor/somarkdown-viewer/lib/somarkdown/somarkdown.umd.min.js'),
    path.resolve(moduleDir, '../../../vendor/somarkdown-viewer/lib/somarkdown/somarkdown.umd.min.js'),
  ])

  for (const p of candidates) {
    if (somarkdownFs.existsSync(p)) {
      const mod = loadCommonJsFile(p)
      _SoMarkDown = resolveSoMarkDownExport(mod)
      return _SoMarkDown
    }
  }

  throw new Error(
    'SoMarkDown UMD not found. Run: git submodule update --init --recursive && vendor/somarkdown-viewer/get_latest_smd.sh'
  )
}

export class SoMarkDown {
  private readonly renderer: { render(markdown: string, ...args: unknown[]): string }

  constructor(...args: unknown[]) {
    const Renderer = loadSoMarkDown()
    this.renderer = new Renderer(...args)
  }

  render(markdown: string, ...args: unknown[]): string {
    return this.renderer.render(markdown, ...args)
  }
}
