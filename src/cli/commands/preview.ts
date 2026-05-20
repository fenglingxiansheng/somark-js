import { Command } from 'commander'
import chalk from 'chalk'
import { SoMarkDownPreview } from '../../resources/preview.js'
import { examples } from '../help.js'

export function registerPreviewCommand(program: Command): void {
  program
    .command('preview [file]')
    .description('Start a local SoMarkDown preview server')
    .option('--host <host>', 'Host to bind', '127.0.0.1')
    .option('--port <n>', 'Port to listen on', '7878')
    .option('--no-open', "Don't open browser")
    .addHelpText('after', examples('somark preview output.md --port 7878'))
    .action(async (file: string | undefined, opts: Record<string, unknown>) => {
      const resource = new SoMarkDownPreview()
      try {
        const server = await resource.start({
          file,
          host: opts.host as string,
          port: Number(opts.port),
          openBrowser: opts.open as boolean,
        })
        console.log(chalk.green(`Preview server started: ${server.url}`))
        if (file) console.log(`File URL: ${server.fileUrl}`)
        console.log('Press Ctrl+C to stop.')
        process.once('SIGINT', async () => {
          await server.stop()
          console.log('\nServer stopped.')
          process.exit(0)
        })
      } catch (err) {
        console.error(chalk.red(`✗ ${(err as Error).message}`))
        process.exit(1)
      }
    })
}
