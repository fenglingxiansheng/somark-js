#!/usr/bin/env node
import { Command } from 'commander'
import pkg from '../../package.json' with { type: 'json' }
const { version } = pkg
import { registerParseCommand } from './commands/parse.js'
import { registerUsageCommand } from './commands/usage.js'
import { registerPdfCommand } from './commands/pdf.js'
import { registerPreviewCommand } from './commands/preview.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerConfigCommand } from './commands/config.js'
import { registerLoginCommand } from './commands/login.js'
import { examples } from './help.js'
import { setWarningsSuppressed } from '../warnings.js'

const program = new Command()

program
  .name('somark')
  .description('SoMark SDK + CLI — Document parsing, PDF processing, and SoMarkDown preview. [JS]')
  .version(version)
  .helpOption('-h, --help', 'display help for command')
  .option('--api-key <key>', 'API key', process.env.SOMARK_API_KEY)
  .option('--base-url <url>', 'Base URL')
  .option('--timeout <seconds>', 'Request timeout in seconds', '60')
  .option('--no-warnings', 'Suppress SoMark warnings')
  .addHelpText('after', examples('somark parse document.pdf --formats md,json --out output.md', 'somark usage --format table'))

registerParseCommand(program)
registerUsageCommand(program)
registerPdfCommand(program)
registerPreviewCommand(program)
registerDoctorCommand(program)
registerConfigCommand(program)
registerLoginCommand(program)

program.hook('preAction', (_thisCommand, actionCommand) => {
  const optsWithGlobals = actionCommand.optsWithGlobals?.() ?? program.opts()
  setWarningsSuppressed(Boolean(optsWithGlobals.warnings === false))
})

program.parse()
