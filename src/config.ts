import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export const DEFAULT_BASE_URL = 'https://somark.tech/api/v1'
export const DEFAULT_TIMEOUT = 60 // seconds
export const DEFAULT_MAX_RETRIES = 2
export const CONFIG_FILE = path.join(os.homedir(), '.somark', 'config.toml')
export const VALID_CONFIG_KEYS = ['api_key', 'base_url', 'timeout', 'max_retries'] as const

type ConfigKey = typeof VALID_CONFIG_KEYS[number]
type ConfigSource = 'explicit' | 'env' | 'file' | 'default'
type FileConfig = Partial<Record<ConfigKey, unknown>>

interface ConfigSchemaEntry {
  key: ConfigKey
  envVar: string
  optionKey: keyof ResolveConfigOptions
  defaultValue: unknown
  parse: (value: unknown) => unknown
  validate: (key: string, value: unknown) => void
  mask: (value: string) => string
  format: (value: unknown) => string
  showWhenUnset: boolean
}

function parseOptionalString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value)
}

function parseString(value: unknown): string {
  return String(value)
}

function parseNumber(value: unknown): number {
  return Number(value)
}

function parseInteger(value: unknown): number {
  return Number.parseInt(String(value), 10)
}

function validateAny(_key: string, _value: unknown): void {
  // No-op validator for keys that only need type parsing today.
}

function validateBaseUrl(key: string, value: unknown): void {
  if (!/^https?:\/\//i.test(String(value))) {
    throw new Error(`Invalid ${key} "${value}". Must start with http:// or https://`)
  }
}

function maskIdentity(value: string): string {
  return value
}

function maskApiKey(value: string): string {
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '***'
}

function formatValue(value: unknown): string {
  return String(value)
}

const CONFIG_SCHEMA = [
  {
    key: 'api_key',
    envVar: 'SOMARK_API_KEY',
    optionKey: 'apiKey',
    defaultValue: undefined,
    parse: parseOptionalString,
    validate: validateAny,
    mask: maskApiKey,
    format: formatValue,
    showWhenUnset: false,
  },
  {
    key: 'base_url',
    envVar: 'SOMARK_BASE_URL',
    optionKey: 'baseUrl',
    defaultValue: DEFAULT_BASE_URL,
    parse: parseString,
    validate: validateBaseUrl,
    mask: maskIdentity,
    format: formatValue,
    showWhenUnset: true,
  },
  {
    key: 'timeout',
    envVar: 'SOMARK_TIMEOUT',
    optionKey: 'timeout',
    defaultValue: DEFAULT_TIMEOUT,
    parse: parseNumber,
    validate: validateAny,
    mask: maskIdentity,
    format: formatValue,
    showWhenUnset: true,
  },
  {
    key: 'max_retries',
    envVar: 'SOMARK_MAX_RETRIES',
    optionKey: 'maxRetries',
    defaultValue: DEFAULT_MAX_RETRIES,
    parse: parseInteger,
    validate: validateAny,
    mask: maskIdentity,
    format: formatValue,
    showWhenUnset: true,
  },
] satisfies readonly ConfigSchemaEntry[]

const CONFIG_SCHEMA_BY_KEY = new Map<ConfigKey, ConfigSchemaEntry>(
  CONFIG_SCHEMA.map((entry) => [entry.key, entry])
)

function stripTomlComment(line: string): string {
  let quote: '"' | "'" | undefined
  let escaping = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quote === '"') {
      if (escaping) {
        escaping = false
      } else if (char === '\\') {
        escaping = true
      } else if (char === quote) {
        quote = undefined
      }
    } else if (quote === "'") {
      if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '#') {
      return line.slice(0, i)
    }
  }
  return line
}

function parseTomlValue(rawValue: string): unknown {
  const value = stripTomlComment(rawValue).trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value)
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1)
  }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) {
    return Number(value)
  }
  return value
}

function loadTomlConfig(): FileConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {}
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const result: FileConfig = {}
    for (const line of content.split('\n')) {
      const trimmed = stripTomlComment(line).trim()
      if (!trimmed || trimmed.startsWith('[')) continue
      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) continue

      const key = trimmed.slice(0, separatorIndex).trim()
      if (!VALID_CONFIG_KEYS.includes(key as ConfigKey)) continue

      result[key as ConfigKey] = parseTomlValue(trimmed.slice(separatorIndex + 1))
    }
    return result
  } catch {
    return {}
  }
}

export interface ResolvedConfig {
  apiKey: string | undefined
  baseUrl: string
  timeout: number
  maxRetries: number
}

export interface ResolveConfigOptions {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
}

function hasFileValue(file: FileConfig, key: ConfigKey): boolean {
  const value = file[key]
  return value !== undefined && value !== null && value !== ''
}

function resolveSchemaEntry(
  entry: ConfigSchemaEntry,
  opts: ResolveConfigOptions,
  file: FileConfig
): { value: unknown, source: ConfigSource } {
  let rawValue: unknown
  let source: ConfigSource

  if (opts[entry.optionKey] !== undefined) {
    rawValue = opts[entry.optionKey]
    source = 'explicit'
  } else if (process.env[entry.envVar]) {
    rawValue = process.env[entry.envVar]
    source = 'env'
  } else if (hasFileValue(file, entry.key)) {
    rawValue = file[entry.key]
    source = 'file'
  } else {
    rawValue = entry.defaultValue
    source = 'default'
  }

  const value = entry.parse(rawValue)
  entry.validate(entry.key, value)
  return { value, source }
}

function resolveSchema(opts: ResolveConfigOptions = {}): Record<ConfigKey, { value: unknown, source: ConfigSource }> {
  const file = loadTomlConfig()
  return Object.fromEntries(
    CONFIG_SCHEMA.map((entry) => [entry.key, resolveSchemaEntry(entry, opts, file)])
  ) as Record<ConfigKey, { value: unknown, source: ConfigSource }>
}

export function resolveConfig(opts: ResolveConfigOptions = {}): ResolvedConfig {
  const resolved = resolveSchema(opts)
  return {
    apiKey: resolved.api_key.value as string | undefined,
    baseUrl: resolved.base_url.value as string,
    timeout: resolved.timeout.value as number,
    maxRetries: resolved.max_retries.value as number,
  }
}

export function saveConfig(values: Record<string, string>): void {
  for (const key of Object.keys(values)) {
    const entry = CONFIG_SCHEMA_BY_KEY.get(key as ConfigKey)
    if (!entry) {
      throw new Error(`Unknown config key "${key}". Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`)
    }
    const parsedValue = entry.parse(values[key])
    entry.validate(key, parsedValue)
  }
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const existing = loadTomlConfig()
  const merged = { ...existing, ...values }
  const lines = Object.entries(merged).map(([k, v]) => `${k} = "${v}"`)
  fs.writeFileSync(CONFIG_FILE, lines.join('\n') + '\n', 'utf-8')
  try {
    fs.chmodSync(CONFIG_FILE, 0o600)
  } catch {
    // Best effort on platforms/filesystems that do not support POSIX modes.
  }
}

export function getConfigValue(key: string): string | undefined {
  const value = loadTomlConfig()[key as ConfigKey]
  return value === undefined ? undefined : String(value)
}

export function maskConfigValue(key: string, value: string): string {
  return CONFIG_SCHEMA_BY_KEY.get(key as ConfigKey)?.mask(value) ?? value
}

export function listConfig(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(loadTomlConfig()).map(([key, value]) => [key, String(value)])
  )
}

export type ResolvedConfigSource = Exclude<ConfigSource, 'explicit'>

export interface ResolvedConfigEntry {
  value: string
  source: ResolvedConfigSource
}

export function listResolvedConfig(): Record<string, ResolvedConfigEntry> {
  const result: Record<string, ResolvedConfigEntry> = {}
  const resolved = resolveSchema()

  for (const entry of CONFIG_SCHEMA) {
    const { value, source } = resolved[entry.key]
    if (value === undefined && !entry.showWhenUnset) continue
    result[entry.key] = { value: entry.format(value), source: source as ResolvedConfigSource }
  }

  return result
}
