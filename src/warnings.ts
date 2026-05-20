let warningsSuppressed = false

export type SoMarkWarning = string

function dedupe(messages: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const message of messages) {
    if (seen.has(message)) continue
    seen.add(message)
    result.push(message)
  }
  return result
}

export function setWarningsSuppressed(suppressed: boolean): void {
  warningsSuppressed = suppressed
}

export function collectApiWarnings(data: Record<string, unknown>): string[] {
  const raw = data.warnings
  if (!Array.isArray(raw)) return []
  return dedupe(raw.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))
}

export function emitWarnings(warnings: string[]): void {
  if (warningsSuppressed) return
  for (const warning of dedupe(warnings)) {
    process.emitWarning(warning, { type: 'SoMarkWarning' })
  }
}

export function parseMaxConcurrency(raw: string | undefined): { value: number; warnings: string[] } {
  const value = raw?.trim() ?? ''
  if (!value) return { value: 1, warnings: [] }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return {
      value: 1,
      warnings: [`Invalid SOMARK_PARSE_MAX_CONCURRENCY="${value}"; using 1.`],
    }
  }
  if (parsed >= 2) {
    return {
      value: parsed,
      warnings: [
        `SOMARK_PARSE_MAX_CONCURRENCY is set to ${parsed}. ` +
        'The official default quota is 1 for everyone; only users explicitly approved for higher concurrency should use 2 or above.',
      ],
    }
  }
  return { value: parsed, warnings: [] }
}
