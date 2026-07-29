import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseDocument } from 'yaml'

const repositoryFile = (path: string): string => {
  const file = new URL(`../${path}`, import.meta.url)
  assert.ok(existsSync(file), `missing repository policy file: ${path}`)
  return readFileSync(file, 'utf8')
}

const packageWorkflow = readFileSync(
  new URL('../.github/workflows/package.yml', import.meta.url),
  'utf8',
)
const buildWorkflow = readFileSync(
  new URL('../.github/workflows/build.yml', import.meta.url),
  'utf8',
)
const releaseWorkflow = readFileSync(
  new URL('../.github/workflows/release.yml', import.meta.url),
  'utf8',
)
const securityDriftWorkflow = readFileSync(
  new URL('../.github/workflows/security-drift.yml', import.meta.url),
  'utf8',
)

type WorkflowRecord = Record<string, unknown>

const isRecord = (value: unknown): value is WorkflowRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseWorkflow = (name: string, source: string): WorkflowRecord => {
  const document = parseDocument(source, { uniqueKeys: true })
  assert.deepEqual(
    document.errors.map((error) => error.message),
    [],
    `${name}: invalid workflow YAML`,
  )
  const workflow = document.toJS()
  assert.ok(isRecord(workflow), `${name}: workflow root must be an object`)
  return workflow
}

const containsDevKey = (value: unknown): boolean => {
  if (typeof value === 'string') return /\bdev_key\b/i.test(value)
  if (Array.isArray(value)) return value.some(containsDevKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, child]) => /\bdev_key\b/i.test(key) || containsDevKey(child),
  )
}

const environmentName = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return undefined
  return typeof value.name === 'string' ? value.name : undefined
}

const containsReleaseEnvironment = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsReleaseEnvironment)
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, child]) =>
      (key.toLowerCase() === 'environment' &&
        environmentName(child)?.toLowerCase() === 'release') ||
      containsReleaseEnvironment(child),
  )
}

const signedBuildSecretStep = (
  allowedJob: WorkflowRecord,
): WorkflowRecord | undefined => {
  if (!Array.isArray(allowedJob.steps)) return undefined
  const candidates = allowedJob.steps.filter(containsDevKey)
  if (candidates.length !== 1 || !isRecord(candidates[0])) return undefined
  return candidates[0]
}

const approvedSignerStep = (step: WorkflowRecord): boolean => {
  const expectedRun = `./scripts/with-release-signer.sh \\
  "$HOME/.startos/id.key.pem" \\
  "$GITHUB_WORKSPACE/.startos/build.key.pem" \\
  make "\${{ matrix.target }}"\n`
  return (
    isRecord(step.env) &&
    exactObject(step.env, { DEV_KEY: '${{ secrets.DEV_KEY }}' }) &&
    exactObject(step, {
      name: 'Build signed ${{ matrix.target }} package',
      env: step.env,
      run: expectedRun,
    })
  )
}

const workflowPolicyViolations = (
  name: string,
  workflow: WorkflowRecord,
): string[] => {
  const violations: string[] = []
  const jobs = workflow.jobs
  assert.ok(isRecord(jobs), `${name}: workflow must define jobs`)

  const allowedJob =
    name === 'release.yml' && isRecord(jobs['signed-build'])
      ? jobs['signed-build']
      : undefined
  if (name === 'release.yml') {
    if (!allowedJob) {
      violations.push('release.yml: missing signed-build job')
    } else {
      const secretStep = signedBuildSecretStep(allowedJob)
      if (!secretStep || !approvedSignerStep(secretStep)) {
        violations.push(
          'release.yml/signed-build: DEV_KEY must exist at the one approved step path',
        )
      }
      if (
        environmentName(allowedJob.environment)?.toLowerCase() !== 'release'
      ) {
        violations.push('release.yml/signed-build: missing release environment')
      }
    }
  }

  const forbiddenScope = structuredClone(workflow)
  const forbiddenJobs = forbiddenScope.jobs
  if (name === 'release.yml' && isRecord(forbiddenJobs)) {
    const signer = forbiddenJobs['signed-build']
    if (isRecord(signer)) {
      delete signer.environment
      const secretStep = signedBuildSecretStep(signer)
      if (secretStep && approvedSignerStep(secretStep)) {
        signer.steps = (signer.steps as unknown[]).filter(
          (step) => step !== secretStep,
        )
      }
    }
  }
  if (containsDevKey(forbiddenScope)) {
    violations.push(`${name}: DEV_KEY outside the approved signer step path`)
  }
  if (containsReleaseEnvironment(forbiddenScope)) {
    violations.push(
      `${name}: release environment outside release.yml/signed-build`,
    )
  }
  return violations
}

const exactObject = (
  actual: WorkflowRecord,
  expected: WorkflowRecord,
): boolean =>
  JSON.stringify(Object.keys(actual).sort()) ===
    JSON.stringify(Object.keys(expected).sort()) &&
  Object.entries(expected).every(([key, value]) => actual[key] === value)

const workflowSources = (): Array<{ name: string; source: string }> => {
  const directory = new URL('../.github/workflows/', import.meta.url)
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      source: readFileSync(new URL(entry.name, directory), 'utf8'),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

const workflowJob = (workflow: string, jobId: string): string => {
  const lines = workflow.split('\n')
  const start = lines.findIndex((line) => line === `  ${jobId}:`)
  assert.notEqual(start, -1, `missing workflow job: ${jobId}`)
  const next = lines.findIndex(
    (line, index) => index > start && /^  [a-z0-9-]+:$/.test(line),
  )
  return lines.slice(start, next === -1 ? undefined : next).join('\n')
}

test('reusable package workflow never accepts the protected signing secret', () => {
  assert.doesNotMatch(packageWorkflow, /\bDEV_KEY\b/)
  assert.doesNotMatch(packageWorkflow, /^  signed-build:$/m)
})

test('only release.yml signed-build obtains the protected signing secret', () => {
  const signedBuild = workflowJob(releaseWorkflow, 'signed-build')
  const finalizer = workflowJob(releaseWorkflow, 'finalize-prerelease')
  const sources = workflowSources()

  assert.ok(sources.length > 0)
  assert.deepEqual(
    sources.flatMap(({ name, source }) =>
      workflowPolicyViolations(name, parseWorkflow(name, source)),
    ),
    [],
  )
  assert.match(signedBuild, /\n    needs: reserve-release\n/)
  assert.match(signedBuild, /\n    environment: release\n/)
  assert.match(signedBuild, /DEV_KEY: \$\{\{ secrets\.DEV_KEY \}\}/)
  assert.match(finalizer, /\n    needs: verify-attested-release\n/)
  assert.equal(releaseWorkflow.match(/secrets\.DEV_KEY/g)?.length, 1)
  assert.doesNotMatch(buildWorkflow, /\bsecrets:/)
  assert.doesNotMatch(
    workflowJob(releaseWorkflow, 'signed-package'),
    /\bsecrets:/,
  )
})

test('workflow policy ignores YAML comments and rejects new protected declarations', () => {
  const safeComment = parseWorkflow(
    'future.yaml',
    `
jobs:
  check:
    runs-on: ubuntu-24.04
    # DEV_KEY and environment: release are forbidden outside the signer.
    steps:
      - run: 'true'
`,
  )
  const unsafeWorkflow = parseWorkflow(
    'future.yaml',
    `
jobs:
  publish:
    runs-on: ubuntu-24.04
    environment: ReLeAsE
    env:
      dev_key: secret
    steps:
      - run: 'true'
`,
  )

  assert.deepEqual(workflowPolicyViolations('future.yaml', safeComment), [])
  assert.deepEqual(workflowPolicyViolations('future.yaml', unsafeWorkflow), [
    'future.yaml: DEV_KEY outside the approved signer step path',
    'future.yaml: release environment outside release.yml/signed-build',
  ])
})

test('the approved signer job rejects a second case-variant secret path', () => {
  const workflow = structuredClone(
    parseWorkflow('release.yml', releaseWorkflow),
  )
  assert.ok(isRecord(workflow.jobs))
  const signedBuild = workflow.jobs['signed-build']
  assert.ok(isRecord(signedBuild))
  signedBuild.env = { dev_key: 'shadow-secret' }

  assert.match(
    workflowPolicyViolations('release.yml', workflow).join('\n'),
    /DEV_KEY outside the approved signer step path/,
  )
})

test('signer wrapper unsets the secret before every child and always cleans up', () => {
  const script = repositoryFile('scripts/with-release-signer.sh')
  const fixture = mkdtempSync(join(tmpdir(), 'buzz-signer-wrapper-'))
  const home = join(fixture, 'home')
  const workspace = join(fixture, 'workspace')
  const homeKey = join(home, 'id.key.pem')
  const workspaceKey = join(workspace, 'build.key.pem')
  const marker = join(fixture, 'child-ran')
  const child = join(fixture, 'assert-child.mjs')
  mkdirSync(home, { mode: 0o700 })
  mkdirSync(workspace, { mode: 0o700 })
  writeFileSync(
    child,
    `
import { readFileSync, writeFileSync } from 'node:fs'
if (Object.keys(process.env).some((name) => name.toLowerCase() === 'dev_key')) {
  process.exit(20)
}
if (readFileSync(process.argv[2], 'utf8') !== 'fixture-secret') process.exit(21)
if (readFileSync(process.argv[3], 'utf8') !== 'fixture-secret') process.exit(22)
writeFileSync(process.argv[4], 'clean child environment\\n')
`,
  )

  try {
    const result = spawnSync(
      'bash',
      [
        new URL('../scripts/with-release-signer.sh', import.meta.url).pathname,
        homeKey,
        workspaceKey,
        process.execPath,
        child,
        homeKey,
        workspaceKey,
        marker,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, DEV_KEY: 'fixture-secret' },
      },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(marker, 'utf8'), 'clean child environment\n')
    assert.equal(existsSync(homeKey), false)
    assert.equal(existsSync(workspaceKey), false)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }

  const writeIndex = script.indexOf(`printf '%s' "$DEV_KEY"`)
  const unsetIndex = script.indexOf('unset DEV_KEY', writeIndex)
  assert.ok(writeIndex > 0 && unsetIndex > writeIndex)
  assert.doesNotMatch(
    script.slice(writeIndex, unsetIndex),
    /^\s*(?:cp|chmod|dirname|env|install|mkdir|rm)\b/m,
  )
})

test('release workflow reserves one durable draft before signing and never clobbers', () => {
  const reserve = workflowJob(releaseWorkflow, 'reserve-release')
  const signer = workflowJob(releaseWorkflow, 'signed-build')
  const assembly = workflowJob(releaseWorkflow, 'assemble-release')
  const attestation = workflowJob(releaseWorkflow, 'attest-release')
  const verifier = workflowJob(releaseWorkflow, 'verify-attested-release')
  const finalizer = workflowJob(releaseWorkflow, 'finalize-prerelease')

  assert.match(reserve, /\n    needs: signed-package\n/)
  assert.match(reserve, /gh api/)
  assert.match(reserve, /HTTP 404/)
  assert.match(reserve, /gh release create/)
  assert.match(reserve, /--draft/)
  assert.match(signer, /\n    needs: reserve-release\n/)
  assert.match(assembly, /\n    needs: signed-build\n/)
  assert.match(attestation, /\n    needs: assemble-release\n/)
  assert.match(verifier, /\n    needs: attest-release\n/)
  assert.match(finalizer, /\n    needs: verify-attested-release\n/)
  assert.doesNotMatch(releaseWorkflow, /--clobber/)
  assert.equal(releaseWorkflow.match(/gh release create/g)?.length, 1)
  assert.equal(releaseWorkflow.match(/gh release upload/g)?.length, 1)
})

test('release publication never restores dependency caches', () => {
  assert.doesNotMatch(releaseWorkflow, /cache: npm/)
  assert.equal(
    releaseWorkflow.match(/package-manager-cache: false/g)?.length,
    3,
  )
})

test('release assembles, verifies, attests, and publishes the complete evidence set', () => {
  const runtimeSbom = workflowJob(packageWorkflow, 'runtime-sbom')
  const assembly = workflowJob(releaseWorkflow, 'assemble-release')
  const attestation = workflowJob(releaseWorkflow, 'attest-release')
  const verifier = workflowJob(releaseWorkflow, 'verify-attested-release')
  const finalizer = workflowJob(releaseWorkflow, 'finalize-prerelease')

  assert.match(runtimeSbom, /\n    needs: verify\n/)
  assert.match(runtimeSbom, /syft_1\.49\.0_linux_amd64\.tar\.gz/)
  assert.match(
    runtimeSbom,
    /7aa2f03ee92739cf643279ba3990548b9925d4e22cae13f46831ee62821147fe/,
  )
  assert.match(runtimeSbom, /cyclonedx-linux-x64/)
  assert.match(
    runtimeSbom,
    /454879e6a4a405c8a13bff49b8982adcb0596f3019b26b0811c66e4d7f0783e1/,
  )
  assert.match(runtimeSbom, /generate-sboms\.sh runtime-sboms/)
  assert.match(runtimeSbom, /name: runtime-sboms/)

  assert.match(assembly, /\n    needs: signed-build\n/)
  assert.match(assembly, /name: runtime-vulnerability-reports/)
  assert.match(assembly, /name: runtime-sboms/)
  assert.match(assembly, /prepare-release-assets\.sh/)
  assert.match(assembly, /name: release-assets/)

  assert.match(attestation, /\n    needs: assemble-release\n/)
  assert.match(attestation, /\n      id-token: write\n/)
  assert.match(attestation, /\n      attestations: write\n/)
  assert.doesNotMatch(attestation, /\n      contents: write\n/)
  assert.match(
    attestation,
    /actions\/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6/,
  )
  assert.match(attestation, /subject-path: release-assets\/\*/)

  assert.match(verifier, /\n    needs: attest-release\n/)
  assert.match(verifier, /\n      contents: read\n/)
  assert.doesNotMatch(verifier, /\n      contents: write\n/)
  assert.match(verifier, /verify-release-assets\.sh/)
  assert.match(verifier, /gh attestation verify/)
  assert.match(
    verifier,
    /--signer-workflow "\$GH_REPO\/\.github\/workflows\/release\.yml"/,
  )
  assert.match(verifier, /--signer-digest "\$GITHUB_SHA"/)
  assert.match(verifier, /--source-digest "\$GITHUB_SHA"/)
  assert.match(verifier, /--source-ref "\$GITHUB_REF"/)
  assert.match(verifier, /--deny-self-hosted-runners/)
  assert.match(finalizer, /\n    needs: verify-attested-release\n/)
  assert.match(finalizer, /\n      contents: write\n/)
  assert.doesNotMatch(
    finalizer,
    /npm ci|verify-release-assets|actions\/checkout/,
  )
  assert.match(finalizer, /"\$ARTIFACT_DIR"\/\*/)
  assert.doesNotMatch(finalizer, /SIGNING-PUBKEY\.pem" \\\n/)
})

test('scheduled security drift checks upstream, dependencies, images, and vulnerabilities', () => {
  const readme = repositoryFile('README.md')
  const workflow = parseWorkflow('security-drift.yml', securityDriftWorkflow)

  assert.ok(isRecord(workflow.permissions))
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  assert.match(securityDriftWorkflow, /\n  schedule:\n    - cron: '[^']+'\n/)
  assert.match(securityDriftWorkflow, /\n  workflow_dispatch:\n/)
  assert.match(securityDriftWorkflow, /https:\/\/github\.com\/block\/buzz\.git/)
  assert.match(
    securityDriftWorkflow,
    /https:\/\/github\.com\/mdubore\/buzz9\.git/,
  )
  assert.match(securityDriftWorkflow, /npm run audit:signatures/)
  assert.match(securityDriftWorkflow, /npm run audit:vulnerabilities/)
  assert.match(securityDriftWorkflow, /npm run verify:images/)
  assert.match(securityDriftWorkflow, /npm run scan:images/)
  assert.match(securityDriftWorkflow, /if: \$\{\{ always\(\) \}\}/)
  assert.match(securityDriftWorkflow, /name: scheduled-vulnerability-reports/)
  assert.match(
    readme,
    /actions\/workflows\/security-drift\.yml\/badge\.svg\?branch=main/,
  )
})

test('repository audit collects every control failure before exiting', () => {
  const auditScript = new URL(
    '../scripts/audit-repository-controls.sh',
    import.meta.url,
  ).pathname
  assert.ok(existsSync(auditScript))
  const fixture = mkdtempSync(join(tmpdir(), 'buzz-repository-audit-'))
  const bin = join(fixture, 'bin')
  const log = join(fixture, 'gh-calls.log')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$AUDIT_LOG"
if [[ "$*" == *'/immutable-releases'* || "$*" == *'/branches/main/protection'* ]]; then
  printf 'gh: Not Found (HTTP 404)\\n' >&2
  exit 1
fi
printf '{}\\n'
`,
  )
  chmodSync(join(bin, 'gh'), 0o755)

  try {
    const result = spawnSync('bash', [auditScript, 'mdubore/buzz-startos'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AUDIT_LOG: log,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
      },
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stdout, /Immutable releases: FAIL/)
    assert.match(
      result.stdout,
      /Legacy main branch protection readback: INFO \(absent\)/,
    )
    assert.match(
      result.stdout,
      /Legacy commit-signature readback: INFO \(absent\)/,
    )
    assert.match(result.stdout, /Repository control audit failed:/)
    const calls = readFileSync(log, 'utf8')
    const immutableIndex = calls.indexOf('/immutable-releases')
    assert.ok(immutableIndex >= 0)
    for (const endpoint of [
      '/rulesets',
      '/environments/release',
      '/deployment-branch-policies',
      '/branches/main/protection',
    ]) {
      assert.ok(
        calls.indexOf(endpoint) > immutableIndex,
        `audit stopped before ${endpoint}`,
      )
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('CodeQL security automation is scheduled and uses reviewed Node 24 action pins', () => {
  const dependabot = repositoryFile('.github/dependabot.yml')
  const codeql = repositoryFile('.github/workflows/codeql.yml')

  assert.match(dependabot, /^version: 2$/m)
  assert.match(dependabot, /package-ecosystem: npm/)
  assert.match(dependabot, /package-ecosystem: github-actions/)
  assert.equal(dependabot.match(/interval: weekly/g)?.length, 2)

  assert.match(codeql, /\n  push:\n    branches: \[main\]\n/)
  assert.match(codeql, /\n  pull_request:\n    branches: \[main\]\n/)
  assert.match(codeql, /\n  schedule:\n    - cron: '[^']+'\n/)
  assert.match(codeql, /\n  contents: read\n/)
  assert.match(codeql, /\n  security-events: write\n/)
  assert.match(codeql, /languages: javascript-typescript/)

  const uses = Array.from(
    codeql.matchAll(/^\s+uses: ([^@\s]+)@([^\s#]+)/gm),
    ([, action, pin]) => [action, pin],
  )
  assert.deepEqual(uses, [
    ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
    ['github/codeql-action/init', 'e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81'],
    [
      'github/codeql-action/analyze',
      'e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81',
    ],
  ])
  for (const [, pin] of uses) {
    assert.match(pin, /^[0-9a-f]{40}$/)
  }
})

test('build, package, and release workflows use reviewed Node 24 action pins', () => {
  const expectedPins: Record<string, string> = {
    'actions/checkout': '3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node': '820762786026740c76f36085b0efc47a31fe5020',
    'actions/upload-artifact': '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'actions/download-artifact': '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
    'actions/attest': 'f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6',
  }
  for (const [name, workflow] of [
    ['build.yml', buildWorkflow],
    ['package.yml', packageWorkflow],
    ['release.yml', releaseWorkflow],
    ['security-drift.yml', securityDriftWorkflow],
  ] as const) {
    for (const [, action, pin] of workflow.matchAll(
      /^\s+(?:-\s+)?uses: ([^@\s]+)@([^\s#]+)/gm,
    )) {
      assert.equal(
        pin,
        expectedPins[action],
        `${name}: unreviewed or non-Node-24 action pin for ${action}`,
      )
    }
  }
})

test('security policy defines private disclosure and response expectations', () => {
  const securityPolicy = repositoryFile('SECURITY.md')
  const contributing = repositoryFile('CONTRIBUTING.md')

  assert.match(
    securityPolicy,
    /`0\.2\.0-main\.20260726\.h\.7\.m\.57\.s\.31\.sha\.dd\.222\.a\.5:2`\s+\|\s+Unsupported/i,
  )
  assert.match(securityPolicy, /validated replacement/i)
  assert.doesNotMatch(
    securityPolicy,
    /Latest published release\s+\|\s+Supported/i,
  )
  assert.match(
    securityPolicy,
    /https:\/\/github\.com\/mdubore\/buzz-startos\/security\/advisories\/new/,
  )
  assert.match(securityPolicy, /do not open a public issue/i)
  assert.match(securityPolicy, /three business days/i)
  assert.match(securityPolicy, /seven business days/i)
  assert.match(contributing, /\[security policy\]\(SECURITY\.md\)/i)
})

test('security operations cover signer lifecycle and repository control gaps', () => {
  const signerRunbook = repositoryFile('docs/security/SIGNING-KEY-RUNBOOK.md')
  const controls = repositoryFile('docs/security/REPOSITORY-CONTROLS.md')

  assert.match(
    signerRunbook,
    /sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c/,
  )
  assert.match(signerRunbook, /offline backup/i)
  assert.match(signerRunbook, /rotation/i)
  assert.match(signerRunbook, /revocation/i)
  assert.match(signerRunbook, /release withdrawal/i)
  let previousSignerControl = -1
  for (const marker of [
    'trap cleanup_signer EXIT',
    `printf '%s' "$DEV_KEY"`,
    'unset DEV_KEY',
    'printenv DEV_KEY',
    'env -u DEV_KEY make',
  ]) {
    const index = signerRunbook.indexOf(marker, previousSignerControl + 1)
    assert.notEqual(index, -1, `missing signer control: ${marker}`)
    assert.ok(
      previousSignerControl < index,
      'signer controls must remain in cleanup/write/unset/prove/build order',
    )
    previousSignerControl = index
  }
  assert.match(signerRunbook, /set \+x/)
  assert.match(signerRunbook, /step-level environment inheritance/i)
  assert.match(signerRunbook, /\/proc\/[^`]*\/environ/)

  for (const releaseStateDocument of [signerRunbook, controls]) {
    assert.match(releaseStateDocument, /tag-push/i)
    assert.match(releaseStateDocument, /pre-existing\s+protected tag/i)
    assert.doesNotMatch(releaseStateDocument, /existing\s+immutable tag/i)
    assert.match(releaseStateDocument, /durable draft reservation/i)
    assert.match(
      releaseStateDocument,
      /Before reservation[\s\S]{0,400}same tag/i,
    )
    assert.match(
      releaseStateDocument,
      /After reservation[\s\S]{0,400}new version and tag/i,
    )
  }

  for (const appliedControl of [
    'Vulnerability alerts',
    'Dependabot security updates',
    'Private vulnerability reporting',
    'Selected GitHub-owned Actions',
    'Full commit SHA enforcement',
    'Delete head branches after merge',
    'Build/package/release action runtime migration',
  ]) {
    assert.match(
      controls,
      new RegExp(`\\|\\s+${appliedControl}\\s+\\|\\s+Applied\\s+\\|`),
    )
  }
  for (const blockedControl of [
    'Immutable releases',
    '`main` ruleset',
    'Release tag ruleset',
    'Release self-review prohibition',
  ]) {
    assert.match(
      controls,
      new RegExp(`\\|\\s+${blockedControl}\\s+\\|\\s+Blocked\\s+\\|`),
    )
  }
  assert.match(controls, /second trusted reviewer/i)
  assert.match(
    controls,
    /\|\s+Scheduled security drift workflow and README integration\s+\|\s+Applied\s+\|/,
  )
  assert.doesNotMatch(
    controls,
    /scheduled security-drift workflow and README integration\s+remain open/i,
  )
  assert.match(controls, /environments\/release\/deployment-branch-policies/)
  assert.match(controls, /branches\/main\/protection/)
  assert.match(controls, /branches\/main\/protection\/required_signatures/)
  assert.match(controls, /HTTP 404/)
  assert.match(controls, /scripts\/audit-repository-controls\.sh/)
  assert.match(controls, /active release tag ruleset/i)
  assert.match(controls, /refs\/tags\/v\*\.\*/)
  assert.match(controls, /CodeQL[\s\S]{0,160}Node 24/i)
  assert.match(
    controls,
    /package\.yml[\s\S]{0,100}release\.yml[\s\S]{0,100}Node 24/i,
  )
})
