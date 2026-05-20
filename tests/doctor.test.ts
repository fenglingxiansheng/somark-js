import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { repairViewerInstall } from '../src/cli/commands/doctor'

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('repairViewerInstall', () => {
  it('replaces a placeholder vendor directory with a git clone and asset fetch', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-doctor-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)

    const vendorDir = path.join(tempDir, 'vendor', 'somarkdown-viewer')
    fs.mkdirSync(vendorDir, { recursive: true })
    fs.writeFileSync(path.join(vendorDir, '.gitkeep'), '')

    const childProcess = await import('child_process')
    const execFileSync = vi.mocked(childProcess.execFileSync)
    execFileSync.mockImplementation((command, args) => {
      if (command === 'git' && args?.[0] === 'clone') {
        fs.mkdirSync(vendorDir, { recursive: true })
        fs.writeFileSync(path.join(vendorDir, 'get_latest_smd.sh'), '#!/usr/bin/env bash\n')
      }
      return Buffer.from('')
    })

    await repairViewerInstall()

    expect(execFileSync).toHaveBeenCalledWith(
      'git',
      ['clone', '--depth', '1', 'https://github.com/SoMarkAI/SoMarkDownViewer.git', vendorDir],
      { stdio: 'inherit' }
    )
    expect(execFileSync).toHaveBeenCalledWith('bash', [path.join(vendorDir, 'get_latest_smd.sh')], { stdio: 'inherit' })
  })

  it('fails for a non-placeholder non-viewer directory', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-doctor-'))
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir)

    const vendorDir = path.join(tempDir, 'vendor', 'somarkdown-viewer')
    fs.mkdirSync(vendorDir, { recursive: true })
    fs.writeFileSync(path.join(vendorDir, 'random.txt'), 'oops')

    await expect(repairViewerInstall()).rejects.toThrow(/is not a SoMarkDownViewer checkout/)
  })
})
