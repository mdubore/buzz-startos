import { FileHelper, z } from '@start9labs/start-sdk'

import { sdk } from '../sdk'

const storePath = {
  base: sdk.volumes.startos,
  subpath: './store.json',
}

export const rawStoredStateShape = z.object({
  schemaVersion: z.unknown().optional().catch(undefined),
  postgresPassword: z.unknown().optional().catch(undefined),
  redisPassword: z.unknown().optional().catch(undefined),
  s3AccessKey: z.unknown().optional().catch(undefined),
  s3SecretKey: z.unknown().optional().catch(undefined),
  relayPrivateKeyHex: z.unknown().optional().catch(undefined),
  gitHookHmacSecretHex: z.unknown().optional().catch(undefined),
  ownerPubkeyHex: z.unknown().optional().catch(undefined),
  primaryUrl: z.unknown().optional().catch(undefined),
  lastMembershipMutationUnixSecond: z.unknown().optional().catch(undefined),
})

export type RawStoredState = z.infer<typeof rawStoredStateShape>

export type RawStoreText = {
  text: string
}

const rawStoreTextShape = z.object({ text: z.string() })

export const storeJson = FileHelper.json(storePath, rawStoredStateShape)

export const storeRawText = FileHelper.raw<RawStoreText>(
  storePath,
  ({ text }) => text,
  (text) => ({ text }),
  (value) => rawStoreTextShape.parse(value),
)
