export function normalizePairingRelayUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('pairingRelayUrl must be a valid WebSocket URL')
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('pairingRelayUrl must use ws or wss')
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('pairingRelayUrl must not contain credentials')
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new Error('pairingRelayUrl must not contain a query or fragment')
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    throw new Error('pairingRelayUrl must be a root URL')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (hostname === '' || hostname.endsWith('.')) {
    throw new Error('pairingRelayUrl must contain a valid hostname')
  }

  const authority = parsed.port ? `${hostname}:${parsed.port}` : hostname
  return `${parsed.protocol}//${authority}`
}

export function pairingRelayUrlIsAvailable(
  pairingRelayUrl: string,
  availableUrls: readonly string[],
): boolean {
  let normalized: string
  try {
    normalized = normalizePairingRelayUrl(pairingRelayUrl)
  } catch {
    return false
  }

  return availableUrls.some((available) => {
    try {
      return normalizePairingRelayUrl(available) === normalized
    } catch {
      return false
    }
  })
}
