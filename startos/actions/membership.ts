import type { T } from '@start9labs/start-sdk'

import {
  prepareMembershipMutation,
  type MembershipInput,
  type MembershipOperation,
  type MembershipRole,
} from '../domain/membership.js'
import {
  validateStoredState,
  type StateValidation,
} from '../domain/state-validation.js'
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
import { buildRuntimeConfig, type RuntimeConfig } from '../runtime/config.js'
import { sdk } from '../sdk.js'

const PUBLIC_KEY_PATTERN =
  '^(?:[0-9A-Fa-f]{64}|npub1[023456789acdefghjklmnpqrstuvwxyz]{58})$'
const MAX_MEMBERSHIP_SLEEP_MILLISECONDS = 60_000

type MembershipTimestampPatch = {
  lastMembershipMutationUnixSecond: number
}

export type MembershipCommandExecutor = {
  execFail: (
    command: string[],
    options?: { env?: Record<string, string | undefined> },
    timeoutMs?: number | null,
    abort?: AbortController,
  ) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>
}

type WithTempBuzz = <Result>(
  run: (subcontainer: MembershipCommandExecutor) => Promise<Result>,
) => Promise<Result>

export type MembershipMutationDependencies = {
  withStoreMutation: StoreMutationQueue
  readStoredStateOnce: () => Promise<StoredStateRead>
  mergeStore: (patch: MembershipTimestampPatch) => Promise<unknown>
  withTempBuzz: WithTempBuzz
  nowUnixSecond: () => number
  sleep: (milliseconds: number) => Promise<void>
}

export type ListMembershipDependencies = {
  readStoredStateOnce: () => Promise<StoredStateRead>
  withTempBuzz: WithTempBuzz
}

export type MembershipMutationResult = {
  publicKeyHex: string
  role: MembershipRole
}

export type MembershipMutationActionRunner = (
  effects: T.Effects,
  operation: MembershipOperation,
  input: MembershipInput,
) => Promise<MembershipMutationResult>

export type ListMembersActionRunner = (effects: T.Effects) => Promise<string>

export const membershipInputSpec = sdk.InputSpec.of({
  publicKey: sdk.Value.text({
    name: i18n('Nostr Public Key'),
    description: i18n(
      'Enter an npub or 64-character hexadecimal Nostr public key.',
    ),
    required: true,
    default: '',
    masked: false,
    patterns: [
      {
        regex: PUBLIC_KEY_PATTERN,
        description: i18n(
          'Enter an npub or 64-character hexadecimal Nostr public key.',
        ),
      },
    ],
  }),
  role: sdk.Value.select({
    name: i18n('Role'),
    description: i18n(
      'Choose whether this identity is a member or administrator.',
    ),
    default: 'member',
    values: {
      member: i18n('Member'),
      admin: i18n('Administrator'),
    },
  }),
})

export function membershipMutationActionResult(
  title: 'Member Added' | 'Member Removed',
  result: MembershipMutationResult,
) {
  return {
    version: '1' as const,
    title: i18n(title),
    message: null,
    result: {
      type: 'single' as const,
      name: i18n('Normalized Nostr Public Key'),
      description: null,
      value: result.publicKeyHex,
      masked: false,
      copyable: true,
      qr: false,
    },
  }
}

function requireReadyState(stored: StoredStateRead) {
  const validation = validateStoredState(stored)
  if (validation.kind !== 'ready') {
    throw new Error('Stored Buzz state is not ready for membership management')
  }
  return validation
}

function mutationEnvironment(config: RuntimeConfig) {
  return {
    DATABASE_URL: config.buzzEnv.DATABASE_URL,
    REDIS_URL: config.buzzEnv.REDIS_URL,
    RELAY_URL: config.buzzEnv.RELAY_URL,
    BUZZ_RELAY_PRIVATE_KEY: config.buzzEnv.BUZZ_RELAY_PRIVATE_KEY,
  }
}

function listEnvironment(config: RuntimeConfig) {
  return {
    DATABASE_URL: config.buzzEnv.DATABASE_URL,
    RELAY_URL: config.buzzEnv.RELAY_URL,
  }
}

async function chooseMutationSecond(
  validation: Extract<StateValidation, { kind: 'ready' }>,
  dependencies: Pick<MembershipMutationDependencies, 'nowUnixSecond' | 'sleep'>,
): Promise<number> {
  const previous = validation.state.lastMembershipMutationUnixSecond
  let current = dependencies.nowUnixSecond()

  while (previous !== undefined && current <= previous) {
    await dependencies.sleep(
      Math.min(
        (previous - current + 1) * 1_000,
        MAX_MEMBERSHIP_SLEEP_MILLISECONDS,
      ),
    )
    current = dependencies.nowUnixSecond()
  }

  return current
}

export async function runMembershipMutationWith(
  operation: MembershipOperation,
  input: MembershipInput,
  dependencies: MembershipMutationDependencies,
): Promise<MembershipMutationResult> {
  const prepared = prepareMembershipMutation(operation, input)

  return dependencies.withStoreMutation(async () => {
    const validation = requireReadyState(
      await dependencies.readStoredStateOnce(),
    )
    if (prepared.publicKeyHex === validation.state.ownerPubkeyHex) {
      throw new Error('The relay owner cannot be added or removed')
    }

    const environment = mutationEnvironment(buildRuntimeConfig(validation))
    let attemptedSecond: number | undefined

    try {
      await dependencies.withTempBuzz(async (subcontainer) => {
        const scheduledSecond = await chooseMutationSecond(
          validation,
          dependencies,
        )
        try {
          await subcontainer.execFail(prepared.command, { env: environment })
        } finally {
          attemptedSecond = Math.max(
            scheduledSecond,
            dependencies.nowUnixSecond(),
          )
        }
      })
    } finally {
      if (attemptedSecond !== undefined) {
        await dependencies.mergeStore({
          lastMembershipMutationUnixSecond: attemptedSecond,
        })
      }
    }

    return {
      publicKeyHex: prepared.publicKeyHex,
      role: prepared.role,
    }
  })
}

export async function listMembersWith(
  dependencies: ListMembershipDependencies,
): Promise<string> {
  const validation = requireReadyState(await dependencies.readStoredStateOnce())
  const environment = listEnvironment(buildRuntimeConfig(validation))

  return dependencies.withTempBuzz(async (subcontainer) => {
    const result = await subcontainer.execFail(['buzz-admin', 'list-members'], {
      env: environment,
    })
    return result.stdout.toString()
  })
}

function withTempBuzz<Result>(
  effects: T.Effects,
  run: (subcontainer: MembershipCommandExecutor) => Promise<Result>,
) {
  return sdk.SubContainer.withTemp(
    effects,
    { imageId: 'buzz' },
    null,
    'buzz-membership-action',
    run,
  )
}

const nowUnixSecond = () => Math.floor(Date.now() / 1_000)
const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

export function runMembershipMutation(
  effects: T.Effects,
  operation: MembershipOperation,
  input: MembershipInput,
) {
  return runMembershipMutationWith(operation, input, {
    withStoreMutation,
    readStoredStateOnce,
    mergeStore: (patch) => storeJson.merge(effects, patch),
    withTempBuzz: (run) => withTempBuzz(effects, run),
    nowUnixSecond,
    sleep,
  })
}

export function listMembers(effects: T.Effects) {
  return listMembersWith({
    readStoredStateOnce,
    withTempBuzz: (run) => withTempBuzz(effects, run),
  })
}
