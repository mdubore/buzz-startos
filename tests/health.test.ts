import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUZZ_READINESS_URL,
  MINIO_LIVENESS_URL,
  MINIO_READINESS_URL,
  checkCompositeHealth,
} from '../startos/runtime/health.js'
import {
  buildBuzzMounts,
  buildMinioMounts,
  buildPostgresMounts,
  buildRedisMounts,
} from '../startos/runtime/mounts.js'
import { buildNativeStack } from '../startos/main.js'
import type { RuntimeConfig } from '../startos/runtime/config.js'

const RUNTIME_CONFIG: RuntimeConfig = {
  postgresEnv: {
    POSTGRES_DB: 'buzz',
    POSTGRES_USER: 'buzz',
    POSTGRES_PASSWORD: 'postgres-secret',
    POSTGRES_INITDB_ARGS: '--auth-host=scram-sha-256',
    PGDATA: '/var/lib/postgresql/data',
  },
  redisEnv: {
    REDIS_PASSWORD: 'redis-secret',
  },
  minioEnv: {
    MINIO_ROOT_USER: 'access@:/%',
    MINIO_ROOT_PASSWORD: 'secret@:/%',
  },
  buzzEnv: {
    DATABASE_URL: 'postgres://buzz:postgres-secret@127.0.0.1:5432/buzz',
    REDIS_URL: 'redis://:redis-secret@127.0.0.1:6379',
    RELAY_URL: 'wss://buzz.example',
  },
}

test('composite health succeeds only after checking Buzz readiness and MinIO liveness', async () => {
  const checkedUrls: string[] = []

  const result = await checkCompositeHealth(async (url) => {
    checkedUrls.push(url)
    return true
  })

  assert.equal(result.result, 'success')
  assert.deepEqual(checkedUrls, [BUZZ_READINESS_URL, MINIO_LIVENESS_URL])
  assert.equal(BUZZ_READINESS_URL, 'http://127.0.0.1:8080/_readiness')
  assert.equal(MINIO_LIVENESS_URL, 'http://127.0.0.1:9000/minio/health/live')
})

test('composite health fails when either required probe fails', async () => {
  for (const failedUrl of [BUZZ_READINESS_URL, MINIO_LIVENESS_URL]) {
    const result = await checkCompositeHealth(async (url) => url !== failedUrl)

    assert.equal(result.result, 'failure')
  }
})

test('composite health sanitizes thrown probe errors', async () => {
  const credential = 'credential-like-sensitive-value'

  const result = await checkCompositeHealth(async () => {
    throw new Error(`probe rejected ${credential}`)
  })

  assert.equal(result.result, 'failure')
  assert.equal(JSON.stringify(result).includes(credential), false)
})

test('MinIO dependency readiness stays separate from ongoing liveness', async () => {
  const checkedUrls: string[] = []

  await checkCompositeHealth(async (url) => {
    checkedUrls.push(url)
    return true
  })

  assert.equal(MINIO_READINESS_URL, 'http://127.0.0.1:9000/minio/health/ready')
  assert.equal(checkedUrls.includes(MINIO_READINESS_URL), false)
})

test('stateful service mounts use overlay-compatible volume mappings', () => {
  assert.deepEqual(buildPostgresMounts().build(), [
    {
      mountpoint: '/var/lib/postgresql',
      options: {
        type: 'volume',
        volumeId: 'postgres',
        subpath: null,
        readonly: false,
        filetype: 'directory',
        idmap: [],
      },
    },
  ])
  assert.deepEqual(buildRedisMounts().build(), [
    {
      mountpoint: '/data',
      options: {
        type: 'volume',
        volumeId: 'redis',
        subpath: null,
        readonly: false,
        filetype: 'directory',
        idmap: [],
      },
    },
  ])
  assert.deepEqual(buildMinioMounts().build(), [
    {
      mountpoint: '/data',
      options: {
        type: 'volume',
        volumeId: 'media',
        subpath: null,
        readonly: false,
        filetype: 'directory',
        idmap: [],
      },
    },
  ])
  assert.deepEqual(buildBuzzMounts().build(), [
    {
      mountpoint: '/data/git',
      options: {
        type: 'volume',
        volumeId: 'git-cache',
        subpath: null,
        readonly: false,
        filetype: 'directory',
        idmap: [],
      },
    },
  ])
})

function normalizeCommand(command: unknown) {
  if (Array.isArray(command)) return command
  if (
    typeof command === 'object' &&
    command !== null &&
    'USE_ENTRYPOINT' in command &&
    'overridCmd' in command
  ) {
    return { entrypoint: command.overridCmd ?? null }
  }
  return command
}

function subcontainerName(subcontainer: unknown) {
  if (
    typeof subcontainer !== 'object' ||
    subcontainer === null ||
    !('name' in subcontainer)
  ) {
    return null
  }
  return subcontainer.name
}

function builtMounts(subcontainer: unknown) {
  if (
    typeof subcontainer !== 'object' ||
    subcontainer === null ||
    !('mounts' in subcontainer) ||
    typeof subcontainer.mounts !== 'object' ||
    subcontainer.mounts === null ||
    !('build' in subcontainer.mounts) ||
    typeof subcontainer.mounts.build !== 'function'
  ) {
    return []
  }

  return Reflect.apply(subcontainer.mounts.build, subcontainer.mounts, [])
}

test('native stack records the exact lazy subcontainers and dependency order', () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)

  assert.deepEqual(
    stack.entries.map((entry) => ({
      kind: entry.kind,
      id: entry.id,
      requires: [...entry.requires],
      imageId:
        'subcontainer' in entry ? (entry.subcontainer?.imageId ?? null) : null,
      name:
        'subcontainer' in entry && entry.subcontainer !== null
          ? subcontainerName(entry.subcontainer)
          : null,
      mounts:
        'subcontainer' in entry && entry.subcontainer !== null
          ? builtMounts(entry.subcontainer)
          : [],
      command:
        'exec' in entry && 'command' in entry.exec
          ? normalizeCommand(entry.exec.command)
          : 'function',
      env:
        'exec' in entry && 'env' in entry.exec
          ? (entry.exec.env ?? null)
          : null,
      display: entry.kind === 'daemon' ? entry.ready.display : null,
      gracePeriod:
        entry.kind === 'daemon' ? (entry.ready.gracePeriod ?? null) : null,
    })),
    [
      {
        kind: 'daemon',
        id: 'postgres',
        requires: [],
        imageId: 'postgres',
        name: 'postgres',
        mounts: buildPostgresMounts().build(),
        command: {
          entrypoint: ['-c', 'listen_addresses=127.0.0.1'],
        },
        env: RUNTIME_CONFIG.postgresEnv,
        display: null,
        gracePeriod: 120_000,
      },
      {
        kind: 'daemon',
        id: 'redis',
        requires: [],
        imageId: 'redis',
        name: 'redis',
        mounts: buildRedisMounts().build(),
        command: {
          entrypoint: [
            'sh',
            '-ec',
            'exec redis-server --bind 127.0.0.1 --appendonly yes --requirepass "$REDIS_PASSWORD"',
          ],
        },
        env: RUNTIME_CONFIG.redisEnv,
        display: null,
        gracePeriod: 60_000,
      },
      {
        kind: 'daemon',
        id: 'minio',
        requires: [],
        imageId: 'minio',
        name: 'minio',
        mounts: buildMinioMounts().build(),
        command: {
          entrypoint: [
            'server',
            '/data',
            '--address',
            '127.0.0.1:9000',
            '--console-address',
            '127.0.0.1:9001',
          ],
        },
        env: RUNTIME_CONFIG.minioEnv,
        display: null,
        gracePeriod: 120_000,
      },
      {
        kind: 'oneshot',
        id: 'create-bucket',
        requires: ['minio'],
        imageId: 'minio-client',
        name: 'minio-client',
        mounts: [],
        command: 'function',
        env: null,
        display: null,
        gracePeriod: null,
      },
      {
        kind: 'oneshot',
        id: 'prepare-git-cache',
        requires: [],
        imageId: 'buzz',
        name: 'buzz',
        mounts: buildBuzzMounts().build(),
        command: ['chown', '-R', 'buzz:buzz', '/data/git'],
        env: null,
        display: null,
        gracePeriod: null,
      },
      {
        kind: 'oneshot',
        id: 'migrate',
        requires: ['postgres', 'create-bucket', 'prepare-git-cache'],
        imageId: 'buzz',
        name: 'buzz',
        mounts: buildBuzzMounts().build(),
        command: ['buzz-admin', 'migrate'],
        env: {
          DATABASE_URL: RUNTIME_CONFIG.buzzEnv.DATABASE_URL,
        },
        display: null,
        gracePeriod: null,
      },
      {
        kind: 'daemon',
        id: 'buzz',
        requires: [
          'postgres',
          'redis',
          'minio',
          'create-bucket',
          'prepare-git-cache',
          'migrate',
        ],
        imageId: 'buzz',
        name: 'buzz',
        mounts: buildBuzzMounts().build(),
        command: { entrypoint: null },
        env: RUNTIME_CONFIG.buzzEnv,
        display: 'Buzz Relay',
        gracePeriod: 180_000,
      },
    ],
  )

  const prepareGitCache = stack.entries[4]
  assert.equal(prepareGitCache.kind, 'oneshot')
  if (prepareGitCache.kind !== 'oneshot' || !('user' in prepareGitCache.exec)) {
    throw new Error('prepare-git-cache must be a command oneshot')
  }
  assert.equal(prepareGitCache.exec.user, 'root')

  const migrate = stack.entries[5]
  const buzz = stack.entries[6]
  assert.ok('subcontainer' in migrate)
  assert.ok('subcontainer' in buzz)
  assert.equal(migrate.subcontainer?.identity, buzz.subcontainer?.identity)
  assert.equal(
    prepareGitCache.subcontainer?.identity,
    buzz.subcontainer?.identity,
  )
})

test('bucket creation uses sequential secret-free argv with scoped encoded env', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const createBucket = stack.entries[3]
  assert.equal(createBucket.kind, 'oneshot')
  if (createBucket.kind !== 'oneshot' || !('fn' in createBucket.exec)) {
    throw new Error('create-bucket must be a function oneshot')
  }

  const calls: {
    command: string[]
    options: { env?: Record<string, string | undefined> } | undefined
    timeoutMs: number | null | undefined
    abort: AbortController | undefined
  }[] = []
  const recordingSubcontainer = {
    async execFail(
      command: string[],
      options?: { env?: Record<string, string | undefined> },
      timeoutMs?: number | null,
      abort?: AbortController,
    ) {
      calls.push({ command, options, timeoutMs, abort })
      return { stdout: '', stderr: '' }
    },
  }

  const result = await Reflect.apply(createBucket.exec.fn, undefined, [
    recordingSubcontainer,
    new AbortController().signal,
  ])

  const mcHost = 'http://access%40%3A%2F%25:secret%40%3A%2F%25@127.0.0.1:9000'
  assert.equal(result, null)
  assert.deepEqual(
    calls.map(({ command, options }) => ({ command, options })),
    [
      {
        command: ['mc', 'mb', '--ignore-existing', 'local/buzz-media'],
        options: { env: { MC_HOST_local: mcHost } },
      },
      {
        command: ['mc', 'anonymous', 'set', 'none', 'local/buzz-media'],
        options: { env: { MC_HOST_local: mcHost } },
      },
    ],
  )
  assert.deepEqual(
    calls.map(({ timeoutMs }) => timeoutMs),
    [30_000, 30_000],
  )
  assert.ok(calls[0]?.abort instanceof AbortController)
  assert.ok(calls[1]?.abort instanceof AbortController)
  assert.notEqual(calls[0]?.abort, calls[1]?.abort)
  assert.notEqual(calls[0]?.options?.env, calls[1]?.options?.env)
  assert.equal(
    JSON.stringify(calls.map(({ command }) => command)).includes('access'),
    false,
  )
  assert.equal(
    JSON.stringify(calls.map(({ command }) => command)).includes('secret'),
    false,
  )
})

test('bucket cancellation after the first command prevents the ACL mutation', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const createBucket = stack.entries[3]
  if (createBucket.kind !== 'oneshot' || !('fn' in createBucket.exec)) {
    throw new Error('create-bucket must be a function oneshot')
  }

  const cancellation = new AbortController()
  const commands: string[][] = []
  let forwardedAbort: AbortController | undefined
  const recordingSubcontainer = {
    async execFail(
      command: string[],
      _options: unknown,
      timeoutMs: number | null | undefined,
      abort: AbortController | undefined,
    ) {
      commands.push(command)
      assert.equal(timeoutMs, 30_000)
      forwardedAbort = abort
      cancellation.abort()
      assert.equal(abort?.signal.aborted, true)
      await Promise.resolve()
      return { stdout: '', stderr: '' }
    },
  }

  await assert.rejects(
    Reflect.apply(createBucket.exec.fn, undefined, [
      recordingSubcontainer,
      cancellation.signal,
    ]),
    { name: 'AbortError' },
  )
  assert.deepEqual(commands, [
    ['mc', 'mb', '--ignore-existing', 'local/buzz-media'],
  ])
  assert.ok(forwardedAbort instanceof AbortController)
})

test('bucket cancellation normalizes a killed command rejection', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const createBucket = stack.entries[3]
  if (createBucket.kind !== 'oneshot' || !('fn' in createBucket.exec)) {
    throw new Error('create-bucket must be a function oneshot')
  }

  const cancellation = new AbortController()
  const commands: string[][] = []
  const commandFailure = Object.assign(new Error('killed by cancellation'), {
    name: 'ExitError',
  })
  const rejectingSubcontainer = {
    async execFail(
      command: string[],
      _options: unknown,
      _timeoutMs: number | null | undefined,
      abort: AbortController | undefined,
    ) {
      commands.push(command)
      cancellation.abort()
      assert.equal(abort?.signal.aborted, true)
      throw commandFailure
    },
  }

  await assert.rejects(
    Reflect.apply(createBucket.exec.fn, undefined, [
      rejectingSubcontainer,
      cancellation.signal,
    ]),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.name, 'AbortError')
      assert.equal(String(error).includes('access@:/%'), false)
      assert.equal(String(error).includes('secret@:/%'), false)
      return true
    },
  )
  assert.deepEqual(commands, [
    ['mc', 'mb', '--ignore-existing', 'local/buzz-media'],
  ])
})

test('bucket cancellation reaches a listener registered after command startup', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const createBucket = stack.entries[3]
  if (createBucket.kind !== 'oneshot' || !('fn' in createBucket.exec)) {
    throw new Error('create-bucket must be a function oneshot')
  }

  const cancellation = new AbortController()
  let releaseRegistration!: () => void
  let markSecondCommandStarted!: () => void
  const registrationGate = new Promise<void>((resolve) => {
    releaseRegistration = resolve
  })
  const secondCommandStarted = new Promise<void>((resolve) => {
    markSecondCommandStarted = resolve
  })
  let calls = 0
  let lateAbortObserved = false
  let mutationRan = false
  const delayedSubcontainer = {
    async execFail(
      _command: string[],
      _options: unknown,
      _timeoutMs: number | null | undefined,
      abort: AbortController | undefined,
    ) {
      calls += 1
      if (calls === 1) return { stdout: '', stderr: '' }

      markSecondCommandStarted()
      await registrationGate
      abort?.signal.addEventListener('abort', () => {
        lateAbortObserved = true
      })
      await Promise.resolve()
      if (!lateAbortObserved) mutationRan = true
      return { stdout: '', stderr: '' }
    },
  }

  const rejected = assert.rejects(
    Reflect.apply(createBucket.exec.fn, undefined, [
      delayedSubcontainer,
      cancellation.signal,
    ]),
    { name: 'AbortError' },
  )
  await secondCommandStarted
  cancellation.abort()
  releaseRegistration()
  await rejected

  assert.equal(lateAbortObserved, true)
  assert.equal(mutationRan, false)
})

test('bucket setup preserves a genuine MinIO client failure', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const createBucket = stack.entries[3]
  if (createBucket.kind !== 'oneshot' || !('fn' in createBucket.exec)) {
    throw new Error('create-bucket must be a function oneshot')
  }

  const commandFailure = Object.assign(new Error('mc failed'), {
    name: 'ExitError',
  })
  const failingSubcontainer = {
    async execFail() {
      throw commandFailure
    },
  }

  await assert.rejects(
    Reflect.apply(createBucket.exec.fn, undefined, [
      failingSubcontainer,
      new AbortController().signal,
    ]),
    (error: unknown) => error === commandFailure,
  )
})

test('an already-aborted bucket oneshot never invokes MinIO client', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const createBucket = stack.entries[3]
  if (createBucket.kind !== 'oneshot' || !('fn' in createBucket.exec)) {
    throw new Error('create-bucket must be a function oneshot')
  }

  const cancellation = new AbortController()
  cancellation.abort()
  let calls = 0
  const recordingSubcontainer = {
    async execFail() {
      calls += 1
      return { stdout: '', stderr: '' }
    },
  }

  await assert.rejects(
    Reflect.apply(createBucket.exec.fn, undefined, [
      recordingSubcontainer,
      cancellation.signal,
    ]),
    { name: 'AbortError' },
  )
  assert.equal(calls, 0)
})

test('Redis readiness requires PONG and keeps its password out of argv', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const redis = stack.entries[1]
  assert.equal(redis.kind, 'daemon')
  if (redis.kind !== 'daemon' || redis.subcontainer === null) {
    throw new Error('redis must be a container daemon')
  }

  let response = {
    exitCode: 0,
    exitSignal: null,
    stdout: 'AUTH failed\nNOAUTH Authentication required.\n',
    stderr: '',
  }
  const calls: {
    command: string[]
    options: { env?: Record<string, string | undefined> } | undefined
  }[] = []
  Object.defineProperty(redis.subcontainer, 'exec', {
    configurable: true,
    value: async (
      command: string[],
      options?: { env?: Record<string, string | undefined> },
    ) => {
      calls.push({ command, options })
      return response
    },
  })

  assert.equal((await redis.ready.fn()).result, 'failure')

  response = { ...response, stdout: 'PONG\n' }
  assert.equal((await redis.ready.fn()).result, 'success')
  assert.deepEqual(calls, [
    {
      command: ['redis-cli', '-h', '127.0.0.1', 'ping'],
      options: {
        env: { REDISCLI_AUTH: RUNTIME_CONFIG.redisEnv.REDIS_PASSWORD },
      },
    },
    {
      command: ['redis-cli', '-h', '127.0.0.1', 'ping'],
      options: {
        env: { REDISCLI_AUTH: RUNTIME_CONFIG.redisEnv.REDIS_PASSWORD },
      },
    },
  ])
  assert.equal(
    JSON.stringify(calls.map(({ command }) => command)).includes(
      'redis-secret',
    ),
    false,
  )
})
