declare module '@hyzyla/pdfium' {
  export class PDFiumLibrary {
    static init(): Promise<PDFiumLibrary>
    loadDocument(data: Buffer | Uint8Array): PDFiumDocument
    destroy(): void
  }
  export class PDFiumDocument {
    getPageCount(): number
    getPage(index: number): PDFiumPage
    destroy(): void
  }
  export class PDFiumPage {
    readonly width: number
    readonly height: number
    render(opts: { width: number; height: number }): Buffer
    destroy(): void
  }
}
