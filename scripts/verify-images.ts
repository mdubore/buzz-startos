import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import { IMAGE_PINS, UPSTREAM, type ImagePin } from '../startos/image-pins.js'

const ARCHITECTURES = ['amd64', 'arm64'] as const
const MAX_BUFFER_BYTES = 32 * 1024 * 1024
const ATTESTATION_ANNOTATION = 'vnd.docker.reference.type'
const ATTESTATION_TYPE = 'attestation-manifest'

type Architecture = (typeof ARCHITECTURES)[number]
type ImageName = keyof typeof IMAGE_PINS

type RuntimeExpectation = {
  readonly user: string
  readonly entrypoint: readonly string[]
  readonly volumes: readonly string[]
  readonly revision?: string
}

type RuntimeMetadata = {
  readonly user: string
  readonly entrypoint: readonly string[]
  readonly volumes: readonly string[]
  readonly revision?: string
}

type OciDescriptor = {
  readonly digest: string
  readonly os: string
  readonly architecture: string
  readonly attestation: boolean
}

type FormattedInspection = {
  readonly manifestDigest: string
  readonly images: Record<string, unknown>
}

const RUNTIME_EXPECTATIONS = {
  buzz: {
    user: 'buzz:buzz',
    entrypoint: ['/usr/local/bin/buzz-relay'],
    volumes: [],
    revision: UPSTREAM.commit,
  },
  postgres: {
    user: '',
    entrypoint: ['docker-entrypoint.sh'],
    volumes: ['/var/lib/postgresql/data'],
  },
  redis: {
    user: '',
    entrypoint: ['docker-entrypoint.sh'],
    volumes: ['/data'],
  },
  minio: {
    user: '',
    entrypoint: ['/usr/bin/docker-entrypoint.sh'],
    volumes: ['/data'],
  },
  minioClient: {
    user: '',
    entrypoint: ['mc'],
    volumes: [],
  },
} as const satisfies Record<ImageName, RuntimeExpectation>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const formatError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)

  const commandError = error as Error & { stderr?: unknown }
  const stderr = commandError.stderr
  const detail =
    typeof stderr === 'string'
      ? stderr
      : Buffer.isBuffer(stderr)
        ? stderr.toString('utf8')
        : error.message

  return detail.replace(/\s+/g, ' ').trim()
}

const runDocker = (args: readonly string[]): Buffer =>
  execFileSync('docker', [...args], {
    maxBuffer: MAX_BUFFER_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const parseOciIndex = (rawIndex: Buffer): OciDescriptor[] => {
  const parsed: unknown = JSON.parse(rawIndex.toString('utf8'))
  if (!isRecord(parsed) || !Array.isArray(parsed.manifests)) {
    throw new Error('registry response is not an OCI image index')
  }

  return parsed.manifests.map((manifest, position) => {
    if (!isRecord(manifest) || typeof manifest.digest !== 'string') {
      throw new Error(`manifest ${position} has no digest`)
    }
    if (!isRecord(manifest.platform)) {
      throw new Error(`manifest ${position} has no platform`)
    }

    const { architecture, os } = manifest.platform
    if (typeof architecture !== 'string' || typeof os !== 'string') {
      throw new Error(`manifest ${position} has an invalid platform`)
    }

    const annotations = isRecord(manifest.annotations)
      ? manifest.annotations
      : {}

    return {
      digest: manifest.digest,
      os,
      architecture,
      attestation: annotations[ATTESTATION_ANNOTATION] === ATTESTATION_TYPE,
    }
  })
}

const parseFormattedInspection = (rawInspect: Buffer): FormattedInspection => {
  const parsed: unknown = JSON.parse(rawInspect.toString('utf8'))
  if (!isRecord(parsed) || !isRecord(parsed.manifest)) {
    throw new Error('formatted inspection has no manifest')
  }
  if (typeof parsed.manifest.digest !== 'string') {
    throw new Error('formatted inspection manifest has no digest')
  }
  if (!isRecord(parsed.image)) {
    throw new Error('formatted inspection has no platform images')
  }

  return {
    manifestDigest: parsed.manifest.digest,
    images: parsed.image,
  }
}

const readStringArray = (value: unknown, field: string): readonly string[] => {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error(`${field} is not a string array`)
  }
  return value
}

const readVolumes = (value: unknown): readonly string[] => {
  if (value === undefined || value === null) return []
  if (!isRecord(value)) throw new Error('Config.Volumes is not an object')
  return Object.keys(value).sort()
}

const readUser = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw new Error('Config.User is not a string')
  return value
}

const readRuntimeMetadata = (
  name: ImageName,
  platform: string,
  image: unknown,
  errors: string[],
): RuntimeMetadata | undefined => {
  if (!isRecord(image)) {
    errors.push(`${platform} is missing from formatted inspection`)
    return undefined
  }
  const expectedArchitecture = platform.slice('linux/'.length)
  if (image.os !== 'linux' || image.architecture !== expectedArchitecture) {
    errors.push(
      `${platform} config reports ${String(image.os)}/${String(image.architecture)}`,
    )
  }
  if (!isRecord(image.config)) {
    errors.push(`${platform} image has no config object`)
    return undefined
  }

  try {
    const labels =
      image.config.Labels === undefined || image.config.Labels === null
        ? {}
        : image.config.Labels
    if (!isRecord(labels)) throw new Error('Config.Labels is not an object')

    return {
      user: readUser(image.config.User),
      entrypoint: readStringArray(image.config.Entrypoint, 'Config.Entrypoint'),
      volumes: readVolumes(image.config.Volumes),
      ...(name === 'buzz'
        ? {
            revision:
              typeof labels['org.opencontainers.image.revision'] === 'string'
                ? labels['org.opencontainers.image.revision']
                : undefined,
          }
        : {}),
    }
  } catch (error) {
    errors.push(`${platform} config parse failed: ${formatError(error)}`)
    return undefined
  }
}

const inspectRuntimeMetadata = (
  name: ImageName,
  pin: ImagePin,
  errors: string[],
): Map<Architecture, RuntimeMetadata> => {
  let inspection: FormattedInspection
  try {
    inspection = parseFormattedInspection(
      runDocker([
        'buildx',
        'imagetools',
        'inspect',
        pin.tagReference,
        '--format',
        '{{json .}}',
      ]),
    )
  } catch (error) {
    errors.push(`formatted tag inspect failed: ${formatError(error)}`)
    return new Map()
  }

  if (inspection.manifestDigest !== pin.indexDigest) {
    errors.push(
      `formatted tag digest is ${inspection.manifestDigest}, expected ${pin.indexDigest}`,
    )
  }

  const metadata = new Map<Architecture, RuntimeMetadata>()
  for (const architecture of ARCHITECTURES) {
    const platform = `linux/${architecture}`
    const inspected = readRuntimeMetadata(
      name,
      platform,
      inspection.images[platform],
      errors,
    )
    if (inspected) metadata.set(architecture, inspected)
  }
  return metadata
}

const compareStringArrays = (
  actual: readonly string[],
  expected: readonly string[],
): boolean =>
  actual.length === expected.length &&
  actual.every((item, index) => item === expected[index])

const validateRuntimeMetadata = (
  platform: string,
  actual: RuntimeMetadata,
  expected: RuntimeExpectation,
  errors: string[],
): void => {
  if (actual.user !== expected.user) {
    errors.push(
      `${platform} Config.User is ${JSON.stringify(actual.user)}, expected ${JSON.stringify(expected.user)}`,
    )
  }
  if (!compareStringArrays(actual.entrypoint, expected.entrypoint)) {
    errors.push(
      `${platform} Config.Entrypoint is ${JSON.stringify(actual.entrypoint)}, expected ${JSON.stringify(expected.entrypoint)}`,
    )
  }
  if (!compareStringArrays(actual.volumes, expected.volumes)) {
    errors.push(
      `${platform} Config.Volumes is ${JSON.stringify(actual.volumes)}, expected ${JSON.stringify(expected.volumes)}`,
    )
  }
  if (actual.revision !== expected.revision) {
    errors.push(
      `${platform} revision is ${JSON.stringify(actual.revision)}, expected ${JSON.stringify(expected.revision)}`,
    )
  }
}

const verifyImage = (name: ImageName, pin: ImagePin): string[] => {
  const errors: string[] = []

  let rawIndex: Buffer | undefined
  try {
    rawIndex = runDocker([
      'buildx',
      'imagetools',
      'inspect',
      pin.tagReference,
      '--raw',
    ])
  } catch (error) {
    errors.push(`index inspect failed: ${formatError(error)}`)
  }

  if (rawIndex) {
    const actualIndexDigest = `sha256:${createHash('sha256')
      .update(rawIndex)
      .digest('hex')}`
    if (actualIndexDigest !== pin.indexDigest) {
      errors.push(
        `index digest is ${actualIndexDigest}, expected ${pin.indexDigest}`,
      )
    }

    try {
      const descriptors = parseOciIndex(rawIndex)
      for (const architecture of ARCHITECTURES) {
        const matches = descriptors.filter(
          (descriptor) =>
            !descriptor.attestation &&
            descriptor.os === 'linux' &&
            descriptor.architecture === architecture,
        )
        if (matches.length !== 1) {
          errors.push(
            `linux/${architecture} has ${matches.length} non-attestation manifests`,
          )
        } else if (matches[0]?.digest !== pin.platforms[architecture]) {
          errors.push(
            `linux/${architecture} digest is ${matches[0]?.digest}, expected ${pin.platforms[architecture]}`,
          )
        }
      }
    } catch (error) {
      errors.push(`index parse failed: ${formatError(error)}`)
    }
  }

  const metadata = inspectRuntimeMetadata(name, pin, errors)
  for (const architecture of ARCHITECTURES) {
    const platform = `linux/${architecture}`
    const inspected = metadata.get(architecture)
    if (!inspected) continue

    validateRuntimeMetadata(
      platform,
      inspected,
      RUNTIME_EXPECTATIONS[name],
      errors,
    )
  }

  const amd64 = metadata.get('amd64')
  const arm64 = metadata.get('arm64')
  if (amd64 && arm64 && JSON.stringify(amd64) !== JSON.stringify(arm64)) {
    errors.push('runtime metadata differs between linux/amd64 and linux/arm64')
  }

  return errors
}

let hasErrors = false
for (const name of Object.keys(IMAGE_PINS) as ImageName[]) {
  const pin: ImagePin = IMAGE_PINS[name]
  let errors: string[]
  try {
    errors = verifyImage(name, pin)
  } catch (error) {
    errors = [`unexpected verifier failure: ${formatError(error)}`]
  }

  if (errors.length === 0) {
    console.log(`OK ${name} ${pin.indexDigest}`)
    continue
  }

  hasErrors = true
  for (const error of errors) console.error(`ERROR ${name}: ${error}`)
}

if (hasErrors) process.exitCode = 1
