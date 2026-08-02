import assert from 'node:assert/strict'
import test from 'node:test'

import {
  projectForRuntime,
  validateStoredState,
  type CompleteStore,
  type RuntimeStateValidation,
  type StateValidation,
} from '../startos/domain/state-validation.js'
import {
  buildConnectionUrl,
  buildRuntimeConfig,
} from '../startos/runtime/config.js'

const COMPLETE_STORE: CompleteStore = {
  schemaVersion: 1,
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
  ownerPubkeyHex: '11'.repeat(32),
  primaryUrl: 'https://buzz.example',
  pairingRelayUrl: 'wss://pair.buzz.example',
  lastMembershipMutationUnixSecond: 42,
}

const REQUIRED_FIELDS = [
  'schemaVersion',
  'postgresPassword',
  'redisPassword',
  's3AccessKey',
  's3SecretKey',
  'relayPrivateKeyHex',
  'gitHookHmacSecretHex',
  'ownerPubkeyHex',
  'primaryUrl',
  'pairingRelayUrl',
] as const

function validatedReady(): Extract<StateValidation, { kind: 'ready' }> {
  const validation = validateStoredState({
    kind: 'parsed',
    value: { ...COMPLETE_STORE },
  })

  assert.equal(validation.kind, 'ready')
  if (validation.kind !== 'ready') {
    throw new Error('Test fixture must produce validated ready state')
  }
  return validation
}

const EXPECTED_CONFIG = {
  postgresEnv: {
    POSTGRES_DB: 'buzz',
    POSTGRES_USER: 'buzz',
    POSTGRES_PASSWORD: COMPLETE_STORE.postgresPassword,
    POSTGRES_INITDB_ARGS: '--auth-host=scram-sha-256',
    PGDATA: '/var/lib/postgresql/data',
  },
  redisEnv: {
    REDIS_PASSWORD: COMPLETE_STORE.redisPassword,
  },
  minioEnv: {
    MINIO_ROOT_USER: COMPLETE_STORE.s3AccessKey,
    MINIO_ROOT_PASSWORD: COMPLETE_STORE.s3SecretKey,
  },
  buzzEnv: {
    BUZZ_BIND_ADDR: '0.0.0.0:3000',
    BUZZ_HEALTH_PORT: '8080',
    BUZZ_METRICS_PORT: '9102',
    BUZZ_PAIRING_RELAY_URL: 'wss://pair.buzz.example',
    DATABASE_URL: `postgres://buzz:${COMPLETE_STORE.postgresPassword}@127.0.0.1:5432/buzz`,
    REDIS_URL: `redis://:${COMPLETE_STORE.redisPassword}@127.0.0.1:6379`,
    RELAY_URL: 'wss://buzz.example',
    BUZZ_MEDIA_BASE_URL: 'https://buzz.example/media',
    BUZZ_CORS_ORIGINS: 'https://buzz.example',
    BUZZ_S3_ENDPOINT: 'http://127.0.0.1:9000',
    BUZZ_S3_ACCESS_KEY: COMPLETE_STORE.s3AccessKey,
    BUZZ_S3_SECRET_KEY: COMPLETE_STORE.s3SecretKey,
    BUZZ_S3_BUCKET: 'buzz-media',
    BUZZ_S3_REGION: 'us-east-1',
    BUZZ_S3_ADDRESSING_STYLE: 'path',
    BUZZ_S3_FORCE_PATH_STYLE: 'true',
    BUZZ_DB_POOL_SIZE: '50',
    BUZZ_REPLICA_READ_MAX_AGE_MS: '0',
    BUZZ_GIT_REPO_PATH: '/data/git',
    BUZZ_AUTO_MIGRATE: 'false',
    BUZZ_GIT_CONFORMANCE_PROBE: 'true',
    BUZZ_REQUIRE_AUTH_TOKEN: 'true',
    BUZZ_REQUIRE_RELAY_MEMBERSHIP: 'true',
    BUZZ_ALLOW_NIP_OA_AUTH: 'true',
    BUZZ_REQUIRE_MEDIA_GET_AUTH: 'false',
    BUZZ_SERVE_GIT_WEB_GUI: 'true',
    BUZZ_PUSH_GATEWAY_DELIVERY_URL: '',
    BUZZ_MESH: 'off',
    BUZZ_MESH_DEMO_ECHO: 'off',
    BUZZ_HUDDLE_AUDIO_AVAILABLE: 'true',
    RELAY_OWNER_PUBKEY: COMPLETE_STORE.ownerPubkeyHex,
    BUZZ_RELAY_PRIVATE_KEY: COMPLETE_STORE.relayPrivateKeyHex,
    BUZZ_GIT_HOOK_HMAC_SECRET: COMPLETE_STORE.gitHookHmacSecretHex,
    RUST_LOG:
      'buzz_relay=info,buzz_db=info,buzz_auth=info,buzz_pubsub=info,tower_http=info',
  },
}

test('builds exact least-privilege environments from full ready state', () => {
  assert.deepEqual(buildRuntimeConfig(validatedReady()), EXPECTED_CONFIG)
})

test('builds the same environments from runtime-projected ready state', () => {
  const projected = projectForRuntime(validatedReady())

  assert.equal(projected.kind, 'ready')
  assert.deepEqual(buildRuntimeConfig(projected), EXPECTED_CONFIG)
})

test('sidecars receive only their own secrets', () => {
  const { postgresEnv, redisEnv, minioEnv } =
    buildRuntimeConfig(validatedReady())

  assert.deepEqual(Object.keys(postgresEnv), [
    'POSTGRES_DB',
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_INITDB_ARGS',
    'PGDATA',
  ])
  assert.deepEqual(Object.keys(redisEnv), ['REDIS_PASSWORD'])
  assert.deepEqual(Object.keys(minioEnv), [
    'MINIO_ROOT_USER',
    'MINIO_ROOT_PASSWORD',
  ])

  assert.equal(
    Object.values(postgresEnv).includes(COMPLETE_STORE.redisPassword),
    false,
  )
  assert.equal(
    Object.values(redisEnv).includes(COMPLETE_STORE.postgresPassword),
    false,
  )
  assert.equal(
    Object.values(minioEnv).includes(COMPLETE_STORE.postgresPassword),
    false,
  )
  assert.equal(
    Object.values(minioEnv).includes(COMPLETE_STORE.redisPassword),
    false,
  )
})

test('omits stale and intentionally disabled environment variables', () => {
  const { buzzEnv } = buildRuntimeConfig(validatedReady())

  for (const name of [
    'BUZZ_RELAY_URL',
    'BUZZ_MEDIA_SERVER_DOMAIN',
    'BUZZ_ADMIN_HOST',
    'TYPESENSE_API_KEY',
    'READ_DATABASE_URL',
    'BUZZ_DB_READ_POOL_SIZE',
    'BUZZ_REPLICA_HEAD_MAX_AGE_SECS',
  ]) {
    assert.equal(Object.hasOwn(buzzEnv, name), false)
  }
})

test('percent-encodes reserved characters in connection credentials', () => {
  assert.equal(
    buildConnectionUrl({
      protocol: 'postgres',
      username: 'buzz',
      password: 'p@:/%',
      authority: '127.0.0.1:5432',
      pathname: '/buzz',
    }),
    'postgres://buzz:p%40%3A%2F%25@127.0.0.1:5432/buzz',
  )
  assert.equal(
    buildConnectionUrl({
      protocol: 'http',
      username: 'access@:/%',
      password: 'secret@:/%',
      authority: '127.0.0.1:9000',
    }),
    'http://access%40%3A%2F%25:secret%40%3A%2F%25@127.0.0.1:9000',
  )
})

test('rejects every missing required ready-state field without values', () => {
  for (const field of REQUIRED_FIELDS) {
    const ready = validatedReady()
    const state = { ...ready.state } as Record<string, unknown>
    const sensitiveValue = String(state[field])
    delete state[field]

    assert.throws(
      () =>
        buildRuntimeConfig({
          kind: 'ready',
          state,
        } as unknown as StateValidation),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(
          error.message,
          `Cannot build Buzz runtime config: invalid ${field}`,
        )
        assert.equal(error.message.includes(sensitiveValue), false)
        return true
      },
    )
  }
})

test('rejects setup and recovery states with fixed value-silent errors', () => {
  const stableOnly = { ...COMPLETE_STORE }
  delete (stableOnly as Partial<CompleteStore>).ownerPubkeyHex
  delete (stableOnly as Partial<CompleteStore>).primaryUrl
  const needsSetup = validateStoredState({
    kind: 'parsed',
    value: stableOnly,
  })
  const sensitiveIssue = 'credential-like-sensitive-issue'
  const needsRecovery: RuntimeStateValidation = {
    kind: 'needs-state-recovery',
    issues: [sensitiveIssue],
  }

  assert.equal(needsSetup.kind, 'needs-setup')
  assert.throws(
    () => buildRuntimeConfig(needsSetup),
    new Error('Cannot build Buzz runtime config: initial setup is incomplete'),
  )
  assert.throws(
    () => buildRuntimeConfig(needsRecovery),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(
        error.message,
        'Cannot build Buzz runtime config: stable state requires recovery',
      )
      assert.equal(error.message.includes(sensitiveIssue), false)
      return true
    },
  )
})

test('sanitizes malformed canonical URL errors at the config boundary', () => {
  const secret = 'credential-like-sensitive-text'
  const ready = validatedReady()

  assert.throws(
    () =>
      buildRuntimeConfig({
        kind: 'ready',
        state: {
          ...ready.state,
          primaryUrl: `https://admin:${secret}@`,
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(
        error.message,
        'Cannot build Buzz runtime config: invalid primaryUrl',
      )
      assert.equal(error.message.includes(secret), false)
      return true
    },
  )
})

test('rejects a missing pairing relay URL at the config boundary', () => {
  const ready = validatedReady()
  const state = { ...ready.state }
  delete state.pairingRelayUrl

  assert.throws(
    () =>
      buildRuntimeConfig({
        kind: 'ready',
        state,
      }),
    new Error('Cannot build Buzz runtime config: invalid pairingRelayUrl'),
  )
})
