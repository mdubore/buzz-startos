import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
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
import {
  buildNativeStack,
  buildPairingProbeCommand,
  pairingProbeSucceeded,
} from '../startos/main.js'
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

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const RFC_SAMPLE_KEY = 'dGhlIHNhbXBsZSBub25jZQ=='
const RFC_SAMPLE_ACCEPT = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='

function websocketAccept(key: string): string {
  return createHash('sha1').update(`${key}${WEBSOCKET_GUID}`).digest('base64')
}

function pairingProbeKey(command: readonly string[]): string {
  const header = command.find((argument) =>
    argument.toLowerCase().startsWith('sec-websocket-key:'),
  )
  assert.ok(header, 'pairing probe must include Sec-WebSocket-Key')
  return header.slice(header.indexOf(':') + 1).trim()
}

function pairingHandshake(
  key = RFC_SAMPLE_KEY,
  additionalHeaders: readonly string[] = [],
): string {
  return [
    'HTTP/1.1 101 Switching Protocols',
    'Connection: Upgrade',
    'Upgrade: websocket',
    `Sec-WebSocket-Accept: ${websocketAccept(key)}`,
    ...additionalHeaders,
    '',
    '',
  ].join('\r\n')
}

const VALID_PAIRING_HANDSHAKE = pairingHandshake()

async function executeProbe(command: readonly string[]) {
  const [executable, ...args] = command
  if (executable === undefined) throw new Error('probe command is empty')

  return await new Promise<{
    exitCode: number | null
    stdout: Buffer
    stderr: Buffer
  }>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const watchdog = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('pairing probe exceeded test watchdog'))
    }, 5_000)

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.once('error', (error) => {
      clearTimeout(watchdog)
      reject(error)
    })
    child.once('close', (exitCode) => {
      clearTimeout(watchdog)
      resolve({
        exitCode,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      })
    })
  })
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
      display:
        entry.kind === 'daemon' || entry.kind === 'health'
          ? entry.ready.display
          : null,
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
        id: 'pairing',
        requires: [],
        imageId: 'buzz',
        name: 'pairing',
        mounts: [],
        command: ['/usr/local/bin/buzz-pair-relay'],
        env: { BUZZ_PAIR_RELAY_BIND_ADDR: '0.0.0.0:5000' },
        display: null,
        gracePeriod: 60_000,
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
      {
        kind: 'health',
        id: 'pairing-relay',
        requires: ['pairing'],
        imageId: null,
        name: null,
        mounts: [],
        command: 'function',
        env: null,
        display: 'Buzz Pairing Relay',
        gracePeriod: null,
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
  const buzz = stack.entries[7]
  assert.ok('subcontainer' in migrate)
  assert.ok('subcontainer' in buzz)
  assert.equal(migrate.subcontainer?.identity, buzz.subcontainer?.identity)
  assert.equal(
    prepareGitCache.subcontainer?.identity,
    buzz.subcontainer?.identity,
  )
})

test('pairing probe creates distinct deterministic 16-byte request keys', () => {
  const nonces = [Buffer.alloc(16, 0x11), Buffer.alloc(16, 0x22)]
  let nextNonce = 0
  const provideBytes = (size: number) => {
    assert.equal(size, 16)
    const nonce = nonces[nextNonce]
    assert.ok(nonce)
    nextNonce += 1
    return nonce
  }

  const first = buildPairingProbeCommand('127.0.0.1:5000', provideBytes)
  const second = buildPairingProbeCommand('127.0.0.1:5000', provideBytes)
  const firstKey = pairingProbeKey(first.command)
  const secondKey = pairingProbeKey(second.command)

  assert.notEqual(firstKey, secondKey)
  assert.deepEqual(Buffer.from(firstKey, 'base64'), nonces[0])
  assert.deepEqual(Buffer.from(secondKey, 'base64'), nonces[1])
  assert.equal(Buffer.from(firstKey, 'base64').length, 16)
  assert.equal(Buffer.from(secondKey, 'base64').length, 16)
  assert.equal(first.expectedAccept, websocketAccept(firstKey))
  assert.equal(second.expectedAccept, websocketAccept(secondKey))
})

test('pairing probe accepts only a complete RFC 6455 switching response', () => {
  assert.equal(
    pairingProbeSucceeded(
      { exitCode: 28, stdout: VALID_PAIRING_HANDSHAKE },
      RFC_SAMPLE_ACCEPT,
    ),
    true,
  )
  assert.equal(
    pairingProbeSucceeded(
      {
        exitCode: 0,
        stdout: [
          'HTTP/1.1 101 Switching Protocols',
          'upgrade: WebSocket',
          'connection: keep-alive, Upgrade',
          'sEc-WeBsOcKeT-aCcEpT: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
          '',
          '',
        ].join('\r\n'),
      },
      RFC_SAMPLE_ACCEPT,
    ),
    true,
  )
})

test('pairing probe rejects a canned accept for a different request key', () => {
  const requestKey = Buffer.alloc(16, 0x33).toString('base64')
  const expectedAccept = websocketAccept(requestKey)
  assert.notEqual(expectedAccept, RFC_SAMPLE_ACCEPT)

  assert.equal(
    pairingProbeSucceeded(
      { exitCode: 0, stdout: VALID_PAIRING_HANDSHAKE },
      expectedAccept,
    ),
    false,
  )
})

test('pairing probe rejects unsolicited extension negotiation', () => {
  for (const headers of [
    ['Sec-WebSocket-Extensions: permessage-deflate'],
    ['sEc-WeBsOcKeT-eXtEnSiOnS:'],
    [
      'Sec-WebSocket-Extensions: permessage-deflate',
      'sec-websocket-extensions:',
    ],
  ]) {
    assert.equal(
      pairingProbeSucceeded(
        { exitCode: 0, stdout: pairingHandshake(RFC_SAMPLE_KEY, headers) },
        RFC_SAMPLE_ACCEPT,
      ),
      false,
    )
  }
})

test('pairing probe rejects unsolicited subprotocol negotiation', () => {
  for (const headers of [
    ['Sec-WebSocket-Protocol: chat'],
    ['sEc-WeBsOcKeT-pRoToCoL:'],
    ['Sec-WebSocket-Protocol: chat', 'sec-websocket-protocol:'],
  ]) {
    assert.equal(
      pairingProbeSucceeded(
        { exitCode: 0, stdout: pairingHandshake(RFC_SAMPLE_KEY, headers) },
        RFC_SAMPLE_ACCEPT,
      ),
      false,
    )
  }
})

test('pairing probe rejects disallowed exits despite valid headers', () => {
  assert.equal(
    pairingProbeSucceeded(
      { exitCode: 7, stdout: VALID_PAIRING_HANDSHAKE },
      RFC_SAMPLE_ACCEPT,
    ),
    false,
  )
  assert.equal(
    pairingProbeSucceeded(
      { exitCode: null, stdout: VALID_PAIRING_HANDSHAKE },
      RFC_SAMPLE_ACCEPT,
    ),
    false,
  )
})

test('pairing probe rejects an HTTP/1.0 switching response', () => {
  assert.equal(
    pairingProbeSucceeded(
      {
        exitCode: 0,
        stdout: VALID_PAIRING_HANDSHAKE.replace('HTTP/1.1', 'HTTP/1.0'),
      },
      RFC_SAMPLE_ACCEPT,
    ),
    false,
  )
})

test('pairing probe rejects wrong or incomplete switching responses', () => {
  for (const stdout of [
    VALID_PAIRING_HANDSHAKE.replace(
      's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ),
    VALID_PAIRING_HANDSHAKE.replace(
      'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n',
      '',
    ),
    VALID_PAIRING_HANDSHAKE.replace(
      'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n',
      'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n',
    ),
    VALID_PAIRING_HANDSHAKE.replace('Connection: Upgrade\r\n', ''),
    VALID_PAIRING_HANDSHAKE.replace('Upgrade: websocket\r\n', ''),
    VALID_PAIRING_HANDSHAKE.replace('101 Switching Protocols', '101 Accepted'),
    'HTTP/1.1 101 Switching Protocols\r\nmalformed\r\n\r\n',
    'HTTP/1.1 101 Switching Protocols\r\n',
    '',
  ]) {
    assert.equal(
      pairingProbeSucceeded({ exitCode: 0, stdout }, RFC_SAMPLE_ACCEPT),
      false,
    )
  }
})

test('pairing probe rejects HTTP admission and routing failures', () => {
  for (const status of [400, 404, 503]) {
    assert.equal(
      pairingProbeSucceeded(
        {
          exitCode: 0,
          stdout: `HTTP/1.1 ${status} Rejected\r\nContent-Length: 0\r\n\r\n`,
        },
        RFC_SAMPLE_ACCEPT,
      ),
      false,
    )
  }
  assert.equal(
    pairingProbeSucceeded({ exitCode: 7, stdout: '' }, RFC_SAMPLE_ACCEPT),
    false,
  )
})

test(
  'real pairing probe exercises WebSocket upgrade admission',
  { timeout: 15_000 },
  async () => {
    let responseStatus = 101
    const requests: {
      method: string | undefined
      url: string | undefined
      httpVersion: string
      connection: string | undefined
      upgrade: string | undefined
      version: string | undefined
      key: string | undefined
    }[] = []
    const sockets = new Set<import('node:net').Socket>()
    const server = createServer()
    server.on('connection', (socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
    })
    server.on('upgrade', (request, socket) => {
      const key = request.headers['sec-websocket-key']
      requests.push({
        method: request.method,
        url: request.url,
        httpVersion: request.httpVersion,
        connection: request.headers.connection,
        upgrade: request.headers.upgrade,
        version: request.headers['sec-websocket-version'],
        key,
      })

      if (responseStatus === 101) {
        assert.equal(typeof key, 'string')
        socket.write(pairingHandshake(key))
        return
      }

      socket.end(
        `HTTP/1.1 ${responseStatus} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      )
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = server.address()
      assert.ok(address !== null && typeof address === 'object')
      const authority = `127.0.0.1:${address.port}`

      for (const status of [101, 101, 400, 404, 503]) {
        responseStatus = status
        const probe = buildPairingProbeCommand(authority)
        const result = await executeProbe(probe.command)

        assert.equal(
          pairingProbeSucceeded(result, probe.expectedAccept),
          status === 101,
        )
        if (status === 101) {
          assert.notEqual(result.exitCode, 0)
        }
      }

      assert.equal(requests.length, 5)
      for (const request of requests) {
        assert.deepEqual(
          {
            method: request.method,
            url: request.url,
            httpVersion: request.httpVersion,
            connection: request.connection,
            upgrade: request.upgrade,
            version: request.version,
          },
          {
            method: 'GET',
            url: '/',
            httpVersion: '1.1',
            connection: 'Upgrade',
            upgrade: 'websocket',
            version: '13',
          },
        )
        const key = request.key
        assert.ok(typeof key === 'string')
        assert.equal(Buffer.from(key, 'base64').length, 16)
      }
      const requestKeys = requests.map(({ key }) => key)
      assert.equal(new Set(requestKeys).size, requestKeys.length)
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        )
      })
    }
  },
)

test('pairing readiness requires a valid WebSocket upgrade handshake', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const pairing = stack.entries.find((entry) => entry.id === 'pairing')
  assert.equal(pairing?.kind, 'daemon')
  if (pairing?.kind !== 'daemon' || pairing.subcontainer === null) {
    throw new Error('pairing must be a container daemon')
  }

  const calls: string[][] = []
  let responseStatus = 101
  Object.defineProperty(pairing.subcontainer, 'exec', {
    configurable: true,
    value: async (command: string[]) => {
      calls.push(command)
      const key = pairingProbeKey(command)
      return responseStatus === 101
        ? { exitCode: 28, stdout: pairingHandshake(key) }
        : {
            exitCode: 0,
            stdout: `HTTP/1.1 ${responseStatus} Rejected\r\nContent-Length: 0\r\n\r\n`,
          }
    },
  })

  assert.equal((await pairing.ready.fn()).result, 'success')
  responseStatus = 400
  assert.equal((await pairing.ready.fn()).result, 'failure')

  assert.equal(calls.length, 2)
  assert.notEqual(calls[0], calls[1])
  const keys = calls.map(pairingProbeKey)
  assert.notEqual(keys[0], keys[1])
  for (const [command, key] of calls.map(
    (command) => [command, pairingProbeKey(command)] as const,
  )) {
    assert.deepEqual(command, [
      'curl',
      '--silent',
      '--show-error',
      '--http1.1',
      '--max-time',
      '2',
      '--dump-header',
      '-',
      '--output',
      '/dev/null',
      '--header',
      'Connection: Upgrade',
      '--header',
      'Upgrade: websocket',
      '--header',
      'Sec-WebSocket-Version: 13',
      '--header',
      `Sec-WebSocket-Key: ${key}`,
      'http://127.0.0.1:5000/',
    ])
    assert.equal(Buffer.from(key, 'base64').length, 16)
  }
})

test('ongoing pairing health reports fixed localized success and failure', async () => {
  const stack = buildNativeStack(null!, RUNTIME_CONFIG)
  const pairing = stack.entries.find((entry) => entry.id === 'pairing')
  const health = stack.entries.find((entry) => entry.id === 'pairing-relay')
  assert.equal(pairing?.kind, 'daemon')
  assert.equal(health?.kind, 'health')
  if (
    pairing?.kind !== 'daemon' ||
    pairing.subcontainer === null ||
    health?.kind !== 'health'
  ) {
    throw new Error('pairing daemon and health check must exist')
  }

  const calls: string[][] = []
  let responseStatus = 101
  Object.defineProperty(pairing.subcontainer, 'exec', {
    configurable: true,
    value: async (command: string[]) => {
      calls.push(command)
      const key = pairingProbeKey(command)
      return responseStatus === 101
        ? { exitCode: 28, stdout: pairingHandshake(key) }
        : {
            exitCode: 0,
            stdout: `HTTP/1.1 ${responseStatus} Rejected\r\nContent-Length: 0\r\n\r\n`,
          }
    },
  })

  assert.deepEqual(await health.ready.fn(), {
    result: 'success',
    message: 'Buzz Pairing Relay is ready',
  })
  responseStatus = 503
  assert.deepEqual(await health.ready.fn(), {
    result: 'failure',
    message: 'Buzz Pairing Relay is not ready',
  })
  assert.equal(calls.length, 2)
  assert.notEqual(calls[0], calls[1])
  const keys = calls.map(pairingProbeKey)
  assert.notEqual(keys[0], keys[1])
  for (const key of keys) {
    assert.equal(Buffer.from(key, 'base64').length, 16)
  }
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
