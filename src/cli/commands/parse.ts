import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { SoMark } from '../../client.js'
import {
  normalizeSaveFormats,
  planOutput,
  type ElementFormats,
  type OutputPlan,
  type ParseResponse,
} from '../../models.js'
import { examples } from '../help.js'
import { resolveCliFileInputs } from '../../resources/parse-core.js'

export function registerParseCommand(program: Command): void {
  program
    .command('parse [files...]')
    .description('Parse a document')
    .option('--formats <formats>', 'Output formats (comma-separated): md,markdown,json,zip', 'md')
    .option('--out <path>', 'Output file path')
    .option('--file-list <path>', 'Text file with one document path per line')
    .option('--image-fmt <mode>', 'Image return mode: url|base64|file|none', 'url')
    .option('--formula-fmt <fmt>', 'Formula format: latex|mathml|ascii')
    .option('--table-fmt <fmt>', 'Table format: markdown|html|image')
    .option('--cs-fmt <fmt>', 'Chemical structure format: image')
    .option('--title-levels', 'Enable title level recognition')
    .option('--cross-page-text', 'Enable text cross-page merge')
    .option('--cross-page-table', 'Enable table cross-page merge')
    .option('--no-inline-image', 'Disable inline images')
    .option('--no-table-image', 'Disable table images')
    .option('--no-image-understanding', 'Disable image understanding')
    .option('--keep-header-footer', 'Keep headers and footers')
    .option('--async', 'Submit async task only')
    .option('--task-id <id>', 'Query/wait for existing task')
    .option('--wait', 'Wait for async task (use with --task-id)')
    .option('--verbose', 'Verbose output')
    .addHelpText('after', examples(
      'somark parse document.pdf --formats md,json --out parsed/',
      'somark parse a.pdf b.pdf --out parsed/',
      'somark parse --file-list files.txt --out parsed/',
      'somark parse document.pdf --async',
      'somark parse --task-id TASK_ID --wait',
    ))
    .action(async (filesArg: string[] | undefined, opts: Record<string, unknown>, cmd: Command) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const client = new SoMark({
        apiKey: parentOpts['apiKey'] as string | undefined,
        baseUrl: parentOpts['baseUrl'] as string | undefined,
        timeout: parentOpts['timeout'] ? Number(parentOpts['timeout']) : undefined,
      })

      const formats = normalizeSaveFormats(opts.formats as string)
      const extractConfig = {
        enableTitleLevelRecognition: !!opts.titleLevels,
        enableTextCrossPage: !!opts.crossPageText,
        enableTableCrossPage: !!opts.crossPageTable,
        enableInlineImage: opts.inlineImage !== false,
        enableTableImage: opts.tableImage !== false,
        enableImageUnderstanding: opts.imageUnderstanding !== false,
        keepHeaderFooter: !!opts.keepHeaderFooter,
      }
      const elementFormats = {
        image: opts.imageFmt as string | undefined,
        formula: opts.formulaFmt as string | undefined,
        table: opts.tableFmt as string | undefined,
        cs: opts.csFmt as 'image' | undefined,
      } as ElementFormats
      const files = collectInputFiles(filesArg ?? [], opts.fileList as string | undefined)
      const isBatch = files.length > 1 || opts.fileList !== undefined

      try {
        if (opts.taskId) {
          const task = client.parser.task(opts.taskId as string)
          if (opts.wait) {
            const stdoutMode = opts.out === undefined && formats.length === 1
            let response: ParseResponse
            if (stdoutMode) {
              response = await task.wait()
            } else {
              const spinner = ora(`Waiting for task ${opts.taskId}...`).start()
              response = await task.wait()
              spinner.succeed('Done')
            }
            response.sourceFileName = response.sourceFileName ?? task.fileName
            const outputPlan = planOutput(response.sourceFileName ?? 'output', opts.out as string | undefined, formats, { allowStdout: true })
            if (outputPlan.stdout) {
              process.stdout.write(response.contentForFormat(formats[0]))
              return
            }
            await saveOutputPlan(response, outputPlan)
            for (const output of planPaths(outputPlan)) console.log(`Output saved: ${output}`)
            console.log(`Task ID: ${response.taskId}, Pages: ${response.pages}`)
          } else {
            await task.refresh()
            console.log(`Task ${opts.taskId}: status=${task.status}`)
          }
          return
        }

        if (opts.async) {
          if (!files.length) { console.error(chalk.red('File argument required for async mode')); process.exit(3) }
          if (isBatch) {
            const spinner = ora('Submitting tasks...').start()
            const tasks = await client.parser.create({ file: files, formats, elementFormats, extractConfig })
            spinner.succeed('Done')
            renderBatchResults(files, tasks, { asyncMode: true, formats, out: opts.out as string | undefined, verbose: !!opts.verbose })
            return
          }
          const file = files[0]
          const task = await client.parser.create({ file, formats, elementFormats, extractConfig })
          console.log(`Task submitted: ${task.id}`)
          console.log(`Status: ${task.status}`)
          console.log(`\nTo retrieve results later:`)
          console.log(`  somark parse --task-id ${task.id} --wait`)
          return
        }

        if (!files.length) { console.error(chalk.red('File argument required')); process.exit(3) }
        if (isBatch) {
          validateBatchOutput(opts.out as string | undefined, formats)
          const spinner = ora('Submitting and processing files...').start()
          const manifest = path.resolve(opts.out as string, 'somark-tasks.jsonl')
          const outcomes = await runLimited(files, async file => {
            let taskId = ''
            try {
              const task = await client.parser.create({ file, formats, elementFormats, extractConfig })
              taskId = task.id
              console.error(`Task submitted: ${file} -> ${taskId}`)
              fs.appendFileSync(manifest, `${JSON.stringify({ file: path.resolve(file), task_id: taskId })}\n`, 'utf-8')
              const response = await task.wait({ timeout: 3600 })
              response.sourceFileName = response.sourceFileName ?? path.basename(file)
              const outputPlan = planOutput(file, opts.out as string, formats, { batch: true })
              await saveOutputPlan(response, outputPlan)
              return { file, taskId, outputs: planPaths(outputPlan), error: '' }
            } catch (err) {
              return { file, taskId, outputs: [], error: (err as Error).message }
            }
          })
          spinner.succeed('Done')
          const table = outcomes.results.map(item => ({
            file: item.file,
            status: item.error ? 'failed' : 'success',
            taskId: item.taskId,
            outputOrError: item.error ? item.error : item.outputs.join(', '),
          }))
          console.table(table)
          console.log(`Task manifest: ${manifest}`)
          const failed = outcomes.results.filter(item => item.error).length
          console.log(`Summary: total=${outcomes.results.length} success=${outcomes.results.length - failed} failed=${failed}`)
          if (failed) process.exitCode = 1
          return
        }

        const file = files[0]
        const outputPlan = planOutput(file, opts.out as string | undefined, formats, { allowStdout: true })
        if (outputPlan.stdout) {
          const task = await client.parser.create({ file, formats, elementFormats, extractConfig })
          console.error(`Task submitted: ${task.id}; waiting for completion...`)
          const response = await task.wait({ timeout: 3600 })
          process.stdout.write(response.contentForFormat(formats[0]))
          return
        }
        const spinner = ora(`Submitting ${file}...`).start()
        const task = await client.parser.create({ file, formats, elementFormats, extractConfig })
        spinner.text = `Waiting for task ${task.id}...`
        const response = await task.wait({ timeout: 3600 })
        spinner.succeed(chalk.green(`Done in ${response.pages} pages`))
        await saveOutputPlan(response, outputPlan)
        for (const output of planPaths(outputPlan)) console.log(`Output saved: ${output}`)
        if (opts.verbose) console.log(`Task ID: ${response.taskId}`)
      } catch (err) {
        const e = err as Error
        console.error(chalk.red(`✗ ${e.message}`))
        process.exit(e.constructor.name.includes('Auth') || e.constructor.name.includes('Connection') ? 2 : 1)
      }
    })
}

function collectInputFiles(files: string[], fileList?: string): string[] {
  try {
    return resolveCliFileInputs(files, fileList).files
  } catch (err) {
    console.error(chalk.red(`✗ ${(err as Error).message}`))
    process.exit(3)
  }
}

export function resolveOutputPaths(source: string, out: string | undefined, formats: string[], allowStdout: boolean): string[] {
  return planPaths(planOutput(source, out, formats, { allowStdout }))
}

export function validateBatchOutput(out?: string, formats: string[] = ['md']): void {
  planOutput('output', out, formats, { batch: true })
}

function planPaths(plan: OutputPlan): string[] {
  return plan.targets.flatMap(target => target.path ? [target.path] : [])
}

async function saveOutputPlan(response: ParseResponse, plan: OutputPlan): Promise<void> {
  for (const target of plan.targets) {
    if (!target.stdout && target.path) await response.save(target.path, target.format)
  }
}

async function saveBatchOutputs(files: string[], responses: ParseResponse[], out: string | undefined, formats: string[]): Promise<void> {
  await Promise.all(responses.map((response, index) => saveOutputPlan(response, planOutput(files[index], out, formats, { batch: true }))))
}

function renderBatchResults(
  files: string[],
  items: Array<ParseResponse | { id: string }>,
  opts: { asyncMode: boolean; formats: string[]; out?: string; verbose: boolean },
): void {
  console.log(`Files: ${files.length}`)
  console.table(items.map((item, index) => {
    const file = files[index]
    const outputOrTask = opts.asyncMode
      ? (item as { id: string }).id
      : outputLabel(file, item as ParseResponse, opts)
    return {
      '#': index + 1,
      file,
      exists: 'yes',
      status: opts.asyncMode ? 'submitted' : 'success',
      outputOrTask,
      error: '',
    }
  }))
  console.log(`Summary: total=${items.length} success=${items.length} failed=0`)
}

function outputLabel(
  file: string,
  response: ParseResponse,
  opts: { formats: string[]; out?: string; verbose: boolean },
): string {
  const output = planPaths(planOutput(file, opts.out, opts.formats, { batch: true })).join(', ')
  return opts.verbose && response.taskId ? `${output} task=${response.taskId}` : output
}
