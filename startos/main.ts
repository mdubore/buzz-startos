import type { T } from '@start9labs/start-sdk'

import { POSTGRES_DB, POSTGRES_USER, S3_BUCKET } from './constants.js'
import { readRuntimeStateConst } from './domain/state-validation.js'
import { i18n } from './i18n/index.js'
import { reconcileBlockingTasks } from './init/reconcile-blocking-tasks.js'
import {
  buildConnectionUrl,
  buildRuntimeConfig,
  type RuntimeConfig,
} from './runtime/config.js'
import { MINIO_READINESS_URL, checkCompositeHealth } from './runtime/health.js'
import {
  buildBuzzMounts,
  buildMinioMounts,
  buildPostgresMounts,
  buildRedisMounts,
} from './runtime/mounts.js'
import { sdk } from './sdk.js'
import {
  canonicalUrlIsAvailable,
  readWebInterfaceOriginsConst,
} from './utils.js'

type ExecResult = {
  exitCode: number | null
  stdout?: string | Buffer
}

async function commandSucceeded(
  run: () => Promise<ExecResult>,
  expectedStdout?: string,
): Promise<boolean> {
  try {
    const result = await run()
    if (result.exitCode !== 0) return false
    return (
      expectedStdout === undefined ||
      result.stdout?.toString().trim() === expectedStdout
    )
  } catch {
    return false
  }
}

function hiddenReadiness(
  ready: boolean,
  successMessage: string,
  failureMessage: string,
) {
  return ready
    ? { result: 'success' as const, message: successMessage }
    : { result: 'failure' as const, message: failureMessage }
}

export function buildNativeStack(effects: T.Effects, config: RuntimeConfig) {
  const buzzSub = sdk.SubContainer.of(
    effects,
    { imageId: 'buzz' },
    buildBuzzMounts(),
    'buzz',
  )
  const postgresSub = sdk.SubContainer.of(
    effects,
    { imageId: 'postgres' },
    buildPostgresMounts(),
    'postgres',
  )
  const redisSub = sdk.SubContainer.of(
    effects,
    { imageId: 'redis' },
    buildRedisMounts(),
    'redis',
  )
  const minioSub = sdk.SubContainer.of(
    effects,
    { imageId: 'minio' },
    buildMinioMounts(),
    'minio',
  )
  const mcSub = sdk.SubContainer.of(
    effects,
    { imageId: 'minio-client' },
    null,
    'minio-client',
  )

  const mcHost = buildConnectionUrl({
    protocol: 'http',
    username: config.minioEnv.MINIO_ROOT_USER,
    password: config.minioEnv.MINIO_ROOT_PASSWORD,
    authority: '127.0.0.1:9000',
  })

  return sdk.Daemons.of(effects)
    .addDaemon('postgres', {
      subcontainer: postgresSub,
      exec: {
        command: sdk.useEntrypoint(['-c', 'listen_addresses=127.0.0.1']),
        env: config.postgresEnv,
      },
      ready: {
        display: null,
        fn: async () =>
          hiddenReadiness(
            await commandSucceeded(() =>
              postgresSub.exec([
                'pg_isready',
                '-q',
                '-h',
                '127.0.0.1',
                '-d',
                POSTGRES_DB,
                '-U',
                POSTGRES_USER,
              ]),
            ),
            'PostgreSQL is ready',
            'PostgreSQL is not ready',
          ),
        gracePeriod: 120_000,
      },
      requires: [],
    })
    .addDaemon('redis', {
      subcontainer: redisSub,
      exec: {
        command: sdk.useEntrypoint([
          'sh',
          '-ec',
          'exec redis-server --bind 127.0.0.1 --appendonly yes --requirepass "$REDIS_PASSWORD"',
        ]),
        env: config.redisEnv,
      },
      ready: {
        display: null,
        fn: async () =>
          hiddenReadiness(
            await commandSucceeded(
              () =>
                redisSub.exec(['redis-cli', '-h', '127.0.0.1', 'ping'], {
                  env: {
                    REDISCLI_AUTH: config.redisEnv.REDIS_PASSWORD,
                  },
                }),
              'PONG',
            ),
            'Redis is ready',
            'Redis is not ready',
          ),
        gracePeriod: 60_000,
      },
      requires: [],
    })
    .addDaemon('minio', {
      subcontainer: minioSub,
      exec: {
        command: sdk.useEntrypoint([
          'server',
          '/data',
          '--address',
          '127.0.0.1:9000',
          '--console-address',
          '127.0.0.1:9001',
        ]),
        env: config.minioEnv,
      },
      ready: {
        display: null,
        fn: async () =>
          hiddenReadiness(
            await commandSucceeded(() =>
              minioSub.exec(['curl', '-fsS', MINIO_READINESS_URL]),
            ),
            'MinIO is ready',
            'MinIO is not ready',
          ),
        gracePeriod: 120_000,
      },
      requires: [],
    })
    .addOneshot('create-bucket', {
      subcontainer: mcSub,
      exec: {
        fn: async (subcontainer, signal) => {
          const commandAbort = new AbortController()
          const forwardAbort = () => commandAbort.abort(signal.reason)
          signal.addEventListener('abort', forwardAbort)

          try {
            if (signal.aborted) forwardAbort()
            signal.throwIfAborted()
            await subcontainer.execFail(
              ['mc', 'mb', '--ignore-existing', `local/${S3_BUCKET}`],
              { env: { MC_HOST_local: mcHost } },
              30_000,
              commandAbort,
            )

            signal.throwIfAborted()
            await subcontainer.execFail(
              ['mc', 'anonymous', 'set', 'none', `local/${S3_BUCKET}`],
              { env: { MC_HOST_local: mcHost } },
              30_000,
              commandAbort,
            )
            signal.throwIfAborted()
            return null
          } finally {
            signal.removeEventListener('abort', forwardAbort)
          }
        },
      },
      requires: ['minio'],
    })
    .addOneshot('migrate', {
      subcontainer: buzzSub,
      exec: {
        command: ['buzz-admin', 'migrate'],
        env: {
          DATABASE_URL: config.buzzEnv.DATABASE_URL,
        },
      },
      requires: ['postgres', 'create-bucket'],
    })
    .addDaemon('buzz', {
      subcontainer: buzzSub,
      exec: {
        command: sdk.useEntrypoint(),
        env: config.buzzEnv,
      },
      ready: {
        display: i18n('Buzz Relay'),
        fn: () =>
          checkCompositeHealth((url) =>
            commandSucceeded(() => buzzSub.exec(['curl', '-fsS', url])),
          ),
        gracePeriod: 180_000,
      },
      requires: ['postgres', 'redis', 'minio', 'create-bucket', 'migrate'],
    })
}

export const main = sdk.setupMain(async ({ effects }) => {
  const stateValidation = await readRuntimeStateConst(effects)
  const origins = await readWebInterfaceOriginsConst(effects)

  await reconcileBlockingTasks(effects, stateValidation, origins)

  if (stateValidation.kind === 'needs-state-recovery') {
    throw new Error('Buzz cannot start until stable state is recovered')
  }
  if (stateValidation.kind === 'needs-setup') {
    throw new Error('Buzz cannot start until initial setup is complete')
  }
  if (!canonicalUrlIsAvailable(stateValidation.state.primaryUrl, origins)) {
    throw new Error('Buzz cannot start until its canonical URL is restored')
  }

  return buildNativeStack(effects, buildRuntimeConfig(stateValidation))
})
