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

test('reusable package workflow never accepts the protected signing secret', () => {
  assert.doesNotMatch(packageWorkflow, /\bDEV_KEY\b/)
  assert.doesNotMatch(packageWorkflow, /^  signed-build:$/m)
})

test('only the top-level release job obtains the protected signing secret', () => {
  const signedBuild = workflowJob(releaseWorkflow, 'signed-build')
  const finalizer = workflowJob(releaseWorkflow, 'finalize-prerelease')
  const unprotectedJobs = [
    workflowJob(packageWorkflow, 'verify'),
    workflowJob(packageWorkflow, 'ephemeral-build'),
    workflowJob(releaseWorkflow, 'preflight'),
    workflowJob(releaseWorkflow, 'signed-package'),
    finalizer,
  ]

  assert.match(signedBuild, /\n    needs: signed-package\n/)
  assert.match(signedBuild, /\n    environment: release\n/)
  assert.match(signedBuild, /DEV_KEY: \$\{\{ secrets\.DEV_KEY \}\}/)
  assert.match(finalizer, /\n    needs: signed-build\n/)
  assert.equal(releaseWorkflow.match(/secrets\.DEV_KEY/g)?.length, 1)
  for (const unprotectedJob of unprotectedJobs) {
    assert.doesNotMatch(unprotectedJob, /\benvironment: release\b/)
    assert.doesNotMatch(unprotectedJob, /\bDEV_KEY\b/)
  }
  assert.doesNotMatch(buildWorkflow, /\bsecrets:/)
  assert.doesNotMatch(buildWorkflow, /\bDEV_KEY\b/)
  assert.doesNotMatch(
    workflowJob(releaseWorkflow, 'signed-package'),
    /\bsecrets:/,
  )
})
