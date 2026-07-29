import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { runtimeImageTargets } from '../scripts/runtime-image-targets.js'
import {
  canonicalizeCycloneDx,
  expectedReleasePayloadNames,
  validateObservedReleaseVerification,
  validateSbomToolEvidence,
  validateSbomSubjects,
  validateReleaseVerification,
  verifyReleaseIndexes,
  writeReleaseIndexes,
} from '../scripts/release-assets.js'

const writeSbomToolEvidence = async (directory: string): Promise<void> => {
  await writeFile(
    join(directory, 'syft-version.json'),
    `${JSON.stringify({
      application: 'syft',
      buildDate: '2026-07-21T13:11:45Z',
      compiler: 'gc',
      gitCommit: '29fd7d0dec81cf03e0a1194a1985c7c893bb2396',
      gitDescription: 'v1.49.0',
      goVersion: 'go1.26.3',
      platform: 'linux/amd64',
      schemaVersion: '16.1.10',
      version: '1.49.0',
    })}\n`,
  )
  await writeFile(
    join(directory, 'cyclonedx-cli-version.txt'),
    '0.32.0+0ed788d25c13cef9e9a3029603f6b708e3279390\n',
  )
}

test('requires every package, SBOM, scan, signer, and verification payload', () => {
  const targets = runtimeImageTargets()
  const names = expectedReleasePayloadNames(targets)

  assert.equal(targets.length, 10)
  assert.equal(new Set(names).size, names.length)
  const expected = [
    'SIGNING-PUBKEY.pem',
    'SIGNING-PUBKEY.sha256',
    'buzz-node.cdx.json',
    'buzz_aarch64.s9pk',
    'buzz_x86_64.s9pk',
    'cyclonedx-cli-version.txt',
    'grype-db-status.json',
    'grype-effective-config.yaml',
    'grype-version.json',
    'minioClient-amd64.cdx.json',
    'minioClient-amd64.grype.json',
    'minioClient-arm64.cdx.json',
    'minioClient-arm64.grype.json',
    'minio-amd64.cdx.json',
    'minio-amd64.grype.json',
    'minio-arm64.cdx.json',
    'minio-arm64.grype.json',
    'postgres-amd64.cdx.json',
    'postgres-amd64.grype.json',
    'postgres-arm64.cdx.json',
    'postgres-arm64.grype.json',
    'redis-amd64.cdx.json',
    'redis-amd64.grype.json',
    'redis-arm64.cdx.json',
    'redis-arm64.grype.json',
    'release-verification.json',
    'runtime-image-targets.json',
    'syft-version.json',
    'buzz-amd64.cdx.json',
    'buzz-amd64.grype.json',
    'buzz-arm64.cdx.json',
    'buzz-arm64.grype.json',
  ].sort()
  assert.deepEqual(names, expected)
})

test('canonicalizes CycloneDX 1.6 output without run-specific identity', () => {
  const first = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: 'urn:uuid:11111111-1111-1111-1111-111111111111',
    version: 1,
    metadata: {
      timestamp: '2026-07-27T12:00:00Z',
      component: {
        type: 'application',
        name: 'buzz-node',
        version: '1.0.0',
        'bom-ref': 'pkg:npm/buzz-startos@1.0.0',
      },
    },
    components: [
      {
        type: 'library',
        name: 'example',
        version: '2.0.0',
        'bom-ref': 'pkg:npm/example@2.0.0',
      },
    ],
    dependencies: [
      {
        ref: 'pkg:npm/buzz-startos@1.0.0',
        dependsOn: ['pkg:npm/example@2.0.0'],
      },
    ],
  }
  const second = {
    dependencies: first.dependencies,
    components: first.components,
    metadata: {
      component: first.metadata.component,
      timestamp: '2026-07-27T12:05:00Z',
    },
    version: 1,
    serialNumber: 'urn:uuid:22222222-2222-2222-2222-222222222222',
    specVersion: '1.6',
    bomFormat: 'CycloneDX',
  }

  const canonical = canonicalizeCycloneDx(first)
  assert.equal(canonical, canonicalizeCycloneDx(second))
  assert.equal(canonical.endsWith('\n'), true)
  assert.doesNotMatch(canonical, /serialNumber|timestamp|urn:uuid/)
  assert.deepEqual(JSON.parse(canonical), {
    bomFormat: 'CycloneDX',
    components: first.components,
    dependencies: first.dependencies,
    metadata: { component: first.metadata.component },
    specVersion: '1.6',
    version: 1,
  })
})

test('binds every canonical SBOM subject to its package or OCI target', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'buzz-sbom-subjects-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const packageVersion = '0.2.0-main.20260727.sha.abc1234:0'
  const targets = runtimeImageTargets()
  const document = (
    type: 'file' | 'container',
    name: string,
    version: string,
  ) =>
    canonicalizeCycloneDx({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      metadata: {
        tools: {
          components: [
            {
              type: 'application',
              author: 'anchore',
              name: 'syft',
              version: '1.49.0',
            },
          ],
        },
        component: {
          'bom-ref': `${name}@${version}`,
          type,
          name,
          version,
        },
      },
      components: [
        {
          type: 'library',
          name: 'fixture',
          version: '1.0.0',
          'bom-ref': 'pkg:generic/fixture@1.0.0',
        },
      ],
      dependencies: [],
    })

  await writeFile(
    join(directory, 'buzz-node.cdx.json'),
    document('file', 'buzz-startos', packageVersion),
  )
  await Promise.all(
    targets.map(({ id, digest }) =>
      writeFile(
        join(directory, `${id}.cdx.json`),
        document('container', id, digest),
      ),
    ),
  )
  await writeSbomToolEvidence(directory)

  await assert.doesNotReject(() =>
    validateSbomSubjects(directory, packageVersion, targets),
  )

  const target = targets[0]
  await writeFile(
    join(directory, `${target.id}.cdx.json`),
    document('container', target.id, `sha256:${'0'.repeat(64)}`),
  )
  await assert.rejects(
    () => validateSbomSubjects(directory, packageVersion, targets),
    /SBOM subject does not match.*immutable target/i,
  )
})

test('rejects noncanonical or untrusted Syft SBOM output', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'buzz-sbom-trust-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const packageVersion = '0.2.0-main.20260727.sha.abc1234:0'
  const document = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      timestamp: '2026-07-27T12:00:00Z',
      tools: {
        components: [
          {
            type: 'application',
            author: 'anchore',
            name: 'syft',
            version: '0.1.0',
          },
        ],
      },
      component: {
        'bom-ref': 'buzz-startos',
        type: 'file',
        name: 'buzz-startos',
        version: packageVersion,
      },
    },
    components: [
      {
        type: 'library',
        name: 'fixture',
        version: '1.0.0',
        'bom-ref': 'pkg:generic/fixture@1.0.0',
      },
    ],
    dependencies: [],
  }
  await writeFile(
    join(directory, 'buzz-node.cdx.json'),
    `${JSON.stringify(document)}\n`,
  )
  await writeSbomToolEvidence(directory)

  await assert.rejects(
    () => validateSbomSubjects(directory, packageVersion, []),
    /SBOM is not canonical/i,
  )

  const { timestamp: _timestamp, ...metadata } = document.metadata
  await writeFile(
    join(directory, 'buzz-node.cdx.json'),
    canonicalizeCycloneDx({ ...document, metadata }),
  )
  await assert.rejects(
    () => validateSbomSubjects(directory, packageVersion, []),
    /Syft 1\.49\.0/i,
  )
})

test('binds retained SBOM tool evidence to the reviewed binaries', () => {
  const syftVersion = {
    application: 'syft',
    buildDate: '2026-07-21T13:11:45Z',
    compiler: 'gc',
    gitCommit: '29fd7d0dec81cf03e0a1194a1985c7c893bb2396',
    gitDescription: 'v1.49.0',
    goVersion: 'go1.26.3',
    platform: 'linux/amd64',
    schemaVersion: '16.1.10',
    version: '1.49.0',
  }
  const cyclonedxVersion = '0.32.0+0ed788d25c13cef9e9a3029603f6b708e3279390\n'

  assert.doesNotThrow(() =>
    validateSbomToolEvidence(syftVersion, cyclonedxVersion),
  )

  const wrongSyft = structuredClone(syftVersion)
  wrongSyft.gitCommit = '0'.repeat(40)
  assert.throws(
    () => validateSbomToolEvidence(wrongSyft, cyclonedxVersion),
    /Syft.*identity/i,
  )
  assert.throws(
    () => validateSbomToolEvidence(syftVersion, '0.32.0\n'),
    /CycloneDX.*identity/i,
  )
})

test('writes and verifies a closed checksum and media-type asset index', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'buzz-release-assets-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const payloadNames = expectedReleasePayloadNames(runtimeImageTargets())
  await Promise.all(
    payloadNames.map((name) =>
      writeFile(join(directory, name), `fixture:${name}\n`),
    ),
  )

  await writeReleaseIndexes(directory, payloadNames)
  await assert.doesNotReject(() =>
    verifyReleaseIndexes(directory, payloadNames),
  )

  const manifest = JSON.parse(
    await readFile(join(directory, 'RELEASE-ASSETS.json'), 'utf8'),
  ) as {
    schemaVersion: number
    assets: Array<{
      name: string
      mediaType: string
      sha256: string
      sizeBytes: number
    }>
  }
  assert.equal(manifest.schemaVersion, 1)
  assert.deepEqual(
    manifest.assets.map(({ name }) => name),
    payloadNames,
  )
  assert.equal(
    manifest.assets.find(({ name }) => name === 'buzz_x86_64.s9pk')?.mediaType,
    'application/vnd.start9.s9pk',
  )
  assert.equal(
    manifest.assets.find(({ name }) => name === 'buzz-node.cdx.json')
      ?.mediaType,
    'application/vnd.cyclonedx+json',
  )
  assert.equal(
    manifest.assets.find(({ name }) => name === 'grype-effective-config.yaml')
      ?.mediaType,
    'application/yaml',
  )
  for (const asset of manifest.assets) {
    assert.match(asset.sha256, /^[0-9a-f]{64}$/)
    assert.ok(asset.sizeBytes > 0)
  }

  const sums = await readFile(join(directory, 'SHA256SUMS'), 'utf8')
  assert.equal(sums.trimEnd().split('\n').length, payloadNames.length + 1)
  assert.match(sums, /^[0-9a-f]{64}  RELEASE-ASSETS\.json$/m)

  await writeFile(join(directory, payloadNames[0]), 'tampered\n')
  await assert.rejects(
    () => verifyReleaseIndexes(directory, payloadNames),
    /checksum mismatch.*SIGNING-PUBKEY\.pem/i,
  )
})

test('binds package inspections and packed bytes to one frozen source identity', () => {
  const targets = runtimeImageTargets()
  const packageCommit = 'a'.repeat(40)
  const upstreamCommit = 'b'.repeat(40)
  const signerFingerprint = `sha256:${'c'.repeat(64)}`
  const packageVersion = '0.2.0-main.20260727.sha.abc1234:0'
  const expectations = {
    packageVersion,
    packageCommit,
    upstreamCommit,
    signerFingerprint,
    manifestMinimumStartos: '0.4.0-beta.10',
    sdkVersion: '2.0.9',
    targets,
  }
  const packageImageName = (name: string) =>
    name === 'minioClient' ? 'minio-client' : name
  const packages = (
    [
      ['x86_64', 'amd64', 'buzz_x86_64.s9pk'],
      ['aarch64', 'arm64', 'buzz_aarch64.s9pk'],
    ] as const
  ).map(([architecture, ociArchitecture, archive]) => ({
    architecture,
    archive: {
      name: archive,
      sha256: architecture === 'x86_64' ? 'd'.repeat(64) : 'e'.repeat(64),
      sizeBytes: architecture === 'x86_64' ? 123456 : 123457,
    },
    signerFingerprint,
    manifest: {
      id: 'buzz',
      version: packageVersion,
      gitHash: packageCommit,
      osVersion: '0.4.0-beta.10',
      sdkVersion: '2.0.9',
      architectures: [architecture],
      images: targets
        .filter((target) => target.architecture === ociArchitecture)
        .map(({ name }) => packageImageName(name))
        .sort(),
    },
    commitment: {
      rootSighash: architecture === 'x86_64' ? 'x86-root' : 'arm-root',
      rootMaxsize: architecture === 'x86_64' ? 445 : 446,
    },
    packedImages: targets
      .filter((target) => target.architecture === ociArchitecture)
      .map((target) => ({
        id: packageImageName(target.name),
        reference: target.reference,
        digest: target.digest,
        configSha256: 'f'.repeat(64),
        rootfsSha256: '1'.repeat(64),
      })),
  }))
  const record = {
    schemaVersion: 1,
    candidate: {
      tag: `v${packageVersion.replace(':', '_')}`,
      packageVersion,
      packageCommit,
      upstreamCommit,
      signerFingerprint,
      manifestMinimumStartos: '0.4.0-beta.10',
      sdkVersion: '2.0.9',
    },
    packages,
    runtimeImages: targets,
  }

  assert.doesNotThrow(() => validateReleaseVerification(record, expectations))
  assert.doesNotThrow(() =>
    validateObservedReleaseVerification(
      record,
      structuredClone(record),
      expectations,
    ),
  )

  const wrongDigest = structuredClone(record)
  wrongDigest.packages[0].packedImages[0].digest = `sha256:${'9'.repeat(64)}`
  assert.throws(
    () => validateReleaseVerification(wrongDigest, expectations),
    /packed image.*does not match/i,
  )

  const wrongCommit = structuredClone(record)
  wrongCommit.packages[1].manifest.gitHash = '0'.repeat(40)
  assert.throws(
    () => validateReleaseVerification(wrongCommit, expectations),
    /package manifest.*does not match/i,
  )

  const wrongObservedBytes = structuredClone(record)
  wrongObservedBytes.packages[0].archive.sha256 = '0'.repeat(64)
  assert.throws(
    () =>
      validateObservedReleaseVerification(
        record,
        wrongObservedBytes,
        expectations,
      ),
    /does not match observed package bytes/i,
  )
})

test('generates and schema-validates one Node and ten native OCI SBOMs', async () => {
  const generator = await readFile(
    new URL('../scripts/generate-sboms.sh', import.meta.url),
    'utf8',
  )

  assert.match(generator, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n/)
  assert.match(generator, /EXPECTED_SYFT_VERSION=['"]1\.49\.0['"]/)
  assert.match(
    generator,
    /EXPECTED_CYCLONEDX_VERSION=['"]0\.32\.0\+0ed788d25c13cef9e9a3029603f6b708e3279390['"]/,
  )
  assert.match(generator, /\benv -i\b/)
  assert.match(generator, /--config "\$syft_config"/)
  assert.doesNotMatch(generator, /--config \/dev\/null/)
  assert.match(
    generator,
    /--override-default-catalogers javascript-lock-cataloger/,
  )
  assert.match(generator, /file:\$repository_root\/package-lock\.json/)
  assert.doesNotMatch(generator, /dir:\$repository_root/)
  assert.match(generator, /cyclonedx-json@1\.6/)
  assert.match(generator, /runtime-image-targets\.ts --tsv/)
  assert.match(generator, /read -r id _name architecture digest reference/)
  assert.match(
    generator,
    /--source-name "\$id"[\s\S]*--source-version "\$digest"/,
  )
  assert.match(generator, /canonicalize-sbom/)
  assert.match(generator, /verify-sbom-subjects/)
  assert.match(
    generator,
    /cyclonedx validate[\s\S]*--input-version v1_6[\s\S]*--fail-on-errors/,
  )
  assert.match(generator, /cp --update=none/)
  assert.doesNotMatch(generator, /--no-clobber/)
  assert.doesNotMatch(generator, /latest|curl\s.*\|\s*(?:ba)?sh/)
})

test('prepares and reverifies release evidence without rebuilding or replacing bytes', async () => {
  const [prepare, verify, releaseAssets] = await Promise.all([
    readFile(
      new URL('../scripts/prepare-release-assets.sh', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../scripts/verify-release-assets.sh', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../scripts/release-assets.ts', import.meta.url), 'utf8'),
  ])

  for (const script of [prepare, verify]) {
    assert.match(script, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n/)
    assert.doesNotMatch(script, /\bDEV_KEY\b|make (?:x86|arm)|--clobber/)
    assert.match(script, /verify-s9pk-signer\.sh/)
    assert.match(script, /check-vulnerability-waivers\.ts grype/)
  }

  assert.match(prepare, /create-verification/)
  assert.match(prepare, /write-indexes/)
  assert.match(prepare, /cp --update=none/)
  assert.doesNotMatch(prepare, /--no-clobber/)
  assert.match(verify, /verify-sbom-subjects/)
  assert.match(verify, /verify-record/)
  assert.match(
    releaseAssets,
    /command === 'verify-record'[\s\S]*createReleaseVerification/,
  )
  assert.match(verify, /verify-indexes/)
  assert.match(
    verify,
    /cyclonedx validate[\s\S]*--input-version v1_6[\s\S]*--fail-on-errors/,
  )
  assert.doesNotMatch(verify, /^\s*(?:cp|mv|install)\s/m)
})
