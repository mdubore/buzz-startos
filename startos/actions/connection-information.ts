import { derivePublicConfig } from '../domain/public-url.js'
import { validateStoredState } from '../domain/state-validation.js'
import { readStoredStateOnce } from '../fileModels/read-store.js'
import { i18n } from '../i18n/index.js'
import { sdk } from '../sdk.js'

export const connectionInformation = sdk.Action.withoutInput(
  'connection-information',
  {
    name: i18n('Connection Information'),
    description: i18n(
      'Show the canonical addresses and owner public key used by external Buzz clients.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  },
  async () => {
    const validation = validateStoredState(await readStoredStateOnce())
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

    const publicConfig = derivePublicConfig(validation.state.primaryUrl)

    return {
      version: '1',
      title: i18n('Buzz Connection Information'),
      message: i18n(
        'Use these values in the Buzz desktop client; mobile clients are still under development, and the StartOS interface does not provide the full Buzz experience.',
      ),
      result: {
        type: 'group',
        value: [
          {
            type: 'single',
            name: i18n('Canonical Web URL'),
            description: null,
            value: publicConfig.primaryUrl,
            masked: false,
            copyable: true,
            qr: false,
          },
          {
            type: 'single',
            name: i18n('Relay WebSocket URL'),
            description: null,
            value: publicConfig.relayUrl,
            masked: false,
            copyable: true,
            qr: false,
          },
          {
            type: 'single',
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
  },
)
