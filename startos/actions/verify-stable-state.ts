import { validateStoredState } from '../domain/state-validation.js'
import { readStoredStateOnce } from '../fileModels/read-store.js'
import { i18n } from '../i18n/index.js'
import { reconcileBlockingTasks } from '../init/reconcile-blocking-tasks.js'
import { sdk } from '../sdk.js'
import {
  readPairingInterfaceUrlsOnce,
  readWebInterfaceOriginsOnce,
} from '../utils.js'

export const verifyStableState = sdk.Action.withoutInput(
  'verify-stable-state',
  {
    name: i18n('Verify Stable State'),
    description: i18n(
      'Verify restored Buzz state after recovering it from a known-good backup.',
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
        `Stored Buzz state requires recovery (${validation.issues.join(', ')}). Restore a known-good StartOS backup or reset and reinstall Buzz.`,
      )
    }

    const origins = await readWebInterfaceOriginsOnce(effects)
    const pairingUrls = await readPairingInterfaceUrlsOnce(effects)
    await reconcileBlockingTasks(effects, validation, origins, pairingUrls)
  },
)
