import { randomBytes } from 'node:crypto'

import { generateSecretKey, getPublicKey } from 'nostr-tools'

const ALPHANUMERIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const MAX_UNBIASED_BYTE = 256 - (256 % ALPHANUMERIC.length)

export type InitKind = 'install' | 'update' | 'restore' | null

export type GeneratedSecrets = {
  postgresPassword: string
  redisPassword: string
  s3AccessKey: string
  s3SecretKey: string
  relayPrivateKeyHex: string
  gitHookHmacSecretHex: string
}

export type StableSecrets = { schemaVersion: 1 } & GeneratedSecrets

export type RawStableFields = {
  [Field in keyof StableSecrets]?: unknown
}

export type SecretProviders = {
  generateRelaySecretKey: () => Uint8Array
  randomBytes: (size: number) => Uint8Array
}

const SECRET_FIELDS = [
  'postgresPassword',
  'redisPassword',
  's3AccessKey',
  's3SecretKey',
  'relayPrivateKeyHex',
  'gitHookHmacSecretHex',
] as const satisfies readonly (keyof GeneratedSecrets)[]

const defaultProviders: SecretProviders = {
  generateRelaySecretKey: generateSecretKey,
  randomBytes,
}

function randomAlphanumeric(
  length: number,
  getRandomBytes: SecretProviders['randomBytes'],
): string {
  let value = ''

  while (value.length < length) {
    const bytes = getRandomBytes(Math.max(16, (length - value.length) * 2))
    if (bytes.length === 0) {
      throw new Error('Random byte provider returned no data')
    }

    for (const byte of bytes) {
      if (byte < MAX_UNBIASED_BYTE) {
        value += ALPHANUMERIC[byte % ALPHANUMERIC.length]
        if (value.length === length) break
      }
    }
  }

  return value
}

export function generateStableSecrets(
  providers: SecretProviders = defaultProviders,
): GeneratedSecrets {
  const relayPrivateKey = Uint8Array.from(providers.generateRelaySecretKey())
  if (relayPrivateKey.length !== 32) {
    throw new Error('Relay secret-key provider returned an invalid length')
  }
  try {
    getPublicKey(relayPrivateKey)
  } catch {
    throw new Error('Relay secret-key provider returned an invalid scalar')
  }
  const relayPrivateKeyHex = Buffer.from(relayPrivateKey).toString('hex')

  const gitHookSecret = providers.randomBytes(32)
  if (gitHookSecret.length !== 32) {
    throw new Error('Random byte provider returned an invalid length')
  }
  const gitHookHmacSecretHex = Buffer.from(gitHookSecret).toString('hex')

  return {
    postgresPassword: randomAlphanumeric(32, providers.randomBytes),
    redisPassword: randomAlphanumeric(32, providers.randomBytes),
    s3AccessKey: randomAlphanumeric(24, providers.randomBytes),
    s3SecretKey: randomAlphanumeric(48, providers.randomBytes),
    relayPrivateKeyHex,
    gitHookHmacSecretHex,
  }
}

export function missingSecretsForInit(
  kind: InitKind,
  current: RawStableFields,
  generate: () => GeneratedSecrets = generateStableSecrets,
): Partial<StableSecrets> {
  if (kind !== 'install') return {}

  const patch: Partial<StableSecrets> = {}
  if (current.schemaVersion === undefined) {
    patch.schemaVersion = 1
  }

  const missingFields = SECRET_FIELDS.filter(
    (field) => current[field] === undefined,
  )
  if (missingFields.length === 0) return patch

  const generated = generate()
  for (const field of missingFields) {
    patch[field] = generated[field]
  }

  return patch
}
