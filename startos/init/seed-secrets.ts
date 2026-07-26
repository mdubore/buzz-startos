import {
  generateStableSecrets,
  missingSecretsForInit,
  type GeneratedSecrets,
  type InitKind,
  type StableSecrets,
} from '../domain/secrets.js'
import {
  readStoredStateOnce,
  type StoredStateRead,
} from '../fileModels/read-store.js'
import {
  storeJson,
  withStoreMutation,
  type StoreMutationQueue,
} from '../fileModels/store.json.js'
import { sdk } from '../sdk'

export type SeedSecretsDependencies = {
  readStoredStateOnce: () => Promise<StoredStateRead>
  mergeStore: (patch: Partial<StableSecrets>) => Promise<unknown>
  generateSecrets: () => GeneratedSecrets
  withStoreMutation: StoreMutationQueue
}

export async function seedSecretsForInit(
  kind: InitKind,
  dependencies: SeedSecretsDependencies,
): Promise<void> {
  if (kind !== 'install') {
    await dependencies.readStoredStateOnce()
    return
  }

  await dependencies.withStoreMutation(async () => {
    const stored = await dependencies.readStoredStateOnce()
    if (stored.kind === 'unreadable') return

    const current = stored.kind === 'missing' ? {} : stored.value
    const patch = missingSecretsForInit(
      kind,
      current,
      dependencies.generateSecrets,
    )
    if (Object.keys(patch).length === 0) return

    await dependencies.mergeStore(patch)
  })
}

export const seedSecrets = sdk.setupOnInit(async (effects, kind) => {
  await seedSecretsForInit(kind, {
    readStoredStateOnce,
    mergeStore: (patch) => storeJson.merge(effects, patch),
    generateSecrets: generateStableSecrets,
    withStoreMutation,
  })
})
