import { Command } from 'commander'
import chalk from 'chalk'
import * as path from 'path'
import * as fs from 'fs'
import { describeVendorSource, findVendorLocation, validateVendorLocation } from '../../resources/preview.js'
import { examples } from '../help.js'
import { printWarning } from '../output.js'

const VIEWER_REPO_URL = 'https://github.com/SoMarkAI/SoMarkDownViewer.git'

function placeholderEntries(targetDir: string): string[] {
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return []
  return fs.readdirSync(targetDir).filter(name => name !== '.DS_Store')
}

export function resolveVendorInstallDir(): string {
  return path.resolve(process.cwd(), 'vendor/somarkdown-viewer')
}

export async function repairViewerInstall(): Promise<void> {
  const { execFileSync } = await import('child_process')
  const targetDir = resolveVendorInstallDir()
  const parentDir = path.dirname(targetDir)
  const gitDir = path.join(targetDir, '.git')
  const scriptPath = path.join(targetDir, 'get_latest_smd.sh')

  fs.mkdirSync(parentDir, { recursive: true })

  if (fs.existsSync(gitDir)) {
    execFileSync('git', ['-C', targetDir, 'fetch', '--depth', '1', 'origin', 'main'], { stdio: 'inherit' })
    execFileSync('git', ['-C', targetDir, 'checkout', 'main'], { stdio: 'inherit' })
    execFileSync('git', ['-C', targetDir, 'pull', '--ff-only', 'origin', 'main'], { stdio: 'inherit' })
  } else if (!fs.existsSync(targetDir)) {
    execFileSync('git', ['clone', '--depth', '1', VIEWER_REPO_URL, targetDir], { stdio: 'inherit' })
  } else {
    const entries = placeholderEntries(targetDir)
    const isPlaceholder = entries.length === 0 || (entries.length === 1 && entries[0] === '.gitkeep')
    const hasViewerFiles = fs.existsSync(path.join(targetDir, 'index.html')) || fs.existsSync(scriptPath)

    if (isPlaceholder) {
      fs.rmSync(targetDir, { recursive: true, force: true })
      execFileSync('git', ['clone', '--depth', '1', VIEWER_REPO_URL, targetDir], { stdio: 'inherit' })
    } else if (!hasViewerFiles) {
      throw new Error(`Cannot repair preview assets automatically because ${targetDir} exists but is not a SoMarkDownViewer checkout.`)
    }
  }

  if (fs.existsSync(scriptPath)) {
    execFileSync('bash', [scriptPath], { stdio: 'inherit' })
    return
  }

  throw new Error(`get_latest_smd.sh not found after repair in ${targetDir}.`)
}

export function registerDoctorCommand(program: Command): void {
  const doctor = program
    .command('doctor')
    .description('Diagnose installation')
    .addHelpText('after', examples('somark doctor', 'somark doctor fix', 'somark doctor ping'))

  doctor.action(runChecks)

  doctor
    .command('fix')
    .description('Attempt to fix installation issues')
    .addHelpText('after', examples('somark doctor fix'))
    .action(async () => {
      try {
        await repairViewerInstall()
        console.log(chalk.green('✓ Preview assets repaired.'))
      } catch (e) {
        console.error(chalk.red(`✗ Failed: ${(e as Error).message}`))
      }
    })

  doctor
    .command('ping')
    .description('Check network connectivity')
    .addHelpText('after', examples('somark doctor ping'))
    .action(async () => {
      const targets = ['https://1.1.1.1', 'https://somark.tech']
      for (const target of targets) {
        try {
          const res = await fetch(target, { signal: AbortSignal.timeout(5000) })
          console.log(chalk.green(`✓ ${target} (${res.status})`))
        } catch (e) {
          console.error(chalk.red(`✗ ${target}: ${(e as Error).message}`))
        }
      }
    })
}

async function runChecks(): Promise<void> {
  console.log(chalk.bold('SoMark Doctor\n'))

  // Node version
  const [major] = process.versions.node.split('.').map(Number)
  if (major >= 18) {
    console.log(chalk.green(`✓ Node.js ${process.versions.node}`))
  } else {
    console.error(chalk.red(`✗ Node.js ${process.versions.node} (>=18 required)`))
  }

  // @hyzyla/pdfium
  try {
    await import('@hyzyla/pdfium')
    console.log(chalk.green('✓ @hyzyla/pdfium installed'))
  } catch {
    printWarning('@hyzyla/pdfium not installed. Run: npm install somark-js')
  }

  // API key
  const { resolveConfig } = await import('../../config.js')
  const cfg = resolveConfig()
  if (cfg.apiKey) {
    const k = cfg.apiKey
    const masked = k.length > 8 ? `${k.slice(0, 4)}...${k.slice(-4)}` : '***'
    console.log(chalk.green(`✓ API key configured (${masked})`))
  } else {
    printWarning('API key not configured. Run: somark login')
  }

  // preview assets
  const vendorLocation = findVendorLocation()
  try {
    const resolvedVendorLocation = validateVendorLocation(vendorLocation)
    const source = describeVendorSource(resolvedVendorLocation.source)
    console.log(chalk.green(`✓ preview assets ready (${source}: ${resolvedVendorLocation.dir})`))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const hasVendorDir = vendorLocation && fs.existsSync(vendorLocation.dir)
    if (hasVendorDir) {
      printWarning(message)
    } else {
      console.error(chalk.red(`✗ ${message}`))
    }
  }

  // network
  try {
    const res = await fetch('https://somark.tech', { signal: AbortSignal.timeout(5000) })
    console.log(chalk.green(`✓ somark.tech reachable (${res.status})`))
  } catch (e) {
    console.error(chalk.red(`✗ somark.tech unreachable: ${(e as Error).message}`))
  }
}
