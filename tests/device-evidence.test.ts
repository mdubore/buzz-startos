import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

type ValidationResult = {
  valid: boolean
  errors: string[]
}

type AuthorizationCase = {
  principalRole: 'owner' | 'admin' | 'member'
  restrictionState:
    'active-ban' | 'active-timeout' | 'expired-ban' | 'expired-timeout' | 'none'
  eventKind: number
  outcome: 'accepted' | 'rejected'
  eventPersisted: boolean
  clientError: string | null
  rawDatabaseTextObserved: boolean
}

type RoleAuthorizationState = {
  stateHash: string
  ownerPubkeys: string[]
  channels: Array<{
    channelId: string
    activeOwnerPubkeys: string[]
  }>
}

type RoleAuthorizationCase = {
  invariant:
    | 'non-admin-role-change-rejected'
    | 'owner-demotion-rejected'
    | 'owner-set-preserved'
    | 'active-owner-per-channel'
  actorRole: 'owner' | 'admin' | 'member' | 'unauthorized'
  outcome: 'rejected'
  eventPersisted: boolean
  clientError: string | null
  rawDatabaseTextObserved: boolean
  before: RoleAuthorizationState
  after: RoleAuthorizationState
}

type RestoreEndpoint = {
  architecture: 'x86_64' | 'aarch64'
  model: string
  cpu: string
  cores: number
  memoryBytes: number
  storage: string
  startosBuildId: string
  startosImageSha256: string
}

type RestoreTrial = {
  source: RestoreEndpoint
  target: RestoreEndpoint
  nativePackageReinstalled: boolean
  outcome: 'pass'
}

type MutableCandidateContract = Record<string, unknown> & {
  startos: Record<string, unknown> & {
    architectures: Record<string, Record<string, unknown>>
  }
  package: Record<string, unknown> & {
    artifacts: Record<string, Record<string, unknown>>
  }
  upgradeSource: Record<string, unknown> & {
    artifacts: Record<string, Record<string, unknown>>
  }
  promotionControls: Record<string, unknown>
}

type MutableEvidenceFixture = {
  example: boolean
  gateId: string
  status: string
  device: {
    architecture: string
    virtualization: string
    startos: {
      buildId: string
      imageSha256: string
    }
  }
  releaseCandidate: {
    archive: {
      name: string
      sha256: string
      sizeBytes: number
    }
    packageCommit: string
  }
  execution: {
    operator: string
    commands: Array<{
      program: string
      args: string[]
      exitCode: number
    }>
  }
  assertions: Array<{
    id: string
    expected: string
    observed: string
    outcome: string
    evidenceIds: string[]
  }>
  evidence: Array<{
    id: string
    kind: string
    path: string
    sha256: string
    redacted: boolean
    containsSecrets: boolean
  }>
  review: {
    reviewer: string
  }
  authorizationRegression?: {
    cases: AuthorizationCase[]
    roleAuthorization: {
      cases: RoleAuthorizationCase[]
    }
  }
  restoreTrials?: RestoreTrial[]
  upgradeSource?: {
    tag: string
    version: string
    packageCommit: string
    upstreamCommit: string
    signerFingerprint: string
    artifact: {
      name: string
      sha256: string
    }
  }
}

type DeviceEvidenceValidator = {
  loadGateCatalog(path: URL): Promise<{
    gates: Array<{
      id: string
      dependsOn: string[]
      requiredAssertions: string[]
    }>
  }>
  loadCandidateContract(path: URL): Promise<{
    schemaVersion: number
    state: 'UNFROZEN' | 'FROZEN'
    startos: {
      releaseLine: string
      releaseTag: string
      sourceUrl: string
      sourceCommit: string
      architectures: Record<
        'x86_64' | 'aarch64',
        { buildId: string | null; imageSha256: string | null }
      >
    }
    package: {
      tag: string | null
      version: string
      packageCommit: string | null
      upstreamCommit: string
      signerFingerprint: string
      manifestMinimumStartos: string
      sdkVersion: string
      artifacts: Record<
        'x86_64' | 'aarch64',
        {
          name: string
          sha256: string | null
          sizeBytes: number | null
        }
      >
    }
    upgradeSource: {
      tag: string
      version: string
      packageCommit: string
      upstreamCommit: string
      signerFingerprint: string
      artifacts: Record<
        'x86_64' | 'aarch64',
        {
          name: string
          sha256: string
        }
      >
    }
    promotionControls: {
      authenticatedOperatorReviewerBinding: 'PENDING'
    }
  }>
  validateEvidenceFile(
    path: URL,
    schemaPath: URL,
    options?: {
      candidatePath?: URL
      allowFixtureOverlay?: boolean
    },
  ): Promise<ValidationResult>
  validateRepository(options: {
    candidatePath: URL
    catalogPath: URL
    examplePath: URL
    matrixPath: URL
    mode?: 'template' | 'promotion'
    schemaPath: URL
  }): Promise<ValidationResult & { matrixCells: number }>
}

const fixture = (name: string) =>
  new URL(`fixtures/device-evidence/${name}`, import.meta.url)

const schemaPath = new URL(
  '../docs/testing/DEVICE_EVIDENCE.schema.json',
  import.meta.url,
)
const catalogPath = new URL(
  '../docs/testing/DEVICE_GATES.json',
  import.meta.url,
)
const examplePath = new URL(
  '../docs/testing/device-evidence.example.json',
  import.meta.url,
)
const matrixPath = new URL(
  '../docs/testing/DEVICE_TEST_MATRIX.md',
  import.meta.url,
)
const candidatePath = new URL(
  '../docs/testing/DEVICE_CANDIDATE.json',
  import.meta.url,
)
const frozenCandidatePath = fixture('frozen-candidate.json')
const gateIds = [
  'ART-01',
  'INS-01',
  'SET-01',
  'NET-01',
  'NET-02',
  'AUTH-01',
  'AUTH-02',
  'MED-01',
  'GIT-01',
  'PER-01',
  'PER-02',
  'PER-03',
  'PER-04',
  'BND-01',
  'BKP-01',
  'HLT-01',
  'HLT-02',
  'HLT-03',
  'REC-01',
  'REC-02',
  'UPG-01',
  'RES-01',
  'LIF-01',
]
const authorizationEventKinds = [
  9030, 9031, 9032, 9033, 41010, 41011, 41012, 30620, 46020, 46030, 46031,
] as const
const maxEvidenceAttachmentBytes = 16 * 1024 * 1024

const repositoryFile = (path: string) => new URL(`../${path}`, import.meta.url)

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

function authorizationCases(): AuthorizationCase[] {
  const cases: AuthorizationCase[] = []
  for (const principalRole of ['owner', 'admin', 'member'] as const) {
    for (const restrictionState of ['active-ban', 'active-timeout'] as const) {
      for (const eventKind of authorizationEventKinds) {
        cases.push({
          principalRole,
          restrictionState,
          eventKind,
          outcome: 'rejected',
          eventPersisted: false,
          clientError: 'request rejected',
          rawDatabaseTextObserved: false,
        })
      }
    }
  }
  for (const restrictionState of [
    'expired-ban',
    'expired-timeout',
    'none',
  ] as const) {
    for (const eventKind of authorizationEventKinds) {
      cases.push({
        principalRole: 'owner',
        restrictionState,
        eventKind,
        outcome: 'accepted',
        eventPersisted: true,
        clientError: null,
        rawDatabaseTextObserved: false,
      })
    }
  }
  return cases
}

function roleAuthorizationCases(): RoleAuthorizationCase[] {
  const ownerPubkey = '1'.repeat(64)
  const channelId = '2'.repeat(64)

  return [
    ['non-admin-role-change-rejected', 'member', 'a'],
    ['owner-demotion-rejected', 'admin', 'b'],
    ['owner-set-preserved', 'admin', 'c'],
    ['active-owner-per-channel', 'admin', 'd'],
  ].map(([invariant, actorRole, hashCharacter]) => {
    const state = {
      stateHash: `sha256:${hashCharacter.repeat(64)}`,
      ownerPubkeys: [ownerPubkey],
      channels: [{ channelId, activeOwnerPubkeys: [ownerPubkey] }],
    }
    return {
      invariant: invariant as RoleAuthorizationCase['invariant'],
      actorRole: actorRole as RoleAuthorizationCase['actorRole'],
      outcome: 'rejected' as const,
      eventPersisted: false,
      clientError: 'request rejected',
      rawDatabaseTextObserved: false,
      before: structuredClone(state),
      after: structuredClone(state),
    }
  })
}

function restoreEndpoint(
  architecture: 'x86_64' | 'aarch64',
  role: string,
): RestoreEndpoint {
  return {
    architecture,
    model: `Fixture ${architecture} ${role}`,
    cpu: `Fixture ${architecture} CPU`,
    cores: 4,
    memoryBytes: 8589934592,
    storage: `Fixture ${architecture} SSD`,
    startosBuildId:
      architecture === 'x86_64'
        ? '0.4.0-evidence-fixture'
        : '0.4.0-evidence-fixture-arm',
    startosImageSha256:
      architecture === 'x86_64' ? 'e'.repeat(64) : '3'.repeat(64),
  }
}

function completeRestoreTrials(): RestoreTrial[] {
  return [
    ['x86_64', 'x86_64'],
    ['aarch64', 'aarch64'],
    ['x86_64', 'aarch64'],
    ['aarch64', 'x86_64'],
  ].map(([sourceArchitecture, targetArchitecture]) => ({
    source: restoreEndpoint(
      sourceArchitecture as 'x86_64' | 'aarch64',
      'source',
    ),
    target: restoreEndpoint(
      targetArchitecture as 'x86_64' | 'aarch64',
      'target',
    ),
    nativePackageReinstalled: sourceArchitecture !== targetArchitecture,
    outcome: 'pass' as const,
  }))
}

async function retainFixtureAttachment(directory: string): Promise<void> {
  await writeFile(
    join(directory, 'artifact-verification.txt'),
    await readFile(fixture('artifact-verification.txt')),
  )
}

function matrixFixture(
  cells: Record<string, { x86_64?: string; aarch64?: string }>,
): string {
  return gateIds
    .map((gateId) => {
      const x86Cell = cells[gateId]?.x86_64 ?? 'NOT RUN'
      const armCell = cells[gateId]?.aarch64 ?? 'NOT RUN'
      return `| ${gateId} | fixture | fixture | ${x86Cell} | ${armCell} | fixture |`
    })
    .join('\n')
}

function canonicalMatrixStatuses(matrix: string): Array<{
  gateId: string
  acceptanceGate: string
  x86_64: string
  aarch64: string
}> {
  return matrix
    .split('\n')
    .filter((line) => /^\|\s*[A-Z]+-[0-9]{2}\s*\|/.test(line))
    .map((line) => {
      const columns = line.split('|').map((column) => column.trim())
      return {
        gateId: columns[1],
        acceptanceGate: columns[2],
        x86_64: columns[4],
        aarch64: columns[5],
      }
    })
}

function markdownSection(document: string, heading: string): string {
  const start = document.indexOf(heading)
  assert.notEqual(start, -1, `missing section ${heading}`)
  const headingPrefix = heading.slice(0, heading.indexOf(' ') + 1)
  const nextHeading = document.indexOf(
    `\n${headingPrefix}`,
    start + heading.length,
  )
  return document.slice(start, nextHeading === -1 ? undefined : nextHeading)
}

function requirePassingAssertions(
  record: MutableEvidenceFixture,
  ids: string[],
): void {
  record.assertions = ids.map((id) => ({
    id,
    expected: 'Fixture expectation',
    observed: 'Fixture observation',
    outcome: 'pass',
    evidenceIds: ['artifact-verification'],
  }))
}

function upgradeSourceFor(
  candidate: Awaited<
    ReturnType<DeviceEvidenceValidator['loadCandidateContract']>
  >,
  architecture: 'x86_64' | 'aarch64',
): NonNullable<MutableEvidenceFixture['upgradeSource']> {
  return {
    tag: candidate.upgradeSource.tag,
    version: candidate.upgradeSource.version,
    packageCommit: candidate.upgradeSource.packageCommit,
    upstreamCommit: candidate.upgradeSource.upstreamCommit,
    signerFingerprint: candidate.upgradeSource.signerFingerprint,
    artifact: candidate.upgradeSource.artifacts[architecture],
  }
}

function makeUnfrozenCandidate(
  candidate: MutableCandidateContract,
): MutableCandidateContract {
  candidate.state = 'UNFROZEN'
  candidate.package.tag = null
  candidate.package.packageCommit = null
  for (const architecture of ['x86_64', 'aarch64'] as const) {
    candidate.package.artifacts[architecture].sha256 = null
    candidate.package.artifacts[architecture].sizeBytes = null
    candidate.startos.architectures[architecture].buildId = null
    candidate.startos.architectures[architecture].imageSha256 = null
  }
  return candidate
}

async function loadValidator(): Promise<DeviceEvidenceValidator> {
  let loaded: DeviceEvidenceValidator | undefined
  let failure: unknown

  try {
    loaded =
      (await import('../scripts/device-evidence-validator.js')) as DeviceEvidenceValidator
  } catch (error) {
    failure = error
  }

  assert.ok(
    loaded,
    `device evidence validator must load: ${failure instanceof Error ? failure.message : String(failure)}`,
  )
  return loaded
}

test('stages the conventional v0.5.4 candidate before new artifacts are frozen', async () => {
  const validator = await loadValidator()
  const candidate = await validator.loadCandidateContract(candidatePath)

  assert.equal(candidate.schemaVersion, 1)
  assert.equal(candidate.state, 'UNFROZEN')
  assert.deepEqual(candidate.startos, {
    releaseLine: '0.4.0',
    releaseTag: 'start-os/v0.4.0',
    sourceUrl:
      'https://github.com/Start9Labs/start-technologies/releases/tag/start-os/v0.4.0',
    sourceCommit: '514af0c2fa076c8b597d9861f882bdb1b3411d9e',
    architectures: {
      x86_64: { buildId: null, imageSha256: null },
      aarch64: { buildId: null, imageSha256: null },
    },
  })
  assert.equal(
    candidate.package.signerFingerprint,
    'sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c',
  )
  assert.equal(candidate.package.tag, null)
  assert.equal(candidate.package.version, '0.5.4:0')
  assert.equal(candidate.package.packageCommit, null)
  assert.equal(
    candidate.package.upstreamCommit,
    '651f6372754e60e3f936b3397040eb0f1e44c9f3',
  )
  assert.deepEqual(candidate.package.artifacts, {
    x86_64: { name: 'buzz_x86_64.s9pk', sha256: null, sizeBytes: null },
    aarch64: { name: 'buzz_aarch64.s9pk', sha256: null, sizeBytes: null },
  })
  assert.equal(
    candidate.promotionControls.authenticatedOperatorReviewerBinding,
    'PENDING',
  )
})

for (const [field, expectedError] of [
  ['version', 'candidate package version must identify the proposed version'],
  [
    'upstreamCommit',
    'candidate upstream commit must identify the proposed source',
  ],
] as const) {
  for (const state of ['UNFROZEN', 'FROZEN'] as const) {
    test(`rejects a ${state} candidate without its proposed ${field}`, async (t) => {
      const validator = await loadValidator()
      const directory = await mkdtemp(join(tmpdir(), 'buzz-proposed-id-'))
      t.after(() => rm(directory, { recursive: true, force: true }))
      const source = state === 'UNFROZEN' ? candidatePath : frozenCandidatePath
      const candidate = JSON.parse(
        await readFile(source, 'utf8'),
      ) as MutableCandidateContract
      candidate.package[field] = null
      const attemptedContract = join(directory, 'candidate.json')
      await writeFile(attemptedContract, JSON.stringify(candidate))

      await assert.rejects(
        () => validator.loadCandidateContract(pathToFileURL(attemptedContract)),
        new RegExp(expectedError),
      )
    })
  }
}

test('rejects malformed proposed identity values in both candidate states', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-proposed-malformed-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const mutations = [
    [
      'version-empty',
      'version',
      '',
      'candidate package version must identify the proposed version',
    ],
    [
      'version-whitespace',
      'version',
      '   ',
      'candidate package version must identify the proposed version',
    ],
    [
      'version-malformed',
      'version',
      'not-a-package-version',
      'candidate package version must identify the proposed version',
    ],
    [
      'version-wrong-type',
      'version',
      7,
      'candidate package version must identify the proposed version',
    ],
    [
      'upstream-empty',
      'upstreamCommit',
      '',
      'candidate upstream commit must identify the proposed source',
    ],
    [
      'upstream-whitespace',
      'upstreamCommit',
      '   ',
      'candidate upstream commit must identify the proposed source',
    ],
    [
      'upstream-malformed',
      'upstreamCommit',
      '651f637',
      'candidate upstream commit must identify the proposed source',
    ],
    [
      'upstream-wrong-type',
      'upstreamCommit',
      7,
      'candidate upstream commit must identify the proposed source',
    ],
  ] as const

  for (const state of ['UNFROZEN', 'FROZEN'] as const) {
    for (const [label, field, value, expectedError] of mutations) {
      const source = state === 'UNFROZEN' ? candidatePath : frozenCandidatePath
      const candidate = JSON.parse(
        await readFile(source, 'utf8'),
      ) as MutableCandidateContract
      candidate.package[field] = value
      const attemptedContract = join(directory, `${state}-${label}.json`)
      await writeFile(attemptedContract, JSON.stringify(candidate))

      await assert.rejects(
        () => validator.loadCandidateContract(pathToFileURL(attemptedContract)),
        new RegExp(expectedError),
      )
    }
  }
})

test('rejects empty and whitespace StartOS build IDs on both architectures and candidate states', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-build-id-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

  for (const state of ['UNFROZEN', 'FROZEN'] as const) {
    for (const architecture of ['x86_64', 'aarch64'] as const) {
      for (const [label, value] of [
        ['empty', ''],
        ['whitespace', '   '],
      ] as const) {
        const source =
          state === 'UNFROZEN' ? candidatePath : frozenCandidatePath
        const candidate = JSON.parse(
          await readFile(source, 'utf8'),
        ) as MutableCandidateContract
        candidate.startos.architectures[architecture].buildId = value
        const attemptedContract = join(
          directory,
          `${state}-${architecture}-${label}.json`,
        )
        await writeFile(attemptedContract, JSON.stringify(candidate))

        await assert.rejects(
          () =>
            validator.loadCandidateContract(pathToFileURL(attemptedContract)),
          new RegExp(`candidate StartOS ${architecture} buildId is invalid`),
        )
      }
    }
  }
})

for (const [label, setFrozenValue] of [
  [
    'candidate tag',
    (candidate: MutableCandidateContract) => {
      candidate.package.tag = 'v0.2.0_0'
    },
  ],
  [
    'package commit',
    (candidate: MutableCandidateContract) => {
      candidate.package.packageCommit = 'a'.repeat(40)
    },
  ],
  [
    'x86_64 artifact hash',
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.x86_64.sha256 = 'a'.repeat(64)
    },
  ],
  [
    'x86_64 artifact size',
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.x86_64.sizeBytes = 1
    },
  ],
  [
    'aarch64 artifact hash',
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.aarch64.sha256 = 'a'.repeat(64)
    },
  ],
  [
    'aarch64 artifact size',
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.aarch64.sizeBytes = 1
    },
  ],
  [
    'x86_64 StartOS build ID',
    (candidate: MutableCandidateContract) => {
      candidate.startos.architectures.x86_64.buildId = 'fixture-build'
    },
  ],
  [
    'x86_64 StartOS image hash',
    (candidate: MutableCandidateContract) => {
      candidate.startos.architectures.x86_64.imageSha256 = 'a'.repeat(64)
    },
  ],
  [
    'aarch64 StartOS build ID',
    (candidate: MutableCandidateContract) => {
      candidate.startos.architectures.aarch64.buildId = 'fixture-build'
    },
  ],
  [
    'aarch64 StartOS image hash',
    (candidate: MutableCandidateContract) => {
      candidate.startos.architectures.aarch64.imageSha256 = 'a'.repeat(64)
    },
  ],
] as const) {
  test(`rejects an UNFROZEN candidate with a frozen-only ${label}`, async (t) => {
    const validator = await loadValidator()
    const directory = await mkdtemp(join(tmpdir(), 'buzz-frozen-only-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const candidate = makeUnfrozenCandidate(
      JSON.parse(
        await readFile(candidatePath, 'utf8'),
      ) as MutableCandidateContract,
    )
    candidate.package.version = '0.5.4:0'
    candidate.package.upstreamCommit =
      '651f6372754e60e3f936b3397040eb0f1e44c9f3'
    setFrozenValue(candidate)
    const attemptedContract = join(directory, 'candidate.json')
    await writeFile(attemptedContract, JSON.stringify(candidate))

    await assert.rejects(
      () => validator.loadCandidateContract(pathToFileURL(attemptedContract)),
      /UNFROZEN candidate identity must not contain frozen values/,
    )
  })
}

test('requires every package artifact identity before a candidate can be FROZEN', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-frozen-complete-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const omissions = [
    (candidate: MutableCandidateContract) => {
      candidate.package.tag = null
    },
    (candidate: MutableCandidateContract) => {
      candidate.package.packageCommit = null
    },
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.x86_64.sha256 = null
    },
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.x86_64.sizeBytes = null
    },
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.aarch64.sha256 = null
    },
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.aarch64.sizeBytes = null
    },
  ]

  for (const [index, omit] of omissions.entries()) {
    const candidate = JSON.parse(
      await readFile(frozenCandidatePath, 'utf8'),
    ) as MutableCandidateContract
    omit(candidate)
    const attemptedContract = join(directory, `candidate-${index}.json`)
    await writeFile(attemptedContract, JSON.stringify(candidate))

    await assert.rejects(
      () => validator.loadCandidateContract(pathToFileURL(attemptedContract)),
      /FROZEN candidate identity must be complete/,
    )
  }
})

test('freezes exact package bytes before device-generated StartOS identities are known', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-frozen-package-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const candidate = JSON.parse(
    await readFile(frozenCandidatePath, 'utf8'),
  ) as MutableCandidateContract
  for (const architecture of ['x86_64', 'aarch64'] as const) {
    candidate.startos.architectures[architecture].buildId = null
    candidate.startos.architectures[architecture].imageSha256 = null
  }
  const candidateFile = join(directory, 'candidate.json')
  await writeFile(candidateFile, JSON.stringify(candidate))

  const loaded = await validator.loadCandidateContract(
    pathToFileURL(candidateFile),
  )
  assert.equal(loaded.state, 'FROZEN')
  assert.deepEqual(loaded.startos.architectures, {
    x86_64: { buildId: null, imageSha256: null },
    aarch64: { buildId: null, imageSha256: null },
  })

  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  await retainFixtureAttachment(directory)
  const recordFile = join(directory, 'record.json')
  await writeFile(recordFile, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordFile),
    schemaPath,
    { candidatePath: pathToFileURL(candidateFile) },
  )
  assert.deepEqual(result, { valid: true, errors: [] })
})

test('rejects a manually asserted authenticated-review enforcement flag', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-binding-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const candidate = JSON.parse(await readFile(frozenCandidatePath, 'utf8')) as {
    promotionControls: {
      authenticatedOperatorReviewerBinding: string
    }
  }
  candidate.promotionControls.authenticatedOperatorReviewerBinding = 'ENFORCED'
  const attemptedContract = join(directory, 'candidate.json')
  await writeFile(attemptedContract, JSON.stringify(candidate))

  await assert.rejects(
    () => validator.loadCandidateContract(pathToFileURL(attemptedContract)),
    /must remain PENDING until authenticated binding is implemented/,
  )
})

for (const [label, addUnknownField] of [
  [
    'top level',
    (candidate: MutableCandidateContract) => {
      candidate.unexpected = true
    },
  ],
  [
    'StartOS identity',
    (candidate: MutableCandidateContract) => {
      candidate.startos.unexpected = true
    },
  ],
  [
    'StartOS architecture map',
    (candidate: MutableCandidateContract) => {
      candidate.startos.architectures.unexpected = {}
    },
  ],
  [
    'StartOS architecture identity',
    (candidate: MutableCandidateContract) => {
      candidate.startos.architectures.x86_64.unexpected = true
    },
  ],
  [
    'package identity',
    (candidate: MutableCandidateContract) => {
      candidate.package.unexpected = true
    },
  ],
  [
    'package artifact map',
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.unexpected = {}
    },
  ],
  [
    'package artifact identity',
    (candidate: MutableCandidateContract) => {
      candidate.package.artifacts.x86_64.unexpected = true
    },
  ],
  [
    'upgrade-source identity',
    (candidate: MutableCandidateContract) => {
      candidate.upgradeSource.unexpected = true
    },
  ],
  [
    'upgrade-source artifact map',
    (candidate: MutableCandidateContract) => {
      candidate.upgradeSource.artifacts.unexpected = {}
    },
  ],
  [
    'upgrade-source artifact identity',
    (candidate: MutableCandidateContract) => {
      candidate.upgradeSource.artifacts.aarch64.unexpected = true
    },
  ],
  [
    'promotion controls',
    (candidate: MutableCandidateContract) => {
      candidate.promotionControls.unexpected = true
    },
  ],
] as const) {
  test(`rejects an unknown field in the candidate ${label}`, async (t) => {
    const validator = await loadValidator()
    const directory = await mkdtemp(join(tmpdir(), 'buzz-candidate-shape-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const candidate = JSON.parse(
      await readFile(frozenCandidatePath, 'utf8'),
    ) as MutableCandidateContract
    addUnknownField(candidate)
    const attemptedContract = join(directory, 'candidate.json')
    await writeFile(attemptedContract, JSON.stringify(candidate))

    await assert.rejects(
      () => validator.loadCandidateContract(pathToFileURL(attemptedContract)),
      /contains unknown field/,
    )
  })
}

test('defines the complete acyclic 46-cell production gate catalog', async () => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)

  assert.deepEqual(
    catalog.gates.map(({ id }) => id),
    gateIds,
  )
  assert.equal(new Set(gateIds).size * 2, 46)
})

test('accepts a complete independently reviewed stable StartOS record', async () => {
  const validator = await loadValidator()
  const result = await validator.validateEvidenceFile(
    fixture('valid-artifact.json'),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.deepEqual(result, { valid: true, errors: [] })
})

test('rejects production evidence when a candidate contract is unfrozen', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-unfrozen-evidence-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const candidate = makeUnfrozenCandidate(
    JSON.parse(
      await readFile(candidatePath, 'utf8'),
    ) as MutableCandidateContract,
  )
  const unfrozenCandidatePath = join(directory, 'candidate.json')
  await writeFile(unfrozenCandidatePath, JSON.stringify(candidate))
  const result = await validator.validateEvidenceFile(
    fixture('valid-artifact.json'),
    schemaPath,
    { candidatePath: pathToFileURL(unfrozenCandidatePath) },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) => error.includes('candidate is UNFROZEN')),
    result.errors.join('\n'),
  )
})

test('rejects fixture inheritance unless a test explicitly enables it', async () => {
  const validator = await loadValidator()
  const result = await validator.validateEvidenceFile(
    fixture('invalid-beta-os.json'),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('cannot use fixture inheritance overlays'),
    ),
    result.errors.join('\n'),
  )
})

for (const [label, attachmentPath, expectedError] of [
  ['absolute attachment', '/tmp/captured.txt', 'local relative path'],
  [
    'attachment URL',
    'https://example.test/captured.txt',
    'local relative path',
  ],
  ['path traversal', '../captured.txt', 'escapes its evidence directory'],
] as const) {
  test(`rejects ${label}`, async (t) => {
    const validator = await loadValidator()
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-path-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.evidence[0].path = attachmentPath
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) => error.includes(expectedError)),
      result.errors.join('\n'),
    )
  })
}

test('rejects attachment symlinks that escape the evidence directory', async (t) => {
  const validator = await loadValidator()
  const root = await mkdtemp(join(tmpdir(), 'buzz-device-symlink-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'record')
  await mkdir(directory)
  await writeFile(join(root, 'outside.txt'), 'sanitized fixture output\n')
  await symlink('../outside.txt', join(directory, 'captured.txt'))

  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.evidence[0].path = 'captured.txt'
  record.evidence[0].sha256 = sha256('sanitized fixture output\n')
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('escapes its evidence directory'),
    ),
    result.errors.join('\n'),
  )
})

test('rejects attachment symlinks even when their target stays in the evidence directory', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-local-symlink-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const contents = 'sanitized fixture output\n'
  await writeFile(join(directory, 'target.txt'), contents)
  await symlink('target.txt', join(directory, 'captured.txt'))

  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.evidence[0].path = 'captured.txt'
  record.evidence[0].sha256 = sha256(contents)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('must not use symbolic links'),
    ),
    result.errors.join('\n'),
  )
})

test('rejects retained attachments over the production size limit', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-oversize-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const attachmentPath = join(directory, 'captured.txt')
  await writeFile(attachmentPath, '')
  await truncate(attachmentPath, maxEvidenceAttachmentBytes + 1)

  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.evidence[0].path = 'captured.txt'
  record.evidence[0].sha256 = '0'.repeat(64)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes(
        `exceeds the ${maxEvidenceAttachmentBytes}-byte production limit`,
      ),
    ),
    result.errors.join('\n'),
  )
})

for (const [label, prepare, expectedError] of [
  [
    'missing attachment',
    async (_directory: string, record: MutableEvidenceFixture) => {
      record.evidence[0].path = 'missing.txt'
    },
    'does not exist',
  ],
  [
    'attachment directory',
    async (directory: string, record: MutableEvidenceFixture) => {
      await mkdir(join(directory, 'captured'))
      record.evidence[0].path = 'captured'
    },
    'is not a regular file',
  ],
  [
    'attachment hash mismatch',
    async (directory: string, record: MutableEvidenceFixture) => {
      await retainFixtureAttachment(directory)
      record.evidence[0].sha256 = '0'.repeat(64)
    },
    'SHA-256 mismatch',
  ],
] as const) {
  test(`rejects ${label}`, async (t) => {
    const validator = await loadValidator()
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-file-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    await prepare(directory, record)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) => error.includes(expectedError)),
      result.errors.join('\n'),
    )
  })
}

for (const [label, contents] of [
  ['PEM private key', '-----BEGIN PRIVATE KEY-----\nfixture\n'],
  ['bearer authorization', 'Authorization: Bearer fixture-credential\n'],
  ['cookie header', 'Cookie: session=fixture-cookie\n'],
  ['password assignment', 'password=fixture-password\n'],
  ['password URL', 'postgres://buzz:fixture-password@postgres/buzz\n'],
  ['Nostr private key', `nsec1${'q'.repeat(58)}\n`],
  ['Buzz service secret', 'BUZZ_GIT_HOOK_HMAC_SECRET=fixture-secret\n'],
] as const) {
  test(`rejects ${label} in retained attachment content`, async (t) => {
    const validator = await loadValidator()
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-secret-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.evidence[0].path = 'captured.txt'
    record.evidence[0].sha256 = sha256(contents)
    await writeFile(join(directory, 'captured.txt'), contents)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) =>
        error.includes('attachment contains a forbidden sensitive value'),
      ),
      result.errors.join('\n'),
    )
  })
}

for (const args of [
  ['--password', 'fixture-password'],
  ['--secret=fixture-secret'],
  ['--token', 'fixture-token'],
]) {
  test(`rejects credential-bearing command argv ${args[0]}`, async (t) => {
    const validator = await loadValidator()
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-argv-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.execution.commands = [
      { program: 'fixture-command', args, exitCode: 0 },
    ]
    await retainFixtureAttachment(directory)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) =>
        error.includes('forbidden sensitive command argument'),
      ),
      result.errors.join('\n'),
    )
  })
}

test('compares operator and reviewer identities case-insensitively', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-reviewer-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.execution.operator = '@Same-Actor'
  record.review.reviewer = '@same-actor'
  await retainFixtureAttachment(directory)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) => error.includes('independent reviewer')),
    result.errors.join('\n'),
  )
})

for (const [name, expectedError] of [
  ['invalid-beta-os.json', 'stable StartOS 0.4.0'],
  ['invalid-architecture.json', 'archive name'],
  ['invalid-failed-assertion.json', 'passing evidence'],
  ['invalid-missing-assertion-evidence.json', 'direct retained evidence'],
  ['invalid-reviewer.json', 'independent reviewer'],
  ['invalid-secret.json', 'forbidden sensitive value'],
] as const) {
  test(`rejects ${name}`, async () => {
    const validator = await loadValidator()
    const result = await validator.validateEvidenceFile(
      fixture(name),
      schemaPath,
      {
        candidatePath: frozenCandidatePath,
        allowFixtureOverlay: true,
      },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) => error.includes(expectedError)),
      result.errors.join('\n'),
    )
  })
}

test('returns validation errors instead of throwing for malformed evidence', async () => {
  const validator = await loadValidator()
  const result = await validator.validateEvidenceFile(
    fixture('invalid-shape.json'),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(result.errors.length > 0)
})

test('catalogs the complete authorization, restore, and upgrade controls', async () => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)
  const assertions = (gateId: string) =>
    catalog.gates.find(({ id }) => id === gateId)?.requiredAssertions ?? []

  for (const assertion of [
    'authorization.restricted-kind-matrix',
    'authorization.expired-restriction-path',
    'authorization.allowed-authorized-path',
    'authorization.no-write-on-rejection',
    'authorization.stable-generic-error',
    'authorization.no-raw-database-text',
  ]) {
    assert.ok(assertions('AUTH-02').includes(assertion), assertion)
  }
  for (const assertion of [
    'restore.same-architecture',
    'restore.cross-architecture-x86-to-aarch64',
    'restore.cross-architecture-aarch64-to-x86',
    'restore.native-package-reinstalled',
  ]) {
    assert.ok(assertions('BKP-01').includes(assertion), assertion)
  }
  assert.ok(assertions('UPG-01').includes('upgrade.source-identity'))
})

test('accepts the exhaustive AUTH-02 authorization regression structure', async (t) => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)
  const gate = catalog.gates.find(({ id }) => id === 'AUTH-02')
  assert.ok(gate)
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-auth-valid-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.gateId = gate.id
  requirePassingAssertions(record, gate.requiredAssertions)
  const cases = authorizationCases()
  assert.equal(cases.length, 99)
  record.authorizationRegression = {
    cases,
    roleAuthorization: { cases: roleAuthorizationCases() },
  }
  await retainFixtureAttachment(directory)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.deepEqual(result, { valid: true, errors: [] })
})

for (const [label, mutate, expectedError] of [
  [
    'a required role/state/kind combination is missing',
    (cases: AuthorizationCase[]) => {
      cases.pop()
    },
    'authorizationRegression must cover exactly',
  ],
  [
    'an active restriction persists a write',
    (cases: AuthorizationCase[]) => {
      const target = cases.find(
        ({ restrictionState }) => restrictionState === 'active-ban',
      )
      assert.ok(target)
      target.eventPersisted = true
    },
    'rejected authorization cases must not persist writes',
  ],
  [
    'an active restriction exposes an unstable client error',
    (cases: AuthorizationCase[]) => {
      const target = cases.find(
        ({ restrictionState }) => restrictionState === 'active-timeout',
      )
      assert.ok(target)
      target.clientError = 'duplicate key violates users_pkey'
    },
    'rejected authorization cases require the stable generic error',
  ],
  [
    'a rejection exposes raw database text',
    (cases: AuthorizationCase[]) => {
      const target = cases.find(
        ({ restrictionState }) => restrictionState === 'active-ban',
      )
      assert.ok(target)
      target.rawDatabaseTextObserved = true
    },
    'authorization cases must not expose raw database or SQL text',
  ],
  [
    'an expired restriction remains blocked',
    (cases: AuthorizationCase[]) => {
      const target = cases.find(
        ({ restrictionState }) => restrictionState === 'expired-ban',
      )
      assert.ok(target)
      target.outcome = 'rejected'
      target.eventPersisted = false
      target.clientError = 'request rejected'
    },
    'expired restrictions must follow an accepted authorized path',
  ],
  [
    'the unrestricted authorized path is missing',
    (cases: AuthorizationCase[]) => {
      const index = cases.findIndex(
        ({ restrictionState }) => restrictionState === 'none',
      )
      assert.notEqual(index, -1)
      cases.splice(index, 1)
    },
    'authorizationRegression must cover exactly',
  ],
] as const) {
  test(`rejects AUTH-02 when ${label}`, async (t) => {
    const validator = await loadValidator()
    const catalog = await validator.loadGateCatalog(catalogPath)
    const gate = catalog.gates.find(({ id }) => id === 'AUTH-02')
    assert.ok(gate)
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-auth-bad-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.gateId = gate.id
    requirePassingAssertions(record, gate.requiredAssertions)
    const cases = authorizationCases()
    mutate(cases)
    record.authorizationRegression = {
      cases,
      roleAuthorization: { cases: roleAuthorizationCases() },
    }
    await retainFixtureAttachment(directory)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) => error.includes(expectedError)),
      result.errors.join('\n'),
    )
  })
}

for (const [label, mutate, expectedError] of [
  [
    'a required structured role invariant is missing',
    (cases: RoleAuthorizationCase[]) => {
      cases.pop()
    },
    'roleAuthorization must cover exactly',
  ],
  [
    'a rejected role change persists an event',
    (cases: RoleAuthorizationCase[]) => {
      cases[0].eventPersisted = true
    },
    'role authorization rejections must not persist writes',
  ],
  [
    'a role rejection exposes an unstable client error',
    (cases: RoleAuthorizationCase[]) => {
      cases[1].clientError = 'duplicate key violates users_pkey'
    },
    'role authorization rejections require the stable generic error',
  ],
  [
    'a role rejection exposes raw database text',
    (cases: RoleAuthorizationCase[]) => {
      cases[2].rawDatabaseTextObserved = true
    },
    'role authorization checks must not expose raw database or SQL text',
  ],
  [
    'persisted state changes after a rejected role operation',
    (cases: RoleAuthorizationCase[]) => {
      cases[0].after.stateHash = `sha256:${'e'.repeat(64)}`
    },
    'role authorization before/after state hashes must match',
  ],
  [
    'the owner set changes after a rejected role operation',
    (cases: RoleAuthorizationCase[]) => {
      cases[2].after.ownerPubkeys = ['3'.repeat(64)]
    },
    'role authorization must preserve the owner set',
  ],
  [
    'a channel has no active owner after a rejected role operation',
    (cases: RoleAuthorizationCase[]) => {
      cases[3].after.channels[0].activeOwnerPubkeys = []
    },
    'every channel requires at least one active owner',
  ],
] as const) {
  test(`rejects AUTH-02 when ${label}`, async (t) => {
    const validator = await loadValidator()
    const catalog = await validator.loadGateCatalog(catalogPath)
    const gate = catalog.gates.find(({ id }) => id === 'AUTH-02')
    assert.ok(gate)
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-role-bad-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.gateId = gate.id
    requirePassingAssertions(record, gate.requiredAssertions)
    const roleCases = roleAuthorizationCases()
    mutate(roleCases)
    record.authorizationRegression = {
      cases: authorizationCases(),
      roleAuthorization: { cases: roleCases },
    }
    await retainFixtureAttachment(directory)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) => error.includes(expectedError)),
      result.errors.join('\n'),
    )
  })
}

test('accepts BKP-01 only with all same- and cross-architecture restores', async (t) => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)
  const gate = catalog.gates.find(({ id }) => id === 'BKP-01')
  assert.ok(gate)
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-restore-valid-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.gateId = gate.id
  requirePassingAssertions(record, gate.requiredAssertions)
  record.restoreTrials = completeRestoreTrials()
  await retainFixtureAttachment(directory)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.deepEqual(result, { valid: true, errors: [] })
})

for (const [source, target] of [
  ['x86_64', 'x86_64'],
  ['aarch64', 'aarch64'],
  ['x86_64', 'aarch64'],
  ['aarch64', 'x86_64'],
] as const) {
  test(`rejects BKP-01 without ${source}->${target} restore evidence`, async (t) => {
    const validator = await loadValidator()
    const catalog = await validator.loadGateCatalog(catalogPath)
    const gate = catalog.gates.find(({ id }) => id === 'BKP-01')
    assert.ok(gate)
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-restore-bad-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.gateId = gate.id
    requirePassingAssertions(record, gate.requiredAssertions)
    record.restoreTrials = completeRestoreTrials().filter(
      (trial) =>
        !(
          trial.source.architecture === source &&
          trial.target.architecture === target
        ),
    )
    await retainFixtureAttachment(directory)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) =>
        error.includes(`BKP-01 requires ${source}->${target} restore evidence`),
      ),
      result.errors.join('\n'),
    )
  })
}

test('rejects cross-architecture restore evidence without native reinstall', async (t) => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)
  const gate = catalog.gates.find(({ id }) => id === 'BKP-01')
  assert.ok(gate)
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-restore-native-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.gateId = gate.id
  requirePassingAssertions(record, gate.requiredAssertions)
  record.restoreTrials = completeRestoreTrials()
  const crossTrial = record.restoreTrials.find(
    (trial) => trial.source.architecture !== trial.target.architecture,
  )
  assert.ok(crossTrial)
  crossTrial.nativePackageReinstalled = false
  await retainFixtureAttachment(directory)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('cross-architecture restores require native reinstall'),
    ),
    result.errors.join('\n'),
  )
})

for (const [label, mutate, expectedError] of [
  [
    'missing target hardware identity',
    (trials: RestoreTrial[]) => {
      delete (trials[0].target as Partial<RestoreEndpoint>).cpu
    },
    'complete hardware identity',
  ],
  [
    'a target using a different StartOS image',
    (trials: RestoreTrial[]) => {
      trials[0].target.startosImageSha256 = '1'.repeat(64)
    },
    'match the frozen StartOS identity',
  ],
] as const) {
  test(`rejects BKP-01 with ${label}`, async (t) => {
    const validator = await loadValidator()
    const catalog = await validator.loadGateCatalog(catalogPath)
    const gate = catalog.gates.find(({ id }) => id === 'BKP-01')
    assert.ok(gate)
    const directory = await mkdtemp(join(tmpdir(), 'buzz-device-hardware-bad-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.gateId = gate.id
    requirePassingAssertions(record, gate.requiredAssertions)
    const trials = completeRestoreTrials()
    mutate(trials)
    record.restoreTrials = trials
    await retainFixtureAttachment(directory)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some((error) => error.includes(expectedError)),
      result.errors.join('\n'),
    )
  })
}

for (const architecture of ['x86_64', 'aarch64'] as const) {
  test(`accepts exact published :2 upgrade source for ${architecture}`, async (t) => {
    const validator = await loadValidator()
    const [catalog, candidate] = await Promise.all([
      validator.loadGateCatalog(catalogPath),
      validator.loadCandidateContract(frozenCandidatePath),
    ])
    const gate = catalog.gates.find(({ id }) => id === 'UPG-01')
    assert.ok(gate)
    const directory = await mkdtemp(
      join(tmpdir(), 'buzz-device-upgrade-valid-'),
    )
    t.after(() => rm(directory, { recursive: true, force: true }))
    const record = JSON.parse(
      await readFile(fixture('valid-artifact.json'), 'utf8'),
    ) as MutableEvidenceFixture
    record.gateId = gate.id
    requirePassingAssertions(record, gate.requiredAssertions)
    record.upgradeSource = upgradeSourceFor(candidate, architecture)
    if (architecture === 'aarch64') {
      const artifact = candidate.package.artifacts.aarch64
      if (
        artifact.sha256 === null ||
        artifact.sizeBytes === null ||
        candidate.startos.architectures.aarch64.buildId === null ||
        candidate.startos.architectures.aarch64.imageSha256 === null
      ) {
        assert.fail('frozen fixture candidate must be complete')
      }
      record.device.architecture = architecture
      record.device.startos.buildId =
        candidate.startos.architectures.aarch64.buildId
      record.device.startos.imageSha256 =
        candidate.startos.architectures.aarch64.imageSha256
      record.releaseCandidate.archive = {
        name: artifact.name,
        sha256: artifact.sha256,
        sizeBytes: artifact.sizeBytes,
      }
    }
    await retainFixtureAttachment(directory)
    const recordPath = join(directory, 'record.json')
    await writeFile(recordPath, JSON.stringify(record))

    const result = await validator.validateEvidenceFile(
      pathToFileURL(recordPath),
      schemaPath,
      { candidatePath: frozenCandidatePath },
    )

    assert.deepEqual(result, { valid: true, errors: [] })
  })
}

test('rejects a mismatched UPG-01 published-source artifact hash', async (t) => {
  const validator = await loadValidator()
  const [catalog, candidate] = await Promise.all([
    validator.loadGateCatalog(catalogPath),
    validator.loadCandidateContract(frozenCandidatePath),
  ])
  const gate = catalog.gates.find(({ id }) => id === 'UPG-01')
  assert.ok(gate)
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-upgrade-bad-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.gateId = gate.id
  requirePassingAssertions(record, gate.requiredAssertions)
  record.upgradeSource = upgradeSourceFor(candidate, 'x86_64')
  record.upgradeSource.artifact.sha256 = '0'.repeat(64)
  await retainFixtureAttachment(directory)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('upgradeSource does not match the fixed :2 identity'),
    ),
    result.errors.join('\n'),
  )
})

test('rejects UPG-01 without the fixed published upgradeSource', async (t) => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)
  const gate = catalog.gates.find(({ id }) => id === 'UPG-01')
  assert.ok(gate)
  const directory = await mkdtemp(
    join(tmpdir(), 'buzz-device-upgrade-missing-'),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.gateId = gate.id
  requirePassingAssertions(record, gate.requiredAssertions)
  await retainFixtureAttachment(directory)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('UPG-01 requires upgradeSource'),
    ),
    result.errors.join('\n'),
  )
})

test('requires upgradeSource only on UPG-01 records', async (t) => {
  const validator = await loadValidator()
  const candidate = await validator.loadCandidateContract(frozenCandidatePath)
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-upgrade-extra-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.upgradeSource = upgradeSourceFor(candidate, 'x86_64')
  await retainFixtureAttachment(directory)
  const recordPath = join(directory, 'record.json')
  await writeFile(recordPath, JSON.stringify(record))

  const result = await validator.validateEvidenceFile(
    pathToFileURL(recordPath),
    schemaPath,
    { candidatePath: frozenCandidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('only UPG-01 may carry upgradeSource'),
    ),
    result.errors.join('\n'),
  )
})

test('validates the template and keeps all 46 production cells NOT RUN', async () => {
  const validator = await loadValidator()
  const result = await validator.validateRepository({
    candidatePath,
    catalogPath,
    examplePath,
    matrixPath,
    schemaPath,
  })

  assert.deepEqual(result, { valid: true, errors: [], matrixCells: 46 })

  const matrix = await readFile(matrixPath, 'utf8')
  const statuses = canonicalMatrixStatuses(matrix)
  assert.deepEqual(
    statuses.map(({ gateId }) => gateId),
    gateIds,
  )
  assert.equal(statuses.length, 23)
  for (const status of statuses) {
    assert.equal(status.x86_64, 'NOT RUN', `${status.gateId}/x86_64`)
    assert.equal(status.aarch64, 'NOT RUN', `${status.gateId}/aarch64`)
  }
  assert.equal(statuses.length * 2, 46)
  assert.doesNotMatch(matrix, /\[(?:PASS|FAIL|BLOCKED)\]\(/)
})

test('rejects a matrix-linked inherited evidence record', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-overlay-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(
    join(directory, 'overlay.json'),
    JSON.stringify({
      extends: fixture('valid-artifact.json').href,
      replace: {},
    }),
  )
  const temporaryMatrix = join(directory, 'DEVICE_TEST_MATRIX.md')
  await writeFile(
    temporaryMatrix,
    matrixFixture({
      'ART-01': { x86_64: '[PASS](overlay.json)' },
    }),
  )

  const result = await validator.validateRepository({
    candidatePath: frozenCandidatePath,
    catalogPath,
    examplePath,
    matrixPath: pathToFileURL(temporaryMatrix),
    schemaPath,
  })

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('cannot use fixture inheritance overlays'),
    ),
    result.errors.join('\n'),
  )
})

for (const matrixLinkKind of [
  'file URL',
  'absolute path',
  'path traversal',
  'escaping symlink',
] as const) {
  test(`rejects a matrix evidence ${matrixLinkKind}`, async (t) => {
    const validator = await loadValidator()
    const root = await mkdtemp(join(tmpdir(), 'buzz-device-matrix-path-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const matrixDirectory = join(root, 'matrix')
    await mkdir(matrixDirectory)
    await retainFixtureAttachment(root)
    const outsideRecord = join(root, 'outside.json')
    await writeFile(
      outsideRecord,
      await readFile(fixture('valid-artifact.json')),
    )

    let matrixLink: string
    if (matrixLinkKind === 'file URL') {
      matrixLink = pathToFileURL(outsideRecord).href
    } else if (matrixLinkKind === 'absolute path') {
      matrixLink = outsideRecord
    } else if (matrixLinkKind === 'path traversal') {
      matrixLink = '../outside.json'
    } else {
      matrixLink = 'linked.json'
      await symlink('../outside.json', join(matrixDirectory, matrixLink))
    }

    const temporaryMatrix = join(matrixDirectory, 'DEVICE_TEST_MATRIX.md')
    await writeFile(
      temporaryMatrix,
      matrixFixture({
        'ART-01': { x86_64: `[PASS](${matrixLink})` },
      }),
    )

    const result = await validator.validateRepository({
      candidatePath: frozenCandidatePath,
      catalogPath,
      examplePath,
      matrixPath: pathToFileURL(temporaryMatrix),
      schemaPath,
    })

    assert.equal(result.valid, false)
    assert.ok(
      result.errors.some(
        (error) =>
          error.includes('matrix evidence') &&
          (error.includes('local relative path') ||
            error.includes('escapes its matrix directory') ||
            error.includes('must not use symbolic links')),
      ),
      result.errors.join('\n'),
    )
  })
}

test('rejects linked records from different release candidates', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-evidence-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await retainFixtureAttachment(directory)

  const x86 = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  const arm = structuredClone(x86)
  arm.device.architecture = 'aarch64'
  arm.releaseCandidate.archive.name = 'buzz_aarch64.s9pk'
  arm.releaseCandidate.packageCommit =
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

  await Promise.all([
    writeFile(join(directory, 'x86.json'), JSON.stringify(x86)),
    writeFile(join(directory, 'arm.json'), JSON.stringify(arm)),
  ])

  const matrix = matrixFixture({
    'ART-01': {
      x86_64: '[PASS](x86.json)',
      aarch64: '[PASS](arm.json)',
    },
  })
  const temporaryMatrix = join(directory, 'DEVICE_TEST_MATRIX.md')
  await writeFile(temporaryMatrix, matrix)

  const result = await validator.validateRepository({
    candidatePath: frozenCandidatePath,
    catalogPath,
    examplePath,
    matrixPath: pathToFileURL(temporaryMatrix),
    schemaPath,
  })

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('release candidate identity differs'),
    ),
    result.errors.join('\n'),
  )
})

test('rejects a passed gate whose dependency has not passed', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-dependency-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await retainFixtureAttachment(directory)

  const record = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  record.gateId = 'INS-01'
  record.assertions = [
    'install.sideload',
    'install.version',
    'install.pre-setup-block',
  ].map((id) => ({
    id,
    expected: 'Fixture expectation',
    observed: 'Fixture observation',
    outcome: 'pass',
    evidenceIds: ['artifact-verification'],
  }))

  await writeFile(join(directory, 'install.json'), JSON.stringify(record))
  const temporaryMatrix = join(directory, 'DEVICE_TEST_MATRIX.md')
  await writeFile(
    temporaryMatrix,
    matrixFixture({
      'INS-01': { x86_64: '[PASS](install.json)' },
    }),
  )

  const result = await validator.validateRepository({
    candidatePath: frozenCandidatePath,
    catalogPath,
    examplePath,
    matrixPath: pathToFileURL(temporaryMatrix),
    schemaPath,
  })

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) =>
      error.includes('INS-01/x86_64 requires PASS for ART-01'),
    ),
    result.errors.join('\n'),
  )
})

test('promotion rejects an unfrozen 46-cell template', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-unfrozen-promotion-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const candidate = makeUnfrozenCandidate(
    JSON.parse(
      await readFile(candidatePath, 'utf8'),
    ) as MutableCandidateContract,
  )
  const unfrozenCandidatePath = join(directory, 'candidate.json')
  await writeFile(unfrozenCandidatePath, JSON.stringify(candidate))
  const result = await validator.validateRepository({
    candidatePath: pathToFileURL(unfrozenCandidatePath),
    catalogPath,
    examplePath,
    matrixPath,
    mode: 'promotion',
    schemaPath,
  })

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) => error.includes('candidate is UNFROZEN')),
    result.errors.join('\n'),
  )
  assert.ok(
    result.errors.some((error) =>
      error.includes('promotion requires exactly 46 linked PASS cells'),
    ),
    result.errors.join('\n'),
  )
})

test('promotion still fails closed after 46 PASS records without authenticated binding', async (t) => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)
  const candidate = await validator.loadCandidateContract(frozenCandidatePath)
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-promotion-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await retainFixtureAttachment(directory)

  const base = JSON.parse(
    await readFile(fixture('valid-artifact.json'), 'utf8'),
  ) as MutableEvidenceFixture
  const cells: Record<string, { x86_64?: string; aarch64?: string }> = {}
  const writes: Array<Promise<void>> = []

  for (const gate of catalog.gates) {
    cells[gate.id] = {}
    for (const architecture of ['x86_64', 'aarch64'] as const) {
      const record = structuredClone(base)
      const artifact = candidate.package.artifacts[architecture]
      const startos = candidate.startos.architectures[architecture]
      const archiveSha256 = artifact.sha256
      const archiveSizeBytes = artifact.sizeBytes
      const startosBuildId = startos.buildId
      const startosImageSha256 = startos.imageSha256
      if (
        archiveSha256 === null ||
        archiveSizeBytes === null ||
        startosBuildId === null ||
        startosImageSha256 === null
      ) {
        assert.fail('frozen fixture candidate must be complete')
      }

      record.gateId = gate.id
      record.device.architecture = architecture
      record.device.startos.buildId = startosBuildId
      record.device.startos.imageSha256 = startosImageSha256
      record.releaseCandidate.archive = {
        name: artifact.name,
        sha256: archiveSha256,
        sizeBytes: archiveSizeBytes,
      }
      requirePassingAssertions(record, gate.requiredAssertions)
      if (gate.id === 'AUTH-02') {
        record.authorizationRegression = {
          cases: authorizationCases(),
          roleAuthorization: { cases: roleAuthorizationCases() },
        }
      }
      if (gate.id === 'BKP-01') {
        record.restoreTrials = completeRestoreTrials()
      }
      if (gate.id === 'UPG-01') {
        record.upgradeSource = upgradeSourceFor(candidate, architecture)
      }

      const fileName = `${gate.id.toLowerCase()}-${architecture}.json`
      cells[gate.id][architecture] = `[PASS](${fileName})`
      writes.push(
        writeFile(join(directory, fileName), JSON.stringify(record, null, 2)),
      )
    }
  }

  await Promise.all(writes)
  const temporaryMatrix = join(directory, 'DEVICE_TEST_MATRIX.md')
  await writeFile(temporaryMatrix, matrixFixture(cells))

  const result = await validator.validateRepository({
    candidatePath: frozenCandidatePath,
    catalogPath,
    examplePath,
    matrixPath: pathToFileURL(temporaryMatrix),
    mode: 'promotion',
    schemaPath,
  })

  assert.equal(result.valid, false)
  assert.equal(result.matrixCells, 46)
  assert.deepEqual(result.errors, [
    'promotion is disabled until authenticated operator/reviewer binding can be verified',
  ])
})

test('runs the repository validator through the project tsx configuration', async () => {
  const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'scripts/validate-device-evidence.ts'],
    { cwd: repositoryRoot },
  )

  assert.equal(stderr, '')
  assert.match(stdout, /Device evidence structure is valid \(46 cells\)/)
})

test('exposes a strict release-only device promotion command', async () => {
  const packageJson = JSON.parse(
    await readFile(repositoryFile('package.json'), 'utf8'),
  ) as { scripts: Record<string, string> }

  assert.equal(
    packageJson.scripts['verify:device-promotion'],
    'tsx scripts/validate-device-evidence.ts --promotion',
  )
})

test('documents the ordered stable StartOS production run', async () => {
  const [matrix, runbook] = await Promise.all([
    readFile(repositoryFile('docs/testing/DEVICE_TEST_MATRIX.md'), 'utf8'),
    readFile(repositoryFile('docs/testing/DEVICE_TEST_RUNBOOK.md'), 'utf8'),
  ])

  for (const document of [matrix, runbook]) {
    assert.match(document, /NO-GO/i)
    assert.match(document, /UNFROZEN/i)
    assert.match(document, /0\.5\.4:0/)
    assert.match(document, /651f6372754e60e3f936b3397040eb0f1e44c9f3/)
    assert.match(document, /Community Registry beta/i)
    assert.match(document, /clean install/i)
    assert.match(document, /initial setup/i)
    assert.match(document, /UI access/i)
    assert.match(document, /health/i)
    assert.match(document, /relay\s+round\s+trip/i)
    assert.match(document, /Desktop.*ACP/i)
    assert.match(document, /pairing QR/i)
    assert.match(document, /uninstall.*reinstall/i)
    assert.match(document, /all 46/i)
    assert.match(document, /backup.*restore/i)
    assert.match(document, /cross-architecture restore/i)
    assert.match(document, /24-hour.*soak/i)
    assert.match(document, /independent review/i)
  }

  const statuses = canonicalMatrixStatuses(matrix)
  assert.deepEqual(
    statuses.map(({ gateId }) => gateId),
    gateIds,
  )
  assert.equal(statuses.length, 23)
  assert.equal(
    statuses.filter(
      ({ x86_64, aarch64 }) => x86_64 === 'NOT RUN' && aarch64 === 'NOT RUN',
    ).length * 2,
    46,
  )

  assert.match(runbook, /official\s+stable StartOS `0\.4\.0`/)
  assert.match(
    runbook,
    /`0\.4\.0-beta\.10` is (?:only )?the\s+compatibility floor/,
  )
  assert.match(runbook, /native x86_64/)
  assert.match(runbook, /native aarch64/)
  assert.match(runbook, /must not move/)
  assert.match(runbook, /must not\s+be rebuilt or replaced/)
  assert.match(runbook, /evidence may be committed\s+after the candidate tag/i)
  assert.match(runbook, /never (?:capture|record|retain).*secrets/i)
  assert.match(runbook, /DEVICE_CANDIDATE\.json/)
  assert.match(runbook, /514af0c2fa076c8b597d9861f882bdb1b3411d9e/)
  assert.match(runbook, /npm run verify:device-promotion/)
  assert.match(runbook, /authenticated.*operator.*reviewer.*binding/i)
  for (const eventKind of authorizationEventKinds) {
    assert.match(runbook, new RegExp(`\\b${eventKind}\\b`))
  }
  assert.match(runbook, /active ban/i)
  assert.match(runbook, /active timeout/i)
  assert.match(runbook, /expired restriction/i)
  assert.match(runbook, /no\s+(?:event\s+)?write/i)
  assert.match(runbook, /request rejected/)
  assert.match(runbook, /raw (?:database|DB).*SQL/i)
  assert.match(runbook, /authorizationRegression\.roleAuthorization/)
  assert.match(runbook, /before.*after.*persisted state/i)
  assert.match(runbook, /16 MiB/)
  assert.match(runbook, /symbolic links.*rejected/i)
  assert.match(runbook, /x86_64.*aarch64/)
  assert.match(runbook, /aarch64.*x86_64/)
  assert.match(runbook, /projects\/start-os\/docs\/src\/backup-restore\.md/)
  assert.match(
    runbook,
    /8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2/,
  )
  assert.match(runbook, /promotion is disabled.*authenticated/i)

  let previousIndex = -1
  for (const gateId of gateIds) {
    const index = runbook.indexOf(`### ${gateId}`)
    assert.ok(index > previousIndex, `${gateId} must appear in canonical order`)
    previousIndex = index
  }
})

test('binds formal beta UPG-01 to the published candidate source and separates the local x86 preflight', async () => {
  const validator = await loadValidator()
  const candidate = await validator.loadCandidateContract(candidatePath)
  const [matrix, runbook] = await Promise.all([
    readFile(repositoryFile('docs/testing/DEVICE_TEST_MATRIX.md'), 'utf8'),
    readFile(repositoryFile('docs/testing/DEVICE_TEST_RUNBOOK.md'), 'utf8'),
  ])
  const expectedPublishedSource = {
    tag: 'v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2',
    version: '0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2',
    packageCommit: '0103ba850c08ae84cca5c623ea76c855d7a7f1a4',
    upstreamCommit: 'dd222a509b156ba52ed3219e895d7bf1cf322c92',
    signerFingerprint:
      'sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c',
    artifacts: {
      x86_64: {
        name: 'buzz_x86_64.s9pk',
        sha256:
          '8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2',
      },
      aarch64: {
        name: 'buzz_aarch64.s9pk',
        sha256:
          '72e4e73e413df327af11eba48c4808b1e011729c3a1f6113d25a6c63138c2638',
      },
    },
  }
  assert.deepEqual(candidate.upgradeSource, expectedPublishedSource)

  const publishedValues = [
    expectedPublishedSource.tag,
    expectedPublishedSource.version,
    expectedPublishedSource.packageCommit,
    expectedPublishedSource.upstreamCommit,
    expectedPublishedSource.signerFingerprint,
    expectedPublishedSource.artifacts.x86_64.sha256,
    expectedPublishedSource.artifacts.aarch64.sha256,
  ]
  const formalBetaSections = [
    markdownSection(matrix, '## Community Registry Beta Minimum'),
    markdownSection(runbook, '## Community Registry Beta Minimum'),
  ]
  for (const section of formalBetaSections) {
    assert.match(section, /UPG-01/)
    assert.doesNotMatch(section, /63496\.cc:2/)
    for (const value of publishedValues) {
      assert.ok(section.includes(value), `formal beta source missing ${value}`)
    }
  }

  const formalUpgradeSection = markdownSection(runbook, '### UPG-01')
  for (const value of publishedValues) {
    assert.ok(formalUpgradeSection.includes(value), `UPG-01 missing ${value}`)
  }
  const matrixUpgrade = canonicalMatrixStatuses(matrix).find(
    ({ gateId }) => gateId === 'UPG-01',
  )
  assert.ok(matrixUpgrade)
  assert.match(matrixUpgrade.acceptanceGate, /Published `dd222a5:2` release/)

  for (const document of [matrix, runbook]) {
    const localPreflight = markdownSection(
      document,
      '## Operator-Specific Local x86_64 Transition Preflight',
    )
    for (const value of [
      '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2',
      '2ae96a9aa150d3fd50a19eaf5fa30a81b452c9e4',
      '63496cc1d4c6f1b7c613801bdcc694169dcf391a',
      'acc6224859b5fc4c945ab43d3a81ea961938459262616650bcd31851b8133b4e',
    ]) {
      assert.ok(
        localPreflight.includes(value),
        `local preflight missing ${value}`,
      )
    }
    assert.match(localPreflight, /not published/i)
    assert.match(localPreflight, /no[\s\S]{0,100}(?:aarch64|arm64).*artifact/i)
    assert.match(localPreflight, /outside[\s\S]{0,100}46-cell.*matrix/i)
    assert.match(
      localPreflight,
      /cannot count[\s\S]{0,100}Community Registry[\s\S]{0,40}beta/i,
    )
    assert.match(localPreflight, /cannot count[\s\S]{0,120}production/i)
  }
})

test('requires a fail-closed audit before upgrading published revision :2', async () => {
  const audit = await readFile(
    repositoryFile('docs/operations/PRE_UPGRADE_AUDIT.md'),
    'utf8',
  )

  for (const immutableValue of [
    'v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2',
    '0103ba850c08ae84cca5c623ea76c855d7a7f1a4',
    '8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2',
    '72e4e73e413df327af11eba48c4808b1e011729c3a1f6113d25a6c63138c2638',
  ]) {
    assert.match(audit, new RegExp(immutableValue))
  }

  assert.match(audit, /verified backup/i)
  assert.match(audit, /at least one active owner.*every channel/i)
  assert.match(audit, /suspicious role history/i)
  assert.match(audit, /operator confirmation/i)
  assert.match(audit, /rollback/i)
  assert.match(audit, /synthetic.*network-isolated/i)
  assert.match(audit, /must not automatically (?:promote|repair).*owner/i)
})

test('fixes a reproducible resource workload without inventing minimum hardware', async () => {
  const profile = JSON.parse(
    await readFile(
      repositoryFile('docs/testing/RESOURCE_PROFILE.production-v1.json'),
      'utf8',
    ),
  ) as {
    schemaVersion: number
    profileId: string
    workload: {
      identities: number
      channels: number
      signedEvents: number
      mediaObjects: number
      mediaBytes: number
      gitRepositories: number
      gitCommits: number
      gitBytes: number
      concurrency: {
        websocketConnections: number
        publishers: number
        readers: number
        mediaWorkers: number
        gitWorkers: number
      }
    }
    protocol: {
      sampleIntervalSeconds: number
      coldStarts: number
      idleMinutes: number
      loadMinutes: number
      soakHours: number
      differentialDataIncreasePercent: number
      phases: string[]
    }
    requiredMeasurements: string[]
    acceptance: {
      maximumHealthyStartupSeconds: number
      unexpectedFailures: number
      stateMismatches: number
    }
    hardwareMinimums: null
  }

  assert.equal(profile.schemaVersion, 1)
  assert.equal(profile.profileId, 'production-v1')
  assert.deepEqual(profile.workload, {
    identities: 20,
    channels: 10,
    signedEvents: 100000,
    mediaObjects: 1000,
    mediaBytes: 10737418240,
    gitRepositories: 5,
    gitCommits: 1000,
    gitBytes: 2147483648,
    concurrency: {
      websocketConnections: 20,
      publishers: 10,
      readers: 10,
      mediaWorkers: 2,
      gitWorkers: 2,
    },
  })
  assert.deepEqual(profile.protocol.phases, [
    'cold-start',
    'idle',
    'representative-load',
    'full-backup',
    'differential-backup',
    'clean-target-restore',
    'soak',
  ])
  assert.equal(profile.protocol.sampleIntervalSeconds, 5)
  assert.equal(profile.protocol.coldStarts, 5)
  assert.equal(profile.protocol.idleMinutes, 30)
  assert.equal(profile.protocol.loadMinutes, 60)
  assert.equal(profile.protocol.soakHours, 24)
  assert.equal(profile.protocol.differentialDataIncreasePercent, 10)
  assert.ok(profile.requiredMeasurements.includes('process-rss-by-container'))
  assert.deepEqual(profile.acceptance, {
    maximumHealthyStartupSeconds: 180,
    unexpectedFailures: 0,
    stateMismatches: 0,
  })
  assert.equal(profile.hardwareMinimums, null)

  const sizing = await readFile(
    repositoryFile('docs/operations/RESOURCE_SIZING.md'),
    'utf8',
  )
  assert.match(sizing, /five-second samples/i)
  assert.match(sizing, /p50.*p95.*p99/i)
  assert.match(sizing, /physical x86_64.*physical aarch64/i)
  assert.match(sizing, /does not establish.*hardware minimum/i)
})

test('keeps contributor and operator documentation aligned with open gates', async () => {
  const [readme, instructions, todo] = await Promise.all([
    readFile(repositoryFile('README.md'), 'utf8'),
    readFile(repositoryFile('instructions.md'), 'utf8'),
    readFile(repositoryFile('TODO.md'), 'utf8'),
  ])

  assert.match(
    readme,
    /official stable StartOS\s+\[publishing guide\]\(https:\/\/docs\.start9\.com\/packaging\/publishing\.html\)/i,
  )
  assert.match(readme, /npm run verify:device-evidence/)
  assert.match(readme, /npm run verify:device-promotion/)
  assert.match(readme, /DEVICE_CANDIDATE\.json/)
  assert.match(readme, /attachments.*local.*SHA-256/i)
  assert.match(readme, /16 MiB/)
  assert.match(readme, /symbolic links.*rejected/i)
  assert.match(
    readme,
    /All 46 StartOS device-matrix cells remain \*\*NOT RUN\*\*/,
  )
  assert.match(readme, /DEVICE_TEST_RUNBOOK\.md/)
  assert.match(readme, /PRE_UPGRADE_AUDIT\.md/)
  assert.match(readme, /RESOURCE_SIZING\.md/)

  assert.match(instructions, /PRE_UPGRADE_AUDIT\.md/)
  assert.match(instructions, /verified backup/i)
  assert.match(instructions, /active owner\s+exists in every channel/i)
  assert.match(instructions, /will not automatically promote.*owner/i)

  assert.match(todo, /46/)
  assert.match(todo, /DEVICE_CANDIDATE\.json/)
  assert.match(todo, /PRE_UPGRADE_AUDIT\.md/)
  assert.match(todo, /RESOURCE_PROFILE\.production-v1\.json/)
  assert.match(todo, /PostgreSQL restore error/)
})
