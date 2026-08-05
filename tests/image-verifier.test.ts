import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import type { ImagePin } from '../startos/image-pins.js'
import {
  DOCKER_TIMEOUT_MS,
  formatError,
  verifyImage,
  verifyImages,
  type CommandOptions,
  type CommandRunner,
} from '../scripts/image-verifier.js'

const AMD64_DIGEST =
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ARM64_DIGEST =
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const MOVED_INDEX_DIGEST =
  'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

type FixtureName = 'minio' | 'minioClient' | 'postgres' | 'redis'

type Fixture = {
  readonly pin: ImagePin
  readonly rawIndex: Buffer
  readonly formattedInspection: Buffer
}

type Descriptor = {
  readonly digest: string
  readonly platform: {
    readonly os: string
    readonly architecture: string
  }
  readonly annotations?: Readonly<Record<string, string>>
}

const digestOf = (value: Buffer): ImagePin['indexDigest'] =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

const runtimeDescriptor = (
  architecture: 'amd64' | 'arm64',
  digest: string,
): Descriptor => ({
  digest,
  platform: { os: 'linux', architecture },
})

const attestationDescriptor = (
  architecture: 'amd64' | 'arm64',
  digest: string,
): Descriptor => ({
  digest,
  platform: { os: 'linux', architecture },
  annotations: {
    'vnd.docker.reference.type': 'attestation-manifest',
  },
})

const defaultDescriptors = (): Descriptor[] => [
  attestationDescriptor(
    'amd64',
    'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  ),
  runtimeDescriptor('amd64', AMD64_DIGEST),
  attestationDescriptor(
    'arm64',
    'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  ),
  runtimeDescriptor('arm64', ARM64_DIGEST),
]

const configFor = (name: FixtureName): Record<string, unknown> => ({
  User: null,
  Entrypoint:
    name === 'minio'
      ? ['/usr/local/bin/minio']
      : name === 'minioClient'
        ? ['/usr/local/bin/mc']
        : ['docker-entrypoint.sh'],
  Volumes:
    name === 'postgres'
      ? { '/var/lib/postgresql/data': {} }
      : name === 'minioClient'
        ? null
        : { '/data': {} },
})

const platformImages = (
  name: FixtureName,
): Record<string, Record<string, unknown>> => ({
  'linux/amd64': {
    os: 'linux',
    architecture: 'amd64',
    config: configFor(name),
  },
  'linux/arm64': {
    os: 'linux',
    architecture: 'arm64',
    config: configFor(name),
  },
})

const makeFixture = (
  name: FixtureName = 'postgres',
  options: {
    readonly descriptors?: readonly Descriptor[]
    readonly formattedDigest?: string
    readonly images?: Readonly<Record<string, unknown>>
  } = {},
): Fixture => {
  const rawIndex = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      manifests: options.descriptors ?? defaultDescriptors(),
    }),
  )
  const indexDigest = digestOf(rawIndex)
  const pin: ImagePin = {
    tagReference: `registry.example/${name}:fixture`,
    indexDigest,
    platforms: {
      amd64: AMD64_DIGEST,
      arm64: ARM64_DIGEST,
    },
  }

  return {
    pin,
    rawIndex,
    formattedInspection: Buffer.from(
      JSON.stringify({
        manifest: {
          digest: options.formattedDigest ?? indexDigest,
        },
        image: options.images ?? platformImages(name),
      }),
    ),
  }
}

const fixtureRunner = (
  fixtures: readonly Fixture[],
  calls: Array<{
    readonly file: string
    readonly args: readonly string[]
    readonly options: CommandOptions
  }> = [],
): CommandRunner => {
  const byTag = new Map(
    fixtures.map((fixture) => [fixture.pin.tagReference, fixture]),
  )

  return (file, args, options) => {
    calls.push({ file, args, options })
    const fixture = byTag.get(args[3] ?? '')
    if (!fixture) throw new Error(`unexpected tag ${String(args[3])}`)
    if (args.includes('--raw')) return fixture.rawIndex
    if (args.includes('--format')) return fixture.formattedInspection
    throw new Error(`unexpected arguments ${JSON.stringify(args)}`)
  }
}

test('accepts one runtime manifest per platform while ignoring attestations', () => {
  const fixture = makeFixture()

  assert.deepEqual(
    verifyImage('postgres', fixture.pin, fixtureRunner([fixture])),
    [],
  )
})

test('accepts the rebuilt MinIO static-binary entrypoint contracts', () => {
  const minio = makeFixture('minio')
  const minioClient = makeFixture('minioClient')
  const runner = fixtureRunner([minio, minioClient])

  assert.deepEqual(verifyImage('minio', minio.pin, runner), [])
  assert.deepEqual(verifyImage('minioClient', minioClient.pin, runner), [])
})

test('reports an exact-byte index digest mismatch', () => {
  const fixture = makeFixture()
  const movedRawIndex = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      moved: true,
      manifests: defaultDescriptors(),
    }),
  )
  const movedFixture = { ...fixture, rawIndex: movedRawIndex }

  const errors = verifyImage(
    'postgres',
    fixture.pin,
    fixtureRunner([movedFixture]),
  )

  assert.ok(
    errors.includes(
      `index digest is ${digestOf(movedRawIndex)}, expected ${fixture.pin.indexDigest}`,
    ),
  )
})

test('reports duplicate and missing target platform manifests', () => {
  const fixture = makeFixture('postgres', {
    descriptors: [
      attestationDescriptor(
        'amd64',
        'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ),
      runtimeDescriptor('amd64', AMD64_DIGEST),
      runtimeDescriptor(
        'amd64',
        'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      ),
      attestationDescriptor(
        'arm64',
        'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      ),
    ],
  })

  const errors = verifyImage('postgres', fixture.pin, fixtureRunner([fixture]))

  assert.ok(errors.includes('linux/amd64 has 2 non-attestation manifests'))
  assert.ok(errors.includes('linux/arm64 has 0 non-attestation manifests'))
})

test('rejects a human-readable tag that moved after raw inspection', () => {
  const fixture = makeFixture('postgres', {
    formattedDigest: MOVED_INDEX_DIGEST,
  })

  const errors = verifyImage('postgres', fixture.pin, fixtureRunner([fixture]))

  assert.ok(
    errors.includes(
      `formatted tag digest is ${MOVED_INDEX_DIGEST}, expected ${fixture.pin.indexDigest}`,
    ),
  )
})

test('collects malformed formatted inspection and config errors', async (t) => {
  await t.test('malformed formatted JSON', () => {
    const fixture = makeFixture()
    const malformed = {
      ...fixture,
      formattedInspection: Buffer.from('{'),
    }

    const errors = verifyImage(
      'postgres',
      fixture.pin,
      fixtureRunner([malformed]),
    )

    assert.ok(
      errors.some((error) => error.startsWith('formatted tag inspect failed:')),
    )
  })

  await t.test('malformed platform config', () => {
    const images = platformImages('postgres')
    images['linux/arm64'] = {
      os: 'linux',
      architecture: 'arm64',
      config: {
        ...configFor('postgres'),
        Entrypoint: 'docker-entrypoint.sh',
      },
    }
    const fixture = makeFixture('postgres', { images })

    const errors = verifyImage(
      'postgres',
      fixture.pin,
      fixtureRunner([fixture]),
    )

    assert.ok(
      errors.includes(
        'linux/arm64 config parse failed: Config.Entrypoint is not a string array',
      ),
    )
  })
})

test('reports cross-architecture runtime metadata drift', () => {
  const images = platformImages('postgres')
  images['linux/arm64'] = {
    os: 'linux',
    architecture: 'arm64',
    config: {
      ...configFor('postgres'),
      User: 'nobody',
    },
  }
  const fixture = makeFixture('postgres', { images })

  const errors = verifyImage('postgres', fixture.pin, fixtureRunner([fixture]))

  assert.ok(errors.includes('linux/arm64 Config.User is "nobody", expected ""'))
  assert.ok(
    errors.includes(
      'runtime metadata differs between linux/amd64 and linux/arm64',
    ),
  )
})

test('aggregates failures and still verifies later images', () => {
  const moved = makeFixture('redis', {
    formattedDigest: MOVED_INDEX_DIGEST,
  })
  const valid = makeFixture('postgres')
  const calls: Array<{
    readonly file: string
    readonly args: readonly string[]
    readonly options: CommandOptions
  }> = []

  const report = verifyImages(
    {
      redis: moved.pin,
      postgres: valid.pin,
    },
    fixtureRunner([moved, valid], calls),
  )

  assert.equal(report.exitCode, 1)
  assert.deepEqual(report.stdout, [`OK postgres ${valid.pin.indexDigest}`])
  assert.ok(
    report.stderr.includes(
      `ERROR redis: formatted tag digest is ${MOVED_INDEX_DIGEST}, expected ${moved.pin.indexDigest}`,
    ),
  )
  assert.deepEqual(
    calls.map((call) => call.args[3]),
    [
      moved.pin.tagReference,
      moved.pin.tagReference,
      valid.pin.tagReference,
      valid.pin.tagReference,
    ],
  )
})

test('falls back to the error message when stderr is blank', () => {
  const error = Object.assign(new Error('fallback reason'), {
    stderr: Buffer.from(' \n\t'),
  })

  assert.equal(formatError(error), 'fallback reason')
})

test('sets a finite timeout on every command and reports timeouts clearly', () => {
  const fixture = makeFixture()
  const calls: Array<{
    readonly file: string
    readonly args: readonly string[]
    readonly options: CommandOptions
  }> = []

  verifyImage('postgres', fixture.pin, fixtureRunner([fixture], calls))

  assert.equal(calls.length, 2)
  assert.ok(Number.isFinite(DOCKER_TIMEOUT_MS))
  assert.ok(DOCKER_TIMEOUT_MS > 0)
  assert.deepEqual(
    calls.map((call) => call.options.timeout),
    [DOCKER_TIMEOUT_MS, DOCKER_TIMEOUT_MS],
  )

  const timeout = Object.assign(new Error('spawnSync docker ETIMEDOUT'), {
    code: 'ETIMEDOUT',
    stderr: Buffer.alloc(0),
  })
  const errors = verifyImage('postgres', fixture.pin, () => {
    throw timeout
  })

  assert.deepEqual(errors, [
    `index inspect failed: command timed out after ${DOCKER_TIMEOUT_MS} ms`,
    `formatted tag inspect failed: command timed out after ${DOCKER_TIMEOUT_MS} ms`,
  ])
})
