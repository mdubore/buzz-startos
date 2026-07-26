import { nip19 } from 'nostr-tools'

const HEX_PUBLIC_KEY = /^[0-9a-f]{64}$/i
const LOWERCASE_HEX_PUBLIC_KEY = /^[0-9a-f]{64}$/
const INVALID_PUBLIC_KEY =
  'Enter an npub or 64-character hexadecimal Nostr public key'

export function normalizeNostrPubkey(value: string): string {
  const trimmed = value.trim()

  if (HEX_PUBLIC_KEY.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  try {
    const decoded = nip19.decode(trimmed)

    if (
      decoded.type === 'npub' &&
      LOWERCASE_HEX_PUBLIC_KEY.test(decoded.data)
    ) {
      return decoded.data
    }
  } catch {
    // Normalize decoder details so private or malformed input is never exposed.
  }

  throw new Error(INVALID_PUBLIC_KEY)
}
