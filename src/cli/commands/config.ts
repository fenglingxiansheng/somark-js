import { Command } from 'commander'
import chalk from 'chalk'
import { saveConfig, getConfigValue, listResolvedConfig, maskConfigValue } from '../../config.js'
import { examples } from '../help.js'

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage configuration')
    .addHelpText('after', examples('somark config set api_key sk-...', 'somark config get api_key', 'somark config list'))

  config
    .command('set <key> <value>')
    .description('Set a config value (keys: api_key, base_url, timeout, max_retries)')
    .option('--show', 'Show secret values in output')
    .addHelpText('after', examples('somark config set api_key sk-...'))
    .action((key: string, value: string, opts: { show?: boolean }) => {
      try {
        saveConfig({ [key]: value })
        const displayValue = opts.show ? value : maskConfigValue(key, value)
        console.log(chalk.green(`✓ Set ${key} = ${displayValue}`))
      } catch (e) {
        console.error(chalk.red(`✗ ${(e as Error).message}`))
        process.exit(1)
      }
    })

  config
    .command('get <key>')
    .description('Get a config value')
    .option('--show', 'Show secret values in output')
    .addHelpText('after', examples('somark config get api_key'))
    .action((key: string, opts: { show?: boolean }) => {
      const val = getConfigValue(key)
      if (val !== undefined) console.log(`${key} = ${opts.show ? val : maskConfigValue(key, val)}`)
      else console.log(`${key} is not set`)
    })

  config
    .command('list')
    .description('List all config values (effective: env > file > default)')
    .option('--show', 'Show secret values in output')
    .addHelpText('after', examples('somark config list'))
    .action((opts: { show?: boolean }) => {
      const cfg = listResolvedConfig()
      const sourceLabel = (s: string) =>
        s === 'env' ? chalk.cyan('[env]') : s === 'file' ? chalk.yellow('[file]') : chalk.dim('[default]')
      Object.entries(cfg).forEach(([k, { value, source }]) => {
        const displayValue = opts.show ? value : maskConfigValue(k, value)
        console.log(`${k} = ${displayValue}  ${sourceLabel(source)}`)
      })
    })
}
