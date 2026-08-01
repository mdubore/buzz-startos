import type { T } from '@start9labs/start-sdk'

import {
  BUZZ_PORT,
  HOST_ID,
  PAIRING_HOST_ID,
  PAIRING_INTERFACE_ID,
  PAIRING_PORT,
  WEB_INTERFACE_ID,
} from './constants.js'
import { normalizePairingRelayUrl } from './domain/pairing-url.js'
import { derivePublicConfig } from './domain/public-url.js'
import { sdk } from './sdk.js'

type AddressFormatter = {
  format: () => unknown[]
}

type InterfaceAddress = {
  id?: string
  addressInfo?: {
    nonLocal?: AddressFormatter
  }
}

type HostWithInterfaces = {
  bindings?: Record<
    string | number,
    {
      interfaces?: Record<string, InterfaceAddress>
    }
  >
}

function normalizeRootOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    return derivePublicConfig(value).primaryUrl
  } catch {
    return null
  }
}

function normalizeWebSocketOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return normalizePairingRelayUrl(value)
  } catch {
    return null
  }
}

function selectInterfaceUrls(
  host: HostWithInterfaces | null | undefined,
  port: number,
  interfaceId: string,
  normalize: (value: unknown) => string | null,
): string[] {
  const binding = host?.bindings?.[port]
  const interfaces = binding?.interfaces ?? {}
  const serviceInterface =
    interfaces[interfaceId] ??
    Object.values(interfaces).find((entry) => entry.id === interfaceId)
  const formatted = serviceInterface?.addressInfo?.nonLocal?.format() ?? []
  const urls = new Set<string>()

  for (const value of formatted) {
    const url = normalize(value)
    if (url !== null) urls.add(url)
  }

  return [...urls]
}

export function selectWebInterfaceOrigins(
  host: HostWithInterfaces | null | undefined,
): string[] {
  return selectInterfaceUrls(
    host,
    BUZZ_PORT,
    WEB_INTERFACE_ID,
    normalizeRootOrigin,
  )
}

export function selectPairingInterfaceUrls(
  host: HostWithInterfaces | null | undefined,
): string[] {
  return selectInterfaceUrls(
    host,
    PAIRING_PORT,
    PAIRING_INTERFACE_ID,
    normalizeWebSocketOrigin,
  )
}

export function canonicalUrlIsAvailable(
  canonicalUrl: string,
  origins: readonly string[],
): boolean {
  const normalizedCanonicalUrl = normalizeRootOrigin(canonicalUrl)
  if (normalizedCanonicalUrl === null) return false

  return origins.some(
    (origin) => normalizeRootOrigin(origin) === normalizedCanonicalUrl,
  )
}

export async function readWebInterfaceOriginsOnce(
  effects: T.Effects,
): Promise<string[]> {
  return (
    (await sdk.host
      .getOwn(effects, HOST_ID, selectWebInterfaceOrigins)
      .once()) ?? []
  )
}

export async function readWebInterfaceOriginsConst(
  effects: T.Effects,
): Promise<string[]> {
  return (
    (await sdk.host
      .getOwn(effects, HOST_ID, selectWebInterfaceOrigins)
      .const()) ?? []
  )
}

export async function readPairingInterfaceUrlsOnce(
  effects: T.Effects,
): Promise<string[]> {
  return (
    (await sdk.host
      .getOwn(effects, PAIRING_HOST_ID, selectPairingInterfaceUrls)
      .once()) ?? []
  )
}

export async function readPairingInterfaceUrlsConst(
  effects: T.Effects,
): Promise<string[]> {
  return (
    (await sdk.host
      .getOwn(effects, PAIRING_HOST_ID, selectPairingInterfaceUrls)
      .const()) ?? []
  )
}
