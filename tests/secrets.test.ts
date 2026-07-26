import assert from 'node:assert/strict'
import test from 'node:test'

import { getPublicKey } from 'nostr-tools'

import {
  generateStableSecrets,
  missingSecretsForInit,
  type GeneratedSecrets,
} from '../startos/domain/secrets.js'

const GENERATED: GeneratedSecrets = {
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
}

test('install fills every missing stable secret and schema version', () => {
  let calls = 0

  const patch = missingSecretsForInit('install', {}, () => {
    calls += 1
    return GENERATED
  })

  assert.deepEqual(patch, { schemaVersion: 1, ...GENERATED })
  assert.equal(calls, 1)
})

test('install sets schema version only when absent', () => {
  let calls = 0

  assert.deepEqual(
    missingSecretsForInit(
      'install',
      { schemaVersion: 99, ...GENERATED },
      () => {
        calls += 1
        return GENERATED
      },
    ),
    {},
  )
  assert.deepEqual(
    missingSecretsForInit('install', { ...GENERATED }, () => {
      calls += 1
      return GENERATED
    }),
    { schemaVersion: 1 },
  )
  assert.equal(calls, 0)
})

test('install preserves every present value, including malformed values', () => {
  const current = {
    schemaVersion: null,
    postgresPassword: '',
    redisPassword: false,
    s3AccessKey: 0,
    s3SecretKey: ['malformed'],
    relayPrivateKeyHex: { malformed: true },
    gitHookHmacSecretHex: 'present',
  }

  const patch = missingSecretsForInit('install', current, () => {
    throw new Error('generator must not run when every secret is present')
  })

  assert.deepEqual(patch, {})
  assert.deepEqual(current, {
    schemaVersion: null,
    postgresPassword: '',
    redisPassword: false,
    s3AccessKey: 0,
    s3SecretKey: ['malformed'],
    relayPrivateKeyHex: { malformed: true },
    gitHookHmacSecretHex: 'present',
  })
})

test('install generates only absent secrets', () => {
  const patch = missingSecretsForInit(
    'install',
    {
      schemaVersion: 1,
      postgresPassword: 'keep-postgres',
      s3AccessKey: null,
      relayPrivateKeyHex: 'keep-relay',
    },
    () => GENERATED,
  )

  assert.deepEqual(patch, {
    redisPassword: GENERATED.redisPassword,
    s3SecretKey: GENERATED.s3SecretKey,
    gitHookHmacSecretHex: GENERATED.gitHookHmacSecretHex,
  })
})

test('non-install init kinds return no patch and never call the generator', () => {
  for (const kind of ['update', 'restore', null] as const) {
    let calls = 0

    assert.deepEqual(
      missingSecretsForInit(kind, {}, () => {
        calls += 1
        return GENERATED
      }),
      {},
    )
    assert.equal(calls, 0)
  }
})

test('generated secrets have the required formats and a valid relay scalar', () => {
  const generated = generateStableSecrets({
    generateRelaySecretKey: () =>
      Uint8Array.from(Buffer.from(`${'0'.repeat(63)}1`, 'hex')),
    randomBytes: (size) =>
      Uint8Array.from({ length: size }, (_, index) => index),
  })

  assert.match(generated.postgresPassword, /^[A-Za-z0-9]{32}$/)
  assert.match(generated.redisPassword, /^[A-Za-z0-9]{32}$/)
  assert.match(generated.s3AccessKey, /^[A-Za-z0-9]{24}$/)
  assert.match(generated.s3SecretKey, /^[A-Za-z0-9]{48}$/)
  assert.match(generated.relayPrivateKeyHex, /^[0-9a-f]{64}$/)
  assert.match(generated.gitHookHmacSecretHex, /^[0-9a-f]{64}$/)
  assert.doesNotThrow(() =>
    getPublicKey(
      Uint8Array.from(Buffer.from(generated.relayPrivateKeyHex, 'hex')),
    ),
  )
})

test('generation rejects invalid relay scalars from an injected provider', () => {
  for (const relayPrivateKeyHex of [
    '0'.repeat(64),
    'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
  ]) {
    assert.throws(
      () =>
        generateStableSecrets({
          generateRelaySecretKey: () =>
            Uint8Array.from(Buffer.from(relayPrivateKeyHex, 'hex')),
          randomBytes: (size) => new Uint8Array(size),
        }),
      (error: unknown) =>
        error instanceof Error &&
        error.message ===
          'Relay secret-key provider returned an invalid scalar',
    )
  }
})
