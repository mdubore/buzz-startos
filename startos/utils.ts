import type { T } from '@start9labs/start-sdk'

import { HOST_ID, WEB_INTERFACE_ID } from './constants.js'
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

export function selectWebInterfaceOrigins(
  host: HostWithInterfaces | null | undefined,
): string[] {
  let webInterface: InterfaceAddress | undefined
  for (const binding of Object.values(host?.bindings ?? {})) {
    const interfaces = binding.interfaces ?? {}
    webInterface =
      interfaces[WEB_INTERFACE_ID] ??
      Object.values(interfaces).find(
        (serviceInterface) => serviceInterface.id === WEB_INTERFACE_ID,
      )
    if (webInterface) break
  }

  const formatted = webInterface?.addressInfo?.nonLocal?.format() ?? []
  const origins = new Set<string>()

  for (const value of formatted) {
    const origin = normalizeRootOrigin(value)
    if (origin !== null) origins.add(origin)
  }

  return [...origins]
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
