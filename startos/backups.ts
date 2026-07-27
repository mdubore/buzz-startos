import type { T } from '@start9labs/start-sdk'

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

const BACKUP_VOLUME_ID_TUPLE = Object.freeze([
  'startos',
  'redis',
  'media',
] as const)

export const BACKUP_VOLUME_IDS: readonly string[] = BACKUP_VOLUME_ID_TUPLE

const POSTGRES_RESTORE_INITDB_ARGS: readonly string[] = Object.freeze([
  '--auth-host=scram-sha-256',
])

export type CreateBackupDependencies = {
  readStoredStateOnce: () => Promise<StoredStateRead>
  createBackup: T.ExpectedExports.createBackup
}

export async function readBackupPostgresPassword(
  readStoredState: () => Promise<StoredStateRead>,
): Promise<string> {
  const validation = validateStoredState(await readStoredState())
  if (validation.kind === 'needs-state-recovery') {
    throw new Error('Stored Buzz state requires recovery before backup')
  }
  return validation.state.postgresPassword
}

export async function createBackupWith(
  options: Parameters<T.ExpectedExports.createBackup>[0],
  dependencies: CreateBackupDependencies,
): Promise<unknown> {
  await readBackupPostgresPassword(dependencies.readStoredStateOnce)
  return dependencies.createBackup(options)
}

export function buildPostgresBackupConfig() {
  return {
    imageId: 'postgres' as const,
    dbVolume: 'postgres' as const,
    mountpoint: POSTGRES_MOUNTPOINT,
    pgdataPath: POSTGRES_DATA_PATH,
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: async () => readBackupPostgresPassword(readStoredStateOnce),
    initdbArgs: [...POSTGRES_RESTORE_INITDB_ARGS],
    readyTimeout: 120_000,
  }
}

function buildBackups() {
  const backups = sdk.Backups.withPgDump(buildPostgresBackupConfig())

  for (const volumeId of BACKUP_VOLUME_ID_TUPLE) {
    backups.addVolume(volumeId)
  }

  return backups
}

const backupSetup = sdk.setupBackups(async () => buildBackups())

export const restoreInit = backupSetup.restoreInit
export const createBackup: T.ExpectedExports.createBackup = (options) =>
  createBackupWith(options, {
    readStoredStateOnce,
    createBackup: backupSetup.createBackup,
  })
