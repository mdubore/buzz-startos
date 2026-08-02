import { isDeepStrictEqual } from 'node:util'

import {
  normalizePairingRelayUrl,
  pairingRelayUrlIsAvailable,
} from '../domain/pairing-url.js'
import { validateStoredState } from '../domain/state-validation.js'
import {
  readStoredStateOnce,
  type StoredStateRead,
} from '../fileModels/read-store.js'
import {
  storeJson,
  withStoreMutation,
  type StoreMutationQueue,
} from '../fileModels/store.json.js'
import { i18n } from '../i18n/index.js'
import { sdk } from '../sdk.js'
import { readPairingInterfaceUrlsOnce } from '../utils.js'

export type PairingRelayConfigurationInput = {
  pairingRelayUrl: string
}

export type PairingRelayConfigurationDependencies = {
  readStoredStateOnce: () => Promise<StoredStateRead>
  readPairingUrls: () => Promise<string[]>
  mergeStore: (patch: PairingRelayConfigurationInput) => Promise<unknown>
  withStoreMutation: StoreMutationQueue
}

export async function configurePairingRelayWith(
  input: PairingRelayConfigurationInput,
  dependencies: PairingRelayConfigurationDependencies,
): Promise<PairingRelayConfigurationInput> {
  const pairingRelayUrl = normalizePairingRelayUrl(input.pairingRelayUrl)

  return dependencies.withStoreMutation(async () => {
    const stored = await dependencies.readStoredStateOnce()
    const validation = validateStoredState(stored)
    if (validation.kind === 'needs-state-recovery') {
      throw new Error(
        `Stored Buzz state requires recovery (${validation.issues.join(', ')})`,
      )
    }

    const availableUrls = await dependencies.readPairingUrls()
    if (!pairingRelayUrlIsAvailable(pairingRelayUrl, availableUrls)) {
      throw new Error(
        'pairingRelayUrl is not currently available on the Buzz pairing interface',
      )
    }

    if (stored.kind !== 'parsed') {
      throw new Error('Stored Buzz state requires recovery (store.json)')
    }

    const current =
      typeof stored.value.pairingRelayUrl === 'string'
        ? { pairingRelayUrl: stored.value.pairingRelayUrl }
        : {}
    const requested = { pairingRelayUrl }
    if (!isDeepStrictEqual(current, requested)) {
      await dependencies.mergeStore(requested)
    }

    return requested
  })
}

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  pairingRelayUrl: Value.dynamicSelect(async ({ effects }) => {
    const urls = await readPairingInterfaceUrlsOnce(effects)
    return {
      name: i18n('Pairing Relay WebSocket URL'),
      description: i18n(
        'Select the StartOS WebSocket address Buzz will advertise for device pairing.',
      ),
      default: urls[0] ?? '',
      values: Object.fromEntries(urls.map((url) => [url, url])),
    }
  }),
})

export const configurePairingRelay = sdk.Action.withInput(
  'configure-pairing-relay',
  {
    name: i18n('Configure Pairing Relay'),
    description: i18n(
      'Select the current StartOS WebSocket address used to pair Buzz devices.',
    ),
    warning: null,
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: 'enabled',
    access: 'user',
  },
  inputSpec,
  async ({ effects }) => {
    const urls = await readPairingInterfaceUrlsOnce(effects)
    return { pairingRelayUrl: urls[0] ?? '' }
  },
  async ({ effects, input }) => {
    const result = await configurePairingRelayWith(input, {
      readStoredStateOnce,
      readPairingUrls: () => readPairingInterfaceUrlsOnce(effects),
      mergeStore: (patch) => storeJson.merge(effects, patch),
      withStoreMutation,
    })

    return {
      version: '1',
      title: i18n('Pairing Relay Configured'),
      message: null,
      result: {
        type: 'single',
        name: i18n('Pairing Relay WebSocket URL'),
        description: null,
        value: result.pairingRelayUrl,
        masked: false,
        copyable: true,
        qr: false,
      },
    }
  },
)
