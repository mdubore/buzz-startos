import type { T } from '@start9labs/start-sdk'

import { completeInitialSetup } from '../actions/complete-initial-setup.js'
import { verifyCanonicalUrl } from '../actions/verify-canonical-url.js'
import { verifyStableState } from '../actions/verify-stable-state.js'
import {
  SETUP_TASK_REPLAY_ID,
  STATE_RECOVERY_TASK_REPLAY_ID,
  URL_RECOVERY_TASK_REPLAY_ID,
} from '../constants.js'
import type {
  RuntimeStateValidation,
  StateValidation,
} from '../domain/state-validation.js'
import { i18n } from '../i18n/index.js'
import { sdk } from '../sdk.js'
import { canonicalUrlIsAvailable } from '../utils.js'

type BlockingStateValidation = StateValidation | RuntimeStateValidation

export type BlockingTaskDecision =
  | {
      actionId: 'verify-stable-state'
      replayId: typeof STATE_RECOVERY_TASK_REPLAY_ID
      clearReplayIds: [
        typeof SETUP_TASK_REPLAY_ID,
        typeof URL_RECOVERY_TASK_REPLAY_ID,
      ]
    }
  | {
      actionId: 'complete-initial-setup'
      replayId: typeof SETUP_TASK_REPLAY_ID
      clearReplayIds: [
        typeof STATE_RECOVERY_TASK_REPLAY_ID,
        typeof URL_RECOVERY_TASK_REPLAY_ID,
      ]
    }
  | {
      actionId: 'verify-canonical-url'
      replayId: typeof URL_RECOVERY_TASK_REPLAY_ID
      clearReplayIds: [
        typeof STATE_RECOVERY_TASK_REPLAY_ID,
        typeof SETUP_TASK_REPLAY_ID,
      ]
    }
  | {
      actionId: null
      replayId: null
      clearReplayIds: [
        typeof STATE_RECOVERY_TASK_REPLAY_ID,
        typeof SETUP_TASK_REPLAY_ID,
        typeof URL_RECOVERY_TASK_REPLAY_ID,
      ]
    }

export function selectBlockingTask(
  stateValidation: BlockingStateValidation,
  origins: readonly string[],
): BlockingTaskDecision {
  if (stateValidation.kind === 'needs-state-recovery') {
    return {
      actionId: 'verify-stable-state',
      replayId: STATE_RECOVERY_TASK_REPLAY_ID,
      clearReplayIds: [SETUP_TASK_REPLAY_ID, URL_RECOVERY_TASK_REPLAY_ID],
    }
  }

  if (stateValidation.kind === 'needs-setup') {
    return {
      actionId: 'complete-initial-setup',
      replayId: SETUP_TASK_REPLAY_ID,
      clearReplayIds: [
        STATE_RECOVERY_TASK_REPLAY_ID,
        URL_RECOVERY_TASK_REPLAY_ID,
      ],
    }
  }

  if (!canonicalUrlIsAvailable(stateValidation.state.primaryUrl, origins)) {
    return {
      actionId: 'verify-canonical-url',
      replayId: URL_RECOVERY_TASK_REPLAY_ID,
      clearReplayIds: [STATE_RECOVERY_TASK_REPLAY_ID, SETUP_TASK_REPLAY_ID],
    }
  }

  return {
    actionId: null,
    replayId: null,
    clearReplayIds: [
      STATE_RECOVERY_TASK_REPLAY_ID,
      SETUP_TASK_REPLAY_ID,
      URL_RECOVERY_TASK_REPLAY_ID,
    ],
  }
}

export async function reconcileBlockingTasks(
  effects: T.Effects,
  stateValidation: BlockingStateValidation,
  origins: readonly string[],
): Promise<void> {
  const decision = selectBlockingTask(stateValidation, origins)

  switch (decision.actionId) {
    case 'verify-stable-state':
      await sdk.action.createOwnTask(effects, verifyStableState, 'critical', {
        replayId: decision.replayId,
        reason: i18n(
          'Buzz stored state requires recovery. Restore a known-good StartOS backup or reset and reinstall Buzz.',
        ),
      })
      break
    case 'complete-initial-setup':
      await sdk.action.createOwnTask(
        effects,
        completeInitialSetup,
        'critical',
        {
          replayId: decision.replayId,
          reason: i18n('Complete initial setup before starting Buzz.'),
        },
      )
      break
    case 'verify-canonical-url':
      await sdk.action.createOwnTask(effects, verifyCanonicalUrl, 'critical', {
        replayId: decision.replayId,
        reason: i18n(
          'The original canonical URL is unavailable. Restore that same StartOS address before starting Buzz.',
        ),
      })
      break
    case null:
      break
  }

  await sdk.action.clearTask(effects, ...decision.clearReplayIds)
}
