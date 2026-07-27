import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { IMAGE_PINS } from '../startos/image-pins.js'

const ARCHITECTURES = ['amd64', 'arm64'] as const

export type RuntimeImageTarget = {
  readonly id: string
  readonly name: keyof typeof IMAGE_PINS
  readonly architecture: (typeof ARCHITECTURES)[number]
  readonly digest: `sha256:${string}`
  readonly reference: string
}

const repositoryFromTag = (tagReference: string): string => {
  const repository = tagReference.replace(/:[^/]+$/, '')
  if (repository === tagReference) {
    throw new Error(
      `image reference has no immutable source tag: ${tagReference}`,
    )
  }
  return repository
}

export const runtimeImageTargets = (): RuntimeImageTarget[] =>
  Object.entries(IMAGE_PINS).flatMap(([name, pin]) => {
    const repository = repositoryFromTag(pin.tagReference)
    return ARCHITECTURES.map((architecture) => {
      const digest = pin.platforms[architecture]
      return {
        id: `${name}-${architecture}`,
        name: name as keyof typeof IMAGE_PINS,
        architecture,
        digest,
        reference: `${repository}@${digest}`,
      }
    })
  })

const main = () => {
  const format = process.argv[2] ?? '--tsv'
  const targets = runtimeImageTargets()
  if (format === '--json') {
    process.stdout.write(`${JSON.stringify(targets, null, 2)}\n`)
    return
  }
  if (format !== '--tsv') {
    throw new Error('usage: runtime-image-targets.ts [--tsv|--json]')
  }
  for (const target of targets) {
    console.log(
      [
        target.id,
        target.name,
        target.architecture,
        target.digest,
        target.reference,
      ].join('\t'),
    )
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
