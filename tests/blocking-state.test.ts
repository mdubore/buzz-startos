import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PAIRING_SETUP_TASK_REPLAY_ID,
  SETUP_TASK_REPLAY_ID,
  STATE_RECOVERY_TASK_REPLAY_ID,
  URL_RECOVERY_TASK_REPLAY_ID,
} from '../startos/constants.js'
import type { RuntimeStateValidation } from '../startos/domain/state-validation.js'
import { selectBlockingTask } from '../startos/init/reconcile-blocking-tasks.js'

const VALID_SECRETS = {
  schemaVersion: 1 as const,
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
}

const READY: RuntimeStateValidation = {
  kind: 'ready',
  state: {
    ...VALID_SECRETS,
    ownerPubkeyHex: '11'.repeat(32),
    primaryUrl: 'https://buzz.example',
    pairingRelayUrl: 'wss://pair.buzz.example',
  },
}

test('state recovery selects only stable-state verification', () => {
  assert.deepEqual(
    selectBlockingTask(
      {
        kind: 'needs-state-recovery',
        issues: ['schemaVersion', 'primaryUrl'],
      },
      ['https://buzz.example'],
      ['wss://pair.buzz.example'],
    ),
    {
      actionId: 'verify-stable-state',
      replayId: STATE_RECOVERY_TASK_REPLAY_ID,
      clearReplayIds: [
        SETUP_TASK_REPLAY_ID,
        URL_RECOVERY_TASK_REPLAY_ID,
        PAIRING_SETUP_TASK_REPLAY_ID,
      ],
    },
  )
})

test('valid stable state without setup selects only initial setup', () => {
  assert.deepEqual(
    selectBlockingTask(
      { kind: 'needs-setup', state: VALID_SECRETS },
      ['https://buzz.example'],
      ['wss://pair.buzz.example'],
    ),
    {
      actionId: 'complete-initial-setup',
      replayId: SETUP_TASK_REPLAY_ID,
      clearReplayIds: [
        STATE_RECOVERY_TASK_REPLAY_ID,
        URL_RECOVERY_TASK_REPLAY_ID,
        PAIRING_SETUP_TASK_REPLAY_ID,
      ],
    },
  )
})

test('ready state with an unavailable canonical URL selects URL recovery first', () => {
  assert.deepEqual(selectBlockingTask(READY, ['https://other.example'], []), {
    actionId: 'verify-canonical-url',
    replayId: URL_RECOVERY_TASK_REPLAY_ID,
    clearReplayIds: [
      STATE_RECOVERY_TASK_REPLAY_ID,
      SETUP_TASK_REPLAY_ID,
      PAIRING_SETUP_TASK_REPLAY_ID,
    ],
  })
})

test('missing or unavailable pairing URL selects pairing configuration', () => {
  const withoutPairing: RuntimeStateValidation = {
    kind: 'ready',
    state: {
      ...READY.state,
      pairingRelayUrl: undefined,
    },
  }

  for (const [state, pairingUrls] of [
    [withoutPairing, ['wss://pair.buzz.example']],
    [READY, ['wss://other.example']],
  ] as const) {
    assert.deepEqual(
      selectBlockingTask(state, ['https://buzz.example'], pairingUrls),
      {
        actionId: 'configure-pairing-relay',
        replayId: PAIRING_SETUP_TASK_REPLAY_ID,
        clearReplayIds: [
          STATE_RECOVERY_TASK_REPLAY_ID,
          SETUP_TASK_REPLAY_ID,
          URL_RECOVERY_TASK_REPLAY_ID,
        ],
      },
    )
  }
})

test('ready state with both normalized URLs clears every task', () => {
  assert.deepEqual(
    selectBlockingTask(
      READY,
      ['https://BUZZ.EXAMPLE.:443/'],
      ['wss://PAIR.BUZZ.EXAMPLE.:443/'],
    ),
    {
      actionId: null,
      replayId: null,
      clearReplayIds: [
        STATE_RECOVERY_TASK_REPLAY_ID,
        SETUP_TASK_REPLAY_ID,
        URL_RECOVERY_TASK_REPLAY_ID,
        PAIRING_SETUP_TASK_REPLAY_ID,
      ],
    },
  )
})

test('state recovery takes priority over setup and address symptoms', () => {
  const decision = selectBlockingTask(
    {
      kind: 'needs-state-recovery',
      issues: ['ownerPubkeyHex', 'primaryUrl'],
    },
    [],
    [],
  )

  assert.equal(decision.actionId, 'verify-stable-state')
  assert.equal(decision.replayId, STATE_RECOVERY_TASK_REPLAY_ID)
  assert.deepEqual(decision.clearReplayIds, [
    SETUP_TASK_REPLAY_ID,
    URL_RECOVERY_TASK_REPLAY_ID,
    PAIRING_SETUP_TASK_REPLAY_ID,
  ])
})
