import { Command } from 'commander'
import chalk from 'chalk'
import { SoMark } from '../../client.js'
import { examples } from '../help.js'

export function registerUsageCommand(program: Command): void {
  program
    .command('usage')
    .description('Query API usage')
    .option('--format <fmt>', 'Output format: text|json|table', 'table')
    .addHelpText('after', examples('somark usage --format table'))
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const client = new SoMark({
        apiKey: parentOpts['apiKey'] as string | undefined,
        baseUrl: parentOpts['baseUrl'] as string | undefined,
        timeout: parentOpts['timeout'] ? Number(parentOpts['timeout']) : undefined,
      })
      try {
        const usage = await client.usage.get()
        if (opts.format === 'json') {
          console.log(JSON.stringify(usage.toJSON(), null, 2))
        } else if (opts.format === 'text') {
          console.log(`Paid Pages Remaining:  ${usage.remainingPaidPages.toLocaleString()}`)
          console.log(`Free Pages Today:      ${usage.remainingFreePagesToday.toLocaleString()}`)
          console.log(`Free Pages This Month: ${usage.remainingFreePagesThisMonth.toLocaleString()}`)
          console.log(`Dashboard: ${usage.dashboardUrl}`)
        } else {
          console.log('┌───────────────────────────┬─────────────────────┐')
          console.log('│ SoMark Usage              │                     │')
          console.log('├───────────────────────────┼─────────────────────┤')
          console.log(`│ Paid Pages Remaining      │ ${String(usage.remainingPaidPages.toLocaleString()).padEnd(20)}│`)
          console.log(`│ Free Pages Today          │ ${String(usage.remainingFreePagesToday.toLocaleString()).padEnd(20)}│`)
          console.log(`│ Free Pages This Month     │ ${String(usage.remainingFreePagesThisMonth.toLocaleString()).padEnd(20)}│`)
          console.log(`│ Dashboard                 │ ${String(usage.dashboardUrl).substring(0, 20).padEnd(20)}│`)
          console.log('└───────────────────────────┴─────────────────────┘')
        }
      } catch (err) {
        console.error(chalk.red(`✗ ${(err as Error).message}`))
        process.exit(2)
      }
    })
}
