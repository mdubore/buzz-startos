import assert from 'node:assert/strict'
import test from 'node:test'

import { nip19 } from 'nostr-tools'

import { mergeInitialSetup, type StoredSetup } from '../startos/domain/setup.js'

const OWNER = '11'.repeat(32)
const OTHER_OWNER = '22'.repeat(32)

test('an empty store accepts and normalizes owner identity and primary URL', () => {
  const existing: StoredSetup = {}
  const requested: StoredSetup = {
    ownerPubkeyHex: OWNER.toUpperCase(),
    primaryUrl: 'https://BUZZ.EXAMPLE:443/',
  }

  const result = mergeInitialSetup(existing, requested)

  assert.deepEqual(result, {
    ownerPubkeyHex: OWNER,
    primaryUrl: 'https://buzz.example',
  })
  assert.notStrictEqual(result, existing)
  assert.notStrictEqual(result, requested)
  assert.deepEqual(existing, {})
  assert.deepEqual(requested, {
    ownerPubkeyHex: OWNER.toUpperCase(),
    primaryUrl: 'https://BUZZ.EXAMPLE:443/',
  })
})

test('an equivalent normalized retry is idempotent', () => {
  const existing: StoredSetup = {
    ownerPubkeyHex: OWNER,
    primaryUrl: 'https://buzz.example',
  }

  const result = mergeInitialSetup(existing, {
    ownerPubkeyHex: nip19.npubEncode(OWNER),
    primaryUrl: 'https://BUZZ.EXAMPLE.:443/',
  })

  assert.deepEqual(result, existing)
  assert.notStrictEqual(result, existing)
})

test('owner identity is immutable once present', () => {
  assert.throws(
    () =>
      mergeInitialSetup(
        { ownerPubkeyHex: OWNER },
        { ownerPubkeyHex: OTHER_OWNER },
      ),
    /owner identity.*immutable in this package version/i,
  )
})

test('canonical URL is immutable once present', () => {
  assert.throws(
    () =>
      mergeInitialSetup(
        { primaryUrl: 'https://buzz.example' },
        { primaryUrl: 'https://other.example' },
      ),
    /canonical URL.*immutable in this package version/i,
  )
})

test('a partial owner record can fill only its missing URL', () => {
  assert.deepEqual(
    mergeInitialSetup(
      { ownerPubkeyHex: OWNER.toUpperCase() },
      {
        ownerPubkeyHex: nip19.npubEncode(OWNER),
        primaryUrl: 'http://BUZZ.LOCAL:3000/',
      },
    ),
    {
      ownerPubkeyHex: OWNER,
      primaryUrl: 'http://buzz.local:3000',
    },
  )

  assert.throws(
    () =>
      mergeInitialSetup(
        { ownerPubkeyHex: OWNER },
        { ownerPubkeyHex: OTHER_OWNER, primaryUrl: 'https://buzz.example' },
      ),
    /owner identity.*immutable in this package version/i,
  )
})

test('a partial URL record can fill only its missing owner', () => {
  assert.deepEqual(
    mergeInitialSetup(
      { primaryUrl: 'https://BUZZ.EXAMPLE.:443/' },
      {
        ownerPubkeyHex: OWNER.toUpperCase(),
        primaryUrl: 'https://buzz.example',
      },
    ),
    {
      ownerPubkeyHex: OWNER,
      primaryUrl: 'https://buzz.example',
    },
  )

  assert.throws(
    () =>
      mergeInitialSetup(
        { primaryUrl: 'https://buzz.example' },
        { ownerPubkeyHex: OWNER, primaryUrl: 'https://other.example' },
      ),
    /canonical URL.*immutable in this package version/i,
  )
})

test('validates the complete request atomically without mutating inputs', () => {
  const existing: StoredSetup = {
    ownerPubkeyHex: OWNER,
    primaryUrl: 'https://buzz.example',
  }
  const requested: StoredSetup = {
    ownerPubkeyHex: OTHER_OWNER,
    primaryUrl: 'https://buzz.example/path',
  }
  const existingSnapshot = { ...existing }
  const requestedSnapshot = { ...requested }

  assert.throws(
    () => mergeInitialSetup(existing, requested),
    /canonical URL|root path/i,
  )
  assert.deepEqual(existing, existingSnapshot)
  assert.deepEqual(requested, requestedSnapshot)
})
