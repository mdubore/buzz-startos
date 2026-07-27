import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
const DEFAULT_CANDIDATE = new URL(
  '../docs/testing/DEVICE_CANDIDATE.json',
  import.meta.url,
)
const OFFICIAL_STARTOS_SOURCE =
  'https://github.com/Start9Labs/start-technologies/releases/tag/start-os/v0.4.0'
const OFFICIAL_STARTOS_COMMIT = '514af0c2fa076c8b597d9861f882bdb1b3411d9e'
const MAX_EVIDENCE_ATTACHMENT_BYTES = 16 * 1024 * 1024
const ATTACHMENT_READ_BUFFER_BYTES = 64 * 1024
const SENSITIVE_SCAN_OVERLAP = 4 * 1024

const FORBIDDEN_SENSITIVE_VALUES = [
  /\bnsec1[023456789acdefghjklmnpqrstuvwxyz]+\b/i,
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
  /\b(?:Authorization|Proxy-Authorization)\s*:\s*(?:Bearer|Basic)?\s*\S+/i,
  /\b(?:Cookie|Set-Cookie)\s*:/i,
  /\b(?:password|passwd|secret|token)\s*[:=]\s*\S+/i,
  /\b(?:POSTGRES_PASSWORD|REDIS_PASSWORD|MINIO_ROOT_(?:USER|PASSWORD))\s*[:=]/i,
  /\b(?:BUZZ_RELAY_PRIVATE_KEY|BUZZ_GIT_HOOK_HMAC_SECRET|BUZZ_S3_(?:ACCESS|SECRET)_KEY)\s*[:=]/i,
  /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^:@/\s]+:[^@/\s]+@/i,
  /\bpostgres(?:ql)?:\/\/[^:@/\s]+:[^@/\s]+@/i,
  /\bredis:\/\/:[^@/\s]+@/i,
] as const

const AUTHORIZATION_EVENT_KINDS = [
  9030, 9031, 9032, 9033, 41010, 41011, 41012, 30620, 46020, 46030, 46031,
] as const
const ROLE_AUTHORIZATION_INVARIANTS = [
  'non-admin-role-change-rejected',
  'owner-demotion-rejected',
  'owner-set-preserved',
  'active-owner-per-channel',
] as const

type Architecture = keyof typeof ARCHIVES

type CandidateArtifact = {
  name: string
  sha256: string | null
  sizeBytes: number | null
}

type UpgradeArtifact = {
  name: string
  sha256: string
}

export type CandidateContract = {
  schemaVersion: 1
  state: 'UNFROZEN' | 'FROZEN'
  startos: {
    releaseLine: '0.4.0'
    releaseTag: 'start-os/v0.4.0'
    sourceUrl: string
    sourceCommit: string
    architectures: Record<
      Architecture,
      { buildId: string | null; imageSha256: string | null }
    >
  }
  package: {
    tag: string | null
    version: string | null
    packageCommit: string | null
    upstreamCommit: string | null
    signerFingerprint: string
    manifestMinimumStartos: '0.4.0-beta.10'
    sdkVersion: string
    artifacts: Record<Architecture, CandidateArtifact>
  }
  upgradeSource: {
    tag: string
    version: string
    packageCommit: string
    upstreamCommit: string
    signerFingerprint: string
    artifacts: Record<Architecture, UpgradeArtifact>
  }
  promotionControls: {
    authenticatedOperatorReviewerBinding: 'PENDING'
  }
}

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

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

const isFingerprint = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)

const isCommit = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)

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

function containsSensitiveValue(value: string): boolean {
  return FORBIDDEN_SENSITIVE_VALUES.some((pattern) => pattern.test(value))
}

function commandArgumentErrors(execution: Record<string, unknown>): string[] {
  if (!Array.isArray(execution.commands)) return []
  const errors: string[] = []
  for (const [commandIndex, command] of execution.commands.entries()) {
    if (!isRecord(command) || !Array.isArray(command.args)) continue
    const args = command.args.filter(
      (argument): argument is string => typeof argument === 'string',
    )
    for (const [argumentIndex, argument] of args.entries()) {
      if (
        /^--?(?:password|passwd|secret|token)$/i.test(argument) &&
        args[argumentIndex + 1] !== undefined
      ) {
        errors.push(
          `execution.commands[${commandIndex}] contains a forbidden sensitive command argument`,
        )
      }
      if (/^--?(?:password|passwd|secret|token)=/i.test(argument)) {
        errors.push(
          `execution.commands[${commandIndex}] contains a forbidden sensitive command argument`,
        )
      }
    }
  }
  return errors
}

function pathIsContained(base: string, target: string): boolean {
  const pathFromBase = relative(base, target)
  return (
    pathFromBase !== '..' &&
    !pathFromBase.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromBase)
  )
}

type LocalFileResolution =
  | {
      path: string
      device: number | bigint
      inode: number | bigint
      error?: never
    }
  | { path?: never; error: string }

async function resolveLocalRegularFile(
  baseDirectory: string,
  localPath: unknown,
  label: string,
  directoryLabel: string,
): Promise<LocalFileResolution> {
  if (
    typeof localPath !== 'string' ||
    localPath.length === 0 ||
    isAbsolute(localPath) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(localPath) ||
    localPath.includes('\\') ||
    localPath.includes('?') ||
    localPath.includes('#') ||
    localPath.includes('\0')
  ) {
    return { error: `${label} must use a local relative path` }
  }

  const segments = localPath.split('/')
  if (segments.includes('..')) {
    return { error: `${label} escapes its ${directoryLabel}` }
  }

  let realBaseDirectory
  try {
    realBaseDirectory = await realpath(baseDirectory)
  } catch {
    return { error: `${label} cannot be opened` }
  }
  const resolvedPath = resolve(realBaseDirectory, localPath)
  if (!pathIsContained(realBaseDirectory, resolvedPath)) {
    return { error: `${label} escapes its ${directoryLabel}` }
  }

  let cursor = realBaseDirectory
  let finalEntry: Awaited<ReturnType<typeof lstat>> | undefined
  for (const segment of segments.filter(
    (pathSegment) => pathSegment !== '' && pathSegment !== '.',
  )) {
    cursor = resolve(cursor, segment)
    let entry
    try {
      entry = await lstat(cursor)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      return {
        error:
          code === 'ENOENT'
            ? `${label} does not exist`
            : `${label} cannot be opened`,
      }
    }
    finalEntry = entry
    if (entry.isSymbolicLink()) {
      try {
        const realLinkTarget = await realpath(cursor)
        if (!pathIsContained(realBaseDirectory, realLinkTarget)) {
          return { error: `${label} escapes its ${directoryLabel}` }
        }
      } catch {
        return { error: `${label} cannot be opened` }
      }
      return { error: `${label} must not use symbolic links` }
    }
  }

  if (finalEntry === undefined) {
    try {
      finalEntry = await lstat(resolvedPath)
    } catch {
      return { error: `${label} cannot be opened` }
    }
  }
  if (!finalEntry.isFile()) {
    return { error: `${label} is not a regular file` }
  }

  let realFilePath
  try {
    realFilePath = await realpath(resolvedPath)
  } catch {
    return { error: `${label} cannot be opened` }
  }
  if (!pathIsContained(realBaseDirectory, realFilePath)) {
    return { error: `${label} escapes its ${directoryLabel}` }
  }
  return {
    path: realFilePath,
    device: finalEntry.dev,
    inode: finalEntry.ino,
  }
}

async function inspectAttachment(
  attachmentPath: string,
  label: string,
  expectedIdentity: { device: number | bigint; inode: number | bigint },
): Promise<
  | {
      sha256: string
      containsSensitiveValue: boolean
      error?: never
    }
  | { error: string }
> {
  let handle
  try {
    handle = await open(
      attachmentPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    )
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      error:
        code === 'ELOOP'
          ? `${label} must not use symbolic links`
          : `${label} cannot be opened`,
    }
  }

  try {
    const before = await handle.stat()
    if (
      before.dev !== expectedIdentity.device ||
      before.ino !== expectedIdentity.inode
    ) {
      return { error: `${label} changed before validation` }
    }
    if (!before.isFile()) {
      return { error: `${label} is not a regular file` }
    }
    if (before.size > MAX_EVIDENCE_ATTACHMENT_BYTES) {
      return {
        error: `${label} exceeds the ${MAX_EVIDENCE_ATTACHMENT_BYTES}-byte production limit`,
      }
    }

    const hash = createHash('sha256')
    const decoder = new StringDecoder('utf8')
    const buffer = Buffer.allocUnsafe(ATTACHMENT_READ_BUFFER_BYTES)
    let bytesReadTotal = 0
    let scanTail = ''
    let foundSensitiveValue = false

    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        bytesReadTotal,
      )
      if (bytesRead === 0) break
      bytesReadTotal += bytesRead
      if (bytesReadTotal > MAX_EVIDENCE_ATTACHMENT_BYTES) {
        return {
          error: `${label} exceeds the ${MAX_EVIDENCE_ATTACHMENT_BYTES}-byte production limit`,
        }
      }

      const chunk = buffer.subarray(0, bytesRead)
      hash.update(chunk)
      const scanWindow = scanTail + decoder.write(chunk)
      foundSensitiveValue ||= containsSensitiveValue(scanWindow)
      scanTail = scanWindow.slice(-SENSITIVE_SCAN_OVERLAP)
    }

    const finalScanWindow = scanTail + decoder.end()
    foundSensitiveValue ||= containsSensitiveValue(finalScanWindow)

    const after = await handle.stat()
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      bytesReadTotal !== after.size
    ) {
      return { error: `${label} changed during validation` }
    }

    return {
      sha256: hash.digest('hex'),
      containsSensitiveValue: foundSensitiveValue,
    }
  } finally {
    await handle.close()
  }
}

async function attachmentErrors(
  document: unknown,
  evidencePath: URL,
): Promise<string[]> {
  if (!isRecord(document) || document.example === true) return []
  const attachments = Array.isArray(document.evidence)
    ? document.evidence.filter(isRecord)
    : []
  const errors: string[] = []
  const evidenceDirectory = dirname(fileURLToPath(evidencePath))

  for (const [index, attachment] of attachments.entries()) {
    const label =
      typeof attachment.id === 'string'
        ? `evidence ${attachment.id}`
        : `evidence attachment ${index}`
    const resolved = await resolveLocalRegularFile(
      evidenceDirectory,
      attachment.path,
      label,
      'evidence directory',
    )
    if (resolved.error !== undefined) {
      errors.push(resolved.error)
      continue
    }

    const inspected = await inspectAttachment(resolved.path, label, {
      device: resolved.device,
      inode: resolved.inode,
    })
    if (inspected.error !== undefined) {
      errors.push(inspected.error)
      continue
    }
    if (attachment.sha256 !== inspected.sha256) {
      errors.push(`${label} SHA-256 mismatch`)
    }
    if (inspected.containsSensitiveValue) {
      errors.push(`${label} attachment contains a forbidden sensitive value`)
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

function unknownFieldErrors(
  value: Record<string, unknown>,
  allowedFields: readonly string[],
  label: string,
): string[] {
  const allowed = new Set(allowedFields)
  return Object.keys(value)
    .filter((field) => !allowed.has(field))
    .map((field) => `${label} contains unknown field ${field}`)
}

function candidateContractErrors(value: unknown): string[] {
  if (!isRecord(value)) return ['candidate contract must be an object']

  const errors: string[] = []
  const startos = isRecord(value.startos) ? value.startos : {}
  const architectures = isRecord(startos.architectures)
    ? startos.architectures
    : {}
  const packageIdentity = isRecord(value.package) ? value.package : {}
  const artifacts = isRecord(packageIdentity.artifacts)
    ? packageIdentity.artifacts
    : {}
  const upgradeSource = isRecord(value.upgradeSource) ? value.upgradeSource : {}
  const upgradeArtifacts = isRecord(upgradeSource.artifacts)
    ? upgradeSource.artifacts
    : {}
  const promotionControls = isRecord(value.promotionControls)
    ? value.promotionControls
    : {}

  errors.push(
    ...unknownFieldErrors(
      value,
      [
        'schemaVersion',
        'state',
        'startos',
        'package',
        'upgradeSource',
        'promotionControls',
      ],
      'candidate contract',
    ),
    ...unknownFieldErrors(
      startos,
      [
        'releaseLine',
        'releaseTag',
        'sourceUrl',
        'sourceCommit',
        'architectures',
      ],
      'candidate StartOS identity',
    ),
    ...unknownFieldErrors(
      architectures,
      ['x86_64', 'aarch64'],
      'candidate StartOS architecture map',
    ),
    ...unknownFieldErrors(
      packageIdentity,
      [
        'tag',
        'version',
        'packageCommit',
        'upstreamCommit',
        'signerFingerprint',
        'manifestMinimumStartos',
        'sdkVersion',
        'artifacts',
      ],
      'candidate package identity',
    ),
    ...unknownFieldErrors(
      artifacts,
      ['x86_64', 'aarch64'],
      'candidate package artifact map',
    ),
    ...unknownFieldErrors(
      upgradeSource,
      [
        'tag',
        'version',
        'packageCommit',
        'upstreamCommit',
        'signerFingerprint',
        'artifacts',
      ],
      'candidate upgrade-source identity',
    ),
    ...unknownFieldErrors(
      upgradeArtifacts,
      ['x86_64', 'aarch64'],
      'candidate upgrade-source artifact map',
    ),
    ...unknownFieldErrors(
      promotionControls,
      ['authenticatedOperatorReviewerBinding'],
      'candidate promotion controls',
    ),
  )

  if (value.schemaVersion !== 1)
    errors.push('candidate schemaVersion must be 1')
  if (value.state !== 'UNFROZEN' && value.state !== 'FROZEN') {
    errors.push('candidate state must be UNFROZEN or FROZEN')
  }
  if (
    startos.releaseLine !== '0.4.0' ||
    startos.releaseTag !== 'start-os/v0.4.0' ||
    startos.sourceUrl !== OFFICIAL_STARTOS_SOURCE ||
    startos.sourceCommit !== OFFICIAL_STARTOS_COMMIT
  ) {
    errors.push('candidate must identify the official StartOS 0.4.0 lineage')
  }

  for (const architecture of ['x86_64', 'aarch64'] as const) {
    const startosIdentity = isRecord(architectures[architecture])
      ? architectures[architecture]
      : {}
    const artifact = isRecord(artifacts[architecture])
      ? artifacts[architecture]
      : {}
    const upgradeArtifact = isRecord(upgradeArtifacts[architecture])
      ? upgradeArtifacts[architecture]
      : {}

    errors.push(
      ...unknownFieldErrors(
        startosIdentity,
        ['buildId', 'imageSha256'],
        `candidate StartOS ${architecture} identity`,
      ),
      ...unknownFieldErrors(
        artifact,
        ['name', 'sha256', 'sizeBytes'],
        `candidate ${architecture} artifact identity`,
      ),
      ...unknownFieldErrors(
        upgradeArtifact,
        ['name', 'sha256'],
        `candidate upgrade-source ${architecture} artifact identity`,
      ),
    )

    if (
      startosIdentity.buildId !== null &&
      typeof startosIdentity.buildId !== 'string'
    ) {
      errors.push(`candidate StartOS ${architecture} buildId is invalid`)
    }
    if (
      startosIdentity.imageSha256 !== null &&
      !isSha256(startosIdentity.imageSha256)
    ) {
      errors.push(`candidate StartOS ${architecture} imageSha256 is invalid`)
    }
    if (artifact.name !== ARCHIVES[architecture]) {
      errors.push(`candidate ${architecture} archive name is invalid`)
    }
    if (artifact.sha256 !== null && !isSha256(artifact.sha256)) {
      errors.push(`candidate ${architecture} archive SHA-256 is invalid`)
    }
    if (
      artifact.sizeBytes !== null &&
      (!Number.isInteger(artifact.sizeBytes) ||
        (artifact.sizeBytes as number) < 1)
    ) {
      errors.push(`candidate ${architecture} archive size is invalid`)
    }
    if (
      upgradeArtifact.name !== ARCHIVES[architecture] ||
      !isSha256(upgradeArtifact.sha256)
    ) {
      errors.push(`upgrade source ${architecture} artifact is invalid`)
    }
  }

  if (
    packageIdentity.tag !== null &&
    (typeof packageIdentity.tag !== 'string' ||
      !/^v[^\s]+_[0-9]+$/.test(packageIdentity.tag))
  ) {
    errors.push('candidate package tag is invalid')
  }
  if (
    packageIdentity.version !== null &&
    (typeof packageIdentity.version !== 'string' ||
      !/^[^\s]+:[0-9]+$/.test(packageIdentity.version))
  ) {
    errors.push('candidate package version is invalid')
  }
  if (
    packageIdentity.packageCommit !== null &&
    !isCommit(packageIdentity.packageCommit)
  ) {
    errors.push('candidate package commit is invalid')
  }
  if (
    packageIdentity.upstreamCommit !== null &&
    !isCommit(packageIdentity.upstreamCommit)
  ) {
    errors.push('candidate upstream commit is invalid')
  }
  if (!isFingerprint(packageIdentity.signerFingerprint)) {
    errors.push('candidate signer fingerprint is invalid')
  }
  if (packageIdentity.manifestMinimumStartos !== '0.4.0-beta.10') {
    errors.push('candidate manifest minimum StartOS is invalid')
  }
  if (
    typeof packageIdentity.sdkVersion !== 'string' ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(packageIdentity.sdkVersion)
  ) {
    errors.push('candidate SDK version is invalid')
  }

  if (
    typeof upgradeSource.tag !== 'string' ||
    typeof upgradeSource.version !== 'string' ||
    !isCommit(upgradeSource.packageCommit) ||
    !isCommit(upgradeSource.upstreamCommit) ||
    !isFingerprint(upgradeSource.signerFingerprint)
  ) {
    errors.push('upgrade source identity is invalid')
  }
  if (promotionControls.authenticatedOperatorReviewerBinding !== 'PENDING') {
    errors.push(
      'candidate promotion control must remain PENDING until authenticated binding is implemented',
    )
  }

  const frozenValues = [
    packageIdentity.tag,
    packageIdentity.version,
    packageIdentity.packageCommit,
    packageIdentity.upstreamCommit,
    ...(['x86_64', 'aarch64'] as const).flatMap((architecture) => {
      const startosIdentity = isRecord(architectures[architecture])
        ? architectures[architecture]
        : {}
      const artifact = isRecord(artifacts[architecture])
        ? artifacts[architecture]
        : {}
      return [
        startosIdentity.buildId,
        startosIdentity.imageSha256,
        artifact.sha256,
        artifact.sizeBytes,
      ]
    }),
  ]
  if (
    value.state === 'FROZEN' &&
    frozenValues.some((candidateValue) => candidateValue === null)
  ) {
    errors.push('FROZEN candidate identity must be complete')
  }
  if (
    value.state === 'UNFROZEN' &&
    frozenValues.some((candidateValue) => candidateValue !== null)
  ) {
    errors.push('UNFROZEN candidate identity must not contain frozen values')
  }

  return errors
}

export async function loadCandidateContract(
  path: URL,
): Promise<CandidateContract> {
  const parsed = await parseJson(path)
  const errors = candidateContractErrors(parsed)
  if (errors.length > 0) {
    throw new Error(`invalid device candidate contract: ${errors.join('; ')}`)
  }
  return parsed as CandidateContract
}

async function schemaErrors(
  document: unknown,
  schemaPath: URL,
): Promise<string[]> {
  const schema = await parseJson(schemaPath)
  if (!isSchema(schema))
    throw new Error('device evidence schema must be an object')
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
  })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  if (validate(document)) return []
  return (validate.errors ?? []).map(formatSchemaError)
}

function normalizedStringSet(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every((item): item is string => typeof item === 'string')
  ) {
    return null
  }
  return [...new Set(value)].sort()
}

function normalizedChannelOwners(
  value: unknown,
  errors: string[],
): string | null {
  if (!Array.isArray(value)) return null
  const channels = new Map<string, string[]>()
  for (const channel of value) {
    if (!isRecord(channel) || typeof channel.channelId !== 'string') return null
    const activeOwners = normalizedStringSet(channel.activeOwnerPubkeys)
    if (activeOwners === null) return null
    if (activeOwners.length === 0) {
      errors.push('every channel requires at least one active owner')
    }
    if (channels.has(channel.channelId)) {
      errors.push('role authorization channel identities must be unique')
    }
    channels.set(channel.channelId, activeOwners)
  }
  if (channels.size === 0) {
    errors.push('every channel requires at least one active owner')
  }
  return JSON.stringify(
    [...channels.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

function roleAuthorizationErrors(
  regression: Record<string, unknown>,
): string[] {
  const roleAuthorization = isRecord(regression.roleAuthorization)
    ? regression.roleAuthorization
    : null
  if (roleAuthorization === null || !Array.isArray(roleAuthorization.cases)) {
    return ['AUTH-02 requires structured roleAuthorization evidence']
  }

  const errors: string[] = []
  const observedInvariants = new Set<string>()
  for (const roleCase of roleAuthorization.cases.filter(isRecord)) {
    observedInvariants.add(String(roleCase.invariant))
    if (roleCase.outcome !== 'rejected') {
      errors.push('role authorization cases must reject unauthorized changes')
    }
    if (roleCase.eventPersisted !== false) {
      errors.push('role authorization rejections must not persist writes')
    }
    if (roleCase.clientError !== 'request rejected') {
      errors.push(
        'role authorization rejections require the stable generic error',
      )
    }
    if (roleCase.rawDatabaseTextObserved !== false) {
      errors.push(
        'role authorization checks must not expose raw database or SQL text',
      )
    }
    if (
      roleCase.invariant === 'non-admin-role-change-rejected' &&
      roleCase.actorRole !== 'member' &&
      roleCase.actorRole !== 'unauthorized'
    ) {
      errors.push(
        'non-admin role-change evidence requires a member or unauthorized actor',
      )
    }

    const before = isRecord(roleCase.before) ? roleCase.before : {}
    const after = isRecord(roleCase.after) ? roleCase.after : {}
    if (before.stateHash !== after.stateHash) {
      errors.push('role authorization before/after state hashes must match')
    }

    const beforeOwners = normalizedStringSet(before.ownerPubkeys)
    const afterOwners = normalizedStringSet(after.ownerPubkeys)
    if (
      beforeOwners === null ||
      afterOwners === null ||
      JSON.stringify(beforeOwners) !== JSON.stringify(afterOwners)
    ) {
      errors.push('role authorization must preserve the owner set')
    }

    const beforeChannels = normalizedChannelOwners(before.channels, errors)
    const afterChannels = normalizedChannelOwners(after.channels, errors)
    if (
      beforeChannels === null ||
      afterChannels === null ||
      beforeChannels !== afterChannels
    ) {
      errors.push('role authorization must preserve active owners per channel')
    }
  }

  if (
    roleAuthorization.cases.length !== ROLE_AUTHORIZATION_INVARIANTS.length ||
    observedInvariants.size !== ROLE_AUTHORIZATION_INVARIANTS.length ||
    ROLE_AUTHORIZATION_INVARIANTS.some(
      (invariant) => !observedInvariants.has(invariant),
    )
  ) {
    errors.push(
      'roleAuthorization must cover exactly the four required role invariants',
    )
  }
  return errors
}

function authorizationRegressionErrors(
  document: Record<string, unknown>,
  gateId: string,
): string[] {
  const regression = isRecord(document.authorizationRegression)
    ? document.authorizationRegression
    : null
  if (gateId !== 'AUTH-02') {
    return regression === null
      ? []
      : ['only AUTH-02 may carry authorizationRegression']
  }
  if (regression === null || !Array.isArray(regression.cases)) {
    return ['AUTH-02 requires authorizationRegression']
  }

  const errors = roleAuthorizationErrors(regression)
  const expected = new Set<string>()
  for (const role of ['owner', 'admin', 'member']) {
    for (const state of ['active-ban', 'active-timeout']) {
      for (const kind of AUTHORIZATION_EVENT_KINDS) {
        expected.add(`${role}/${state}/${kind}`)
      }
    }
  }
  for (const state of ['expired-ban', 'expired-timeout', 'none']) {
    for (const kind of AUTHORIZATION_EVENT_KINDS) {
      expected.add(`owner/${state}/${kind}`)
    }
  }

  const observed = new Set<string>()
  for (const authorizationCase of regression.cases.filter(isRecord)) {
    const role = authorizationCase.principalRole
    const state = authorizationCase.restrictionState
    const kind = authorizationCase.eventKind
    const key = `${String(role)}/${String(state)}/${String(kind)}`
    observed.add(key)

    if (state === 'active-ban' || state === 'active-timeout') {
      if (authorizationCase.outcome !== 'rejected') {
        errors.push(
          'active bans and timeouts must reject every covered event kind',
        )
      }
      if (authorizationCase.eventPersisted !== false) {
        errors.push('rejected authorization cases must not persist writes')
      }
      if (authorizationCase.clientError !== 'request rejected') {
        errors.push(
          'rejected authorization cases require the stable generic error',
        )
      }
    }

    if (state === 'expired-ban' || state === 'expired-timeout') {
      if (
        authorizationCase.outcome !== 'accepted' ||
        authorizationCase.eventPersisted !== true ||
        authorizationCase.clientError !== null
      ) {
        errors.push(
          'expired restrictions must follow an accepted authorized path',
        )
      }
    }

    if (state === 'none') {
      if (
        authorizationCase.outcome !== 'accepted' ||
        authorizationCase.eventPersisted !== true ||
        authorizationCase.clientError !== null
      ) {
        errors.push('unrestricted authorized cases must be accepted')
      }
    }

    if (authorizationCase.rawDatabaseTextObserved !== false) {
      errors.push(
        'authorization cases must not expose raw database or SQL text',
      )
    }
  }

  if (
    observed.size !== expected.size ||
    [...expected].some((key) => !observed.has(key)) ||
    regression.cases.length !== expected.size
  ) {
    errors.push(
      'authorizationRegression must cover exactly all required role/state/event-kind cases',
    )
  }

  return errors
}

function restoreEndpointIsComplete(endpoint: unknown): boolean {
  if (!isRecord(endpoint)) return false
  return (
    (endpoint.architecture === 'x86_64' ||
      endpoint.architecture === 'aarch64') &&
    typeof endpoint.model === 'string' &&
    endpoint.model.length > 0 &&
    typeof endpoint.cpu === 'string' &&
    endpoint.cpu.length > 0 &&
    Number.isInteger(endpoint.cores) &&
    Number.isInteger(endpoint.memoryBytes) &&
    typeof endpoint.storage === 'string' &&
    endpoint.storage.length > 0 &&
    typeof endpoint.startosBuildId === 'string' &&
    endpoint.startosBuildId.length > 0 &&
    isSha256(endpoint.startosImageSha256)
  )
}

function restoreTrialErrors(
  document: Record<string, unknown>,
  gateId: string,
  candidate: CandidateContract,
): string[] {
  const trials = Array.isArray(document.restoreTrials)
    ? document.restoreTrials
    : null
  if (gateId !== 'BKP-01') {
    return trials === null ? [] : ['only BKP-01 may carry restoreTrials']
  }
  if (trials === null) return ['BKP-01 requires restoreTrials']

  const errors: string[] = []
  const directions = new Set<string>()
  for (const trial of trials.filter(isRecord)) {
    const source = isRecord(trial.source) ? trial.source : {}
    const target = isRecord(trial.target) ? trial.target : {}
    const direction = `${String(source.architecture)}->${String(target.architecture)}`
    directions.add(direction)
    if (
      !restoreEndpointIsComplete(source) ||
      !restoreEndpointIsComplete(target)
    ) {
      errors.push('restore trial endpoints require complete hardware identity')
    }
    for (const endpoint of [source, target]) {
      if (
        endpoint.architecture === 'x86_64' ||
        endpoint.architecture === 'aarch64'
      ) {
        const startosIdentity =
          candidate.startos.architectures[endpoint.architecture]
        if (
          endpoint.startosBuildId !== startosIdentity.buildId ||
          endpoint.startosImageSha256 !== startosIdentity.imageSha256
        ) {
          errors.push(
            'restore trial endpoints must match the frozen StartOS identity',
          )
        }
      }
    }
    if (
      source.architecture !== target.architecture &&
      trial.nativePackageReinstalled !== true
    ) {
      errors.push('cross-architecture restores require native reinstall')
    }
  }

  for (const direction of [
    'x86_64->x86_64',
    'aarch64->aarch64',
    'x86_64->aarch64',
    'aarch64->x86_64',
  ]) {
    if (!directions.has(direction)) {
      errors.push(`BKP-01 requires ${direction} restore evidence`)
    }
  }
  if (directions.size !== 4 || trials.length !== 4) {
    errors.push('BKP-01 restore directions must be unique')
  }
  return errors
}

function upgradeSourceErrors(
  document: Record<string, unknown>,
  gateId: string,
  architecture: unknown,
  candidate: CandidateContract,
): string[] {
  const upgradeSource = isRecord(document.upgradeSource)
    ? document.upgradeSource
    : null
  if (gateId !== 'UPG-01') {
    return upgradeSource === null ? [] : ['only UPG-01 may carry upgradeSource']
  }
  if (upgradeSource === null) return ['UPG-01 requires upgradeSource']
  if (architecture !== 'x86_64' && architecture !== 'aarch64') return []

  const expected = candidate.upgradeSource
  const expectedArtifact = expected.artifacts[architecture]
  const observedArtifact = isRecord(upgradeSource.artifact)
    ? upgradeSource.artifact
    : {}
  const matches =
    upgradeSource.tag === expected.tag &&
    upgradeSource.version === expected.version &&
    upgradeSource.packageCommit === expected.packageCommit &&
    upgradeSource.upstreamCommit === expected.upstreamCommit &&
    upgradeSource.signerFingerprint === expected.signerFingerprint &&
    observedArtifact.name === expectedArtifact.name &&
    observedArtifact.sha256 === expectedArtifact.sha256

  return matches
    ? []
    : [
        'upgradeSource does not match the fixed :2 identity for its architecture',
      ]
}

function customEvidenceErrors(
  document: unknown,
  catalog: GateCatalog,
  candidate: CandidateContract,
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
  errors.push(...commandArgumentErrors(execution))

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
  errors.push(
    ...authorizationRegressionErrors(document, gateId),
    ...restoreTrialErrors(document, gateId, candidate),
    ...upgradeSourceErrors(document, gateId, architecture, candidate),
  )
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
    typeof review.reviewer === 'string' &&
    execution.operator.toLocaleLowerCase() ===
      review.reviewer.toLocaleLowerCase()
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

  if (document.example !== true) {
    if (candidate.state !== 'FROZEN') {
      errors.push('production evidence rejected because candidate is UNFROZEN')
      return errors
    }

    if (architecture === 'x86_64' || architecture === 'aarch64') {
      const candidateArtifact = candidate.package.artifacts[architecture]
      const candidateStartos = candidate.startos.architectures[architecture]
      const comparisons: Array<[string, unknown, unknown]> = [
        ['releaseCandidate.tag', releaseCandidate.tag, candidate.package.tag],
        [
          'releaseCandidate.packageVersion',
          releaseCandidate.packageVersion,
          candidate.package.version,
        ],
        [
          'releaseCandidate.packageCommit',
          releaseCandidate.packageCommit,
          candidate.package.packageCommit,
        ],
        [
          'releaseCandidate.upstreamCommit',
          releaseCandidate.upstreamCommit,
          candidate.package.upstreamCommit,
        ],
        [
          'releaseCandidate.signerFingerprint',
          releaseCandidate.signerFingerprint,
          candidate.package.signerFingerprint,
        ],
        [
          'releaseCandidate.manifestMinimumStartos',
          releaseCandidate.manifestMinimumStartos,
          candidate.package.manifestMinimumStartos,
        ],
        [
          'releaseCandidate.sdkVersion',
          releaseCandidate.sdkVersion,
          candidate.package.sdkVersion,
        ],
        ['releaseCandidate.archive.name', archive.name, candidateArtifact.name],
        [
          'releaseCandidate.archive.sha256',
          archive.sha256,
          candidateArtifact.sha256,
        ],
        [
          'releaseCandidate.archive.sizeBytes',
          archive.sizeBytes,
          candidateArtifact.sizeBytes,
        ],
        [
          'device.startos.releaseLine',
          startos.releaseLine,
          candidate.startos.releaseLine,
        ],
        [
          'device.startos.releaseTag',
          startos.releaseTag,
          candidate.startos.releaseTag,
        ],
        [
          'device.startos.officialSource',
          startos.officialSource,
          candidate.startos.sourceUrl,
        ],
        [
          'device.startos.sourceCommit',
          startos.sourceCommit,
          candidate.startos.sourceCommit,
        ],
        ['device.startos.buildId', startos.buildId, candidateStartos.buildId],
        [
          'device.startos.imageSha256',
          startos.imageSha256,
          candidateStartos.imageSha256,
        ],
      ]

      for (const [field, observed, expected] of comparisons) {
        if (observed !== expected) {
          errors.push(`${field} does not match the frozen candidate`)
        }
      }
    }
  }

  return errors
}

export async function validateEvidenceFile(
  path: URL,
  schemaPath: URL,
  options: {
    candidatePath?: URL
    allowFixtureOverlay?: boolean
  } = {},
): Promise<ValidationResult> {
  try {
    const rawDocument = await parseJson(path)
    if (isOverlay(rawDocument) && options.allowFixtureOverlay !== true) {
      return {
        valid: false,
        errors: ['production evidence cannot use fixture inheritance overlays'],
      }
    }

    const document = await loadEvidenceDocument(path)
    const [catalog, candidate] = await Promise.all([
      loadGateCatalog(DEFAULT_CATALOG),
      loadCandidateContract(options.candidatePath ?? DEFAULT_CANDIDATE),
    ])
    const errors = [
      ...(await schemaErrors(document, schemaPath)),
      ...(await attachmentErrors(document, path)),
      ...customEvidenceErrors(document, catalog, candidate),
    ]
    return { valid: errors.length === 0, errors: [...new Set(errors)] }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
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
  candidatePath: URL
  catalogPath: URL
  examplePath: URL
  matrixPath: URL
  mode?: 'template' | 'promotion'
  schemaPath: URL
}): Promise<ValidationResult & { matrixCells: number }> {
  const errors: string[] = []
  let catalog: GateCatalog
  let candidate: CandidateContract
  try {
    ;[catalog, candidate] = await Promise.all([
      loadGateCatalog(options.catalogPath),
      loadCandidateContract(options.candidatePath),
    ])
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
    { candidatePath: options.candidatePath },
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

  if (options.mode === 'promotion') {
    if (candidate.state !== 'FROZEN') {
      errors.push('promotion rejected because candidate is UNFROZEN')
    }
    errors.push(
      'promotion is disabled until authenticated operator/reviewer binding can be verified',
    )
    const linkedPassCells = [...parsedCells.values()].filter(
      ({ status, path }) => status === 'PASS' && path !== undefined,
    ).length
    if (matrixCells !== 46 || linkedPassCells !== 46) {
      errors.push(
        `promotion requires exactly 46 linked PASS cells; found ${linkedPassCells}`,
      )
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

      const matrixEvidence = await resolveLocalRegularFile(
        dirname(fileURLToPath(options.matrixPath)),
        cell.path,
        `${gate.id}/${architecture} matrix evidence`,
        'matrix directory',
      )
      if (matrixEvidence.error !== undefined) {
        errors.push(matrixEvidence.error)
        continue
      }
      const evidencePath = pathToFileURL(matrixEvidence.path)
      const evidenceResult = await validateEvidenceFile(
        evidencePath,
        options.schemaPath,
        { candidatePath: options.candidatePath },
      )
      errors.push(
        ...evidenceResult.errors.map(
          (error) => `${gate.id}/${architecture}: ${error}`,
        ),
      )

      let evidence: unknown
      try {
        evidence = await parseJson(evidencePath)
      } catch {
        continue
      }
      if (isOverlay(evidence)) continue
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
