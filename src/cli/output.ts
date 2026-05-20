import { emitWarnings } from '../warnings.js'

export function printWarning(message: string): void {
  emitWarnings([message])
}

export function printWarnings(warnings: Array<string | undefined>): void {
  emitWarnings(warnings.filter((warning): warning is string => Boolean(warning)))
}
