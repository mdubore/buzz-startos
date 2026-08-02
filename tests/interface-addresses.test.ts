import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUZZ_HEALTH_PORT,
  BUZZ_METRICS_PORT,
  BUZZ_PORT,
  HOST_ID,
  PAIRING_HOST_ID,
  PAIRING_INTERFACE_ID,
  PAIRING_PORT,
  PAIRING_SETUP_TASK_REPLAY_ID,
  POSTGRES_DATA_PATH,
  POSTGRES_DB,
  POSTGRES_MOUNTPOINT,
  POSTGRES_USER,
  RELAY_INTERFACE_ID,
  S3_BUCKET,
  SETUP_TASK_REPLAY_ID,
  STATE_RECOVERY_TASK_REPLAY_ID,
  URL_RECOVERY_TASK_REPLAY_ID,
  WEB_INTERFACE_ID,
} from '../startos/constants.js'
import {
  canonicalUrlIsAvailable,
  selectPairingInterfaceUrls,
  selectWebInterfaceOrigins,
} from '../startos/utils.js'

function hostWithAddresses(nonLocal: string[], all = nonLocal) {
  return {
    bindings: {
      [BUZZ_PORT]: {
        interfaces: {
          [WEB_INTERFACE_ID]: {
            addressInfo: {
              format: () => all,
              nonLocal: {
                format: () => nonLocal,
              },
            },
          },
        },
      },
    },
  }
}

function pairingHostWithAddresses(nonLocal: string[], all = nonLocal) {
  return {
    bindings: {
      [PAIRING_PORT]: {
        interfaces: {
          [PAIRING_INTERFACE_ID]: {
            addressInfo: {
              format: () => all,
              nonLocal: {
                format: () => nonLocal,
              },
            },
          },
        },
      },
    },
  }
}

test('declares the exact Buzz runtime ports, names, and replay IDs', () => {
  assert.deepEqual(
    {
      HOST_ID,
      WEB_INTERFACE_ID,
      RELAY_INTERFACE_ID,
      PAIRING_HOST_ID,
      PAIRING_INTERFACE_ID,
      PAIRING_PORT,
      BUZZ_PORT,
      BUZZ_HEALTH_PORT,
      BUZZ_METRICS_PORT,
      POSTGRES_DB,
      POSTGRES_USER,
      POSTGRES_MOUNTPOINT,
      POSTGRES_DATA_PATH,
      S3_BUCKET,
      SETUP_TASK_REPLAY_ID,
      STATE_RECOVERY_TASK_REPLAY_ID,
      URL_RECOVERY_TASK_REPLAY_ID,
      PAIRING_SETUP_TASK_REPLAY_ID,
    },
    {
      HOST_ID: 'buzz',
      WEB_INTERFACE_ID: 'web',
      RELAY_INTERFACE_ID: 'relay',
      PAIRING_HOST_ID: 'buzz-pairing',
      PAIRING_INTERFACE_ID: 'pairing-relay',
      PAIRING_PORT: 5000,
      BUZZ_PORT: 3000,
      BUZZ_HEALTH_PORT: 8080,
      BUZZ_METRICS_PORT: 9102,
      POSTGRES_DB: 'buzz',
      POSTGRES_USER: 'buzz',
      POSTGRES_MOUNTPOINT: '/var/lib/postgresql',
      POSTGRES_DATA_PATH: '/data',
      S3_BUCKET: 'buzz-media',
      SETUP_TASK_REPLAY_ID: 'buzz:complete-initial-setup',
      STATE_RECOVERY_TASK_REPLAY_ID: 'buzz:verify-stable-state',
      URL_RECOVERY_TASK_REPLAY_ID: 'buzz:verify-canonical-url',
      PAIRING_SETUP_TASK_REPLAY_ID: 'buzz:configure-pairing-relay',
    },
  )
})

test('keeps only normalized root WebSocket pairing URLs', () => {
  assert.deepEqual(
    selectPairingInterfaceUrls(
      pairingHostWithAddresses([
        'wss://PAIR.BUZZ.EXAMPLE.:443/',
        'ws://PAIR.BUZZ.LOCAL:5000/',
        'https://pair.buzz.example',
        'http://pair.buzz.example',
        'wss://pair.buzz.example/path',
        'wss://pair.buzz.example/?query=1',
        'wss://user@pair.buzz.example',
        'not-a-url',
      ]),
    ),
    ['wss://pair.buzz.example', 'ws://pair.buzz.local:5000'],
  )
})

test('deduplicates pairing URLs and excludes bridge-only addresses', () => {
  const bridgeAddress = 'ws://10.0.3.1:5000'
  const publicAddresses = [
    'wss://pair.buzz.example',
    'wss://PAIR.BUZZ.EXAMPLE:443/',
  ]

  assert.deepEqual(
    selectPairingInterfaceUrls(
      pairingHostWithAddresses(publicAddresses, [
        bridgeAddress,
        ...publicAddresses,
      ]),
    ),
    ['wss://pair.buzz.example'],
  )
})

test('returns no pairing URLs when its host, port, or interface is absent', () => {
  assert.deepEqual(selectPairingInterfaceUrls(null), [])
  assert.deepEqual(selectPairingInterfaceUrls(undefined), [])
  assert.deepEqual(selectPairingInterfaceUrls({ bindings: {} }), [])
  assert.deepEqual(
    selectPairingInterfaceUrls({
      bindings: {
        [PAIRING_PORT]: {
          interfaces: {
            relay: {
              addressInfo: {
                nonLocal: { format: () => ['wss://pair.buzz.example'] },
              },
            },
          },
        },
      },
    }),
    [],
  )
})

test('keeps only normalized HTTP and HTTPS root origins', () => {
  assert.deepEqual(
    selectWebInterfaceOrigins(
      hostWithAddresses([
        'https://BUZZ.EXAMPLE.:443/',
        'http://BUZZ.LOCAL:3000/',
        'ws://buzz.example',
        'wss://buzz.example',
        'ftp://buzz.example',
        'https://buzz.example/path',
        'https://buzz.example/?query=1',
        'https://user@buzz.example',
        'not-a-url',
      ]),
    ),
    ['https://buzz.example', 'http://buzz.local:3000'],
  )
})

test('removes duplicate origins after normalization', () => {
  assert.deepEqual(
    selectWebInterfaceOrigins(
      hostWithAddresses([
        'https://buzz.example',
        'https://BUZZ.EXAMPLE:443/',
        'https://buzz.example./',
      ]),
    ),
    ['https://buzz.example'],
  )
})

test('uses the SDK nonLocal address view and excludes bridge-only addresses', () => {
  const bridgeAddress = 'http://10.0.3.1:3000'
  const publicAddress = 'https://buzz.example'
  const host = hostWithAddresses(
    [publicAddress],
    [bridgeAddress, publicAddress],
  )

  assert.deepEqual(selectWebInterfaceOrigins(host), [publicAddress])
})

test('returns no origins when the Buzz host, port, or web interface is absent', () => {
  assert.deepEqual(selectWebInterfaceOrigins(null), [])
  assert.deepEqual(selectWebInterfaceOrigins(undefined), [])
  assert.deepEqual(selectWebInterfaceOrigins({ bindings: {} }), [])
  assert.deepEqual(
    selectWebInterfaceOrigins({
      bindings: {
        [BUZZ_PORT]: {
          interfaces: {
            [RELAY_INTERFACE_ID]: {
              addressInfo: {
                nonLocal: { format: () => ['wss://buzz.example'] },
              },
            },
          },
        },
      },
    }),
    [],
  )
})

test('compares canonical URL availability using normalized origins', () => {
  const origins = [
    'https://BUZZ.EXAMPLE.:443/',
    'http://buzz.local:3000/',
    'not-a-url',
  ]

  assert.equal(canonicalUrlIsAvailable('https://buzz.example', origins), true)
  assert.equal(
    canonicalUrlIsAvailable('HTTP://BUZZ.LOCAL:3000/', origins),
    true,
  )
  assert.equal(canonicalUrlIsAvailable('https://other.example', origins), false)
  assert.equal(canonicalUrlIsAvailable('not-a-url', origins), false)
})
