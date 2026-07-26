export type PublicConfig = {
  primaryUrl: string
  relayUrl: string
  mediaBaseUrl: string
  corsOrigins: string
  authority: string
}

const INVALID_URL = 'Enter a valid HTTP or HTTPS canonical URL'

export function derivePublicConfig(input: string): PublicConfig {
  let parsed: URL

  try {
    parsed = new URL(input)
  } catch {
    throw new Error(INVALID_URL)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Canonical URL must use HTTP or HTTPS')
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('Canonical URL must not include credentials')
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new Error('Canonical URL must not include a query string or fragment')
  }
  if (parsed.pathname !== '' && parsed.pathname !== '/') {
    throw new Error('Canonical URL must use the root path')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (hostname === '' || hostname.endsWith('.')) {
    throw new Error('Canonical URL must include a hostname')
  }

  const authority = parsed.port ? `${hostname}:${parsed.port}` : hostname
  const primaryUrl = `${parsed.protocol}//${authority}`
  const relayScheme = parsed.protocol === 'https:' ? 'wss:' : 'ws:'

  return {
    primaryUrl,
    relayUrl: `${relayScheme}//${authority}`,
    mediaBaseUrl: `${primaryUrl}/media`,
    corsOrigins: primaryUrl,
    authority,
  }
}
