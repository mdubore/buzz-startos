import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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

const workflowJob = (workflow: string, jobId: string): string => {
  const lines = workflow.split('\n')
  const start = lines.findIndex((line) => line === `  ${jobId}:`)
  assert.notEqual(start, -1, `missing workflow job: ${jobId}`)
  const next = lines.findIndex(
    (line, index) => index > start && /^  [a-z0-9-]+:$/.test(line),
  )
  return lines.slice(start, next === -1 ? undefined : next).join('\n')
}

test('reusable package workflow declares the protected signing secret', () => {
  assert.ok(
    packageWorkflow.includes(
      [
        '    secrets:',
        '      DEV_KEY:',
        '        description: Protected release signing key supplied by the release environment',
        '        required: false',
      ].join('\n'),
    ),
  )
})

test('signed builds obtain the declared secret only through the release environment', () => {
  const signedBuild = workflowJob(packageWorkflow, 'signed-build')
  const unsignedJobs = [
    workflowJob(packageWorkflow, 'verify'),
    workflowJob(packageWorkflow, 'ephemeral-build'),
  ]

  assert.match(signedBuild, /\n    environment: release\n/)
  assert.match(signedBuild, /DEV_KEY: \$\{\{ secrets\.DEV_KEY \}\}/)
  assert.equal(packageWorkflow.match(/secrets\.DEV_KEY/g)?.length, 1)
  for (const unsignedJob of unsignedJobs) {
    assert.doesNotMatch(unsignedJob, /\benvironment: release\b/)
    assert.doesNotMatch(unsignedJob, /\bDEV_KEY\b/)
  }
  assert.doesNotMatch(buildWorkflow, /\bsecrets:/)
  assert.doesNotMatch(buildWorkflow, /\bDEV_KEY\b/)
  assert.doesNotMatch(releaseWorkflow, /\bsecrets:/)
  assert.doesNotMatch(releaseWorkflow, /\bDEV_KEY\b/)
})
