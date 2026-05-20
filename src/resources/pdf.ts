import * as fs from 'fs'
import * as path from 'path'
import { ToImagesResult } from '../models.js'

export interface ToImagesOptions {
  file: string
  out?: string
  filenameFormat?: string
  dpi?: number
}

export class PDFProcessor {
  async toImages(opts: ToImagesOptions): Promise<ToImagesResult> {
    // Lazy-load @hyzyla/pdfium so importing the SDK does not initialize PDFium.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pdfiumMod: any | null = null
    try {
      pdfiumMod = await import('@hyzyla/pdfium')
    } catch {
      return { ok: false, files: [], error: '@hyzyla/pdfium is not installed. Run: npm install somark-js' }
    }

    // Lazy-load pngjs for raw BGRA → PNG encoding
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let PNG: any = null
    try {
      const pngjsMod = await import('pngjs')
      PNG = pngjsMod.PNG
    } catch {
      return { ok: false, files: [], error: 'pngjs is not installed. Run: npm install pngjs' }
    }

    try {
      const outDir = opts.out ?? './'
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

      const baseName = path.basename(opts.file, path.extname(opts.file))
      const fmt = opts.filenameFormat ?? '{name}.page-{n}.png'
      const dpi = opts.dpi ?? 150
      const scale = dpi / 72

      const pdfBuffer = fs.readFileSync(opts.file)
      const library = await pdfiumMod.PDFiumLibrary.init()
      const document = await library.loadDocument(pdfBuffer)
      const files: string[] = []
      const pageCount = document.getPageCount()

      for (let i = 0; i < pageCount; i++) {
        const page = document.getPage(i)

        const image = await page.render({
          scale,
          render: async (renderOpts: { width: number; height: number; data: Uint8Array }) => {
            const png = new PNG({ width: renderOpts.width, height: renderOpts.height })
            // pdfium gives BGRA, convert to RGBA for PNG
            const src = renderOpts.data
            for (let j = 0; j < src.length; j += 4) {
              png.data[j]     = src[j + 2]  // R ← B
              png.data[j + 1] = src[j + 1]  // G
              png.data[j + 2] = src[j]       // B ← R
              png.data[j + 3] = src[j + 3]  // A
            }
            return Buffer.from(PNG.sync.write(png))
          },
        })

        const outName = fmt
          .replace('{name}', baseName)
          .replace('{n}', String(i + 1))
        const outPath = path.join(outDir, outName)
        fs.writeFileSync(outPath, Buffer.from(image.data))
        files.push(outPath)
      }

      document.destroy()
      library.destroy()
      return { ok: true, files }
    } catch (err) {
      return { ok: false, files: [], error: String(err) }
    }
  }
}
