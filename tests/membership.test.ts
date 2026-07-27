import assert from 'node:assert/strict'
import test from 'node:test'

import { nip19 } from 'nostr-tools'

import {
  createAddMemberAction,
  type MembershipMutationActionRunner,
} from '../startos/actions/add-member.js'
import { actions } from '../startos/actions/index.js'
import {
  listMembersWith,
  runMembershipMutationWith,
  type ListMembershipDependencies,
  type MembershipMutationDependencies,
} from '../startos/actions/membership.js'
import { createRemoveMemberAction } from '../startos/actions/remove-member.js'
import {
  createListMembersAction,
  type ListMembersActionRunner,
} from '../startos/actions/list-members.js'
import {
  prepareMembershipMutation,
  type MembershipInput,
} from '../startos/domain/membership.js'
import type { StoredStateRead } from '../startos/fileModels/read-store.js'
import {
  createStoreMutationQueue,
  type RawStoredState,
} from '../startos/fileModels/store.json.js'

const OWNER = '11'.repeat(32)
const MEMBER = '22'.repeat(32)
const OTHER_MEMBER = '33'.repeat(32)

const VALID_STORE: RawStoredState = {
  schemaVersion: 1,
  postgresPassword: 'P'.repeat(32),
  redisPassword: 'R'.repeat(32),
  s3AccessKey: 'A'.repeat(24),
  s3SecretKey: 'S'.repeat(48),
  relayPrivateKeyHex: `${'0'.repeat(63)}1`,
  gitHookHmacSecretHex: 'ab'.repeat(32),
  ownerPubkeyHex: OWNER,
  primaryUrl: 'https://buzz.example',
}

const EXPECTED_MUTATION_ENV = {
  DATABASE_URL: `postgres://buzz:${'P'.repeat(32)}@127.0.0.1:5432/buzz`,
  REDIS_URL: `redis://:${'R'.repeat(32)}@127.0.0.1:6379`,
  RELAY_URL: 'wss://buzz.example',
  BUZZ_RELAY_PRIVATE_KEY: `${'0'.repeat(63)}1`,
}

function parsed(value: RawStoredState): StoredStateRead {
  return { kind: 'parsed', value: structuredClone(value) }
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

test('membership inputs normalize before exact array commands are built', () => {
  assert.deepEqual(
    prepareMembershipMutation('add', {
      publicKey: nip19.npubEncode(MEMBER),
      role: 'admin',
    }),
    {
      publicKeyHex: MEMBER,
      role: 'admin',
      command: [
        'buzz-admin',
        'add-member',
        '--pubkey',
        MEMBER,
        '--role',
        'admin',
      ],
    },
  )
  assert.deepEqual(
    prepareMembershipMutation('remove', {
      publicKey: OTHER_MEMBER.toUpperCase(),
      role: 'member',
    }),
    {
      publicKeyHex: OTHER_MEMBER,
      role: 'member',
      command: [
        'buzz-admin',
        'remove-member',
        '--pubkey',
        OTHER_MEMBER,
        '--role',
        'member',
      ],
    },
  )

  assert.equal(
    Array.isArray(
      prepareMembershipMutation('add', {
        publicKey: MEMBER,
        role: 'member',
      }).command,
    ),
    true,
  )
})

test('membership roles are restricted to member and admin', () => {
  for (const role of ['owner', 'guest', 'ADMIN', '', null]) {
    assert.throws(
      () =>
        prepareMembershipMutation('add', {
          publicKey: MEMBER,
          role,
        } as unknown as MembershipInput),
      /member or admin/i,
    )
  }
})

test('invalid membership input is rejected before queue acquisition', async () => {
  let queueEntries = 0
  let stateReads = 0
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: async (mutation) => {
      queueEntries += 1
      return mutation()
    },
    readStoredStateOnce: async () => {
      stateReads += 1
      return parsed(VALID_STORE)
    },
    mergeStore: async () => undefined,
    withTempBuzz: async (run) =>
      run({
        execFail: async () => ({ stdout: '', stderr: '' }),
      }),
    nowUnixSecond: () => 100,
    sleep: async () => undefined,
  }

  await assert.rejects(
    runMembershipMutationWith(
      'add',
      { publicKey: MEMBER, role: 'owner' } as unknown as MembershipInput,
      dependencies,
    ),
    /member or admin/i,
  )
  assert.equal(queueEntries, 0)
  assert.equal(stateReads, 0)
})

test('owner identity cannot be added or removed', async () => {
  let commands = 0
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => parsed(VALID_STORE),
    mergeStore: async () => undefined,
    withTempBuzz: async (run) =>
      run({
        execFail: async () => {
          commands += 1
          return { stdout: '', stderr: '' }
        },
      }),
    nowUnixSecond: () => 100,
    sleep: async () => undefined,
  }

  for (const operation of ['add', 'remove'] as const) {
    await assert.rejects(
      runMembershipMutationWith(
        operation,
        { publicKey: OWNER.toUpperCase(), role: 'admin' },
        dependencies,
      ),
      /owner/i,
    )
  }
  assert.equal(commands, 0)
})

test('concurrent mutations serialize authoritative reads, commands, and attempted timestamps', async () => {
  let stored: RawStoredState = {
    ...VALID_STORE,
    lastMembershipMutationUnixSecond: 100,
  }
  let now = 101
  let reads = 0
  let commandCalls = 0
  let releaseFirstCommand!: () => void
  let markFirstCommandStarted!: () => void
  const firstCommandStarted = new Promise<void>((resolve) => {
    markFirstCommandStarted = resolve
  })
  const firstCommandRelease = new Promise<void>((resolve) => {
    releaseFirstCommand = resolve
  })
  const events: string[] = []
  const seenCommands: Array<{
    command: string[]
    env: Record<string, string | undefined> | undefined
  }> = []

  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => {
      reads += 1
      events.push(`read-${reads}-${stored.lastMembershipMutationUnixSecond}`)
      return parsed(stored)
    },
    mergeStore: async (patch) => {
      events.push(`write-${patch.lastMembershipMutationUnixSecond}`)
      stored = { ...stored, ...patch }
    },
    withTempBuzz: async (run) =>
      run({
        execFail: async (command, options) => {
          commandCalls += 1
          seenCommands.push({ command, env: options?.env })
          events.push(`command-${commandCalls}-start-${now}`)
          if (commandCalls === 1) {
            markFirstCommandStarted()
            await firstCommandRelease
          }
          events.push(`command-${commandCalls}-finish-${now}`)
          return { stdout: '', stderr: '' }
        },
      }),
    nowUnixSecond: () => now,
    sleep: async (milliseconds) => {
      events.push(`sleep-${milliseconds}`)
      now += Math.ceil(milliseconds / 1_000)
    },
  }

  const first = runMembershipMutationWith(
    'add',
    { publicKey: MEMBER, role: 'member' },
    dependencies,
  )
  await firstCommandStarted
  const second = runMembershipMutationWith(
    'remove',
    { publicKey: OTHER_MEMBER, role: 'admin' },
    dependencies,
  )
  await nextTurn()

  assert.equal(reads, 1)
  assert.equal(commandCalls, 1)
  releaseFirstCommand()

  assert.deepEqual(await Promise.all([first, second]), [
    { publicKeyHex: MEMBER, role: 'member' },
    { publicKeyHex: OTHER_MEMBER, role: 'admin' },
  ])
  assert.equal(reads, 2)
  assert.equal(commandCalls, 2)
  assert.deepEqual(seenCommands, [
    {
      command: [
        'buzz-admin',
        'add-member',
        '--pubkey',
        MEMBER,
        '--role',
        'member',
      ],
      env: EXPECTED_MUTATION_ENV,
    },
    {
      command: [
        'buzz-admin',
        'remove-member',
        '--pubkey',
        OTHER_MEMBER,
        '--role',
        'admin',
      ],
      env: EXPECTED_MUTATION_ENV,
    },
  ])
  assert.deepEqual(events, [
    'read-1-100',
    'command-1-start-101',
    'command-1-finish-101',
    'write-101',
    'read-2-101',
    'sleep-1000',
    'command-2-start-102',
    'command-2-finish-102',
    'write-102',
  ])
  assert.equal(stored.lastMembershipMutationUnixSecond, 102)

  const serializedResults = JSON.stringify(await Promise.all([first, second]))
  for (const secret of [
    VALID_STORE.postgresPassword,
    VALID_STORE.redisPassword,
    VALID_STORE.relayPrivateKeyHex,
    VALID_STORE.gitHookHmacSecretHex,
  ]) {
    assert.equal(serializedResults.includes(String(secret)), false)
  }
})

test('a failed mutation persists its attempted second and releases the queue', async () => {
  let stored: RawStoredState = { ...VALID_STORE }
  let now = 200
  let commands = 0
  const writes: number[] = []
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => parsed(stored),
    mergeStore: async (patch) => {
      writes.push(patch.lastMembershipMutationUnixSecond)
      stored = { ...stored, ...patch }
    },
    withTempBuzz: async (run) =>
      run({
        execFail: async () => {
          commands += 1
          if (commands === 1) throw new Error('expected command failure')
          return { stdout: '', stderr: '' }
        },
      }),
    nowUnixSecond: () => now,
    sleep: async (milliseconds) => {
      now += Math.ceil(milliseconds / 1_000)
    },
  }

  const failed = runMembershipMutationWith(
    'add',
    { publicKey: MEMBER, role: 'member' },
    dependencies,
  )
  const retry = runMembershipMutationWith(
    'remove',
    { publicKey: OTHER_MEMBER, role: 'admin' },
    dependencies,
  )

  await assert.rejects(failed, /expected command failure/)
  assert.deepEqual(await retry, {
    publicKeyHex: OTHER_MEMBER,
    role: 'admin',
  })
  assert.equal(commands, 2)
  assert.deepEqual(writes, [200, 201])
  assert.equal(stored.lastMembershipMutationUnixSecond, 201)
})

test('a fresh queue honors the persisted attempted second after process restart', async () => {
  let stored: RawStoredState = {
    ...VALID_STORE,
    lastMembershipMutationUnixSecond: 500,
  }
  let now = 500
  const sleeps: number[] = []
  const commandSeconds: number[] = []
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => parsed(stored),
    mergeStore: async (patch) => {
      stored = { ...stored, ...patch }
    },
    withTempBuzz: async (run) =>
      run({
        execFail: async () => {
          commandSeconds.push(now)
          return { stdout: '', stderr: '' }
        },
      }),
    nowUnixSecond: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds)
      now += Math.ceil(milliseconds / 1_000)
    },
  }

  await runMembershipMutationWith(
    'add',
    { publicKey: MEMBER, role: 'admin' },
    dependencies,
  )

  assert.deepEqual(sleeps, [1_000])
  assert.deepEqual(commandSeconds, [501])
  assert.equal(stored.lastMembershipMutationUnixSecond, 501)
})

test('the persisted attempt second is chosen after temporary container creation', async () => {
  let stored: RawStoredState = {
    ...VALID_STORE,
    lastMembershipMutationUnixSecond: 700,
  }
  let now = 701
  const commandSeconds: number[] = []
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => parsed(stored),
    mergeStore: async (patch) => {
      stored = { ...stored, ...patch }
    },
    withTempBuzz: async (run) => {
      now = 702
      return run({
        execFail: async () => {
          commandSeconds.push(now)
          return { stdout: '', stderr: '' }
        },
      })
    },
    nowUnixSecond: () => now,
    sleep: async (milliseconds) => {
      now += Math.ceil(milliseconds / 1_000)
    },
  }

  await runMembershipMutationWith(
    'add',
    { publicKey: MEMBER, role: 'member' },
    dependencies,
  )

  assert.deepEqual(commandSeconds, [702])
  assert.equal(stored.lastMembershipMutationUnixSecond, 702)
})

test('command startup delay updates the marker and forces the next command into a later second', async () => {
  let stored: RawStoredState = {
    ...VALID_STORE,
    lastMembershipMutationUnixSecond: 800,
  }
  let now = 801
  let commands = 0
  const commandSeconds: number[] = []
  const writes: number[] = []
  const sleeps: number[] = []
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => parsed(stored),
    mergeStore: async (patch) => {
      writes.push(patch.lastMembershipMutationUnixSecond)
      stored = { ...stored, ...patch }
    },
    withTempBuzz: async (run) =>
      run({
        execFail: async () => {
          commands += 1
          if (commands === 1) now = 802
          commandSeconds.push(now)
          return { stdout: '', stderr: '' }
        },
      }),
    nowUnixSecond: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds)
      now += Math.ceil(milliseconds / 1_000)
    },
  }

  await runMembershipMutationWith(
    'add',
    { publicKey: MEMBER, role: 'member' },
    dependencies,
  )
  await runMembershipMutationWith(
    'remove',
    { publicKey: OTHER_MEMBER, role: 'admin' },
    dependencies,
  )

  assert.deepEqual(commandSeconds, [802, 803])
  assert.deepEqual(writes, [802, 803])
  assert.deepEqual(sleeps, [1_000])
})

test('a rejected command records its later attempt second before releasing the queue', async () => {
  let stored: RawStoredState = {
    ...VALID_STORE,
    lastMembershipMutationUnixSecond: 900,
  }
  let now = 901
  let commands = 0
  const commandSeconds: number[] = []
  const writes: number[] = []
  const sleeps: number[] = []
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => parsed(stored),
    mergeStore: async (patch) => {
      writes.push(patch.lastMembershipMutationUnixSecond)
      stored = { ...stored, ...patch }
    },
    withTempBuzz: async (run) =>
      run({
        execFail: async () => {
          commands += 1
          if (commands === 1) {
            now = 902
            commandSeconds.push(now)
            throw new Error('expected delayed rejection')
          }
          commandSeconds.push(now)
          return { stdout: '', stderr: '' }
        },
      }),
    nowUnixSecond: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds)
      now += Math.ceil(milliseconds / 1_000)
    },
  }

  await assert.rejects(
    runMembershipMutationWith(
      'add',
      { publicKey: MEMBER, role: 'member' },
      dependencies,
    ),
    /expected delayed rejection/,
  )
  await runMembershipMutationWith(
    'remove',
    { publicKey: OTHER_MEMBER, role: 'admin' },
    dependencies,
  )

  assert.deepEqual(commandSeconds, [902, 903])
  assert.deepEqual(writes, [902, 903])
  assert.deepEqual(sleeps, [1_000])
})

test('far-future stored seconds use bounded sleep intervals', async () => {
  const previous = 3_000_100
  let now = 100
  const sleeps: number[] = []
  const dependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () =>
      parsed({
        ...VALID_STORE,
        lastMembershipMutationUnixSecond: previous,
      }),
    mergeStore: async () => undefined,
    withTempBuzz: async (run) =>
      run({
        execFail: async () => ({ stdout: '', stderr: '' }),
      }),
    nowUnixSecond: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds)
      now = previous + 1
    },
  }

  await runMembershipMutationWith(
    'add',
    { publicKey: MEMBER, role: 'member' },
    dependencies,
  )

  assert.deepEqual(sleeps, [60_000])
})

test('list members uses the exact command and least-privilege environment', async () => {
  const calls: Array<{
    command: string[]
    env: Record<string, string | undefined> | undefined
  }> = []
  const dependencies: ListMembershipDependencies = {
    readStoredStateOnce: async () => parsed(VALID_STORE),
    withTempBuzz: async (run) =>
      run({
        execFail: async (command, options) => {
          calls.push({ command, env: options?.env })
          return { stdout: Buffer.from('member roster\n'), stderr: '' }
        },
      }),
  }

  assert.equal(await listMembersWith(dependencies), 'member roster\n')
  assert.deepEqual(calls, [
    {
      command: ['buzz-admin', 'list-members'],
      env: {
        DATABASE_URL: EXPECTED_MUTATION_ENV.DATABASE_URL,
        RELAY_URL: EXPECTED_MUTATION_ENV.RELAY_URL,
      },
    },
  ])
  assert.equal('REDIS_URL' in calls[0]!.env!, false)
  assert.equal('BUZZ_RELAY_PRIVATE_KEY' in calls[0]!.env!, false)
})

test('membership runners require fresh ready stored state', async () => {
  const mutationDependencies: MembershipMutationDependencies = {
    withStoreMutation: createStoreMutationQueue(),
    readStoredStateOnce: async () => ({ kind: 'missing' }),
    mergeStore: async () => undefined,
    withTempBuzz: async () => {
      throw new Error('temporary container must not start')
    },
    nowUnixSecond: () => 100,
    sleep: async () => undefined,
  }
  const listDependencies: ListMembershipDependencies = {
    readStoredStateOnce: async () => ({ kind: 'missing' }),
    withTempBuzz: async () => {
      throw new Error('temporary container must not start')
    },
  }

  await assert.rejects(
    runMembershipMutationWith(
      'add',
      { publicKey: MEMBER, role: 'member' },
      mutationDependencies,
    ),
    /not ready|setup|recovery/i,
  )
  await assert.rejects(
    listMembersWith(listDependencies),
    /not ready|setup|recovery/i,
  )
})

type FakeEffects = {
  eventId: string
  child: () => FakeEffects
  action: {
    export: (value: unknown) => Promise<void>
  }
}

let nextEventId = 0

function fakeEffects(onExport: (value: unknown) => void = () => undefined) {
  const effects: FakeEffects = {
    eventId: `membership-test-${nextEventId++}`,
    child: () => effects,
    action: {
      export: async (value) => onExport(value),
    },
  }
  return effects
}

async function actionMetadata(action: {
  exportMetadata: (options: { effects: never }) => Promise<unknown>
}) {
  let exported: unknown
  await action.exportMetadata({
    effects: fakeEffects((value) => {
      exported = value
    }) as never,
  })
  assert.ok(
    typeof exported === 'object' && exported !== null && 'metadata' in exported,
  )
  return exported.metadata
}

test('membership actions are registered with the package action set', () => {
  assert.equal(actions.get('add-member').id, 'add-member')
  assert.equal(actions.get('remove-member').id, 'remove-member')
  assert.equal(actions.get('list-members').id, 'list-members')
})

test('membership actions expose running-only user forms and secret-free results', async () => {
  const mutationCalls: Array<{
    operation: string
    input: MembershipInput
  }> = []
  const mutationRunner: MembershipMutationActionRunner = async (
    _effects,
    operation,
    input,
  ) => {
    mutationCalls.push({ operation, input })
    return {
      publicKeyHex: MEMBER,
      role: input.role,
    }
  }
  const add = createAddMemberAction(mutationRunner)
  const remove = createRemoveMemberAction(mutationRunner)

  for (const action of [add, remove]) {
    assert.deepEqual(await actionMetadata(action), {
      name: action.id === 'add-member' ? 'Add Member' : 'Remove Member',
      description:
        action.id === 'add-member'
          ? 'Add a member or administrator role to a Nostr identity in the private relay.'
          : 'Remove a member or administrator role from a Nostr identity in the private relay.',
      warning: null,
      allowedStatuses: 'only-running',
      group: null,
      visibility: 'enabled',
      access: 'user',
      hasInput: true,
    })

    const effects = fakeEffects()
    const prepared = await action.getInput({
      effects: effects as never,
      prefill: null,
    })
    const publicKeySpec = prepared.spec.publicKey as Record<string, unknown>
    const roleSpec = prepared.spec.role as Record<string, unknown>
    assert.equal(publicKeySpec.type, 'text')
    assert.equal(publicKeySpec.required, true)
    assert.equal(publicKeySpec.masked, false)
    assert.equal(roleSpec.type, 'select')
    assert.deepEqual(roleSpec.values, {
      member: 'Member',
      admin: 'Administrator',
    })

    const result = await action.run({
      effects: effects as never,
      input: {
        publicKey: nip19.npubEncode(MEMBER),
        role: 'admin',
      },
    })
    assert.equal(
      JSON.stringify(result).includes(VALID_STORE.postgresPassword as string),
      false,
    )
    assert.equal(
      JSON.stringify(result).includes(VALID_STORE.redisPassword as string),
      false,
    )
    assert.equal(
      JSON.stringify(result).includes(VALID_STORE.relayPrivateKeyHex as string),
      false,
    )
    assert.equal(
      JSON.stringify(result).includes(
        VALID_STORE.gitHookHmacSecretHex as string,
      ),
      false,
    )
    assert.equal(JSON.stringify(result).includes(MEMBER), true)
  }

  assert.deepEqual(
    mutationCalls.map(({ operation }) => operation),
    ['add', 'remove'],
  )
})

test('list action is input-free and returns copyable unmasked stdout', async () => {
  const runner: ListMembersActionRunner = async () => 'member roster\n'
  const action = createListMembersAction(runner)

  assert.deepEqual(await actionMetadata(action), {
    name: 'List Members',
    description: 'Display the private relay roster.',
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
    access: 'user',
    hasInput: false,
  })
  assert.deepEqual(
    await action.run({ effects: fakeEffects() as never, input: {} }),
    {
      version: '1',
      title: 'Relay Members',
      message: null,
      result: {
        type: 'single',
        name: 'Relay Members',
        description: null,
        value: 'member roster\n',
        masked: false,
        copyable: true,
        qr: false,
      },
    },
  )
})
