import { validateStoredState } from '../domain/state-validation.js'
import { readStoredStateOnce } from '../fileModels/read-store.js'
import { i18n } from '../i18n/index.js'
import { reconcileBlockingTasks } from '../init/reconcile-blocking-tasks.js'
import { sdk } from '../sdk.js'
import {
  canonicalUrlIsAvailable,
  readPairingInterfaceUrlsOnce,
  readWebInterfaceOriginsOnce,
} from '../utils.js'

export const verifyCanonicalUrl = sdk.Action.withoutInput(
  'verify-canonical-url',
  {
    name: i18n('Verify Canonical URL'),
    description: i18n(
      'Verify that the original immutable StartOS address is available after a restore or gateway change.',
    ),
    warning: null,
    allowedStatuses: 'only-stopped',
    group: null,
    visibility: 'hidden',
  },
  async ({ effects }) => {
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

    const origins = await readWebInterfaceOriginsOnce(effects)
    const pairingUrls = await readPairingInterfaceUrlsOnce(effects)
    if (!canonicalUrlIsAvailable(validation.state.primaryUrl, origins)) {
      throw new Error(
        'primaryUrl is unavailable. Restore the original StartOS address before starting Buzz.',
      )
    }

    await reconcileBlockingTasks(effects, validation, origins, pairingUrls)
  },
)
