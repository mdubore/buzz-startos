import { isDeepStrictEqual } from 'node:util'

import { normalizeNostrPubkey } from '../domain/identity.js'
import { derivePublicConfig } from '../domain/public-url.js'
import { mergeInitialSetup, type StoredSetup } from '../domain/setup.js'
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
import {
  canonicalUrlIsAvailable,
  readWebInterfaceOriginsOnce,
} from '../utils.js'

const OWNER_PUBLIC_KEY_PATTERN =
  '^(?:[0-9A-Fa-f]{64}|npub1[023456789acdefghjklmnpqrstuvwxyz]{58})$'

export type InitialSetupInput = {
  ownerPubkeyHex: string
  primaryUrl: string
}

export type InitialSetupDependencies = {
  readStoredStateOnce: () => Promise<StoredStateRead>
  readOrigins: () => Promise<string[]>
  mergeStore: (patch: StoredSetup) => Promise<unknown>
  withStoreMutation: StoreMutationQueue
}

function recoveryError(issues: readonly string[]): Error {
  return new Error(
    `Stored Buzz state requires recovery (${issues.join(', ')}). Restore a known-good StartOS backup or reset and reinstall Buzz.`,
  )
}

export async function completeInitialSetupWith(
  input: InitialSetupInput,
  dependencies: InitialSetupDependencies,
): Promise<{ primaryUrl: string; relayUrl: string }> {
  const requested = {
    ownerPubkeyHex: normalizeNostrPubkey(input.ownerPubkeyHex),
    primaryUrl: derivePublicConfig(input.primaryUrl).primaryUrl,
  }

  return dependencies.withStoreMutation(async () => {
    const stored = await dependencies.readStoredStateOnce()
    const validation = validateStoredState(stored)
    if (validation.kind === 'needs-state-recovery') {
      throw recoveryError(validation.issues)
    }

    const origins = await dependencies.readOrigins()
    if (!canonicalUrlIsAvailable(requested.primaryUrl, origins)) {
      throw new Error(
        'primaryUrl is not currently available on the Buzz web interface',
      )
    }

    if (stored.kind !== 'parsed') {
      throw recoveryError(['store.json'])
    }

    const existing: StoredSetup = {}
    if (typeof stored.value.ownerPubkeyHex === 'string') {
      existing.ownerPubkeyHex = stored.value.ownerPubkeyHex
    }
    if (typeof stored.value.primaryUrl === 'string') {
      existing.primaryUrl = stored.value.primaryUrl
    }

    const merged = mergeInitialSetup(existing, requested)
    if (
      merged.ownerPubkeyHex === undefined ||
      merged.primaryUrl === undefined
    ) {
      throw new Error('ownerPubkeyHex and primaryUrl are required')
    }

    if (!isDeepStrictEqual(existing, merged)) {
      await dependencies.mergeStore(merged)
    }

    const publicConfig = derivePublicConfig(merged.primaryUrl)
    return {
      primaryUrl: publicConfig.primaryUrl,
      relayUrl: publicConfig.relayUrl,
    }
  })
}

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  ownerPubkeyHex: Value.text({
    name: i18n('Owner Nostr Public Key'),
    description: i18n(
      'Enter an npub or 64-character hexadecimal Nostr public key.',
    ),
    required: true,
    default: '',
    masked: false,
    patterns: [
      {
        regex: OWNER_PUBLIC_KEY_PATTERN,
        description: i18n(
          'Enter an npub or 64-character hexadecimal Nostr public key.',
        ),
      },
    ],
  }),
  primaryUrl: Value.dynamicSelect(async ({ effects }) => {
    const origins = await readWebInterfaceOriginsOnce(effects)
    return {
      name: i18n('Canonical Web URL'),
      description: i18n(
        'Select the StartOS URL that will permanently identify this Buzz community.',
      ),
      default: origins[0] ?? '',
      values: Object.fromEntries(origins.map((origin) => [origin, origin])),
    }
  }),
})

export const completeInitialSetup = sdk.Action.withInput(
  'complete-initial-setup',
  {
    name: i18n('Complete Initial Setup'),
    description: i18n(
      'Set and validate the immutable owner identity and canonical StartOS URL for this Buzz community.',
    ),
    warning: null,
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: 'hidden',
  },
  inputSpec,
  async ({ effects }) => {
    const origins = await readWebInterfaceOriginsOnce(effects)
    return {
      ownerPubkeyHex: '',
      primaryUrl: origins[0] ?? '',
    }
  },
  async ({ effects, input }) => {
    const result = await completeInitialSetupWith(input, {
      readStoredStateOnce,
      readOrigins: () => readWebInterfaceOriginsOnce(effects),
      mergeStore: (patch) => storeJson.merge(effects, patch),
      withStoreMutation,
    })

    return {
      version: '1',
      title: i18n('Initial Setup Complete'),
      message: null,
      result: {
        type: 'group',
        value: [
          {
            type: 'single',
            name: i18n('Canonical Web URL'),
            description: null,
            value: result.primaryUrl,
            masked: false,
            copyable: true,
            qr: false,
          },
          {
            type: 'single',
            name: i18n('Relay WebSocket URL'),
            description: null,
            value: result.relayUrl,
            masked: false,
            copyable: true,
            qr: false,
          },
        ],
      },
    }
  },
)
