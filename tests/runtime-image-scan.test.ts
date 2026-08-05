import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { runtimeImageTargets } from '../scripts/runtime-image-targets.js'
import { IMAGE_PINS } from '../startos/image-pins.js'

test('AJV resolves the patched fast-uri 3.x release', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const lockfile = JSON.parse(
    readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'),
  ) as { packages: Record<string, { version?: string }> }

  assert.equal(packageJson.dependencies?.['fast-uri'], undefined)
  assert.equal(packageJson.devDependencies?.['fast-uri'], undefined)
  assert.equal(lockfile.packages['node_modules/fast-uri']?.version, '3.1.5')
})

test('runtime scan covers both native manifests for every pinned image', () => {
  const targets = runtimeImageTargets()

  assert.equal(targets.length, Object.keys(IMAGE_PINS).length * 2)
  assert.equal(new Set(targets.map(({ id }) => id)).size, targets.length)

  for (const [name, pin] of Object.entries(IMAGE_PINS)) {
    for (const architecture of ['amd64', 'arm64'] as const) {
      const target = targets.find(
        (candidate) =>
          candidate.name === name && candidate.architecture === architecture,
      )
      assert.ok(target, `missing ${name}/${architecture}`)
      assert.equal(target.digest, pin.platforms[architecture])
      assert.match(
        target.reference,
        new RegExp(`@${pin.platforms[architecture]}$`),
      )
      const repository = target.reference.split('@', 1)[0]
      assert.doesNotMatch(
        repository.slice(repository.lastIndexOf('/') + 1),
        /:/,
      )
    }
  }
})

test('scanner requires pinned Grype, records database status, and runs policy', () => {
  const script = readFileSync(
    new URL('../scripts/scan-runtime-images.sh', import.meta.url),
    'utf8',
  )

  assert.match(script, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n/)
  assert.match(script, /EXPECTED_GRYPE_VERSION=['"]0\.116\.0['"]/)
  assert.match(script, /compgen -e/)
  assert.match(script, /GRYPE_\*\|SYFT_\*/)
  assert.match(script, /unset "\$variable"/)
  assert.match(script, /XDG_CONFIG_HOME/)
  assert.match(script, /trusted_config=.*security\/grype-ci\.yaml/)
  assert.match(
    script,
    /run_grype\(\)[\s\S]*command grype --config "\$trusted_config" "\$@"/,
  )
  assert.match(script, /grype-version\.json/)
  assert.match(script, /grype-effective-config\.yaml/)
  assert.match(script, /run_grype db update[\s\S]*run_grype db status/)
  assert.match(script, /--platform "linux\/\$architecture"/)
  assert.match(script, /runtime-image-targets\.ts/)
  assert.match(script, /check-vulnerability-waivers\.ts grype/)
  assert.doesNotMatch(script, /--fail-on\s+(?:critical|medium|low)/)

  const directCalls = script
    .split('\n')
    .filter((line) => /^\s*(?:command\s+)?grype(?:\s|$)/.test(line))
  assert.deepEqual(directCalls, [
    '  command grype --config "$trusted_config" "$@"',
  ])
})

test('trusted Grype config cannot suppress scanner findings', () => {
  const config = readFileSync(
    new URL('../security/grype-ci.yaml', import.meta.url),
    'utf8',
  )

  assert.match(config, /^check-for-app-update: false$/m)
  assert.match(config, /^only-fixed: false$/m)
  assert.match(config, /^only-notfixed: false$/m)
  assert.match(config, /^ignore-wontfix: ''$/m)
  assert.match(config, /^ignore: \[\]$/m)
  assert.match(config, /^exclude: \[\]$/m)
  assert.match(config, /^vex-documents: \[\]$/m)
  assert.match(config, /^vex-add: \[\]$/m)
  assert.match(config, /^match-upstream-kernel-headers: true$/m)
  assert.match(config, /^default-image-pull-source: registry$/m)
  assert.match(config, /^  auto-update: false$/m)
  assert.match(config, /^  validate-by-hash-on-start: true$/m)
  assert.match(config, /^  validate-age: true$/m)
})

test('package workflow gates npm and OCI risk with checksum-pinned tooling', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> }
  assert.equal(
    packageJson.scripts['audit:vulnerabilities'],
    'tsx scripts/check-vulnerability-waivers.ts npm',
  )
  assert.equal(packageJson.scripts['audit:signatures'], 'npm audit signatures')
  assert.equal(
    packageJson.scripts['scan:images'],
    'scripts/scan-runtime-images.sh',
  )

  const workflow = readFileSync(
    new URL('../.github/workflows/package.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /run: npm run audit:signatures/)
  assert.match(
    workflow,
    /name: Compile package entrypoint[\s\S]*name: Enforce npm vulnerability policy/,
  )
  assert.match(workflow, /^  runtime-risk:$/m)
  assert.match(workflow, /grype_0\.116\.0_linux_amd64\.tar\.gz/)
  assert.match(
    workflow,
    /40aff724297312f91ea390d003bed8d8651c74cc7f5b26732db80b3a408d2fc5/,
  )
  assert.match(workflow, /npm run scan:images -- runtime-scan-results/)
  assert.match(workflow, /name: runtime-vulnerability-reports/)
})

test('records the passing r2 ten-manifest vulnerability scan', () => {
  const checkpoint = readFileSync(
    new URL(
      '../docs/security/651f637-startos-r2-runtime-scan.md',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(checkpoint, /Grype(?: version)?:? `?0\.116\.0`?/i)
  assert.match(checkpoint, /database schema: `v6\.1\.9`/i)
  assert.match(checkpoint, /database built: `2026-08-05T07:04:14Z`/i)
  assert.match(
    checkpoint,
    /database source checksum:[\s\S]{0,100}`sha256:d929b4ee3f8c535f76847d46d08b6844b86b7d150e60da578b5ea5e9755dc6ba`/i,
  )
  assert.match(
    checkpoint,
    /effective configuration SHA-256:[\s\S]{0,100}`c12a9608de881cb3ac97be666629a1a1e17fb515d74701ae44a0d0881548a9ff`/i,
  )
  assert.match(
    checkpoint,
    /target manifest SHA-256:[\s\S]{0,100}`b06e9f356af2874738b31198af89a88eb05ff1bb4def2ba75eb0ede001c9a5f8`/i,
  )
  for (const reportHash of [
    'f106cf778355e367382d52ba22e5727b53a7fb3298b25528061ba3d58cdfc1d7',
    '6224f91404a268ade24bff43dffddd19b9b9d2da6ecfac29aa27670a8ad363f9',
    '66ec5a93992d841de72c795dd13db1c731a3b6f0c6c6306f863bc36ab2dddc1b',
    'b2df307a67ccda3b88760615f7cf0e5288cf9d3738047e777c9730c734602496',
    '93bcbc0f4d9ceca223ce7bf98a323550290d33f485807ecb84798e891db90238',
    '5ebded2924855db947084d73787bbc0625d54a3d89e2cdea396a72f3852d7a55',
    '6509099a54f652656161122a8eb93004bc1c76aa8b050ba830091a0047a088bf',
    '0342d37238bc8686549aac77614047c09cd72bebfb12aa0b948cf64c1ac0ec09',
    '16ab1284d993f4d71cf074ffa32127c5492f800586a355b39bb321119b30e4c1',
    '649422450ac3d21ae04fe3b71ea4dfd5504c6e29fabcbc2052ca834a35e69018',
  ]) {
    assert.match(checkpoint, new RegExp(reportHash))
  }
  assert.match(checkpoint, /10 image target\(s\)/i)
  assert.match(checkpoint, /zero Critical/i)
  assert.match(checkpoint, /zero High/i)
  assert.match(checkpoint, /zero Unknown/i)
  assert.match(checkpoint, /0 waived High finding/i)
})
