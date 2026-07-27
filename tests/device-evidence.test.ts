import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

type MutableEvidenceFixture = {
  gateId: string
  device: {
    architecture: string
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
  assertions: Array<{
    id: string
    expected: string
    observed: string
    outcome: string
    evidenceIds: string[]
  }>
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
      version: string | null
      packageCommit: string | null
      upstreamCommit: string | null
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
    promotionControls: {
      authenticatedOperatorReviewerBinding: 'PENDING' | 'ENFORCED'
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

const repositoryFile = (path: string) => new URL(`../${path}`, import.meta.url)

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

test('declares the official StartOS 0.4.0 lineage but remains unfrozen', async () => {
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
  assert.equal(candidate.package.version, null)
  assert.equal(candidate.package.packageCommit, null)
  assert.equal(candidate.package.upstreamCommit, null)
  assert.equal(candidate.package.artifacts.x86_64.sha256, null)
  assert.equal(candidate.package.artifacts.aarch64.sha256, null)
  assert.equal(
    candidate.promotionControls.authenticatedOperatorReviewerBinding,
    'PENDING',
  )
})

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

test('rejects production evidence while the repository candidate is unfrozen', async () => {
  const validator = await loadValidator()
  const result = await validator.validateEvidenceFile(
    fixture('valid-artifact.json'),
    schemaPath,
    { candidatePath },
  )

  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some((error) => error.includes('candidate is UNFROZEN')),
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
  assert.equal(matrix.match(/\bNOT RUN\b/g)?.length, 46)
  assert.doesNotMatch(matrix, /\[(?:PASS|FAIL|BLOCKED)\]\(/)
})

test('rejects linked records from different release candidates', async (t) => {
  const validator = await loadValidator()
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-evidence-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

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

test('promotion rejects the unfrozen 46-cell template', async () => {
  const validator = await loadValidator()
  const result = await validator.validateRepository({
    candidatePath,
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

test('promotion accepts exactly 46 linked records for one frozen candidate', async (t) => {
  const validator = await loadValidator()
  const catalog = await validator.loadGateCatalog(catalogPath)
  const candidate = await validator.loadCandidateContract(frozenCandidatePath)
  const directory = await mkdtemp(join(tmpdir(), 'buzz-device-promotion-'))
  t.after(() => rm(directory, { recursive: true, force: true }))

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
      record.assertions = gate.requiredAssertions.map((id) => ({
        id,
        expected: 'Fixture expectation',
        observed: 'Fixture observation',
        outcome: 'pass',
        evidenceIds: ['artifact-verification'],
      }))

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

  assert.deepEqual(result, { valid: true, errors: [], matrixCells: 46 })
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
  const runbook = await readFile(
    repositoryFile('docs/testing/DEVICE_TEST_RUNBOOK.md'),
    'utf8',
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

  let previousIndex = -1
  for (const gateId of gateIds) {
    const index = runbook.indexOf(`### ${gateId}`)
    assert.ok(index > previousIndex, `${gateId} must appear in canonical order`)
    previousIndex = index
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

  assert.match(readme, /official\s+stable StartOS `0\.4\.0`/)
  assert.match(readme, /npm run verify:device-evidence/)
  assert.match(readme, /npm run verify:device-promotion/)
  assert.match(readme, /DEVICE_CANDIDATE\.json/)
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
