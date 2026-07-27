# Buzz Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a frozen, security-reviewed Buzz StartOS 0.4.0 release candidate with immutable signed artifacts, automated supply-chain evidence, and an explicit real-device promotion gate.

**Architecture:** Keep `buzz9` as a clean fast-forward-only mirror and keep all StartOS integration in `buzz-startos`. Select an exact upstream commit only after closing all known authorization blockers, pin its native image digests, then create signed draft-release artifacts exactly once. Promote those existing bytes only after native x86_64 and aarch64 device evidence and independent approval are present.

**Tech Stack:** Rust/Cargo, PostgreSQL, Redis, TypeScript, Node.js 22.23.1, Start SDK 2.0.9 or reviewed successor, Start CLI 1.1.0, Docker Buildx 0.35.0, GitHub Actions, S9PK v2, CycloneDX/SPDX, GitHub artifact attestations.

---

### Task 1: Close The Upstream Security Baseline

**Files:**
- Modify if required in an upstream PR: `../buzz9/crates/buzz-relay/src/http/nip98.rs`
- Modify if required in an upstream PR: `../buzz9/crates/buzz-relay/src/handlers/side_effects.rs`
- Modify if required in an upstream PR: `../buzz9/crates/buzz-db/src/channel.rs`
- Test if required in an upstream PR: adjacent Rust test modules for NIP-29, NIP-43, and NIP-98 authorization

**Step 1: Inspect and freeze the live upstream delta**

Run:

```bash
git -C ../buzz9 fetch --prune upstream
git -C ../buzz9 log --oneline --decorate 00ecf2c..upstream/main
git -C ../buzz9 diff --stat 00ecf2c..upstream/main
```

Expected: every packaged-runtime and security change is identified; the
selected commit is a full SHA, not a moving branch.

**Step 2: Write failing upstream security regressions**

Cover banned owner/admin/member requests for kinds `9030`-`9033`, `41010`,
`41011`, `41012`, `30620`, `46030`, and `46031`, plus HTTP responses that must
not expose raw PostgreSQL errors. Run each focused test and confirm the
vulnerable baseline fails for the intended reason.

**Step 3: Implement the smallest upstream fix**

Centralize the active-membership/ban authorization decision at the command
boundary used by all covered event kinds. Map internal database failures to a
generic client response while retaining structured server-side diagnostics
that contain no credentials.

**Step 4: Run real-service upstream tests**

Start PostgreSQL and Redis using the upstream test contract, then explicitly
run all ignored membership and `test_nip29_*`, NIP-43, NIP-98, and command-kind
regressions. Confirm the new tests fail without the fix and pass with it.

**Step 5: Publish the correction upstream**

Push a focused branch to `mdubore/buzz9`, open a PR against `block/buzz`, and
record the PR URL. Do not add StartOS code or merge the branch into mirror
`main`.

**Step 6: Fast-forward the mirror**

After the required fixes are merged:

```bash
git -C ../buzz9 checkout main
git -C ../buzz9 merge --ff-only upstream/main
git -C ../buzz9 push origin main
git -C ../buzz9 rev-list --left-right --count origin/main...upstream/main
```

Expected: `0 0`.

**Step 7: Commit**

No package commit is created for this task. The upstream PR and mirror
fast-forward provide separate Git history.

### Task 2: Pin The Reviewed Buzz Runtime

**Files:**
- Modify: `tests/image-pins.test.ts`
- Modify: `startos/image-pins.ts`
- Modify: `startos/versions/current.ts`
- Create: `docs/upstream/<short-sha>-runtime-contract.md`
- Create: `docs/releases/<candidate-tag>.md`
- Modify: `README.md`
- Modify: `UPDATING.md`
- Modify: `TODO.md`

**Step 1: Write the failing frozen-source assertions**

Update `tests/image-pins.test.ts` to require the selected full SHA, short SHA,
commit timestamp, OCI index digest, and distinct amd64/arm64 digests.

**Step 2: Run the focused test**

Run:

```bash
npm test -- tests/image-pins.test.ts
```

Expected: FAIL because the package still pins the older snapshot.

**Step 3: Verify the exact published image**

Use `docker buildx imagetools inspect --raw` and native platform pulls to
verify the revision label, `buzz:buzz` user, relay entrypoint, ports, baked
environment, binaries, and packaged `buzz-admin` command surfaces.

**Step 4: Update pins and version**

Record immutable index/platform digests in `startos/image-pins.ts`. Encode the
relay version, UTC commit timestamp, and short SHA in the ExVer and reset the
downstream revision to `:0`. Keep the wrapper migration empty only after
confirming no schema or runtime-contract adaptation is required.

**Step 5: Record immutable evidence**

Create a new runtime-contract document; never edit or delete the existing
`dd222a5` evidence. Add five-locale release notes, the pre-upgrade membership
audit warning, and exact upstream old/new SHAs.

**Step 6: Verify and commit**

Run:

```bash
npm test -- tests/image-pins.test.ts
npm run verify:images
npm run check
git diff --check
```

Commit:

```bash
git add startos tests docs README.md UPDATING.md TODO.md
git commit -m "build: pin security-reviewed Buzz runtime"
```

### Task 3: Automate Upstream Authorization Regressions

**Files:**
- Create: `scripts/verify-upstream-security.sh`
- Create: `.github/workflows/upstream-security.yml`
- Modify: `tests/workflow-policy.test.ts`
- Modify: `package.json`
- Modify: `UPDATING.md`

**Step 1: Write failing workflow-policy tests**

Require the workflow to derive the exact commit from
`startos/image-pins.ts`, use real PostgreSQL and Redis service containers, run
the ignored database membership tests, and run every named relay
authorization regression.

**Step 2: Run the focused test**

Run:

```bash
npm test -- tests/workflow-policy.test.ts
```

Expected: FAIL because the upstream security gate does not exist.

**Step 3: Implement the deterministic test driver**

The shell script must use `set -euo pipefail`, accept one validated full SHA,
clone or reuse a clean source tree, reject a mismatched checkout, wait for
PostgreSQL/Redis readiness, and execute the explicitly enumerated ignored
tests. It must not interpolate credentials into logs.

**Step 4: Add the CI workflow**

Use full-SHA-pinned Actions, least-privilege permissions, immutable service
image digests, bounded timeouts, and concurrency cancellation for superseded
branch runs.

**Step 5: Verify and commit**

Run the policy test, `shellcheck`, and the real-service script. Commit:

```bash
git add .github/workflows/upstream-security.yml scripts/verify-upstream-security.sh tests/workflow-policy.test.ts package.json UPDATING.md
git commit -m "ci: gate upstream authorization regressions"
```

### Task 4: Enforce Dependency And Image Risk Policy

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `security/vulnerability-waivers.json`
- Create: `scripts/check-vulnerability-waivers.ts`
- Create: `scripts/scan-runtime-images.sh`
- Create: `tests/vulnerability-policy.test.ts`
- Modify: `.github/workflows/package.yml`
- Modify: `UPDATING.md`

**Step 1: Write failing waiver-policy tests**

Require each waiver to have a vulnerability ID, affected component, severity,
runtime-reachability decision, owner, rationale, compensating control, and a
future expiry date. Reject critical waivers and expired or unknown fields.

**Step 2: Run the focused test**

Run:

```bash
npm test -- tests/vulnerability-policy.test.ts
```

Expected: FAIL because the checker is absent.

**Step 3: Resolve npm findings**

Inspect `npm audit --json` and dependency paths. Apply only reviewed direct
updates or lockfile overrides that preserve Start SDK behavior. If no fixed
compatible dependency exists, record a time-bounded reachability waiver rather
than running a blind `npm audit fix`.

**Step 4: Add native image scanning**

Install a checksum-pinned scanner, scan all five amd64 and five arm64 immutable
digests, emit machine-readable reports, and fail on unwaived high/critical
runtime findings.

**Step 5: Verify and commit**

Run:

```bash
npm ci
npm audit --json
npm test
npm run check
npm run verify:images
```

Commit:

```bash
git add package.json package-lock.json security scripts tests .github/workflows/package.yml UPDATING.md
git commit -m "security: enforce dependency and image risk policy"
```

### Task 5: Generate SBOMs And Provenance

**Files:**
- Create: `scripts/generate-sboms.sh`
- Create: `scripts/verify-release-assets.sh`
- Modify: `.github/workflows/package.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `tests/workflow-policy.test.ts`
- Modify: `UPDATING.md`

**Step 1: Write failing release-asset policy tests**

Require architecture-specific S9PKs, `SHA256SUMS`, signer key/fingerprint,
CycloneDX or SPDX SBOMs for the Node package and all native OCI images, scan
reports, manifest/commitment verification JSON, and GitHub attestations.

**Step 2: Run the focused test**

Run:

```bash
npm test -- tests/workflow-policy.test.ts
```

Expected: FAIL because the release omits SBOM/provenance evidence.

**Step 3: Implement SBOM generation and verification**

Use checksum- or digest-pinned tools, deterministic filenames, JSON schema
validation, and an asset manifest containing SHA-256 and media type. Verify
that S9PK manifests match the expected version, architecture, five image
references, signer, and commitments.

**Step 4: Add artifact attestations**

Grant `id-token: write` and `attestations: write` only to the attestation job.
Attest the two S9PKs, checksum file, SBOMs, scan reports, and verification
manifest using the candidate commit and workflow identity.

**Step 5: Verify and commit**

Run all workflow policy tests and execute the generators twice against fixture
inputs to confirm stable content. Commit:

```bash
git add scripts .github/workflows tests UPDATING.md
git commit -m "ci: publish SBOM and build provenance"
```

### Task 6: Make Candidate Publication Immutable

**Files:**
- Modify: `.github/workflows/release.yml`
- Create: `.github/workflows/promote.yml`
- Modify: `tests/workflow-policy.test.ts`
- Modify: `UPDATING.md`
- Modify: `CONTRIBUTING.md`

**Step 1: Write failing release-policy tests**

Reject `--clobber`, existing-release edits during candidate creation,
runner-provided mutable Buildx, signing keys present during upload, promotion
jobs with build/upload permissions, or publication without device-evidence
hash validation.

**Step 2: Run the focused test**

Run:

```bash
npm test -- tests/workflow-policy.test.ts
```

Expected: FAIL against the current mutable prerelease workflow.

**Step 3: Pin every build tool**

Install the reviewed Buildx version in every artifact-producing job and verify
its version. Upgrade GitHub-maintained Actions to reviewed Node 24-native
releases, pinned by full commit SHA.

**Step 4: Scope the signing key to one step**

Provision the protected key, build, verify, and delete it inside one
fail-cleanup shell step. Prove the key paths are absent before artifact upload.

**Step 5: Create a new draft exactly once**

Fail if the GitHub release already exists. Create a draft prerelease, upload
each asset once, re-download every asset, and compare it with the local
checksum manifest. Never rebuild or replace an asset.

**Step 6: Add no-rebuild promotion**

The protected promotion workflow validates the draft’s existing assets,
attestations, signed device-evidence record, and independent approval, then
changes only draft/prerelease/latest state.

**Step 7: Verify and commit**

Run policy tests, actionlint, zizmor, and a dry-run release with an invalid tag
that must fail before signing. Commit:

```bash
git add .github/workflows tests UPDATING.md CONTRIBUTING.md
git commit -m "ci: freeze release candidates before promotion"
```

### Task 7: Add Repository Security Operations

**Files:**
- Create: `.github/dependabot.yml`
- Create: `.github/workflows/codeql.yml`
- Create: `.github/workflows/security-drift.yml`
- Create: `SECURITY.md`
- Create: `docs/security/SIGNING-KEY-RUNBOOK.md`
- Create: `docs/security/REPOSITORY-CONTROLS.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`

**Step 1: Add security automation**

Configure weekly npm and GitHub Actions updates, CodeQL for repository-owned
TypeScript/JavaScript, and scheduled upstream/image/dependency drift checks.
Keep permissions read-only except where a documented API write is required.

**Step 2: Document disclosure and signing incidents**

State supported versions, private reporting route, response targets, signer
fingerprint verification, offline backup, rotation, revocation, and release
withdrawal steps. Never include private-key material or locations.

**Step 3: Apply safe GitHub repository settings**

Enable vulnerability alerts, automated security fixes, private reporting,
signed-commit visibility, restricted Actions, and available immutable-release
controls. Do not enable a rule that permanently locks out the sole
administrator.

**Step 4: Record blocked controls**

Document required `main`/tag rules, check names, one independent approval,
release-environment reviewer, and self-review prohibition. Leave them marked
blocked until a second trusted reviewer exists.

**Step 5: Verify and commit**

Validate YAML, run workflow policy tests, query settings back through
`gh api`, redact tokens, and commit:

```bash
git add .github SECURITY.md docs/security README.md CONTRIBUTING.md
git commit -m "security: define repository and signer operations"
```

### Task 8: Expand Production Device And Upgrade Evidence

**Files:**
- Modify: `docs/testing/DEVICE_TEST_MATRIX.md`
- Create: `docs/testing/DEVICE_TEST_RUNBOOK.md`
- Create: `docs/testing/DEVICE_EVIDENCE.schema.json`
- Create: `docs/testing/device-evidence.example.json`
- Create: `docs/operations/PRE_UPGRADE_AUDIT.md`
- Create: `docs/operations/RESOURCE_SIZING.md`
- Modify: `README.md`
- Modify: `instructions.md`
- Modify: `TODO.md`

**Step 1: Expand the matrix without marking cells complete**

Add exact candidate identity fields and scenarios for upgrade, reboot/rebuild,
uninstall/reinstall, canonical-address loss, malformed state, service
failure/recovery, authorization regression, cross-host restore, 24-hour soak,
and resource sizing. Preserve every unrun cell as `NOT RUN`.

**Step 2: Add machine-readable evidence**

Require artifact SHA-256, signer fingerprint, StartOS build, native
architecture, device model, operator/reviewer, timestamps, client versions,
test result, sanitized evidence references, and before/after state hashes.

**Step 3: Add the pre-upgrade audit**

Require verified backup, active-owner enumeration per channel, suspicious
role-history review, operator confirmation, and rollback planning. Explicitly
forbid arbitrary-owner auto-repair.

**Step 4: Add resource measurement protocol**

Define representative data scale, cold-start peak, steady/load CPU and RSS,
disk growth, backup/restore duration, and 24-hour stability. Do not invent
minimum hardware values before measurements exist.

**Step 5: Verify and commit**

Validate the JSON schema/example, links, Markdown, and explicit `NOT RUN`
counts. Commit:

```bash
git add docs/testing docs/operations README.md instructions.md TODO.md
git commit -m "docs: define production device acceptance"
```

### Task 9: Verify And Freeze The Release Candidate

**Files:**
- Modify only with new evidence: `docs/releases/<candidate-tag>.md`
- Modify only with real results: `docs/testing/DEVICE_TEST_MATRIX.md`

**Step 1: Run every automated gate**

Run:

```bash
npm ci
npm test
npm run prettier:check
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
npm run build
npm run verify:images
npm run verify:upstream-security
npm run security:check
git diff --check
```

Expected: all commands exit zero with no unwaived release-blocking finding.

**Step 2: Build both native packages**

Run:

```bash
make x86
make arm
start-cli s9pk inspect buzz_x86_64.s9pk manifest
start-cli s9pk inspect buzz_x86_64.s9pk commitment
start-cli s9pk inspect buzz_aarch64.s9pk manifest
start-cli s9pk inspect buzz_aarch64.s9pk commitment
scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk buzz_aarch64.s9pk
```

Expected: version, architecture, five images, signer, and commitments match the
candidate contract.

**Step 3: Request independent code review**

Review the full branch against the approved design, fix every blocking
finding, and rerun affected gates.

**Step 4: Tag and create the draft**

Create a signed version-matching tag on the reviewed commit. Let CI create the
draft release once. Download all assets and independently verify checksums,
attestations, SBOMs, scans, signer, manifests, architectures, and commitments.

**Step 5: Record candidate identity**

Put the exact remote asset SHA-256 values in the device matrix and evidence
template. Do not publish the draft.

### Task 10: Run Device Gates And Promote Existing Bytes

**Files:**
- Modify with real evidence only: `docs/testing/DEVICE_TEST_MATRIX.md`
- Create with sanitized evidence only: `docs/testing/evidence/<candidate-tag>/...`
- Modify: `docs/operations/RESOURCE_SIZING.md`
- Modify: `docs/releases/<candidate-tag>.md`

**Step 1: Run native x86_64 and aarch64 acceptance**

Use StartOS stable 0.4.0 and the exact draft assets. Complete all base and
expanded scenarios, including `:2` upgrade, backup/restore, failure recovery,
authorization attacks, uninstall/reinstall, and 24-hour soak.

**Step 2: Review evidence independently**

Confirm every result references the exact candidate hashes and contains no
secret material. Reject emulation-only sizing evidence.

**Step 3: Document measured requirements**

Publish minimum CPU, RAM, storage, and backup-space guidance with data scale,
observed peaks, and explicit headroom.

**Step 4: Promote without rebuilding**

Run the protected promotion workflow against the existing draft tag. Confirm
that remote asset IDs and SHA-256 values are unchanged and that the release is
stable, immutable, and marked latest.

**Step 5: Final verification**

Re-download the public release, verify all cryptographic and provenance
evidence, confirm sideload instructions against StartOS 0.4.0, and record the
release URL.
