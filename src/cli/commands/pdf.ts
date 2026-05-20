import { Command } from 'commander'
import chalk from 'chalk'
import { PDFProcessor } from '../../resources/pdf.js'
import { examples } from '../help.js'

export function registerPdfCommand(program: Command): void {
  const pdf = program
    .command('pdf')
    .description('PDF operations')
    .addHelpText('after', examples('somark pdf toimg document.pdf --out ./pages'))

  pdf
    .command('toimg <file>')
    .description('Convert PDF pages to images (local, no API key needed)')
    .option('--out <dir>', 'Output directory', './')
    .option('--format <template>', 'Filename template: {name}.page-{n}.png')
    .option('--dpi <n>', 'Resolution in DPI', '150')
    .addHelpText('after', examples('somark pdf toimg document.pdf --out ./pages'))
    .action(async (file: string, opts: Record<string, unknown>) => {
      const resource = new PDFProcessor()
      const result = await resource.toImages({
        file,
        out: opts.out as string,
        filenameFormat: opts.format as string | undefined,
        dpi: Number(opts.dpi),
      })
      if (result.ok) {
        console.log(chalk.green(`✓ Converted ${result.files.length} page(s) to ${opts.out}`))
        result.files.forEach(f => console.log(`  ${f}`))
      } else {
        console.error(chalk.red(`✗ ${result.error}`))
        process.exit(1)
      }
    })
}
