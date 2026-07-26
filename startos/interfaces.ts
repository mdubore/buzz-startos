import {
  BUZZ_PORT,
  HOST_ID,
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

  return [await origin.export([web, relay])]
})
