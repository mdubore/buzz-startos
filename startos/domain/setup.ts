import { normalizeNostrPubkey } from './identity.js'
import { derivePublicConfig } from './public-url.js'

export type StoredSetup = {
  ownerPubkeyHex?: string
  primaryUrl?: string
}

function normalizeSetup(setup: StoredSetup): StoredSetup {
  const normalized: StoredSetup = {}

  if (setup.ownerPubkeyHex !== undefined) {
    normalized.ownerPubkeyHex = normalizeNostrPubkey(setup.ownerPubkeyHex)
  }
  if (setup.primaryUrl !== undefined) {
    normalized.primaryUrl = derivePublicConfig(setup.primaryUrl).primaryUrl
  }

  return normalized
}

export function mergeInitialSetup(
  existing: StoredSetup,
  requested: StoredSetup,
): StoredSetup {
  const normalizedExisting = normalizeSetup(existing)
  const normalizedRequested = normalizeSetup(requested)

  if (
    normalizedExisting.ownerPubkeyHex !== undefined &&
    normalizedRequested.ownerPubkeyHex !== undefined &&
    normalizedExisting.ownerPubkeyHex !== normalizedRequested.ownerPubkeyHex
  ) {
    throw new Error('Owner identity is immutable in this package version')
  }
  if (
    normalizedExisting.primaryUrl !== undefined &&
    normalizedRequested.primaryUrl !== undefined &&
    normalizedExisting.primaryUrl !== normalizedRequested.primaryUrl
  ) {
    throw new Error('Canonical URL is immutable in this package version')
  }

  const ownerPubkeyHex =
    normalizedExisting.ownerPubkeyHex ?? normalizedRequested.ownerPubkeyHex
  const primaryUrl =
    normalizedExisting.primaryUrl ?? normalizedRequested.primaryUrl

  return {
    ...(ownerPubkeyHex === undefined ? {} : { ownerPubkeyHex }),
    ...(primaryUrl === undefined ? {} : { primaryUrl }),
  }
}
