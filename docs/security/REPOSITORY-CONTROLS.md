# Repository Controls

## Current State

This snapshot was verified against `mdubore/buzz-startos` on 2026-07-29 using
GitHub's REST API version `2026-03-10`. "Applied" means the setting was read
back from GitHub. "Blocked" means the intended production control is not
enabled and must not be represented as active. "Deferred" is also open work,
but its implementation belongs to a separately scoped vulnerability gate.

| Control                                                  | Status   | Verified state or blocker                                                                                                                                                                 |
| -------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vulnerability alerts                                     | Applied  | The alerts endpoint returns success.                                                                                                                                                      |
| Automated security fixes                                 | Applied  | Enabled and not paused.                                                                                                                                                                   |
| Dependabot security updates                              | Applied  | Repository security analysis reports enabled.                                                                                                                                             |
| Private vulnerability reporting                          | Applied  | Enabled for private security advisories.                                                                                                                                                  |
| Secret scanning and push protection                      | Applied  | Both controls report enabled.                                                                                                                                                             |
| Selected GitHub-owned Actions                            | Applied  | GitHub-owned actions are allowed; verified marketplace actions and custom patterns are not.                                                                                               |
| Full commit SHA enforcement                              | Applied  | Actions policy requires full commit pins.                                                                                                                                                 |
| Delete head branches after merge                         | Applied  | `delete_branch_on_merge` is enabled.                                                                                                                                                      |
| Immutable releases                                       | Blocked  | Disabled. The workflow is now create-once, but activation must wait until the reviewed workflow is merged and the remaining release controls pass.                                         |
| `main` ruleset                                           | Blocked  | No repository ruleset exists; required check names must be observed on a real pull request first.                                                                                         |
| Release tag ruleset                                      | Blocked  | No `v*.*` tag ruleset exists; tag creation authority and emergency bypass roles are not ready.                                                                                            |
| Signed commits                                           | Blocked  | Cryptographic signature enforcement belongs in the pending `main` ruleset.                                                                                                                |
| Release self-review prohibition                          | Blocked  | The sole environment reviewer cannot approve their own deployment after this is enabled; add a second trusted reviewer first.                                                             |
| Build/package/release action runtime migration           | Applied  | `package.yml` and `release.yml` use reviewed Node 24 action releases pinned to full commits; `build.yml` invokes the reviewed reusable package workflow.                                   |
| Scheduled security drift workflow and README integration | Deferred | `.github/workflows/security-drift.yml` and the corresponding README status integration are intentionally deferred to the vulnerability gate and remain required for production readiness. |

The `release` environment currently has one reviewer, allows self-review, and
uses a custom deployment branch policy. The existing release tag pattern is
`v*.*`. This is not independent release approval. Both legacy `main` branch
protection endpoints currently return HTTP 404, so legacy protection does not
backfill the absent rulesets.

This security-operations slice does not complete production security
automation. The scheduled security-drift workflow and README integration
remain open under the vulnerability gate.

## Actions Policy

Repository settings allow only GitHub-owned actions pinned to full commit SHAs.
CodeQL, `package.yml`, and `release.yml` use reviewed Node 24 action releases;
`build.yml` invokes the reviewed package workflow. Dependabot checks for
updates weekly, and `tests/workflow-policy.test.ts` records every allowed pin.

Third-party build tools must be installed from immutable release assets with
verified SHA-256 checksums instead of broadening the Actions allowlist.

Review every Dependabot action update for:

- the commit's verified repository and release tag;
- the action runtime, with Node 24 required for JavaScript actions;
- permission or input changes; and
- the focused workflow-policy and YAML checks.

## Required `main` Ruleset

Do not activate a ruleset that locks out the sole administrator. First add a
second trusted collaborator and observe the exact check names on a pull
request. Then review and enable a ruleset for `main` that:

- blocks deletion and force updates;
- requires a pull request and at least one independent approval;
- dismisses stale approvals and requires approval after the latest push;
- requires resolved review conversations;
- requires cryptographically signed commits;
- requires the observed build, policy, CodeQL, and vulnerability checks; and
- limits bypass to a documented emergency role with audit review.

Do not invent status-check names in advance. Capture the names GitHub reports
from a real pull request, stage the ruleset in evaluate mode when available,
and test normal and emergency paths before active enforcement.

## Required Release Tag Ruleset

After the release workflow rewrite and second-reviewer setup, add a ruleset for
`refs/tags/v*.*` that restricts creation to the release path and blocks tag
updates and deletion. An emergency bypass must be role-based, time-bounded,
audited, and must never authorize asset replacement.

Existing prerelease tags predate this control. Do not rewrite them.

## Release Environment

Add a second trusted user or team with repository access before enabling
`prevent_self_review`. Then verify that:

- only the tag-based release workflow can deploy;
- an actor who triggered the workflow cannot approve it;
- at least one independent reviewer must approve;
- `DEV_KEY` is scoped only to the environment; and
- cancellation and failure remove working signer copies.

GitHub environment reviewer lists require one listed reviewer, not multiple
simultaneous approvals. Independence comes from self-review prevention and the
second trusted reviewer, not from listing the triggering actor.

## Immutable Releases

Immutable releases protect only releases created after the setting is enabled.
They do not retrofit existing releases. Before activation:

1. Preserve the tag-push entry point: accept and validate the pre-existing
   protected tag and require it to resolve to the reviewed commit.
2. Create a durable draft reservation before the protected signing environment
   is entered. Fail if a release or asset already exists for that tag.
3. Rewrite the release workflow to assemble and verify every package, checksum,
   SBOM, vulnerability report, signer record, and attestation before release
   creation.
4. Remove `--clobber` and every edit-existing-release path.
5. Create a draft once, validate its asset hashes, and publish only those
   tested bytes without rebuilding or uploading replacements.
6. Exercise every failure and rerun transition below on a disposable candidate
   tag.

| State                                               | Rerun rule                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Before reservation, with no release or asset        | A same tag rerun is allowed only after preflight revalidates the unchanged protected tag and reviewed commit.  |
| After reservation, before or after key provisioning | The release identity is consumed. Preserve the draft and use a new version and tag.                            |
| After signed bytes exist                            | Destroy unpublished working copies, preserve sanitized evidence, and use a new version and tag.                |
| Draft, published release, or any asset exists        | Refuse the run and use a new version and tag; never edit, append, replace, or delete to recycle the identity.  |

After those checks, enable immutable releases through the repository API and
read the setting back. Previously published artifacts remain outside that
guarantee.

## Read-Back Audit

Run `scripts/audit-repository-controls.sh mdubore/buzz-startos` after any
control change and before a production release. It queries every required
endpoint, prints only PASS/FAIL labels, collects all failures, and exits
nonzero at the end. An HTTP 404 is a failed required control, but it does not
stop later readbacks.

The two legacy branch-protection endpoints return HTTP 404 when the control is
not configured. The audit records an expected 404 as informational and
continues collecting the remaining controls; other API failures still fail the
audit. A legacy 404 says nothing about repository rulesets, so the separate
rulesets query remains mandatory.
Those informational readbacks are `branches/main/protection` and
`branches/main/protection/required_signatures`.

The audit requires an active release tag ruleset and reads its detail endpoint
back. The rule must include `refs/tags/v*.*` and block tag creation, updates,
and deletion except through its reviewed bypass roles. A matching deployment
branch policy from
`environments/release/deployment-branch-policies` by itself is not a
protected-tag control.

Store only a sanitized control summary in release evidence. Never retain API
tokens, environment secrets, private advisory contents, or private-key
material.

## Review Cadence

Re-run the read-back audit before every candidate and at least monthly. Update
this page in the same reviewed change when a control moves between blocked and
applied. A workflow file is not evidence that its corresponding repository
setting is enabled.
