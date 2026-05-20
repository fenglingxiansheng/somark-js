export function examples(...commands: string[]): string {
  return `\nExamples:\n${commands.map(command => `  ${command}`).join('\n')}`
}
