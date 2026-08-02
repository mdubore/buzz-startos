import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { FileHelper, T } from '@start9labs/start-sdk'
import { nip19 } from 'nostr-tools'

import {
  projectForRuntime,
  readRuntimeStateConstFrom,
  runtimeStateEqual,
  validateStoredState,
  type CompleteStore,
  type RuntimeStateValidation,
} from '../startos/domain/state-validation.js'
import {
  parseStoredStateText,
  type StoredStateRead,
} from '../startos/fileModels/read-store.js'
import {
  createStoreMutationQueue,
  storeRawText,
  type RawStoreText,
  type RawStoredState,
} from '../startos/fileModels/store.json.js'
import {
  seedSecretsForInit,
  type SeedSecretsDependencies,
} from '../startos/init/seed-secrets.js'
import type { GeneratedSecrets } from '../startos/domain/secrets.js'

const VALID_SECRETS = {
  schemaVersion: 1 as const,
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
}

const COMPLETE_STORE: CompleteStore = {
  ...VALID_SECRETS,
  ownerPubkeyHex: '11'.repeat(32),
  primaryUrl: 'https://buzz.example',
  pairingRelayUrl: 'wss://pair.buzz.example',
  lastMembershipMutationUnixSecond: 42,
}

const GENERATED: GeneratedSecrets = {
  postgresPassword: 'G'.repeat(32),
  redisPassword: 'H'.repeat(32),
  s3AccessKey: 'I'.repeat(24),
  s3SecretKey: 'J'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}2`,
  gitHookHmacSecretHex: 'cd'.repeat(32),
}

const STABLE_FIELDS = [
  'schemaVersion',
  'postgresPassword',
  'redisPassword',
  's3AccessKey',
  's3SecretKey',
  'relayPrivateKeyHex',
  'gitHookHmacSecretHex',
] as const

function parsed(value: RawStoredState): StoredStateRead {
  return { kind: 'parsed', value }
}

function assertRecovery(
  input: StoredStateRead,
  expectedIssues?: readonly string[],
): string[] {
  const result = validateStoredState(input)

  assert.equal(result.kind, 'needs-state-recovery')
  if (result.kind !== 'needs-state-recovery') {
    throw new Error('Expected state recovery')
  }
  if (expectedIssues) {
    assert.deepEqual(result.issues, expectedIssues)
  }
  return result.issues
}

function makeEffects(onRetry?: () => void): T.Effects {
  return {
    isInContext: true,
    constRetry: onRetry,
    onLeaveContext: () => {},
  } as unknown as T.Effects
}

async function withTimeout<TValue>(
  promise: Promise<TValue>,
  message: string,
): Promise<TValue> {
  let timeout: NodeJS.Timeout | undefined
  const expired = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), 2_000)
  })

  try {
    return await Promise.race([promise, expired])
  } finally {
    clearTimeout(timeout)
  }
}

test('raw text wraps an existing empty file in a truthy object', () => {
  const raw = storeRawText.readData('')

  assert.deepEqual(raw, { text: '' })
  assert.ok(raw)
  assert.deepEqual(storeRawText.validate(raw), { text: '' })
})

test('safe parsing distinguishes missing, invalid JSON, and invalid roots', () => {
  assert.deepEqual(parseStoredStateText(null), { kind: 'missing' })

  for (const text of ['', '{"schemaVersion":', 'not-json-sensitive-value']) {
    assert.deepEqual(parseStoredStateText(text), {
      kind: 'unreadable',
      issue: 'invalid-json',
    })
  }

  for (const text of ['null', '[]', '"text"', '1', 'true']) {
    assert.deepEqual(parseStoredStateText(text), {
      kind: 'unreadable',
      issue: 'invalid-root',
    })
  }
})

test('missing, empty, truncated, invalid, and non-object state require recovery', () => {
  const reads: StoredStateRead[] = [
    { kind: 'missing' },
    parseStoredStateText(''),
    parseStoredStateText('{"postgresPassword":'),
    parseStoredStateText('sensitive-invalid-json'),
    parseStoredStateText('[]'),
  ]

  for (const read of reads) {
    assert.doesNotThrow(() => assertRecovery(read, ['store.json']))
  }
})

test('a fully valid record returns normalized ready state', () => {
  assert.deepEqual(validateStoredState(parsed({ ...COMPLETE_STORE })), {
    kind: 'ready',
    state: COMPLETE_STORE,
  })
})

test('pairing relay URL is optional for backward compatibility', () => {
  const withoutPairingUrl = { ...COMPLETE_STORE }
  delete withoutPairingUrl.pairingRelayUrl

  assert.deepEqual(validateStoredState(parsed(withoutPairingUrl)), {
    kind: 'ready',
    state: withoutPairingUrl,
  })
})

test('present pairing relay URL must already use canonical WebSocket form', () => {
  for (const pairingRelayUrl of [
    'wss://PAIR.BUZZ.EXAMPLE/',
    'https://pair.buzz.example',
    'wss://pair.buzz.example/path',
    null,
  ]) {
    assertRecovery(parsed({ ...COMPLETE_STORE, pairingRelayUrl }), [
      'pairingRelayUrl',
    ])
  }
})

test('valid stable secrets with either setup field absent need setup', () => {
  for (const setup of [
    {},
    { ownerPubkeyHex: COMPLETE_STORE.ownerPubkeyHex },
    { primaryUrl: COMPLETE_STORE.primaryUrl },
  ]) {
    assert.deepEqual(
      validateStoredState(parsed({ ...VALID_SECRETS, ...setup })),
      {
        kind: 'needs-setup',
        state: VALID_SECRETS,
      },
    )
  }
})

test('every missing or malformed stable field requires recovery', () => {
  const malformed: Record<(typeof STABLE_FIELDS)[number], unknown> = {
    schemaVersion: 2,
    postgresPassword: 'short',
    redisPassword: `${'R'.repeat(31)}!`,
    s3AccessKey: 'A'.repeat(23),
    s3SecretKey: 'S'.repeat(49),
    relayPrivateKeyHex: 'AB'.repeat(32),
    gitHookHmacSecretHex: 'xy'.repeat(32),
  }

  for (const field of STABLE_FIELDS) {
    const missing = { ...COMPLETE_STORE } as RawStoredState
    delete missing[field]
    assertRecovery(parsed(missing), [field])

    assertRecovery(parsed({ ...COMPLETE_STORE, [field]: malformed[field] }), [
      field,
    ])
  }
})

test('zero and out-of-range relay private keys require recovery', () => {
  for (const relayPrivateKeyHex of [
    '0'.repeat(64),
    'f'.repeat(64),
    'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
  ]) {
    assertRecovery(parsed({ ...COMPLETE_STORE, relayPrivateKeyHex }), [
      'relayPrivateKeyHex',
    ])
  }
})

test('only undefined owner and URL fields are treated as unconfigured', () => {
  for (const [field, values] of [
    ['ownerPubkeyHex', [null, '', false, 0, 'not-a-public-key']],
    ['primaryUrl', [null, '', false, 0, 'not-a-url']],
  ] as const) {
    for (const value of values) {
      const result = validateStoredState(
        parsed({ ...VALID_SECRETS, [field]: value }),
      )

      assert.equal(result.kind, 'needs-state-recovery')
      if (result.kind === 'needs-state-recovery') {
        assert.deepEqual(result.issues, [field])
      }
    }
  }
})

test('present owner and URL values must already use canonical stored form', () => {
  for (const ownerPubkeyHex of [
    'ab'.repeat(32).toUpperCase(),
    nip19.npubEncode(COMPLETE_STORE.ownerPubkeyHex),
  ]) {
    assertRecovery(parsed({ ...COMPLETE_STORE, ownerPubkeyHex }), [
      'ownerPubkeyHex',
    ])
  }

  for (const primaryUrl of [
    'https://BUZZ.EXAMPLE/',
    'https://buzz.example:443/',
  ]) {
    assertRecovery(parsed({ ...COMPLETE_STORE, primaryUrl }), ['primaryUrl'])
  }
})

test('membership timestamp is optional but must be a nonnegative integer', () => {
  const withoutTimestamp = { ...COMPLETE_STORE }
  delete withoutTimestamp.lastMembershipMutationUnixSecond

  assert.equal(validateStoredState(parsed(withoutTimestamp)).kind, 'ready')
  assert.equal(
    validateStoredState(
      parsed({ ...COMPLETE_STORE, lastMembershipMutationUnixSecond: 0 }),
    ).kind,
    'ready',
  )
  assert.equal(
    validateStoredState(
      parsed({
        ...COMPLETE_STORE,
        lastMembershipMutationUnixSecond: Number.MAX_SAFE_INTEGER,
      }),
    ).kind,
    'ready',
  )

  for (const lastMembershipMutationUnixSecond of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
    '42',
    null,
  ]) {
    assertRecovery(
      parsed({ ...COMPLETE_STORE, lastMembershipMutationUnixSecond }),
      ['lastMembershipMutationUnixSecond'],
    )
  }
})

test('validation aggregates fixed field-name-only issues without values', () => {
  const rawValues = [
    'schema-sensitive-value',
    'postgres-sensitive-value',
    'redis-sensitive-value',
    'access-sensitive-value',
    'secret-sensitive-value',
    'relay-sensitive-value',
    'hook-sensitive-value',
    'owner-sensitive-value',
    'url-sensitive-value',
    'pairing-sensitive-value',
    'timestamp-sensitive-value',
  ]
  const issues = assertRecovery(
    parsed({
      schemaVersion: rawValues[0],
      postgresPassword: rawValues[1],
      redisPassword: rawValues[2],
      s3AccessKey: rawValues[3],
      s3SecretKey: rawValues[4],
      relayPrivateKeyHex: rawValues[5],
      gitHookHmacSecretHex: rawValues[6],
      ownerPubkeyHex: rawValues[7],
      primaryUrl: rawValues[8],
      pairingRelayUrl: rawValues[9],
      lastMembershipMutationUnixSecond: rawValues[10],
    }),
    [
      'schemaVersion',
      'postgresPassword',
      'redisPassword',
      's3AccessKey',
      's3SecretKey',
      'relayPrivateKeyHex',
      'gitHookHmacSecretHex',
      'ownerPubkeyHex',
      'primaryUrl',
      'pairingRelayUrl',
      'lastMembershipMutationUnixSecond',
    ],
  )
  const renderedIssues = JSON.stringify(issues)

  for (const rawValue of rawValues) {
    assert.equal(renderedIssues.includes(rawValue), false)
  }
})

test('runtime projection excludes only a valid membership timestamp', () => {
  const first = projectForRuntime(
    validateStoredState(parsed({ ...COMPLETE_STORE })),
  )
  const second = projectForRuntime(
    validateStoredState(
      parsed({
        ...COMPLETE_STORE,
        lastMembershipMutationUnixSecond: 9_999,
      }),
    ),
  )
  const { lastMembershipMutationUnixSecond: _, ...expectedState } =
    COMPLETE_STORE

  assert.deepEqual(first, { kind: 'ready', state: expectedState })
  assert.deepEqual(second, first)
  assert.equal(runtimeStateEqual(first, second), true)
})

test('runtime equality handles null and every projected change', () => {
  const base = projectForRuntime(
    validateStoredState(parsed({ ...COMPLETE_STORE })),
  )
  const changes: RuntimeStateValidation[] = [
    projectForRuntime(
      validateStoredState(
        parsed({
          ...COMPLETE_STORE,
          postgresPassword: 'Q'.repeat(32),
        }),
      ),
    ),
    projectForRuntime(
      validateStoredState(
        parsed({ ...COMPLETE_STORE, ownerPubkeyHex: '22'.repeat(32) }),
      ),
    ),
    projectForRuntime(
      validateStoredState(
        parsed({ ...COMPLETE_STORE, primaryUrl: 'https://other.example' }),
      ),
    ),
    projectForRuntime(validateStoredState(parsed({ ...VALID_SECRETS }))),
    { kind: 'needs-state-recovery', issues: ['schemaVersion'] },
    { kind: 'needs-state-recovery', issues: ['postgresPassword'] },
  ]

  assert.equal(runtimeStateEqual(null, null), true)
  assert.equal(runtimeStateEqual(base, null), false)
  assert.equal(runtimeStateEqual(null, base), false)
  assert.equal(runtimeStateEqual(base, structuredClone(base)), true)
  for (const change of changes) {
    assert.equal(runtimeStateEqual(base, change), false)
  }
  assert.equal(runtimeStateEqual(changes[4], changes[5]), false)
})

test('a null reactive read normalizes to the fixed missing-state recovery', async () => {
  const helper = {
    read: () => ({
      const: async () => null,
    }),
  } as unknown as FileHelper<RawStoreText>

  assert.deepEqual(await readRuntimeStateConstFrom(makeEffects(), helper), {
    kind: 'needs-state-recovery',
    issues: ['store.json'],
  })
})

test('a missing then truncated file remains watched and reevaluates when repaired', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'buzz-state-validation-'))
  const path = join(directory, 'store.json')
  const helper = storeRawText.withPath(path)

  try {
    let firstRetry!: () => void
    const firstChanged = new Promise<void>((resolve) => {
      firstRetry = resolve
    })
    assert.deepEqual(
      await readRuntimeStateConstFrom(makeEffects(firstRetry), helper),
      {
        kind: 'needs-state-recovery',
        issues: ['store.json'],
      },
    )

    await writeFile(path, '{"schemaVersion":')
    await withTimeout(firstChanged, 'missing-file watcher did not reevaluate')

    let secondRetry!: () => void
    const secondChanged = new Promise<void>((resolve) => {
      secondRetry = resolve
    })
    assert.deepEqual(
      await readRuntimeStateConstFrom(makeEffects(secondRetry), helper),
      {
        kind: 'needs-state-recovery',
        issues: ['store.json'],
      },
    )

    await writeFile(path, JSON.stringify(COMPLETE_STORE))
    await withTimeout(secondChanged, 'repaired-file watcher did not reevaluate')

    assert.deepEqual(
      await readRuntimeStateConstFrom(makeEffects(), helper),
      projectForRuntime(validateStoredState(parsed(COMPLETE_STORE))),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

function seedDependencies(
  read: StoredStateRead,
  calls: {
    reads: number
    merges: Partial<typeof VALID_SECRETS>[]
    generates: number
  },
): SeedSecretsDependencies {
  return {
    readStoredStateOnce: async () => {
      calls.reads += 1
      return read
    },
    mergeStore: async (patch) => {
      calls.merges.push(patch)
    },
    generateSecrets: () => {
      calls.generates += 1
      return GENERATED
    },
    withStoreMutation: createStoreMutationQueue(),
  }
}

test('fresh install safely seeds missing state with one merge', async () => {
  const calls = { reads: 0, merges: [], generates: 0 } as {
    reads: number
    merges: Partial<typeof VALID_SECRETS>[]
    generates: number
  }

  await seedSecretsForInit(
    'install',
    seedDependencies({ kind: 'missing' }, calls),
  )

  assert.equal(calls.reads, 1)
  assert.equal(calls.generates, 1)
  assert.deepEqual(calls.merges, [{ schemaVersion: 1, ...GENERATED }])
})

test('install preserves present malformed fields and fills only absent ones', async () => {
  const calls = { reads: 0, merges: [], generates: 0 } as {
    reads: number
    merges: Partial<typeof VALID_SECRETS>[]
    generates: number
  }
  const current: RawStoredState = {
    schemaVersion: 'malformed-present-schema',
    postgresPassword: null,
    s3AccessKey: false,
    relayPrivateKeyHex: 'malformed-present-relay',
  }

  await seedSecretsForInit('install', seedDependencies(parsed(current), calls))

  assert.equal(calls.reads, 1)
  assert.equal(calls.generates, 1)
  assert.deepEqual(calls.merges, [
    {
      redisPassword: GENERATED.redisPassword,
      s3SecretKey: GENERATED.s3SecretKey,
      gitHookHmacSecretHex: GENERATED.gitHookHmacSecretHex,
    },
  ])
})

test('concurrent installs serialize the authoritative read through merge', async () => {
  let stored: RawStoredState = {}
  let reads = 0
  let merges = 0
  let generations = 0
  let releaseFirstMerge!: () => void
  let markFirstMergeStarted!: () => void
  const firstMergeStarted = new Promise<void>((resolve) => {
    markFirstMergeStarted = resolve
  })
  const firstMergeRelease = new Promise<void>((resolve) => {
    releaseFirstMerge = resolve
  })
  const withStoreMutation = createStoreMutationQueue()
  const common = {
    readStoredStateOnce: async (): Promise<StoredStateRead> => {
      reads += 1
      return parsed(structuredClone(stored))
    },
    mergeStore: async (patch: Partial<typeof VALID_SECRETS>) => {
      merges += 1
      if (merges === 1) {
        markFirstMergeStarted()
        await firstMergeRelease
      }
      stored = { ...stored, ...patch }
    },
    withStoreMutation,
  }

  const first = seedSecretsForInit('install', {
    ...common,
    generateSecrets: () => {
      generations += 1
      return GENERATED
    },
  })
  await firstMergeStarted

  const secondGenerated: GeneratedSecrets = {
    ...GENERATED,
    postgresPassword: 'Z'.repeat(32),
  }
  const second = seedSecretsForInit('install', {
    ...common,
    generateSecrets: () => {
      generations += 1
      return secondGenerated
    },
  })

  await new Promise<void>((resolve) => setImmediate(resolve))
  releaseFirstMerge()
  await Promise.all([first, second])

  assert.equal(reads, 2)
  assert.equal(generations, 1)
  assert.equal(merges, 1)
  assert.deepEqual(stored, { schemaVersion: 1, ...GENERATED })
})

test('install skips merge when the authoritative state needs no patch', async () => {
  const calls = { reads: 0, merges: [], generates: 0 } as {
    reads: number
    merges: Partial<typeof VALID_SECRETS>[]
    generates: number
  }

  await seedSecretsForInit(
    'install',
    seedDependencies(parsed({ ...COMPLETE_STORE }), calls),
  )

  assert.deepEqual(calls, { reads: 1, merges: [], generates: 0 })
})

test('store mutation queue releases the next mutation after a failure', async () => {
  const withStoreMutation = createStoreMutationQueue()
  const order: string[] = []
  const first = withStoreMutation(async () => {
    order.push('first')
    throw new Error('expected mutation failure')
  })
  const second = withStoreMutation(async () => {
    order.push('second')
    return 'completed'
  })

  await assert.rejects(first, /expected mutation failure/)
  assert.equal(await second, 'completed')
  assert.deepEqual(order, ['first', 'second'])
})

test('safe seeding never writes unreadable or non-install state', async () => {
  for (const read of [
    { kind: 'unreadable', issue: 'invalid-json' },
    { kind: 'unreadable', issue: 'invalid-root' },
  ] as const) {
    const calls = { reads: 0, merges: [], generates: 0 } as {
      reads: number
      merges: Partial<typeof VALID_SECRETS>[]
      generates: number
    }

    await seedSecretsForInit('install', seedDependencies(read, calls))
    assert.deepEqual(calls, { reads: 1, merges: [], generates: 0 })
  }

  for (const kind of ['update', 'restore', null] as const) {
    const calls = { reads: 0, merges: [], generates: 0 } as {
      reads: number
      merges: Partial<typeof VALID_SECRETS>[]
      generates: number
    }

    await seedSecretsForInit(kind, seedDependencies({ kind: 'missing' }, calls))
    assert.deepEqual(calls, { reads: 1, merges: [], generates: 0 })
  }
})
