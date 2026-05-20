import { Command } from 'commander'
import chalk from 'chalk'
import { saveConfig } from '../../config.js'
import * as readline from 'readline'
import { examples } from '../help.js'

export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Login to SoMark and save API key')
    .option('--no-open', "Don't open browser")
    .addHelpText('after', examples('somark login --no-open'))
    .action(async (opts: Record<string, unknown>) => {
      const apiKeyUrl = 'https://somark.tech/workbench/apikey'
      if (opts.open !== false) {
        console.log(`Opening ${apiKeyUrl} in your browser...`)
        const open = await import('open').catch(() => null)
        if (open) await open.default(apiKeyUrl)
      } else {
        console.log(`Visit ${apiKeyUrl} to get your API key.`)
      }

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const apiKey = await new Promise<string>(resolve => rl.question('Enter your API key: ', resolve))
      rl.close()

      if (!apiKey.startsWith('sk-')) {
        console.error(chalk.red("✗ Invalid API key format (should start with 'sk-')"))
        process.exit(1)
      }

      saveConfig({ api_key: apiKey })
      console.log(chalk.green('✓ Authenticated. Config saved to ~/.somark/config.toml'))
    })
}
