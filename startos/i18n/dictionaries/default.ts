export const DEFAULT_LANG = 'en_US'

const dict = {
  'Buzz Web': 0,
  "Browser access to Buzz's HTTP interface.": 1,
  'Buzz Relay': 2,
  'WebSocket relay endpoint for Buzz clients.': 3,
  'Complete Initial Setup': 4,
  'Set and validate the immutable owner identity and canonical StartOS URL for this Buzz community.': 5,
  'Owner Nostr Public Key': 6,
  'Enter an npub or 64-character hexadecimal Nostr public key.': 7,
  'Canonical Web URL': 8,
  'Select the StartOS URL that will permanently identify this Buzz community.': 9,
  'Initial Setup Complete': 10,
  'Relay WebSocket URL': 11,
  'Verify Stable State': 12,
  'Verify restored Buzz state after recovering it from a known-good backup.': 13,
  'Verify Canonical URL': 14,
  'Verify that the original immutable StartOS address is available after a restore or gateway change.': 15,
  'Connection Information': 16,
  'Show the canonical addresses and owner public key used by external Buzz clients.': 17,
  'Buzz Connection Information': 18,
  'Use these values in the Buzz desktop client; mobile clients are still under development, and the StartOS interface does not provide the full Buzz experience.': 19,
  'Owner Public Key (Hex)': 20,
  'Buzz stored state requires recovery. Restore a known-good StartOS backup or reset and reinstall Buzz.': 21,
  'Complete initial setup before starting Buzz.': 22,
  'The original canonical URL is unavailable. Restore that same StartOS address before starting Buzz.': 23,
  'Buzz Relay is ready': 24,
  'Buzz Relay is not ready': 25,
  'Add Member': 26,
  'Add a member or administrator role to a Nostr identity in the private relay.': 27,
  'Remove Member': 28,
  'Remove a member or administrator role from a Nostr identity in the private relay.': 29,
  'List Members': 30,
  'Display the private relay roster.': 31,
  'Nostr Public Key': 32,
  Role: 33,
  'Choose whether this identity is a member or administrator.': 34,
  Member: 35,
  Administrator: 36,
  'Member Added': 37,
  'Member Removed': 38,
  'Normalized Nostr Public Key': 39,
  'Relay Members': 40,
  'Buzz Pairing Relay': 41,
  'Ephemeral WebSocket endpoint for pairing Buzz devices.': 42,
  'Pairing Relay WebSocket URL': 43,
  'Select the StartOS WebSocket address Buzz will advertise for device pairing.': 44,
  'Configure Pairing Relay': 45,
  'Select the current StartOS WebSocket address used to pair Buzz devices.': 46,
  'Pairing Relay Configured': 47,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
