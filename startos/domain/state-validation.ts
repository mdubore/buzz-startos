import { isDeepStrictEqual } from 'node:util'

import type { FileHelper, T } from '@start9labs/start-sdk'
import { getPublicKey } from 'nostr-tools'

import {
  parseStoredStateText,
  type StoredStateRead,
} from '../fileModels/read-store.js'
import { storeRawText, type RawStoreText } from '../fileModels/store.json.js'
import { normalizeNostrPubkey } from './identity.js'
import { derivePublicConfig } from './public-url.js'
import type { StableSecrets } from './secrets.js'

const LOWERCASE_HEX_64 = /^[0-9a-f]{64}$/

export type CompleteStore = StableSecrets & {
  ownerPubkeyHex: string
  primaryUrl: string
  lastMembershipMutationUnixSecond?: number
}

export type StateValidation =
  | { kind: 'ready'; state: CompleteStore }
  | { kind: 'needs-setup'; state: StableSecrets }
  | { kind: 'needs-state-recovery'; issues: string[] }

export type RuntimeStateValidation =
  | {
      kind: 'ready'
      state: Omit<CompleteStore, 'lastMembershipMutationUnixSecond'>
    }
  | { kind: 'needs-setup'; state: StableSecrets }
  | { kind: 'needs-state-recovery'; issues: string[] }

function isAlphanumeric(value: unknown, length: number): value is string {
  return (
    typeof value === 'string' &&
    value.length === length &&
    /^[A-Za-z0-9]+$/.test(value)
  )
}

function isLowercaseHex64(value: unknown): value is string {
  return typeof value === 'string' && LOWERCASE_HEX_64.test(value)
}

function isValidRelayPrivateKey(value: unknown): value is string {
  if (!isLowercaseHex64(value)) return false

  try {
    getPublicKey(Uint8Array.from(Buffer.from(value, 'hex')))
    return true
  } catch {
    return false
  }
}

export function validateStoredState(input: StoredStateRead): StateValidation {
  if (input.kind !== 'parsed') {
    return { kind: 'needs-state-recovery', issues: ['store.json'] }
  }

  const raw = input.value
  const issues: string[] = []

  if (raw.schemaVersion !== 1) issues.push('schemaVersion')
  if (!isAlphanumeric(raw.postgresPassword, 32)) {
    issues.push('postgresPassword')
  }
  if (!isAlphanumeric(raw.redisPassword, 32)) {
    issues.push('redisPassword')
  }
  if (!isAlphanumeric(raw.s3AccessKey, 24)) issues.push('s3AccessKey')
  if (!isAlphanumeric(raw.s3SecretKey, 48)) issues.push('s3SecretKey')
  if (!isValidRelayPrivateKey(raw.relayPrivateKeyHex)) {
    issues.push('relayPrivateKeyHex')
  }
  if (!isLowercaseHex64(raw.gitHookHmacSecretHex)) {
    issues.push('gitHookHmacSecretHex')
  }

  let ownerPubkeyHex: string | undefined
  if (raw.ownerPubkeyHex !== undefined) {
    if (typeof raw.ownerPubkeyHex !== 'string') {
      issues.push('ownerPubkeyHex')
    } else {
      try {
        ownerPubkeyHex = normalizeNostrPubkey(raw.ownerPubkeyHex)
        if (ownerPubkeyHex !== raw.ownerPubkeyHex) {
          issues.push('ownerPubkeyHex')
        }
      } catch {
        issues.push('ownerPubkeyHex')
      }
    }
  }

  let primaryUrl: string | undefined
  if (raw.primaryUrl !== undefined) {
    if (typeof raw.primaryUrl !== 'string') {
      issues.push('primaryUrl')
    } else {
      try {
        primaryUrl = derivePublicConfig(raw.primaryUrl).primaryUrl
        if (primaryUrl !== raw.primaryUrl) issues.push('primaryUrl')
      } catch {
        issues.push('primaryUrl')
      }
    }
  }

  let lastMembershipMutationUnixSecond: number | undefined
  if (raw.lastMembershipMutationUnixSecond !== undefined) {
    if (
      typeof raw.lastMembershipMutationUnixSecond !== 'number' ||
      !Number.isSafeInteger(raw.lastMembershipMutationUnixSecond) ||
      raw.lastMembershipMutationUnixSecond < 0
    ) {
      issues.push('lastMembershipMutationUnixSecond')
    } else {
      lastMembershipMutationUnixSecond = raw.lastMembershipMutationUnixSecond
    }
  }

  if (issues.length > 0) {
    return { kind: 'needs-state-recovery', issues }
  }

  const stableSecrets: StableSecrets = {
    schemaVersion: 1,
    postgresPassword: raw.postgresPassword as string,
    redisPassword: raw.redisPassword as string,
    s3AccessKey: raw.s3AccessKey as string,
    s3SecretKey: raw.s3SecretKey as string,
    relayPrivateKeyHex: raw.relayPrivateKeyHex as string,
    gitHookHmacSecretHex: raw.gitHookHmacSecretHex as string,
  }

  if (ownerPubkeyHex === undefined || primaryUrl === undefined) {
    return { kind: 'needs-setup', state: stableSecrets }
  }

  return {
    kind: 'ready',
    state: {
      ...stableSecrets,
      ownerPubkeyHex,
      primaryUrl,
      ...(lastMembershipMutationUnixSecond === undefined
        ? {}
        : { lastMembershipMutationUnixSecond }),
    },
  }
}

export function projectForRuntime(
  validation: StateValidation,
): RuntimeStateValidation {
  if (validation.kind !== 'ready') return validation

  const { lastMembershipMutationUnixSecond: _, ...state } = validation.state
  return { kind: 'ready', state }
}

export function runtimeStateEqual(
  left: RuntimeStateValidation | null,
  right: RuntimeStateValidation | null,
): boolean {
  if (left === null || right === null) return left === right
  return isDeepStrictEqual(left, right)
}

const runtimeStateFromText = ({ text }: RawStoreText) =>
  projectForRuntime(validateStoredState(parseStoredStateText(text)))

type RuntimeStateFile = Pick<FileHelper<RawStoreText>, 'read'>

export async function readRuntimeStateConstFrom(
  effects: T.Effects,
  file: RuntimeStateFile,
): Promise<RuntimeStateValidation> {
  const projected = await file
    .read(runtimeStateFromText, runtimeStateEqual)
    .const(effects)

  return (
    projected ?? projectForRuntime(validateStoredState({ kind: 'missing' }))
  )
}

export async function readRuntimeStateConst(
  effects: T.Effects,
): Promise<RuntimeStateValidation> {
  return readRuntimeStateConstFrom(effects, storeRawText)
}
