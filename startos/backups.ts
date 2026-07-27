import {
  POSTGRES_DATA_PATH,
  POSTGRES_DB,
  POSTGRES_MOUNTPOINT,
  POSTGRES_USER,
} from './constants.js'
import { validateStoredState } from './domain/state-validation.js'
import {
  readStoredStateOnce,
  type StoredStateRead,
} from './fileModels/read-store.js'
import { sdk } from './sdk'

export const BACKUP_VOLUME_IDS = ['startos', 'redis', 'media']

export async function readBackupPostgresPassword(
  readStoredState: () => Promise<StoredStateRead>,
): Promise<string> {
  const validation = validateStoredState(await readStoredState())
  if (validation.kind === 'needs-state-recovery') {
    throw new Error('Stored Buzz state requires recovery before backup')
  }
  return validation.state.postgresPassword
}

export const { createBackup, restoreInit } = sdk.setupBackups(async () =>
  sdk.Backups.withPgDump({
    imageId: 'postgres',
    dbVolume: 'postgres',
    mountpoint: POSTGRES_MOUNTPOINT,
    pgdataPath: POSTGRES_DATA_PATH,
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: async () => readBackupPostgresPassword(readStoredStateOnce),
    readyTimeout: 120_000,
  })
    .addVolume('startos')
    .addVolume('redis')
    .addVolume('media'),
)
