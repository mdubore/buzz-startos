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
