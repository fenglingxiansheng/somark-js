import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { resolveConfig, DEFAULT_BASE_URL, DEFAULT_TIMEOUT, DEFAULT_MAX_RETRIES, maskConfigValue, listResolvedConfig } from '../src/config'

describe('resolveConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses provided options as highest priority', () => {
    const cfg = resolveConfig({ apiKey: 'sk-test', baseUrl: 'https://custom', timeout: 30, maxRetries: 1 })
    expect(cfg.apiKey).toBe('sk-test')
    expect(cfg.baseUrl).toBe('https://custom')
    expect(cfg.timeout).toBe(30)
    expect(cfg.maxRetries).toBe(1)
  })

  it('falls back to env vars', () => {
    vi.stubEnv('SOMARK_API_KEY', 'sk-env')
    vi.stubEnv('SOMARK_BASE_URL', 'https://env-url')
    const cfg = resolveConfig()
    expect(cfg.apiKey).toBe('sk-env')
    expect(cfg.baseUrl).toBe('https://env-url')
  })

  it('uses defaults when nothing set', () => {
    vi.stubEnv('SOMARK_API_KEY', '')
    const cfg = resolveConfig()
    expect(cfg.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(cfg.timeout).toBe(DEFAULT_TIMEOUT)
    expect(cfg.maxRetries).toBe(DEFAULT_MAX_RETRIES)
  })

  it('param overrides env', () => {
    vi.stubEnv('SOMARK_API_KEY', 'sk-env')
    const cfg = resolveConfig({ apiKey: 'sk-param' })
    expect(cfg.apiKey).toBe('sk-param')
  })

  it('uses the schema resolver for resolved config listing', () => {
    vi.stubEnv('SOMARK_BASE_URL', 'https://env-url')
    vi.stubEnv('SOMARK_TIMEOUT', '45')
    const cfg = listResolvedConfig()
    expect(cfg.base_url).toEqual({ value: 'https://env-url', source: 'env' })
    expect(cfg.timeout).toEqual({ value: '45', source: 'env' })
    expect(cfg.max_retries).toEqual({ value: String(DEFAULT_MAX_RETRIES), source: 'default' })
  })

  it('validates env base_url through the schema resolver', () => {
    vi.stubEnv('SOMARK_BASE_URL', 'not-a-url')
    expect(() => resolveConfig()).toThrow('Invalid base_url "not-a-url"')
  })

  it('reads TOML values without treating quoted # characters as comments', async () => {
    vi.resetModules()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'somark-js-config-'))
    vi.doMock('os', () => ({ homedir: () => tempDir }))

    try {
      const configDir = path.join(tempDir, '.somark')
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(
        path.join(configDir, 'config.toml'),
        'api_key = "sk#file" # inline comment\nbase_url = "https://file-url"\ntimeout = 30\n',
        'utf-8'
      )

      const { resolveConfig: resolveFreshConfig, getConfigValue } = await import('../src/config')
      expect(getConfigValue('api_key')).toBe('sk#file')
      expect(resolveFreshConfig()).toMatchObject({
        apiKey: 'sk#file',
        baseUrl: 'https://file-url',
        timeout: 30,
      })
    } finally {
      vi.doUnmock('os')
      vi.resetModules()
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('masks api keys for display', () => {
    expect(maskConfigValue('api_key', 'sk-1234567890')).toBe('sk-1...7890')
    expect(maskConfigValue('api_key', 'sk-test')).toBe('***')
    expect(maskConfigValue('base_url', 'https://somark.tech')).toBe('https://somark.tech')
  })
})
