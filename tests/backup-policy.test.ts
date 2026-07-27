import assert from 'node:assert/strict'
import test from 'node:test'

import type { T } from '@start9labs/start-sdk'

import {
  BACKUP_VOLUME_IDS,
  buildPostgresBackupConfig,
  createBackupWith,
  readBackupPostgresPassword,
} from '../startos/backups.js'
import type { StoredStateRead } from '../startos/fileModels/read-store.js'
import type { RawStoredState } from '../startos/fileModels/store.json.js'

const VALID_SECRETS = {
  schemaVersion: 1,
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
}

function parsed(value: RawStoredState): StoredStateRead {
  return { kind: 'parsed', value }
}

test('PostgreSQL uses a logical dump while MinIO is authoritative for media and Git objects', () => {
  assert.deepEqual(BACKUP_VOLUME_IDS, ['startos', 'redis', 'media'])
  assert.equal(BACKUP_VOLUME_IDS.includes('postgres'), false)
  assert.equal(BACKUP_VOLUME_IDS.includes('git-cache'), false)
  assert.equal(Object.isFrozen(BACKUP_VOLUME_IDS), true)
})

test('PostgreSQL restore construction requires SCRAM authentication for TCP clients', () => {
  assert.deepEqual(buildPostgresBackupConfig().initdbArgs, [
    '--auth-host=scram-sha-256',
  ])
})

test('backup preflight rejects malformed state without calling the delegate or exposing stored values', async () => {
  const storedValue = 'do-not-print-this-backup-value'
  let delegateCalls = 0

  await assert.rejects(
    createBackupWith(
      { effects: {} as T.Effects },
      {
        readStoredStateOnce: async () =>
          parsed({
            ...VALID_SECRETS,
            postgresPassword: storedValue,
          }),
        createBackup: async () => {
          delegateCalls += 1
        },
      },
    ),
    (error: Error) => {
      assert.equal(
        error.message,
        'Stored Buzz state requires recovery before backup',
      )
      assert.equal(error.message.includes(storedValue), false)
      return true
    },
  )
  assert.equal(delegateCalls, 0)
})

test('backup preflight delegates valid ready and needs-setup state with the original options', async () => {
  const validStates: RawStoredState[] = [
    VALID_SECRETS,
    {
      ...VALID_SECRETS,
      ownerPubkeyHex: '11'.repeat(32),
      primaryUrl: 'https://buzz.example',
    },
  ]

  for (const state of validStates) {
    const options = { effects: {} as T.Effects }
    const delegateResult = { state }
    let delegatedOptions: typeof options | undefined

    const result = await createBackupWith(options, {
      readStoredStateOnce: async () => parsed(state),
      createBackup: async (received) => {
        delegatedOptions = received
        return delegateResult
      },
    })

    assert.equal(result, delegateResult)
    assert.equal(delegatedOptions, options)
  }
})

test('the lazy PostgreSQL password accepts both ready and needs-setup state', async () => {
  let reads = 0
  const read = async (value: RawStoredState) => {
    reads += 1
    return parsed(value)
  }

  assert.equal(
    await readBackupPostgresPassword(() => read(VALID_SECRETS)),
    VALID_SECRETS.postgresPassword,
  )
  assert.equal(
    await readBackupPostgresPassword(() =>
      read({
        ...VALID_SECRETS,
        ownerPubkeyHex: '11'.repeat(32),
        primaryUrl: 'https://buzz.example',
      }),
    ),
    VALID_SECRETS.postgresPassword,
  )
  assert.equal(reads, 2)
})

test('the lazy PostgreSQL password rejects malformed state without exposing stored values', async () => {
  const storedValue = 'do-not-print-this-value'

  await assert.rejects(
    readBackupPostgresPassword(async () =>
      parsed({
        ...VALID_SECRETS,
        postgresPassword: storedValue,
      }),
    ),
    (error: Error) => {
      assert.equal(
        error.message,
        'Stored Buzz state requires recovery before backup',
      )
      assert.equal(error.message.includes(storedValue), false)
      return true
    },
  )
})
