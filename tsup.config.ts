import { defineConfig } from 'tsup'

export default defineConfig([
  // SDK library entry — no shebang banner
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    external: [/vendor\//, '@hyzyla/pdfium', 'pngjs'],
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.mjs' }),
    esbuildOptions(options) {
      options.logOverride = { ...options.logOverride, 'empty-import-meta': 'silent' }
    },
  },
  // CLI entry — no shebang banner here as it is already in the source file
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    external: [/vendor\//, '@hyzyla/pdfium', 'pngjs'],
    outExtension: () => ({ js: '.mjs' }),
  },
])
