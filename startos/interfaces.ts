import {
  BUZZ_PORT,
  HOST_ID,
  PAIRING_HOST_ID,
  PAIRING_INTERFACE_ID,
  PAIRING_PORT,
  RELAY_INTERFACE_ID,
  WEB_INTERFACE_ID,
} from './constants'
import { i18n } from './i18n'
import { sdk } from './sdk'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const host = sdk.MultiHost.of(effects, HOST_ID)
  const origin = await host.bindPort(BUZZ_PORT, {
    protocol: 'http',
    preferredExternalPort: BUZZ_PORT,
  })
  const pairingHost = sdk.MultiHost.of(effects, PAIRING_HOST_ID)
  const pairingOrigin = await pairingHost.bindPort(PAIRING_PORT, {
    protocol: 'http',
    preferredExternalPort: PAIRING_PORT,
  })

  const web = sdk.createInterface(effects, {
    name: i18n('Buzz Web'),
    id: WEB_INTERFACE_ID,
    description: i18n("Browser access to Buzz's HTTP interface."),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  const relay = sdk.createInterface(effects, {
    name: i18n('Buzz Relay'),
    id: RELAY_INTERFACE_ID,
    description: i18n('WebSocket relay endpoint for Buzz clients.'),
    type: 'api',
    masked: false,
    schemeOverride: { ssl: 'wss', noSsl: 'ws' },
    username: null,
    path: '',
    query: {},
  })

  const pairingRelay = sdk.createInterface(effects, {
    name: i18n('Buzz Pairing Relay'),
    id: PAIRING_INTERFACE_ID,
    description: i18n('Ephemeral WebSocket endpoint for pairing Buzz devices.'),
    type: 'api',
    masked: false,
    schemeOverride: { ssl: 'wss', noSsl: 'ws' },
    username: null,
    path: '',
    query: {},
  })

  return [
    await origin.export([web, relay]),
    await pairingOrigin.export([pairingRelay]),
  ]
})
