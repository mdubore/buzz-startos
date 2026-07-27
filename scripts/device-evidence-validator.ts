import { readFile } from 'node:fs/promises'

import Ajv2020, { type AnySchema, type ErrorObject } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const ARCHIVES = {
  x86_64: 'buzz_x86_64.s9pk',
  aarch64: 'buzz_aarch64.s9pk',
} as const

const DEFAULT_CATALOG = new URL(
  '../docs/testing/DEVICE_GATES.json',
  import.meta.url,
)

const FORBIDDEN_SENSITIVE_VALUES = [
  /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]+\b/i,
  /\bAuthorization\s*:\s*\S+/i,
  /\b(?:POSTGRES_PASSWORD|REDIS_PASSWORD|MINIO_ROOT_PASSWORD)\s*[:=]/i,
  /\b(?:BUZZ_RELAY_PRIVATE_KEY|BUZZ_GIT_HOOK_HMAC_SECRET)\s*[:=]/i,
  /\bpostgres(?:ql)?:\/\/[^:@/\s]+:[^@/\s]+@/i,
  /\bredis:\/\/:[^@/\s]+@/i,
] as const

type Architecture = keyof typeof ARCHIVES

export type Gate = {
  id: string
  title: string
  category: string
  dependsOn: string[]
  requiredAssertions: string[]
  destructive: boolean
  requiresPhysicalHardware: boolean
}

export type GateCatalog = {
  schemaVersion: number
  architectures: Architecture[]
  gates: Gate[]
}

export type ValidationResult = {
  valid: boolean
  errors: string[]
}

type Overlay = {
  extends: string
  replace: Record<string, unknown>
}

type MatrixCell = {
  status: 'NOT RUN' | 'PASS' | 'FAIL' | 'BLOCKED'
  path?: string
}

type CandidateIdentity = {
  shared: string
  archive: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isSchema = (value: unknown): value is AnySchema =>
  typeof value === 'boolean' || isRecord(value)

const parseJson = async (path: URL): Promise<unknown> =>
  JSON.parse(await readFile(path, 'utf8')) as unknown

const isOverlay = (value: unknown): value is Overlay =>
  isRecord(value) &&
  typeof value.extends === 'string' &&
  isRecord(value.replace)

const decodePointerSegment = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~')

function replaceAtPointer(
  document: unknown,
  pointer: string,
  replacement: unknown,
): void {
  if (!pointer.startsWith('/') || pointer === '/') {
    throw new Error(`invalid fixture JSON pointer: ${pointer}`)
  }

  const segments = pointer.slice(1).split('/').map(decodePointerSegment)
  let cursor: unknown = document

  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        throw new Error(`invalid fixture array pointer: ${pointer}`)
      }
      cursor = cursor[index]
    } else if (isRecord(cursor) && segment in cursor) {
      cursor = cursor[segment]
    } else {
      throw new Error(`missing fixture pointer: ${pointer}`)
    }
  }

  const leaf = segments.at(-1)
  if (leaf === undefined) throw new Error(`invalid fixture pointer: ${pointer}`)
  if (Array.isArray(cursor)) {
    const index = Number(leaf)
    if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
      throw new Error(`invalid fixture array pointer: ${pointer}`)
    }
    cursor[index] = replacement
  } else if (isRecord(cursor) && leaf in cursor) {
    cursor[leaf] = replacement
  } else {
    throw new Error(`missing fixture pointer: ${pointer}`)
  }
}

async function loadEvidenceDocument(
  path: URL,
  seen: ReadonlySet<string> = new Set(),
): Promise<unknown> {
  if (seen.has(path.href)) {
    throw new Error(`cyclic fixture inheritance: ${path.href}`)
  }

  const parsed = await parseJson(path)
  if (!isOverlay(parsed)) return parsed

  const nextSeen = new Set(seen)
  nextSeen.add(path.href)
  const base = structuredClone(
    await loadEvidenceDocument(new URL(parsed.extends, path), nextSeen),
  )
  for (const [pointer, replacement] of Object.entries(parsed.replace)) {
    replaceAtPointer(base, pointer, replacement)
  }
  return base
}

function formatSchemaError(error: ErrorObject): string {
  const location = error.instancePath || '/'
  return `${location} ${error.message ?? 'is invalid'}`
}

function collectSensitiveErrors(
  value: unknown,
  path = '$',
  errors: string[] = [],
): string[] {
  if (typeof value === 'string') {
    if (FORBIDDEN_SENSITIVE_VALUES.some((pattern) => pattern.test(value))) {
      errors.push(`${path} contains a forbidden sensitive value`)
    }
    return errors
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectSensitiveErrors(item, `${path}[${index}]`, errors),
    )
    return errors
  }

  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectSensitiveErrors(item, `${path}.${key}`, errors)
    }
  }
  return errors
}

function findCycle(catalog: GateCatalog): string | null {
  const byId = new Map(catalog.gates.map((gate) => [gate.id, gate]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string): string | null => {
    if (visiting.has(id)) return id
    if (visited.has(id)) return null
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      const cycle = visit(dependency)
      if (cycle !== null) return cycle
    }
    visiting.delete(id)
    visited.add(id)
    return null
  }

  for (const gate of catalog.gates) {
    const cycle = visit(gate.id)
    if (cycle !== null) return cycle
  }
  return null
}

export async function loadGateCatalog(path: URL): Promise<GateCatalog> {
  const parsed = await parseJson(path)
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.architectures) ||
    !Array.isArray(parsed.gates)
  ) {
    throw new Error('device gate catalog has an invalid top-level shape')
  }

  const catalog = parsed as unknown as GateCatalog
  if (
    catalog.architectures.length !== 2 ||
    catalog.architectures[0] !== 'x86_64' ||
    catalog.architectures[1] !== 'aarch64'
  ) {
    throw new Error('device gate catalog must target x86_64 and aarch64')
  }

  const ids = new Set<string>()
  for (const gate of catalog.gates) {
    if (
      !isRecord(gate) ||
      typeof gate.id !== 'string' ||
      !Array.isArray(gate.dependsOn) ||
      !Array.isArray(gate.requiredAssertions)
    ) {
      throw new Error('device gate catalog contains an invalid gate')
    }
    if (ids.has(gate.id)) throw new Error(`duplicate device gate: ${gate.id}`)
    ids.add(gate.id)
  }

  for (const gate of catalog.gates) {
    for (const dependency of gate.dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(`${gate.id} depends on unknown gate ${dependency}`)
      }
    }
  }

  const cycle = findCycle(catalog)
  if (cycle !== null)
    throw new Error(`device gate dependency cycle at ${cycle}`)
  return catalog
}

async function schemaErrors(
  document: unknown,
  schemaPath: URL,
): Promise<string[]> {
  const schema = await parseJson(schemaPath)
  if (!isSchema(schema))
    throw new Error('device evidence schema must be an object')
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  if (validate(document)) return []
  return (validate.errors ?? []).map(formatSchemaError)
}

function customEvidenceErrors(
  document: unknown,
  catalog: GateCatalog,
): string[] {
  if (!isRecord(document)) return ['evidence record must be an object']
  const errors = collectSensitiveErrors(document)
  const gateId = typeof document.gateId === 'string' ? document.gateId : ''
  const status = typeof document.status === 'string' ? document.status : ''
  const releaseCandidate = isRecord(document.releaseCandidate)
    ? document.releaseCandidate
    : {}
  const archive = isRecord(releaseCandidate.archive)
    ? releaseCandidate.archive
    : {}
  const device = isRecord(document.device) ? document.device : {}
  const startos = isRecord(device.startos) ? device.startos : {}
  const execution = isRecord(document.execution) ? document.execution : {}
  const review = isRecord(document.review) ? document.review : {}
  const assertions = Array.isArray(document.assertions)
    ? document.assertions.filter(isRecord)
    : []
  const evidence = Array.isArray(document.evidence)
    ? document.evidence.filter(isRecord)
    : []
  const issues = Array.isArray(document.issues)
    ? document.issues.filter(isRecord)
    : []

  const gate = catalog.gates.find(({ id }) => id === gateId)
  if (gate === undefined) {
    errors.push(`unknown device gate: ${String(document.gateId)}`)
    return errors
  }

  if (
    startos.releaseLine !== '0.4.0' ||
    !/^0\.4\.0(?:\+[0-9A-Za-z.-]+)?$/.test(
      typeof startos.reportedVersion === 'string'
        ? startos.reportedVersion
        : '',
    )
  ) {
    errors.push('production evidence requires stable StartOS 0.4.0')
  }

  const architecture = device.architecture
  if (
    (architecture === 'x86_64' || architecture === 'aarch64') &&
    archive.name !== ARCHIVES[architecture]
  ) {
    errors.push(`archive name does not match ${architecture}`)
  }

  const packageVersion =
    typeof releaseCandidate.packageVersion === 'string'
      ? releaseCandidate.packageVersion
      : ''
  const expectedTag = `v${packageVersion.replace(':', '_')}`
  if (releaseCandidate.tag !== expectedTag) {
    errors.push('release tag does not match the package version')
  }

  if (
    typeof execution.operator === 'string' &&
    execution.operator === review.reviewer
  ) {
    errors.push('device evidence requires an independent reviewer')
  }

  const startedAt = Date.parse(
    typeof execution.startedAt === 'string' ? execution.startedAt : '',
  )
  const completedAt = Date.parse(
    typeof execution.completedAt === 'string' ? execution.completedAt : '',
  )
  const reviewedAt = Date.parse(
    typeof review.reviewedAt === 'string' ? review.reviewedAt : '',
  )
  if (!(startedAt < completedAt)) {
    errors.push('execution completion must follow its start')
  }
  if (!(completedAt <= reviewedAt)) {
    errors.push('review must occur after execution completes')
  }

  const assertionIds = new Set(
    assertions.flatMap(({ id }) => (typeof id === 'string' ? [id] : [])),
  )
  for (const required of gate.requiredAssertions) {
    if (!assertionIds.has(required)) {
      errors.push(`${gateId} is missing required assertion ${required}`)
    }
  }
  if (assertionIds.size !== assertions.length) {
    errors.push('assertion identifiers must be unique')
  }

  const evidenceIds = new Set(
    evidence.flatMap(({ id }) => (typeof id === 'string' ? [id] : [])),
  )
  if (evidenceIds.size !== evidence.length) {
    errors.push('evidence identifiers must be unique')
  }
  for (const assertion of assertions) {
    const assertionId =
      typeof assertion.id === 'string' ? assertion.id : 'unknown assertion'
    const assertionEvidenceIds = Array.isArray(assertion.evidenceIds)
      ? assertion.evidenceIds.filter(
          (evidenceId): evidenceId is string => typeof evidenceId === 'string',
        )
      : []
    for (const evidenceId of assertionEvidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        errors.push(`${assertionId} references missing evidence ${evidenceId}`)
      }
    }
  }

  if (status === 'pass') {
    if (assertions.some(({ outcome }) => outcome !== 'pass')) {
      errors.push('passing evidence cannot contain a non-passing assertion')
    }
    if (
      assertions.some(
        ({ evidenceIds: ids }) => !Array.isArray(ids) || ids.length === 0,
      )
    ) {
      errors.push('passing assertions require direct retained evidence')
    }
    if (evidence.length === 0) {
      errors.push('passing evidence requires retained evidence')
    }
    if (review.decision !== 'approved') {
      errors.push('passing evidence requires review approval')
    }
    if (
      issues.some(
        (issue) =>
          issue.status === 'open' &&
          (issue.severity === 'high' || issue.severity === 'critical'),
      )
    ) {
      errors.push('passing evidence cannot retain an open high/critical issue')
    }
  }

  if (gateId === 'RES-01' && device.virtualization !== 'physical') {
    errors.push('RES-01 requires representative physical hardware')
  }

  return errors
}

export async function validateEvidenceFile(
  path: URL,
  schemaPath: URL,
): Promise<ValidationResult> {
  const document = await loadEvidenceDocument(path)
  const catalog = await loadGateCatalog(DEFAULT_CATALOG)
  const errors = [
    ...(await schemaErrors(document, schemaPath)),
    ...customEvidenceErrors(document, catalog),
  ]
  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

function parseMatrixCell(value: string): MatrixCell | null {
  if (value === 'NOT RUN') return { status: value }
  const match = value.match(/^\[(PASS|FAIL|BLOCKED)\]\(([^)]+\.json)\)$/)
  if (match === null) return null
  return {
    status: match[1] as MatrixCell['status'],
    path: match[2],
  }
}

function candidateIdentity(document: unknown): CandidateIdentity | null {
  if (!isRecord(document) || !isRecord(document.releaseCandidate)) return null
  const candidate = document.releaseCandidate
  if (!isRecord(candidate.archive)) return null
  const archive = candidate.archive

  const sharedValues = [
    candidate.tag,
    candidate.packageVersion,
    candidate.packageCommit,
    candidate.upstreamCommit,
    candidate.signerFingerprint,
    candidate.manifestMinimumStartos,
    candidate.sdkVersion,
  ]
  const archiveValues = [archive.name, archive.sha256, archive.sizeBytes]
  if (
    !sharedValues.every((value) => typeof value === 'string') ||
    typeof archive.name !== 'string' ||
    typeof archive.sha256 !== 'string' ||
    typeof archive.sizeBytes !== 'number'
  ) {
    return null
  }

  return {
    shared: JSON.stringify(sharedValues),
    archive: JSON.stringify(archiveValues),
  }
}

export async function validateRepository(options: {
  catalogPath: URL
  examplePath: URL
  matrixPath: URL
  schemaPath: URL
}): Promise<ValidationResult & { matrixCells: number }> {
  const errors: string[] = []
  let catalog: GateCatalog
  try {
    catalog = await loadGateCatalog(options.catalogPath)
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      matrixCells: 0,
    }
  }

  const example = await validateEvidenceFile(
    options.examplePath,
    options.schemaPath,
  )
  errors.push(...example.errors.map((error) => `example: ${error}`))

  const matrix = await readFile(options.matrixPath, 'utf8')
  const rows = matrix
    .split('\n')
    .filter((line) => /^\|\s+[A-Z]{3,4}-[0-9]{2}\s+\|/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )

  if (rows.length !== catalog.gates.length) {
    errors.push(
      `matrix has ${rows.length} gate rows; expected ${catalog.gates.length}`,
    )
  }

  const matrixCells = rows.length * catalog.architectures.length
  const parsedCells = new Map<string, MatrixCell>()
  for (const [index, gate] of catalog.gates.entries()) {
    const row = rows[index]
    if (row === undefined) continue
    if (row[0] !== gate.id) {
      errors.push(`matrix row ${index + 1} must be ${gate.id}`)
      continue
    }

    for (const [offset, architecture] of catalog.architectures.entries()) {
      const cell = parseMatrixCell(row[3 + offset] ?? '')
      if (cell === null) {
        errors.push(`${gate.id}/${architecture} has an invalid matrix status`)
        continue
      }
      parsedCells.set(`${gate.id}/${architecture}`, cell)
    }
  }

  let sharedCandidateIdentity: string | undefined
  const archiveIdentities = new Map<Architecture, string>()
  for (const gate of catalog.gates) {
    for (const architecture of catalog.architectures) {
      const cell = parsedCells.get(`${gate.id}/${architecture}`)
      if (cell === undefined) continue

      if (cell.status === 'PASS' || cell.status === 'FAIL') {
        for (const dependency of gate.dependsOn) {
          const dependencyCell = parsedCells.get(
            `${dependency}/${architecture}`,
          )
          if (dependencyCell?.status !== 'PASS') {
            errors.push(
              `${gate.id}/${architecture} requires PASS for ${dependency}`,
            )
          }
        }
      }
      if (cell.status === 'NOT RUN' || cell.path === undefined) continue

      const evidencePath = new URL(cell.path, options.matrixPath)
      const evidenceResult = await validateEvidenceFile(
        evidencePath,
        options.schemaPath,
      )
      errors.push(
        ...evidenceResult.errors.map(
          (error) => `${gate.id}/${architecture}: ${error}`,
        ),
      )

      const evidence = await loadEvidenceDocument(evidencePath)
      if (isRecord(evidence)) {
        if (evidence.gateId !== gate.id) {
          errors.push(`${gate.id}/${architecture} links the wrong gate record`)
        }
        if (
          !isRecord(evidence.device) ||
          evidence.device.architecture !== architecture
        ) {
          errors.push(
            `${gate.id}/${architecture} links the wrong architecture record`,
          )
        }
        if (
          typeof evidence.status !== 'string' ||
          evidence.status.toUpperCase() !== cell.status
        ) {
          errors.push(`${gate.id}/${architecture} status disagrees with record`)
        }

        const identity = candidateIdentity(evidence)
        if (identity !== null) {
          if (sharedCandidateIdentity === undefined) {
            sharedCandidateIdentity = identity.shared
          } else if (sharedCandidateIdentity !== identity.shared) {
            errors.push(
              `${gate.id}/${architecture} release candidate identity differs`,
            )
          }

          const architectureIdentity = archiveIdentities.get(architecture)
          if (architectureIdentity === undefined) {
            archiveIdentities.set(architecture, identity.archive)
          } else if (architectureIdentity !== identity.archive) {
            errors.push(
              `${gate.id}/${architecture} archive identity differs across records`,
            )
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    matrixCells,
  }
}
