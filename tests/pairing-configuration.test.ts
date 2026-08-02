import assert from 'node:assert/strict'
import test from 'node:test'

import {
  configurePairingRelayWith,
  type PairingRelayConfigurationDependencies,
} from '../startos/actions/configure-pairing-relay.js'
import { connectionInformationWith } from '../startos/actions/connection-information.js'
import { normalizePairingRelayUrl } from '../startos/domain/pairing-url.js'
import type { StoredStateRead } from '../startos/fileModels/read-store.js'
import {
  createStoreMutationQueue,
  type RawStoredState,
} from '../startos/fileModels/store.json.js'

const VALID_STATE: RawStoredState = {
  schemaVersion: 1,
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
  ownerPubkeyHex: '11'.repeat(32),
  primaryUrl: 'https://buzz.example',
}

function parsed(value: RawStoredState): StoredStateRead {
  return { kind: 'parsed', value }
}

test('normalizes only root WebSocket pairing relay URLs', () => {
  assert.equal(
    normalizePairingRelayUrl('wss://PAIR.BUZZ.EXAMPLE.:443/'),
    'wss://pair.buzz.example',
  )
  assert.equal(
    normalizePairingRelayUrl('ws://PAIR.BUZZ.LOCAL:5000/'),
    'ws://pair.buzz.local:5000',
  )

  for (const value of [
    'https://pair.buzz.example',
    'http://pair.buzz.example',
    'wss://user@pair.buzz.example',
    'wss://pair.buzz.example/path',
    'wss://pair.buzz.example?query=1',
    'wss://pair.buzz.example#fragment',
    'not-a-url',
    '',
  ]) {
    assert.throws(() => normalizePairingRelayUrl(value))
  }
})

function dependencies(
  state: { value: RawStoredState },
  urls: string[],
  merges: Partial<RawStoredState>[],
): PairingRelayConfigurationDependencies {
  return {
    readStoredStateOnce: async () => parsed(structuredClone(state.value)),
    readPairingUrls: async () => urls,
    mergeStore: async (patch) => {
      merges.push(patch)
      state.value = { ...state.value, ...patch }
    },
    withStoreMutation: createStoreMutationQueue(),
  }
}

test('rejects a pairing URL not exported by the current interface', async () => {
  const state = { value: { ...VALID_STATE } }
  const merges: Partial<RawStoredState>[] = []

  await assert.rejects(
    configurePairingRelayWith(
      { pairingRelayUrl: 'wss://other.example' },
      dependencies(state, ['wss://pair.buzz.example'], merges),
    ),
    /not currently available on the Buzz pairing interface/,
  )
  assert.deepEqual(merges, [])
})

test('persists only the normalized pairing URL and makes retries idempotent', async () => {
  const state = { value: { ...VALID_STATE } }
  const merges: Partial<RawStoredState>[] = []
  const deps = dependencies(
    state,
    ['wss://pair.buzz.example', 'ws://pair.buzz.local:5000'],
    merges,
  )

  assert.deepEqual(
    await configurePairingRelayWith(
      { pairingRelayUrl: 'wss://PAIR.BUZZ.EXAMPLE.:443/' },
      deps,
    ),
    { pairingRelayUrl: 'wss://pair.buzz.example' },
  )
  await configurePairingRelayWith(
    { pairingRelayUrl: 'wss://pair.buzz.example' },
    deps,
  )

  assert.deepEqual(merges, [{ pairingRelayUrl: 'wss://pair.buzz.example' }])
})

test('allows replacing a previously configured pairing URL', async () => {
  const state = {
    value: {
      ...VALID_STATE,
      pairingRelayUrl: 'wss://old-pair.buzz.example',
    },
  }
  const merges: Partial<RawStoredState>[] = []

  await configurePairingRelayWith(
    { pairingRelayUrl: 'wss://new-pair.buzz.example' },
    dependencies(state, ['wss://new-pair.buzz.example'], merges),
  )

  assert.deepEqual(merges, [{ pairingRelayUrl: 'wss://new-pair.buzz.example' }])
})

test('serializes concurrent pairing URL mutations through the authoritative read', async () => {
  const state = { value: { ...VALID_STATE } }
  const merges: Partial<RawStoredState>[] = []
  let releaseFirst!: () => void
  let firstMergeStarted!: () => void
  const firstStarted = new Promise<void>((resolve) => {
    firstMergeStarted = resolve
  })
  const queue = createStoreMutationQueue()
  const deps: PairingRelayConfigurationDependencies = {
    readStoredStateOnce: async () => parsed(structuredClone(state.value)),
    readPairingUrls: async () => ['wss://one.example', 'wss://two.example'],
    mergeStore: async (patch) => {
      merges.push(patch)
      if (merges.length === 1) {
        firstMergeStarted()
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      }
      state.value = { ...state.value, ...patch }
    },
    withStoreMutation: queue,
  }

  const first = configurePairingRelayWith(
    { pairingRelayUrl: 'wss://one.example' },
    deps,
  )
  await firstStarted
  const second = configurePairingRelayWith(
    { pairingRelayUrl: 'wss://two.example' },
    deps,
  )

  assert.equal(merges.length, 1)
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(merges, [
    { pairingRelayUrl: 'wss://one.example' },
    { pairingRelayUrl: 'wss://two.example' },
  ])
  assert.equal(state.value.pairingRelayUrl, 'wss://two.example')
})

test('connection information exposes the selected pairing relay URL', async () => {
  const result = await connectionInformationWith(async () =>
    parsed({
      ...VALID_STATE,
      pairingRelayUrl: 'wss://pair.buzz.example',
    }),
  )

  assert.equal(result.result.type, 'group')
  if (result.result.type !== 'group') {
    throw new Error('connection information must return a group')
  }
  assert.deepEqual(
    result.result.value.find(
      (entry) => entry.name === 'Pairing Relay WebSocket URL',
    ),
    {
      type: 'single',
      name: 'Pairing Relay WebSocket URL',
      description: null,
      value: 'wss://pair.buzz.example',
      masked: false,
      copyable: true,
      qr: false,
    },
  )
})
