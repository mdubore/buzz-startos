import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { type Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { UPSTREAM } from '../startos/image-pins.js'
import {
  runtimeImageTargets,
  type RuntimeImageTarget,
} from './runtime-image-targets.js'

const RELEASE_INDEXES = ['RELEASE-ASSETS.json', 'SHA256SUMS'] as const
const PACKAGE_ARCHITECTURES = [
  {
    packageArchitecture: 'x86_64',
    ociArchitecture: 'amd64',
    archive: 'buzz_x86_64.s9pk',
  },
  {
    packageArchitecture: 'aarch64',
    ociArchitecture: 'arm64',
    archive: 'buzz_aarch64.s9pk',
  },
] as const
const MANIFEST_MINIMUM_STARTOS = '0.4.0-beta.10'
const SDK_VERSION = '2.0.9'
const SYFT_VERSION = '1.49.0'
const SYFT_IDENTITY = {
  application: 'syft',
  buildDate: '2026-07-21T13:11:45Z',
  compiler: 'gc',
  gitCommit: '29fd7d0dec81cf03e0a1194a1985c7c893bb2396',
  gitDescription: 'v1.49.0',
  goVersion: 'go1.26.3',
  platform: 'linux/amd64',
  schemaVersion: '16.1.10',
  version: SYFT_VERSION,
} as const
const CYCLONEDX_CLI_IDENTITY =
  '0.32.0+0ed788d25c13cef9e9a3029603f6b708e3279390\n'
const START_CLI_TIMEOUT_MS = 60_000
const execFileAsync = promisify(execFile)
const FIXED_RELEASE_PAYLOADS = [
  'SIGNING-PUBKEY.pem',
  'SIGNING-PUBKEY.sha256',
  'buzz-node.cdx.json',
  'buzz_aarch64.s9pk',
  'buzz_x86_64.s9pk',
  'cyclonedx-cli-version.txt',
  'grype-db-status.json',
  'grype-effective-config.yaml',
  'grype-version.json',
  'release-verification.json',
  'runtime-image-targets.json',
  'syft-version.json',
] as const

export const expectedReleasePayloadNames = (
  targets: readonly RuntimeImageTarget[],
): string[] =>
  [
    ...FIXED_RELEASE_PAYLOADS,
    ...targets.flatMap(({ id }) => [`${id}.cdx.json`, `${id}.grype.json`]),
  ].sort()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  )
}

export const canonicalizeCycloneDx = (value: unknown): string => {
  if (
    !isRecord(value) ||
    value.bomFormat !== 'CycloneDX' ||
    value.specVersion !== '1.6' ||
    value.version !== 1 ||
    !isRecord(value.metadata) ||
    !isRecord(value.metadata.component)
  ) {
    throw new Error('SBOM must be a CycloneDX 1.6 document with a subject')
  }

  const document = structuredClone(value)
  delete document.serialNumber
  if (isRecord(document.metadata)) delete document.metadata.timestamp
  return `${JSON.stringify(canonicalValue(document), null, 2)}\n`
}

const validateSbomDocument = async (
  path: string,
  expectedSubject: {
    type: 'file' | 'container'
    name: string
    version: string
  },
  context: string,
): Promise<void> => {
  const stats = await lstat(path)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1) {
    throw new Error(`SBOM must be a nonempty regular file: ${context}`)
  }

  const text = await readFile(path, 'utf8')
  let document: unknown
  try {
    document = JSON.parse(text) as unknown
  } catch {
    throw new Error(`SBOM is not valid JSON: ${context}`)
  }
  if (text !== canonicalizeCycloneDx(document)) {
    throw new Error(`SBOM is not canonical: ${context}`)
  }
  if (
    !isRecord(document) ||
    !isRecord(document.metadata) ||
    !isRecord(document.metadata.component) ||
    !isRecord(document.metadata.tools) ||
    !Array.isArray(document.metadata.tools.components) ||
    !Array.isArray(document.components) ||
    document.components.length === 0 ||
    !Array.isArray(document.dependencies)
  ) {
    throw new Error(`SBOM is incomplete: ${context}`)
  }

  const hasPinnedSyft = document.metadata.tools.components.some(
    (tool) =>
      isRecord(tool) &&
      tool.type === 'application' &&
      tool.author === 'anchore' &&
      tool.name === 'syft' &&
      tool.version === SYFT_VERSION,
  )
  if (!hasPinnedSyft) {
    throw new Error(`SBOM must identify Syft ${SYFT_VERSION}: ${context}`)
  }

  const subject = document.metadata.component
  if (
    !exactFields(subject, ['bom-ref', 'type', 'name', 'version']) ||
    typeof subject['bom-ref'] !== 'string' ||
    subject['bom-ref'].length === 0 ||
    subject.type !== expectedSubject.type ||
    subject.name !== expectedSubject.name ||
    subject.version !== expectedSubject.version
  ) {
    throw new Error(
      `SBOM subject does not match its package or immutable target: ${context}`,
    )
  }
}

export const validateSbomSubjects = async (
  directory: string,
  packageVersion: string,
  targets: readonly RuntimeImageTarget[],
): Promise<void> => {
  if (!/^[^\s]+:[0-9]+$/.test(packageVersion)) {
    throw new Error('SBOM package version is invalid')
  }
  if (
    new Set(targets.map(({ id }) => id)).size !== targets.length ||
    targets.some(
      ({ id, digest }) =>
        !/^[A-Za-z0-9-]+$/.test(id) || !/^sha256:[0-9a-f]{64}$/.test(digest),
    )
  ) {
    throw new Error('SBOM target identity is invalid')
  }

  const syftVersionText = await readFile(
    join(directory, 'syft-version.json'),
    'utf8',
  )
  let syftVersion: unknown
  try {
    syftVersion = JSON.parse(syftVersionText) as unknown
  } catch {
    throw new Error('Syft tool evidence is not valid JSON')
  }
  validateSbomToolEvidence(
    syftVersion,
    await readFile(join(directory, 'cyclonedx-cli-version.txt'), 'utf8'),
  )

  await validateSbomDocument(
    join(directory, 'buzz-node.cdx.json'),
    {
      type: 'file',
      name: 'buzz-startos',
      version: packageVersion,
    },
    'buzz-node.cdx.json',
  )
  await Promise.all(
    targets.map(({ id, digest }) =>
      validateSbomDocument(
        join(directory, `${id}.cdx.json`),
        { type: 'container', name: id, version: digest },
        `${id}.cdx.json`,
      ),
    ),
  )
}

type ReleaseAsset = {
  name: string
  mediaType: string
  sha256: string
  sizeBytes: number
}

type ReleaseAssetManifest = {
  schemaVersion: 1
  assets: ReleaseAsset[]
}

type ReleaseVerificationExpectations = {
  packageVersion: string
  packageCommit: string
  upstreamCommit: string
  signerFingerprint: string
  manifestMinimumStartos: string
  sdkVersion: string
  targets: readonly RuntimeImageTarget[]
}

const exactFields = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => {
  const fields = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return (
    fields.length === wanted.length &&
    fields.every((field, index) => field === wanted[index])
  )
}

export const validateSbomToolEvidence = (
  syftVersion: unknown,
  cyclonedxVersion: string,
): void => {
  if (
    !isRecord(syftVersion) ||
    !exactFields(syftVersion, Object.keys(SYFT_IDENTITY)) ||
    JSON.stringify(canonicalValue(syftVersion)) !==
      JSON.stringify(canonicalValue(SYFT_IDENTITY))
  ) {
    throw new Error('Syft tool evidence does not match the reviewed identity')
  }
  if (cyclonedxVersion !== CYCLONEDX_CLI_IDENTITY) {
    throw new Error(
      'CycloneDX CLI tool evidence does not match the reviewed identity',
    )
  }
}

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)

const packageImageName = (name: string): string =>
  name === 'minioClient' ? 'minio-client' : name

const mediaType = (name: string): string => {
  if (name.endsWith('.s9pk')) return 'application/vnd.start9.s9pk'
  if (name.endsWith('.cdx.json')) return 'application/vnd.cyclonedx+json'
  if (name.endsWith('.grype.json')) return 'application/vnd.anchore.grype+json'
  if (name.endsWith('.pem')) return 'application/x-pem-file'
  if (name.endsWith('.yaml')) return 'application/yaml'
  if (name.endsWith('.json')) return 'application/json'
  if (name.endsWith('.sha256') || name.endsWith('.txt')) {
    return 'text/plain; charset=utf-8'
  }
  throw new Error(`release asset has no media type: ${name}`)
}

const assertSafeNames = (names: readonly string[]): string[] => {
  const sorted = [...names].sort()
  if (
    sorted.length === 0 ||
    new Set(sorted).size !== sorted.length ||
    sorted.some(
      (name) =>
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ||
        name === '.' ||
        name === '..',
    )
  ) {
    throw new Error('release asset names must be unique safe basenames')
  }
  return sorted
}

const assertDirectoryEntries = async (
  directory: string,
  expectedNames: readonly string[],
): Promise<void> => {
  const expected = assertSafeNames(expectedNames)
  const actual = (await readdir(directory)).sort()
  if (
    actual.length !== expected.length ||
    actual.some((name, index) => name !== expected[index])
  ) {
    throw new Error(
      `release directory contents differ: expected ${expected.join(', ')}, found ${actual.join(', ')}`,
    )
  }

  for (const name of expected) {
    const stats = await lstat(join(directory, name))
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`release asset must be a regular file: ${name}`)
    }
  }
}

const assertNamedRegularFiles = async (
  directory: string,
  expectedNames: readonly string[],
): Promise<void> => {
  for (const name of assertSafeNames(expectedNames)) {
    const stats = await lstat(join(directory, name))
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1) {
      throw new Error(`release asset must be a nonempty regular file: ${name}`)
    }
  }
}

const hashStream = async (stream: Readable, context: string): Promise<string> =>
  new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolveHash(hash.digest('hex')))
    stream.on('close', () => {
      if (!stream.readableEnded) {
        reject(new Error(`stream closed before completion: ${context}`))
      }
    })
  })

const fileSha256 = async (path: string): Promise<string> =>
  hashStream(createReadStream(path), path)

const releaseAsset = async (
  directory: string,
  name: string,
): Promise<ReleaseAsset> => {
  const path = join(directory, name)
  const stats = await lstat(path)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`release asset must be a regular file: ${name}`)
  }
  if (stats.size < 1) throw new Error(`release asset is empty: ${name}`)
  return {
    name,
    mediaType: mediaType(name),
    sha256: await fileSha256(path),
    sizeBytes: stats.size,
  }
}

const canonicalJson = (value: unknown): string =>
  `${JSON.stringify(canonicalValue(value), null, 2)}\n`

const checksumFile = async (
  directory: string,
  names: readonly string[],
): Promise<string> => {
  const lines = await Promise.all(
    assertSafeNames(names).map(async (name) => {
      const sha256 = await fileSha256(join(directory, name))
      return `${sha256}  ${name}`
    }),
  )
  return `${lines.join('\n')}\n`
}

export const writeReleaseIndexes = async (
  directory: string,
  payloadNames: readonly string[],
): Promise<void> => {
  const payloads = assertSafeNames(payloadNames)
  await assertDirectoryEntries(directory, payloads)
  const manifest: ReleaseAssetManifest = {
    schemaVersion: 1,
    assets: await Promise.all(
      payloads.map((name) => releaseAsset(directory, name)),
    ),
  }
  await writeFile(
    join(directory, RELEASE_INDEXES[0]),
    canonicalJson(manifest),
    { flag: 'wx' },
  )
  await writeFile(
    join(directory, RELEASE_INDEXES[1]),
    await checksumFile(directory, [...payloads, RELEASE_INDEXES[0]]),
    { flag: 'wx' },
  )
}

const parseReleaseManifest = (value: unknown): ReleaseAssetManifest => {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(',') !== 'assets,schemaVersion' ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.assets)
  ) {
    throw new Error('release asset manifest has an invalid top-level shape')
  }

  const assets = value.assets.map((candidate, index) => {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).sort().join(',') !==
        'mediaType,name,sha256,sizeBytes' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.mediaType !== 'string' ||
      typeof candidate.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(candidate.sha256) ||
      !Number.isSafeInteger(candidate.sizeBytes) ||
      (candidate.sizeBytes as number) < 1
    ) {
      throw new Error(`release asset manifest entry ${index} is invalid`)
    }
    return candidate as ReleaseAsset
  })
  return { schemaVersion: 1, assets }
}

export const validateReleaseVerification = (
  value: unknown,
  expected: ReleaseVerificationExpectations,
): void => {
  if (
    !isRecord(value) ||
    !exactFields(value, [
      'schemaVersion',
      'candidate',
      'packages',
      'runtimeImages',
    ]) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.candidate) ||
    !Array.isArray(value.packages) ||
    !Array.isArray(value.runtimeImages)
  ) {
    throw new Error('release verification has an invalid top-level shape')
  }

  const candidate = value.candidate
  const expectedCandidate = {
    tag: `v${expected.packageVersion.replace(':', '_')}`,
    packageVersion: expected.packageVersion,
    packageCommit: expected.packageCommit,
    upstreamCommit: expected.upstreamCommit,
    signerFingerprint: expected.signerFingerprint,
    manifestMinimumStartos: expected.manifestMinimumStartos,
    sdkVersion: expected.sdkVersion,
  }
  if (
    !exactFields(candidate, Object.keys(expectedCandidate)) ||
    JSON.stringify(canonicalValue(candidate)) !==
      JSON.stringify(canonicalValue(expectedCandidate))
  ) {
    throw new Error('release candidate identity does not match expectations')
  }
  if (
    !/^[0-9a-f]{40}$/.test(expected.packageCommit) ||
    !/^[0-9a-f]{40}$/.test(expected.upstreamCommit) ||
    !/^sha256:[0-9a-f]{64}$/.test(expected.signerFingerprint)
  ) {
    throw new Error('release verification expectations are invalid')
  }

  const actualRuntimeImages = [...value.runtimeImages].sort((left, right) =>
    isRecord(left) && isRecord(right)
      ? String(left.id).localeCompare(String(right.id))
      : 0,
  )
  const expectedRuntimeImages = [...expected.targets].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  if (
    JSON.stringify(canonicalValue(actualRuntimeImages)) !==
    JSON.stringify(canonicalValue(expectedRuntimeImages))
  ) {
    throw new Error('runtime image identity does not match the immutable pins')
  }

  if (value.packages.length !== PACKAGE_ARCHITECTURES.length) {
    throw new Error('release verification must contain exactly two packages')
  }

  const packages = new Map<string, Record<string, unknown>>()
  for (const item of value.packages) {
    if (!isRecord(item) || typeof item.architecture !== 'string') {
      throw new Error('release package verification entry is invalid')
    }
    if (packages.has(item.architecture)) {
      throw new Error(`duplicate release package: ${item.architecture}`)
    }
    packages.set(item.architecture, item)
  }

  const commitmentRoots = new Set<string>()
  for (const architecture of PACKAGE_ARCHITECTURES) {
    const item = packages.get(architecture.packageArchitecture)
    if (
      item === undefined ||
      !exactFields(item, [
        'architecture',
        'archive',
        'signerFingerprint',
        'manifest',
        'commitment',
        'packedImages',
      ]) ||
      !isRecord(item.archive) ||
      !isRecord(item.manifest) ||
      !isRecord(item.commitment) ||
      !Array.isArray(item.packedImages)
    ) {
      throw new Error(
        `release package verification is incomplete: ${architecture.packageArchitecture}`,
      )
    }

    const archive = item.archive
    if (
      !exactFields(archive, ['name', 'sha256', 'sizeBytes']) ||
      archive.name !== architecture.archive ||
      !isSha256(archive.sha256) ||
      !Number.isSafeInteger(archive.sizeBytes) ||
      (archive.sizeBytes as number) < 1 ||
      item.signerFingerprint !== expected.signerFingerprint
    ) {
      throw new Error(
        `release archive identity does not match: ${architecture.packageArchitecture}`,
      )
    }

    const manifest = item.manifest
    const expectedImages = expected.targets
      .filter(
        ({ architecture: targetArchitecture }) =>
          targetArchitecture === architecture.ociArchitecture,
      )
      .map(({ name }) => packageImageName(name))
      .sort()
    if (
      !exactFields(manifest, [
        'id',
        'version',
        'gitHash',
        'osVersion',
        'sdkVersion',
        'architectures',
        'images',
      ]) ||
      manifest.id !== 'buzz' ||
      manifest.version !== expected.packageVersion ||
      manifest.gitHash !== expected.packageCommit ||
      manifest.osVersion !== expected.manifestMinimumStartos ||
      manifest.sdkVersion !== expected.sdkVersion ||
      !Array.isArray(manifest.architectures) ||
      manifest.architectures.length !== 1 ||
      manifest.architectures[0] !== architecture.packageArchitecture ||
      !Array.isArray(manifest.images) ||
      JSON.stringify([...manifest.images].sort()) !==
        JSON.stringify(expectedImages)
    ) {
      throw new Error(
        `package manifest does not match: ${architecture.packageArchitecture}`,
      )
    }

    const commitment = item.commitment
    if (
      !exactFields(commitment, ['rootSighash', 'rootMaxsize']) ||
      typeof commitment.rootSighash !== 'string' ||
      commitment.rootSighash.trim().length === 0 ||
      !Number.isSafeInteger(commitment.rootMaxsize) ||
      (commitment.rootMaxsize as number) < 1
    ) {
      throw new Error(
        `package commitment is invalid: ${architecture.packageArchitecture}`,
      )
    }
    commitmentRoots.add(commitment.rootSighash)

    const expectedTargets = expected.targets
      .filter(
        ({ architecture: targetArchitecture }) =>
          targetArchitecture === architecture.ociArchitecture,
      )
      .sort((left, right) => left.id.localeCompare(right.id))
    const packedImages = item.packedImages
      .map((packed) => {
        if (!isRecord(packed)) {
          throw new Error(
            `packed image is invalid: ${architecture.packageArchitecture}`,
          )
        }
        return packed
      })
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    if (packedImages.length !== expectedTargets.length) {
      throw new Error(
        `packed image count does not match: ${architecture.packageArchitecture}`,
      )
    }
    for (const [index, target] of expectedTargets.entries()) {
      const packed = packedImages[index]
      if (
        !exactFields(packed, [
          'id',
          'reference',
          'digest',
          'configSha256',
          'rootfsSha256',
        ]) ||
        packed.id !== packageImageName(target.name) ||
        packed.reference !== target.reference ||
        packed.digest !== target.digest ||
        !isSha256(packed.configSha256) ||
        !isSha256(packed.rootfsSha256) ||
        !isDigest(packed.digest)
      ) {
        throw new Error(
          `packed image ${target.id} does not match the immutable pin`,
        )
      }
    }
  }

  if (commitmentRoots.size !== PACKAGE_ARCHITECTURES.length) {
    throw new Error('architecture packages must have distinct commitments')
  }
}

export const validateObservedReleaseVerification = (
  value: unknown,
  observed: unknown,
  expected: ReleaseVerificationExpectations,
): void => {
  validateReleaseVerification(value, expected)
  validateReleaseVerification(observed, expected)
  if (canonicalJson(value) !== canonicalJson(observed)) {
    throw new Error(
      'release verification does not match observed package bytes',
    )
  }
}

const inspectJson = async (
  archive: string,
  command: 'manifest' | 'commitment' | 'file-tree',
): Promise<unknown> => {
  const { stdout } = await execFileAsync(
    'start-cli',
    ['s9pk', 'inspect', archive, command],
    {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: START_CLI_TIMEOUT_MS,
    },
  )
  try {
    return JSON.parse(stdout) as unknown
  } catch {
    throw new Error(`start-cli returned invalid ${command} JSON`)
  }
}

const hashArchiveMember = async (
  archive: string,
  member: string,
): Promise<string> => {
  const child = spawn(
    'start-cli',
    ['s9pk', 'inspect', archive, 'cat', member],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    if (stderr.length < 8192) stderr += chunk
  })
  const digest = hashStream(child.stdout, `${archive}:${member}`)
  const exit = new Promise<void>((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`start-cli timed out reading ${member}`))
    }, START_CLI_TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolveExit()
      } else {
        reject(
          new Error(
            `start-cli failed reading ${member}: ${signal ?? String(code)} ${stderr.trim()}`,
          ),
        )
      }
    })
  })
  const [sha256] = await Promise.all([digest, exit])
  return sha256
}

const assertPackageManifest = (
  value: unknown,
  architecture: (typeof PACKAGE_ARCHITECTURES)[number],
  packageVersion: string,
  packageCommit: string,
  imageNames: readonly string[],
): Record<string, unknown> => {
  if (
    !isRecord(value) ||
    value.id !== 'buzz' ||
    value.version !== packageVersion ||
    value.gitHash !== packageCommit ||
    value.osVersion !== MANIFEST_MINIMUM_STARTOS ||
    value.sdkVersion !== SDK_VERSION ||
    !isRecord(value.images) ||
    !isRecord(value.hardwareRequirements)
  ) {
    throw new Error(
      `package manifest does not match: ${architecture.packageArchitecture}`,
    )
  }
  if (
    JSON.stringify(Object.keys(value.images).sort()) !==
      JSON.stringify([...imageNames].sort()) ||
    !Array.isArray(value.hardwareRequirements.arch) ||
    value.hardwareRequirements.arch.length !== 1 ||
    value.hardwareRequirements.arch[0] !== architecture.packageArchitecture
  ) {
    throw new Error(
      `package manifest architecture does not match: ${architecture.packageArchitecture}`,
    )
  }
  for (const imageName of imageNames) {
    const image = value.images[imageName]
    if (
      !isRecord(image) ||
      image.source !== 'packed' ||
      !Array.isArray(image.arch) ||
      image.arch.length !== 1 ||
      image.arch[0] !== architecture.packageArchitecture
    ) {
      throw new Error(
        `package image manifest does not match: ${architecture.packageArchitecture}/${imageName}`,
      )
    }
  }
  return value
}

const assertImageTree = (
  value: unknown,
  architecture: (typeof PACKAGE_ARCHITECTURES)[number],
  imageNames: readonly string[],
): void => {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new Error('package file tree is invalid')
  }
  const prefix = `images/${architecture.packageArchitecture}/`
  const expected = [
    'images/',
    prefix,
    ...imageNames.flatMap((name) => [
      `${prefix}${name}.env`,
      `${prefix}${name}.json`,
      `${prefix}${name}.squashfs`,
    ]),
  ].sort()
  const actual = value.filter((path) => path.startsWith('images/')).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `package image file tree does not match: ${architecture.packageArchitecture}`,
    )
  }
}

const assertCommitment = (value: unknown): Record<string, unknown> => {
  if (
    !isRecord(value) ||
    !exactFields(value, ['rootSighash', 'rootMaxsize']) ||
    typeof value.rootSighash !== 'string' ||
    value.rootSighash.trim().length === 0 ||
    !Number.isSafeInteger(value.rootMaxsize) ||
    (value.rootMaxsize as number) < 1
  ) {
    throw new Error('package commitment is invalid')
  }
  return value
}

const readSignerFingerprint = async (): Promise<string> => {
  const path = new URL('../assets/signing-pubkey.sha256', import.meta.url)
  const fingerprint = (await readFile(path, 'utf8')).trim()
  if (!/^sha256:[0-9a-f]{64}$/.test(fingerprint)) {
    throw new Error('committed signer fingerprint is invalid')
  }
  return fingerprint
}

const createReleaseVerification = async (
  packagesDirectory: string,
  packageVersion: string,
  packageCommit: string,
): Promise<unknown> => {
  const targets = runtimeImageTargets()
  const signerFingerprint = await readSignerFingerprint()
  await assertNamedRegularFiles(
    packagesDirectory,
    PACKAGE_ARCHITECTURES.map(({ archive }) => archive),
  )

  const packages: unknown[] = []
  for (const architecture of PACKAGE_ARCHITECTURES) {
    const archivePath = join(packagesDirectory, architecture.archive)
    const architectureTargets = targets
      .filter(
        ({ architecture: targetArchitecture }) =>
          targetArchitecture === architecture.ociArchitecture,
      )
      .sort((left, right) => left.id.localeCompare(right.id))
    const imageNames = architectureTargets
      .map(({ name }) => packageImageName(name))
      .sort()
    const [manifest, commitment, fileTree, archiveStats, archiveSha256] =
      await Promise.all([
        inspectJson(archivePath, 'manifest'),
        inspectJson(archivePath, 'commitment'),
        inspectJson(archivePath, 'file-tree'),
        lstat(archivePath),
        fileSha256(archivePath),
      ])
    assertPackageManifest(
      manifest,
      architecture,
      packageVersion,
      packageCommit,
      imageNames,
    )
    assertImageTree(fileTree, architecture, imageNames)

    const packedImages = []
    for (const target of architectureTargets) {
      const id = packageImageName(target.name)
      const prefix = `images/${architecture.packageArchitecture}/${id}`
      const [configSha256, rootfsSha256] = await Promise.all([
        hashArchiveMember(archivePath, `${prefix}.json`),
        hashArchiveMember(archivePath, `${prefix}.squashfs`),
      ])
      packedImages.push({
        id,
        reference: target.reference,
        digest: target.digest,
        configSha256,
        rootfsSha256,
      })
    }

    const manifestRecord = manifest as Record<string, unknown>
    packages.push({
      architecture: architecture.packageArchitecture,
      archive: {
        name: architecture.archive,
        sha256: archiveSha256,
        sizeBytes: archiveStats.size,
      },
      signerFingerprint,
      manifest: {
        id: manifestRecord.id,
        version: manifestRecord.version,
        gitHash: manifestRecord.gitHash,
        osVersion: manifestRecord.osVersion,
        sdkVersion: manifestRecord.sdkVersion,
        architectures: [architecture.packageArchitecture],
        images: imageNames,
      },
      commitment: assertCommitment(commitment),
      packedImages,
    })
  }

  const record = {
    schemaVersion: 1,
    candidate: {
      tag: `v${packageVersion.replace(':', '_')}`,
      packageVersion,
      packageCommit,
      upstreamCommit: UPSTREAM.commit,
      signerFingerprint,
      manifestMinimumStartos: MANIFEST_MINIMUM_STARTOS,
      sdkVersion: SDK_VERSION,
    },
    packages,
    runtimeImages: targets,
  }
  validateReleaseVerification(record, {
    packageVersion,
    packageCommit,
    upstreamCommit: UPSTREAM.commit,
    signerFingerprint,
    manifestMinimumStartos: MANIFEST_MINIMUM_STARTOS,
    sdkVersion: SDK_VERSION,
    targets,
  })
  return record
}

export const verifyReleaseIndexes = async (
  directory: string,
  payloadNames: readonly string[],
): Promise<void> => {
  const payloads = assertSafeNames(payloadNames)
  await assertDirectoryEntries(directory, [...payloads, ...RELEASE_INDEXES])

  const manifestPath = join(directory, RELEASE_INDEXES[0])
  const manifestText = await readFile(manifestPath, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestText) as unknown
  } catch {
    throw new Error('release asset manifest is not valid JSON')
  }
  const manifest = parseReleaseManifest(parsed)
  if (manifestText !== canonicalJson(manifest)) {
    throw new Error('release asset manifest is not canonical JSON')
  }
  if (
    manifest.assets.length !== payloads.length ||
    manifest.assets.some(({ name }, index) => name !== payloads[index])
  ) {
    throw new Error(
      'release asset manifest does not match the payload allowlist',
    )
  }

  for (const expected of manifest.assets) {
    const actual = await releaseAsset(directory, expected.name)
    if (actual.sha256 !== expected.sha256) {
      throw new Error(`checksum mismatch for ${expected.name}`)
    }
    if (actual.sizeBytes !== expected.sizeBytes) {
      throw new Error(`size mismatch for ${expected.name}`)
    }
    if (actual.mediaType !== expected.mediaType) {
      throw new Error(`media type mismatch for ${expected.name}`)
    }
  }

  const expectedSums = await checksumFile(directory, [
    ...payloads,
    RELEASE_INDEXES[0],
  ])
  const actualSums = await readFile(join(directory, RELEASE_INDEXES[1]), 'utf8')
  if (actualSums !== expectedSums) {
    throw new Error('SHA256SUMS does not match the release payloads')
  }
}

const main = async (): Promise<void> => {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'canonicalize-sbom' && args.length === 2) {
    const input = JSON.parse(
      await readFile(resolve(args[0]), 'utf8'),
    ) as unknown
    await writeFile(resolve(args[1]), canonicalizeCycloneDx(input), {
      flag: 'wx',
    })
    return
  }
  if (command === 'create-verification' && args.length === 5) {
    const [packagesDirectory, output, tag, packageVersion, packageCommit] = args
    if (tag !== `v${packageVersion.replace(':', '_')}`) {
      throw new Error('candidate tag does not match the package version')
    }
    await assertDirectoryEntries(
      resolve(packagesDirectory),
      PACKAGE_ARCHITECTURES.map(({ archive }) => archive),
    )
    const record = await createReleaseVerification(
      resolve(packagesDirectory),
      packageVersion,
      packageCommit,
    )
    await writeFile(resolve(output), canonicalJson(record), { flag: 'wx' })
    return
  }
  if (command === 'verify-record' && args.length === 4) {
    const [input, tag, packageVersion, packageCommit] = args
    if (tag !== `v${packageVersion.replace(':', '_')}`) {
      throw new Error('candidate tag does not match the package version')
    }
    const signerFingerprint = await readSignerFingerprint()
    const inputPath = resolve(input)
    const recordText = await readFile(inputPath, 'utf8')
    const record = JSON.parse(recordText) as unknown
    if (recordText !== canonicalJson(record)) {
      throw new Error('release verification is not canonical JSON')
    }
    const expectations = {
      packageVersion,
      packageCommit,
      upstreamCommit: UPSTREAM.commit,
      signerFingerprint,
      manifestMinimumStartos: MANIFEST_MINIMUM_STARTOS,
      sdkVersion: SDK_VERSION,
      targets: runtimeImageTargets(),
    }
    const observed = await createReleaseVerification(
      dirname(inputPath),
      packageVersion,
      packageCommit,
    )
    validateObservedReleaseVerification(record, observed, expectations)
    return
  }
  if (command === 'verify-sbom-subjects' && args.length === 2) {
    await validateSbomSubjects(resolve(args[0]), args[1], runtimeImageTargets())
    return
  }
  if (command === 'write-indexes' && args.length === 1) {
    await writeReleaseIndexes(
      resolve(args[0]),
      expectedReleasePayloadNames(runtimeImageTargets()),
    )
    return
  }
  if (command === 'verify-indexes' && args.length === 1) {
    await verifyReleaseIndexes(
      resolve(args[0]),
      expectedReleasePayloadNames(runtimeImageTargets()),
    )
    return
  }
  throw new Error(
    'usage: release-assets.ts <canonicalize-sbom|create-verification|verify-record|verify-sbom-subjects|write-indexes|verify-indexes> ...',
  )
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
