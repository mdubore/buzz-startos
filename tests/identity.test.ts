import assert from 'node:assert/strict'
import test from 'node:test'

import { nip19 } from 'nostr-tools'

import { normalizeNostrPubkey } from '../startos/domain/identity.js'

const HEX = '11'.repeat(32)
const ERROR_MESSAGE =
  'Enter an npub or 64-character hexadecimal Nostr public key'

function assertInvalid(value: string): void {
  assert.throws(
    () => normalizeNostrPubkey(value),
    (error: unknown) =>
      error instanceof Error && error.message === ERROR_MESSAGE,
  )
}

test('accepts a lowercase hexadecimal public key', () => {
  assert.equal(normalizeNostrPubkey(HEX), HEX)
})

test('lowercases an uppercase hexadecimal public key', () => {
  assert.equal(normalizeNostrPubkey(HEX.toUpperCase()), HEX)
})

test('trims and decodes an npub', () => {
  assert.equal(normalizeNostrPubkey(`  ${nip19.npubEncode(HEX)}  `), HEX)
})

test('rejects short and non-hexadecimal public keys', () => {
  assertInvalid('11')
  assertInvalid('g'.repeat(64))
})

test('rejects an nsec with the shared public-key error', () => {
  const privateKey = Uint8Array.from(Buffer.from(HEX, 'hex'))

  assertInvalid(nip19.nsecEncode(privateKey))
})

test('rejects another non-npub encoded type', () => {
  assertInvalid(nip19.noteEncode(HEX))
})
