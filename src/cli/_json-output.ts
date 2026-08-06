import { writeFileSync } from 'node:fs'
import { findOption } from './_args.js'

export function writeJsonOutput (args: string[], optionName: string, payload: unknown): void {
  const json = JSON.stringify(payload)
  const outputPath = findOption(args, optionName)
  if (outputPath) {
    writeFileSync(outputPath, `${json}\n`, 'utf8')
    return
  }

  console.log(json)
}
