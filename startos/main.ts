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

function createLateDeliveringAbortController(parentSignal: AbortSignal) {
  const controller = new AbortController()
  const commandSignal = controller.signal
  const nativeAddEventListener =
    commandSignal.addEventListener.bind(commandSignal)

  // SDK 2.0.9 registers after async container setup and misses an earlier abort.
  Object.defineProperty(commandSignal, 'addEventListener', {
    configurable: true,
    value: ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      nativeAddEventListener(type, listener, options)
      if (type !== 'abort' || !commandSignal.aborted) return

      queueMicrotask(() => {
        const event = new Event('abort')
        if (typeof listener === 'function') {
          listener.call(commandSignal, event)
        } else {
          listener.handleEvent(event)
        }
      })
    }) satisfies AbortSignal['addEventListener'],
  })

  const forwardAbort = () => controller.abort(parentSignal.reason)
  parentSignal.addEventListener('abort', forwardAbort, { once: true })
  if (parentSignal.aborted) forwardAbort()

  return {
    controller,
    dispose: () => parentSignal.removeEventListener('abort', forwardAbort),
  }
}

async function runAbortableCommand(
  parentSignal: AbortSignal,
  run: (controller: AbortController) => Promise<unknown>,
) {
  parentSignal.throwIfAborted()
  const linked = createLateDeliveringAbortController(parentSignal)

  try {
    try {
      await run(linked.controller)
    } catch (error) {
      parentSignal.throwIfAborted()
      throw error
    }
    parentSignal.throwIfAborted()
  } finally {
    linked.dispose()
  }
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
          await runAbortableCommand(signal, (commandAbort) =>
            subcontainer.execFail(
              ['mc', 'mb', '--ignore-existing', `local/${S3_BUCKET}`],
              { env: { MC_HOST_local: mcHost } },
              30_000,
              commandAbort,
            ),
          )
          await runAbortableCommand(signal, (commandAbort) =>
            subcontainer.execFail(
              ['mc', 'anonymous', 'set', 'none', `local/${S3_BUCKET}`],
              { env: { MC_HOST_local: mcHost } },
              30_000,
              commandAbort,
            ),
          )
          return null
        },
      },
      requires: ['minio'],
    })
    .addOneshot('prepare-git-cache', {
      subcontainer: buzzSub,
      exec: {
        command: ['chown', 'buzz:buzz', '/data/git'],
        user: 'root',
      },
      requires: [],
    })
    .addOneshot('migrate', {
      subcontainer: buzzSub,
      exec: {
        command: ['buzz-admin', 'migrate'],
        env: {
          DATABASE_URL: config.buzzEnv.DATABASE_URL,
        },
      },
      requires: ['postgres', 'create-bucket', 'prepare-git-cache'],
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
      requires: [
        'postgres',
        'redis',
        'minio',
        'create-bucket',
        'prepare-git-cache',
        'migrate',
      ],
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
