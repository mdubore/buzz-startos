import { pathToFileURL } from 'node:url'

import {
  validateEvidenceFile,
  validateRepository,
} from './device-evidence-validator.js'

const root = new URL('../', import.meta.url)
const schemaPath = new URL('docs/testing/DEVICE_EVIDENCE.schema.json', root)

async function main(): Promise<void> {
  const recordIndex = process.argv.indexOf('--record')
  const recordPath = process.argv[recordIndex + 1]
  if (recordIndex !== -1 && recordPath === undefined) {
    throw new Error('--record requires a JSON file path')
  }

  const result =
    recordIndex === -1
      ? await validateRepository({
          catalogPath: new URL('docs/testing/DEVICE_GATES.json', root),
          examplePath: new URL(
            'docs/testing/device-evidence.example.json',
            root,
          ),
          matrixPath: new URL('docs/testing/DEVICE_TEST_MATRIX.md', root),
          schemaPath,
        })
      : await validateEvidenceFile(pathToFileURL(recordPath), schemaPath)

  if (!result.valid) {
    for (const error of result.errors) console.error(error)
    process.exitCode = 1
    return
  }

  const cells = 'matrixCells' in result ? ` (${result.matrixCells} cells)` : ''
  console.log(`Device evidence structure is valid${cells}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
