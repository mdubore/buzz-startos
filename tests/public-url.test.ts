import assert from 'node:assert/strict'
import test from 'node:test'

import { derivePublicConfig } from '../startos/domain/public-url.js'

test('derives canonical HTTPS configuration and drops the default port', () => {
  assert.deepEqual(derivePublicConfig('https://Buzz.Example:443/'), {
    primaryUrl: 'https://buzz.example',
    relayUrl: 'wss://buzz.example',
    mediaBaseUrl: 'https://buzz.example/media',
    corsOrigins: 'https://buzz.example',
    authority: 'buzz.example',
  })
})

test('derives canonical HTTP configuration and preserves a non-default port', () => {
  assert.deepEqual(derivePublicConfig('http://buzz.local:3000'), {
    primaryUrl: 'http://buzz.local:3000',
    relayUrl: 'ws://buzz.local:3000',
    mediaBaseUrl: 'http://buzz.local:3000/media',
    corsOrigins: 'http://buzz.local:3000',
    authority: 'buzz.local:3000',
  })
})

test('lowercases the hostname and removes one trailing hostname dot', () => {
  assert.deepEqual(derivePublicConfig('https://BUZZ.EXAMPLE.:8443/'), {
    primaryUrl: 'https://buzz.example:8443',
    relayUrl: 'wss://buzz.example:8443',
    mediaBaseUrl: 'https://buzz.example:8443/media',
    corsOrigins: 'https://buzz.example:8443',
    authority: 'buzz.example:8443',
  })
})

test('preserves brackets and a non-default port for IPv6', () => {
  assert.deepEqual(derivePublicConfig('https://[2001:DB8::1]:8443/'), {
    primaryUrl: 'https://[2001:db8::1]:8443',
    relayUrl: 'wss://[2001:db8::1]:8443',
    mediaBaseUrl: 'https://[2001:db8::1]:8443/media',
    corsOrigins: 'https://[2001:db8::1]:8443',
    authority: '[2001:db8::1]:8443',
  })
})

test('rejects non-root paths', () => {
  for (const value of [
    'https://buzz.example/media',
    'https://buzz.example//',
  ]) {
    assert.throws(() => derivePublicConfig(value))
  }
})

test('rejects query strings and fragments', () => {
  for (const value of [
    'https://buzz.example/?page=1',
    'https://buzz.example/#relay',
  ]) {
    assert.throws(() => derivePublicConfig(value))
  }
})

test('rejects URL credentials', () => {
  for (const value of [
    'https://alice@buzz.example/',
    'https://alice:secret@buzz.example/',
  ]) {
    assert.throws(() => derivePublicConfig(value))
  }
})

test('rejects non-HTTP schemes', () => {
  for (const value of [
    'ws://buzz.example/',
    'wss://buzz.example/',
    'ftp://buzz.example/',
  ]) {
    assert.throws(() => derivePublicConfig(value))
  }
})

test('rejects malformed URLs', () => {
  for (const value of ['', 'buzz.example', 'not a URL']) {
    assert.throws(() => derivePublicConfig(value))
  }
})
