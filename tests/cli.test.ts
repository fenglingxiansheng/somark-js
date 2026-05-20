import { describe, it, expect, vi } from 'vitest'
import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('CLI structure', () => {
  it('parse help exposes only xxx-fmt element format flags', async () => {
    const { registerParseCommand } = await import('../src/cli/commands/parse')
    const program = new Command()
    program.exitOverride()
    registerParseCommand(program)

    const parseCommand = program.commands.find((command) => command.name() === 'parse')
    expect(parseCommand).toBeDefined()

    const help = parseCommand!.helpInformation()
    expect(help).toContain('[files...]')
    expect(help).toContain('--file-list')
    expect(help).toContain('md,markdown,json,zip')
    expect(help).not.toContain('smd')
    expect(help).toContain('--image-fmt')
    expect(help).toContain('--formula-fmt')
    expect(help).toContain('--table-fmt')
    expect(help).toContain('--cs-fmt')
    expect(help).not.toContain('--image <')
    expect(help).not.toContain('--formula <')
    expect(help).not.toContain('--cs <')
  })

  it('emits warnings through process.emitWarning and dedupes', async () => {
    const { printWarnings } = await import('../src/cli/output')
    const { setWarningsSuppressed } = await import('../src/warnings')
    setWarningsSuppressed(false)
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      printWarnings(['same warning', 'same warning', 'other warning'])
      expect(spy).toHaveBeenCalledTimes(2)
      expect(spy.mock.calls[0][0]).toContain('same warning')
      expect(spy.mock.calls[1][0]).toContain('other warning')
    } finally {
      spy.mockRestore()
      setWarningsSuppressed(false)
    }
  })

  it('suppresses warnings when requested', async () => {
    const { printWarnings } = await import('../src/cli/output')
    const { setWarningsSuppressed } = await import('../src/warnings')
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      setWarningsSuppressed(true)
      printWarnings(['hidden warning'])
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      setWarningsSuppressed(false)
    }
  })

  it('resolves parse output targets predictably', async () => {
    const { resolveOutputPaths, validateBatchOutput } = await import('../src/cli/commands/parse')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-cli-out-'))
    try {
      const input = path.join(dir, 'input.png')
      fs.writeFileSync(input, 'png')
      const fileOut = path.join(dir, 'result.md')

      expect(resolveOutputPaths(input, undefined, ['md'], true)).toEqual([])
      expect(() => resolveOutputPaths(input, undefined, ['md', 'json'], true)).toThrow(/multiple formats require --out/)
      expect(resolveOutputPaths(input, dir, ['md', 'json'], true)).toEqual([
        path.join(dir, 'input.md'),
        path.join(dir, 'input.json'),
      ])
      expect(resolveOutputPaths(input, fileOut, ['md'], true)).toEqual([fileOut])
      expect(() => resolveOutputPaths(input, fileOut, ['md', 'json'], true)).toThrow(/multiple formats require --out/)
      expect(() => resolveOutputPaths(input, path.join(dir, 'missing') + path.sep, ['md'], true)).toThrow(/output directory does not exist/)
      expect(() => resolveOutputPaths(input, path.join(dir, 'missing', 'result.md'), ['md'], true)).toThrow(/output parent directory does not exist/)
      expect(() => validateBatchOutput(undefined)).toThrow(/batch parse requires --out/)
      expect(() => validateBatchOutput(path.join(dir, 'missing'))).toThrow(/batch parse requires --out/)
      expect(() => validateBatchOutput(dir)).not.toThrow()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('config commands mask api keys unless --show is provided and write private config files', async () => {
    vi.resetModules()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-config-'))
    vi.doMock('os', () => ({ homedir: () => tempDir }))

    const { registerConfigCommand } = await import('../src/cli/commands/config')
    const logs: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      logs.push(String(message))
    })

    const run = async (args: string[]) => {
      const program = new Command()
      program.exitOverride()
      registerConfigCommand(program)
      await program.parseAsync(['node', 'test', ...args])
    }

    try {
      await run(['config', 'set', 'api_key', 'sk-test'])
      await run(['config', 'get', 'api_key'])
      expect(logs.join('\n')).not.toContain('sk-test')
      expect(logs.join('\n')).toContain('api_key = ***')

      logs.length = 0
      await run(['config', 'get', 'api_key', '--show'])
      expect(logs.join('\n')).toContain('sk-test')

      logs.length = 0
      await run(['config', 'list'])
      expect(logs.join('\n')).not.toContain('sk-test')
      expect(logs.join('\n')).toContain('api_key = ***')

      logs.length = 0
      await run(['config', 'list', '--show'])
      expect(logs.join('\n')).toContain('sk-test')

      const configFile = path.join(tempDir, '.somark', 'config.toml')
      expect((fs.statSync(configFile).mode & 0o777)).toBe(0o600)
    } finally {
      logSpy.mockRestore()
      vi.doUnmock('os')
      vi.resetModules()
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
