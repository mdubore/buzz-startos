import assert from 'node:assert/strict'
import test from 'node:test'

import {
  completeInitialSetupWith,
  type InitialSetupDependencies,
} from '../startos/actions/complete-initial-setup.js'
import type { StoredStateRead } from '../startos/fileModels/read-store.js'
import {
  createStoreMutationQueue,
  type RawStoredState,
} from '../startos/fileModels/store.json.js'

const OWNER = '11'.repeat(32)
const OTHER_OWNER = '22'.repeat(32)
const PRIMARY_URL = 'https://buzz.example'
const OTHER_URL = 'https://other.example'

const VALID_SECRETS = {
  schemaVersion: 1 as const,
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
}

function parsed(value: RawStoredState): StoredStateRead {
  return { kind: 'parsed', value: structuredClone(value) }
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

test('conflicting concurrent setup calls serialize the authoritative transaction', async () => {
  let stored: RawStoredState = { ...VALID_SECRETS }
  let reads = 0
  let originReads = 0
  let merges = 0
  const events: string[] = []
  let releaseFirstMerge!: () => void
  let markFirstMergeStarted!: () => void
  const firstMergeStarted = new Promise<void>((resolve) => {
    markFirstMergeStarted = resolve
  })
  const firstMergeRelease = new Promise<void>((resolve) => {
    releaseFirstMerge = resolve
  })

  const dependencies: InitialSetupDependencies = {
    readStoredStateOnce: async () => {
      reads += 1
      events.push(`read-${reads}`)
      return parsed(stored)
    },
    readOrigins: async () => {
      originReads += 1
      events.push(`origins-${originReads}`)
      return [PRIMARY_URL, OTHER_URL]
    },
    mergeStore: async (patch) => {
      merges += 1
      events.push(`merge-${merges}-start`)
      if (merges === 1) {
        markFirstMergeStarted()
        await firstMergeRelease
      }
      stored = { ...stored, ...patch }
      events.push(`merge-${merges}-finish`)
    },
    withStoreMutation: createStoreMutationQueue(),
  }

  const winner = completeInitialSetupWith(
    {
      ownerPubkeyHex: OWNER.toUpperCase(),
      primaryUrl: 'https://BUZZ.EXAMPLE:443/',
    },
    dependencies,
  )
  await firstMergeStarted

  const loser = completeInitialSetupWith(
    { ownerPubkeyHex: OTHER_OWNER, primaryUrl: OTHER_URL },
    dependencies,
  )
  await nextTurn()

  assert.equal(reads, 1)
  assert.equal(originReads, 1)
  assert.equal(merges, 1)
  assert.deepEqual(events, ['read-1', 'origins-1', 'merge-1-start'])

  releaseFirstMerge()

  assert.deepEqual(await winner, {
    primaryUrl: PRIMARY_URL,
    relayUrl: 'wss://buzz.example',
  })
  await assert.rejects(loser, /owner identity.*immutable/i)

  assert.equal(reads, 2)
  assert.equal(originReads, 2)
  assert.equal(merges, 1)
  assert.deepEqual(stored, {
    ...VALID_SECRETS,
    ownerPubkeyHex: OWNER,
    primaryUrl: PRIMARY_URL,
  })
  assert.deepEqual(events, [
    'read-1',
    'origins-1',
    'merge-1-start',
    'merge-1-finish',
    'read-2',
    'origins-2',
  ])
})

test('concurrent identical retries are idempotent and do not overwrite', async () => {
  let stored: RawStoredState = { ...VALID_SECRETS }
  let reads = 0
  let originReads = 0
  let merges = 0
  let releaseFirstMerge!: () => void
  let markFirstMergeStarted!: () => void
  const firstMergeStarted = new Promise<void>((resolve) => {
    markFirstMergeStarted = resolve
  })
  const firstMergeRelease = new Promise<void>((resolve) => {
    releaseFirstMerge = resolve
  })

  const dependencies: InitialSetupDependencies = {
    readStoredStateOnce: async () => {
      reads += 1
      return parsed(stored)
    },
    readOrigins: async () => {
      originReads += 1
      return ['https://BUZZ.EXAMPLE.:443/']
    },
    mergeStore: async (patch) => {
      merges += 1
      if (merges === 1) {
        markFirstMergeStarted()
        await firstMergeRelease
      }
      stored = { ...stored, ...patch }
    },
    withStoreMutation: createStoreMutationQueue(),
  }

  const first = completeInitialSetupWith(
    { ownerPubkeyHex: OWNER, primaryUrl: PRIMARY_URL },
    dependencies,
  )
  await firstMergeStarted
  const second = completeInitialSetupWith(
    { ownerPubkeyHex: OWNER.toUpperCase(), primaryUrl: `${PRIMARY_URL}/` },
    dependencies,
  )
  await nextTurn()

  assert.equal(reads, 1)
  releaseFirstMerge()

  assert.deepEqual(await Promise.all([first, second]), [
    {
      primaryUrl: PRIMARY_URL,
      relayUrl: 'wss://buzz.example',
    },
    {
      primaryUrl: PRIMARY_URL,
      relayUrl: 'wss://buzz.example',
    },
  ])
  assert.equal(reads, 2)
  assert.equal(originReads, 2)
  assert.equal(merges, 1)
  assert.deepEqual(stored, {
    ...VALID_SECRETS,
    ownerPubkeyHex: OWNER,
    primaryUrl: PRIMARY_URL,
  })
})

test('a failed setup transaction releases the shared mutation queue', async () => {
  let stored: RawStoredState = { ...VALID_SECRETS }
  let reads = 0
  let originReads = 0
  let mergeAttempts = 0
  let releaseFailedMerge!: () => void
  let markFailedMergeStarted!: () => void
  const failedMergeStarted = new Promise<void>((resolve) => {
    markFailedMergeStarted = resolve
  })
  const failedMergeRelease = new Promise<void>((resolve) => {
    releaseFailedMerge = resolve
  })

  const dependencies: InitialSetupDependencies = {
    readStoredStateOnce: async () => {
      reads += 1
      return parsed(stored)
    },
    readOrigins: async () => {
      originReads += 1
      return [PRIMARY_URL]
    },
    mergeStore: async (patch) => {
      mergeAttempts += 1
      if (mergeAttempts === 1) {
        markFailedMergeStarted()
        await failedMergeRelease
        throw new Error('expected setup merge failure')
      }
      stored = { ...stored, ...patch }
    },
    withStoreMutation: createStoreMutationQueue(),
  }

  const failed = completeInitialSetupWith(
    { ownerPubkeyHex: OWNER, primaryUrl: PRIMARY_URL },
    dependencies,
  )
  const failedAssertion = assert.rejects(failed, /expected setup merge failure/)
  await failedMergeStarted

  const retry = completeInitialSetupWith(
    { ownerPubkeyHex: OWNER, primaryUrl: PRIMARY_URL },
    dependencies,
  )
  await nextTurn()
  assert.equal(reads, 1)

  releaseFailedMerge()
  await failedAssertion

  assert.deepEqual(await retry, {
    primaryUrl: PRIMARY_URL,
    relayUrl: 'wss://buzz.example',
  })
  assert.equal(reads, 2)
  assert.equal(originReads, 2)
  assert.equal(mergeAttempts, 2)
  assert.deepEqual(stored, {
    ...VALID_SECRETS,
    ownerPubkeyHex: OWNER,
    primaryUrl: PRIMARY_URL,
  })
})
