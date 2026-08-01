import { derivePublicConfig } from '../domain/public-url.js'
import { validateStoredState } from '../domain/state-validation.js'
import {
  readStoredStateOnce,
  type StoredStateRead,
} from '../fileModels/read-store.js'
import { i18n } from '../i18n/index.js'
import { sdk } from '../sdk.js'

export async function connectionInformationWith(
  readState: () => Promise<StoredStateRead>,
) {
  const validation = validateStoredState(await readState())
  if (validation.kind === 'needs-state-recovery') {
    throw new Error(
      `Stored Buzz state requires recovery (${validation.issues.join(', ')})`,
    )
  }
  if (validation.kind !== 'ready') {
    throw new Error(
      'Stored Buzz state is not ready (ownerPubkeyHex, primaryUrl)',
    )
  }
  if (validation.state.pairingRelayUrl === undefined) {
    throw new Error('Stored Buzz state is not ready (pairingRelayUrl)')
  }

  const publicConfig = derivePublicConfig(validation.state.primaryUrl)

  return {
    version: '1' as const,
    title: i18n('Buzz Connection Information'),
    message: i18n(
      'Normal mobile traffic uses the main relay. Use the pairing relay only when adding a device. The current verified beta configuration is LAN-only.',
    ),
    result: {
      type: 'group' as const,
      value: [
        {
          type: 'single' as const,
          name: i18n('Canonical Web URL'),
          description: null,
          value: publicConfig.primaryUrl,
          masked: false,
          copyable: true,
          qr: false,
        },
        {
          type: 'single' as const,
          name: i18n('Relay WebSocket URL'),
          description: null,
          value: publicConfig.relayUrl,
          masked: false,
          copyable: true,
          qr: false,
        },
        {
          type: 'single' as const,
          name: i18n('Pairing Relay WebSocket URL'),
          description: null,
          value: validation.state.pairingRelayUrl,
          masked: false,
          copyable: true,
          qr: false,
        },
        {
          type: 'single' as const,
          name: i18n('Owner Public Key (Hex)'),
          description: null,
          value: validation.state.ownerPubkeyHex,
          masked: false,
          copyable: true,
          qr: false,
        },
      ],
    },
  }
}

export const connectionInformation = sdk.Action.withoutInput(
  'connection-information',
  {
    name: i18n('Connection Information'),
    description: i18n(
      'Show the canonical, relay, and pairing addresses and owner public key used by external Buzz clients.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  },
  async () => connectionInformationWith(readStoredStateOnce),
)
