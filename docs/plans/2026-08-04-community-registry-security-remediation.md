# Community Registry Security Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the package's dependency and runtime-image security blockers, publish and pin audited native images, build the final x86_64/aarch64 packages, and freeze the exact candidate for user-run StartOS testing.

**Architecture:** Keep Buzz application source at verified upstream commit `651f6372754e60e3f936b3397040eb0f1e44c9f3`. Build public downstream Buzz, MinIO, and MC images from exact source identities with checked-in security patches, native architecture jobs, immutable OCI digests, and GitHub provenance; then pin those bytes in the StartOS wrapper. Treat repository-owner governance as optional maintainer hardening, not a Community Registry package gate.

**Tech Stack:** Start SDK 2.0.9, TypeScript/Node 24, Docker Buildx and GHCR, Rust 1.95, Go 1.26.5, GitHub Actions attestations, Grype/Syft, `start-cli` 0.4.x.

---

### Task 1: Correct the Submission Gate

**Files:**

- Modify: `tests/workflow-policy.test.ts`
- Modify: `docs/security/REPOSITORY-CONTROLS.md`
- Modify: `docs/operations/COMMUNITY_REGISTRY_READINESS.md`
- Modify: `TODO.md`

**Step 1: Write the failing policy assertion**

Add a test that requires `REPOSITORY-CONTROLS.md` and the readiness report to
state that rulesets, immutable GitHub Releases, and a second repository reviewer
are optional maintainer hardening and are not Start9 Community Registry
submission gates. Require the readiness decision to cite only package checks,
runtime security, artifact identity, and device evidence as technical gates.

**Step 2: Run the focused test and verify it fails**

Run:

```bash
npx tsx --test tests/workflow-policy.test.ts
```

Expected: FAIL because the current readiness report says repository controls
block beta and production.

**Step 3: Update the documentation**

Preserve the repository-control inventory as optional advice. Remove it from
the readiness decision, required remediation list, and `TODO.md` release
blockers. Cite the official StartOS flow: public repository, passing checks,
current docs, and end-to-end StartOS testing.

**Step 4: Re-run the focused test**

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/workflow-policy.test.ts docs/security/REPOSITORY-CONTROLS.md \
  docs/operations/COMMUNITY_REGISTRY_READINESS.md TODO.md
git commit -m "docs: align readiness with StartOS submission gates"
```

### Task 2: Remediate the npm Advisory

**Files:**

- Modify: `package-lock.json`
- Test: `tests/runtime-image-scan.test.ts`

**Step 1: Add a failing lockfile assertion**

Require the root AJV dependency path to resolve `fast-uri` to `3.1.5`, the
first patched 3.x release for `GHSA-7p8r-x3mc-p8w7`.

**Step 2: Verify the test fails**

```bash
npx tsx --test tests/runtime-image-scan.test.ts
```

Expected: FAIL on `fast-uri@3.1.4`.

**Step 3: Update only the compatible transitive dependency**

```bash
npm install --package-lock-only --ignore-scripts fast-uri@3.1.5
npm ci
```

Keep AJV at `8.20.0`; do not add a vulnerability waiver.

**Step 4: Verify the dependency gate**

```bash
npx tsx --test tests/runtime-image-scan.test.ts
npm explain fast-uri
npm run audit:signatures
npm run audit:vulnerabilities
```

Expected: all pass and `fast-uri@3.1.5` is the only root AJV resolution.

**Step 5: Commit**

```bash
git add package-lock.json tests/runtime-image-scan.test.ts
git commit -m "fix: update patched fast-uri dependency"
```

### Task 3: Add Reproducible Runtime Image Sources

**Files:**

- Create: `images/README.md`
- Create: `images/buzz/Dockerfile`
- Create: `images/minio/Dockerfile`
- Create: `images/minio/go.mod`
- Create: `images/minio/go.sum`
- Create: `images/mc/Dockerfile`
- Create: `images/mc/go.mod`
- Create: `images/mc/go.sum`
- Create: `scripts/prepare-runtime-image-source.sh`
- Create: `tests/runtime-image-build.test.ts`

**Step 1: Write failing source-policy tests**

Require exact source identities:

- Buzz `651f6372754e60e3f936b3397040eb0f1e44c9f3`;
- MinIO release `RELEASE.2025-10-15T17-29-55Z`, commit
  `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`;
- MC release `RELEASE.2025-08-13T08-35-41Z`, commit
  `7394ce0dd2a80935aded936b09fa12cbb3cb8096`.

Require the preparation script to fetch an exact commit, verify `HEAD`, replace
only MinIO/MC `go.mod` and `go.sum` with checked-in reviewed files, and reject a
dirty or mismatched source tree.

Require MinIO and MC to compile with Go 1.26.5. Require the MinIO runtime to
contain `curl`, preserve `/data`, expose 9000/9001, and use `minio` as its
entrypoint. Require MC to keep an executable named `mc`. Require the Buzz image
to preserve `buzz-relay`, `buzz-admin`, `buzz-pair-relay`, Git, curl, ports
3000/8080/9102, user 1000, and `/data/git`.

**Step 2: Run and observe failure**

```bash
npx tsx --test tests/runtime-image-build.test.ts
```

**Step 3: Implement exact source preparation and Dockerfiles**

Adapt Block's upstream Dockerfile for the exact Buzz source without modifying
application code. Use a current Debian runtime and refresh packages during the
build. Compile MinIO/MC as static Go binaries with the checked-in focused module
updates and place them in minimal current Alpine runtimes. Set OCI source,
revision, license, and downstream-build labels.

**Step 4: Build and smoke-test amd64 locally**

Run the preparation script for each source, build local images, then verify:

```bash
docker run --rm <buzz-image> --help
docker run --rm --entrypoint buzz-admin <buzz-image> migrate --help
docker run --rm --entrypoint /usr/local/bin/buzz-pair-relay <buzz-image> --help
docker run --rm <minio-image> --version
docker run --rm <mc-image> --version
```

Start MinIO with synthetic credentials and use the rebuilt MC image to set an
alias, create a bucket, set anonymous policy to `none`, put/get/delete an
object, restart MinIO, and confirm persistence.

**Step 5: Run focused tests and commit**

```bash
npx tsx --test tests/runtime-image-build.test.ts tests/health.test.ts
git add images scripts/prepare-runtime-image-source.sh \
  tests/runtime-image-build.test.ts
git commit -m "build: add patched runtime image sources"
```

### Task 4: Publish Native Multi-Architecture Images

**Files:**

- Create: `.github/workflows/runtime-images.yml`
- Modify: `tests/workflow-policy.test.ts`
- Modify: `tests/runtime-image-build.test.ts`

**Step 1: Write failing workflow tests**

Require native `linux/amd64` and `linux/arm64` jobs, read-only contents, package
write, ID-token and attestation permissions only where needed, full-SHA action
pins, digest-only architecture outputs, one merged OCI index per image, and
`actions/attest-build-provenance` for each merged digest. Reject mutable
`latest` tags and pull-request publishing.

**Step 2: Verify failure**

```bash
npx tsx --test tests/workflow-policy.test.ts tests/runtime-image-build.test.ts
```

**Step 3: Implement and verify the workflow**

Publish:

```text
ghcr.io/mdubore/buzz-startos/buzz:651f637-startos-r1
ghcr.io/mdubore/buzz-startos/minio:2025-10-15-startos-r1
ghcr.io/mdubore/buzz-startos/mc:2025-08-13-startos-r1
```

The workflow must build from the exact prepared sources and checked-in module
files. Push the reviewed branch, merge it to `main`, run the workflow, and wait
for all three indexes to publish successfully.

**Step 4: Verify public identities and provenance**

For each tag, record the index plus native manifest digests using
`docker buildx imagetools inspect`, and verify:

```bash
gh attestation verify oci://<image>@<index-digest> --repo mdubore/buzz-startos
```

Inspect both native configurations and filesystems; run native CLI checks on
amd64 locally and arm64 in the native workflow job.

**Step 5: Commit any evidence-only workflow corrections**

Use a new downstream image revision if published bytes must change. Never
replace an accepted immutable identity silently.

### Task 5: Pin the New Images and Package Revision

**Files:**

- Modify: `tests/image-pins.test.ts`
- Modify: `tests/manifest.test.ts`
- Modify: `startos/image-pins.ts`
- Modify: `startos/versions/current.ts`
- Modify: `docs/testing/DEVICE_CANDIDATE.json`

**Step 1: Update tests with the recorded immutable identities**

Require all three GHCR index and native manifest digests. Require the package
version to retain upstream `651f637` and increment the downstream revision from
`:0` to `:1` because application source is unchanged but runtime bytes differ.

**Step 2: Observe the focused failures**

```bash
npx tsx --test tests/image-pins.test.ts tests/manifest.test.ts \
  tests/device-evidence.test.ts
```

**Step 3: Update pins, version, and proposed candidate identity**

Keep `docs/testing/DEVICE_CANDIDATE.json` `UNFROZEN`; set the proposed `:1`
version but leave tag, package commit, artifact hashes/sizes, and StartOS device
identities null.

**Step 4: Verify and commit**

```bash
npm run verify:images
npx tsx --test tests/image-pins.test.ts tests/manifest.test.ts \
  tests/device-evidence.test.ts
git add startos tests docs/testing/DEVICE_CANDIDATE.json
git commit -m "chore: pin remediated runtime images"
```

### Task 6: Re-Audit Runtime Compatibility and Vulnerabilities

**Files:**

- Create: `docs/upstream/651f637-startos-r1-runtime-contract.md`
- Create: `docs/security/651f637-startos-r1-runtime-scan.md`
- Modify: `docs/EVIDENCE.md`
- Modify: `tests/manifest.test.ts`
- Modify: `tests/runtime-image-scan.test.ts`

**Step 1: Run the full compatibility contract**

Verify source commits, build inputs, attestations, both native configurations
and filesystems, commands, users, ports, environment, mounts, health,
migrations, storage, bucket operations, pairing topology, and Desktop/ACP
assumptions. Record exact commands and hashes; do not reuse the official-image
contract for rebuilt bytes.

**Step 2: Run the ten-manifest scan**

```bash
scan_dir=$(mktemp -d /tmp/buzz-runtime-scan.XXXXXX)
npm run scan:images -- "$scan_dir"
```

Expected: ten reports, zero Critical, zero Unknown, and zero unwaived High.
If it fails, remediate the exact package and publish a new downstream image
revision; do not weaken policy or add a generic waiver.

**Step 3: Record evidence and test it**

Hash the scanner version/database/config/target manifest/reports and summarize
all counts. Add tests requiring the new contract and scan identities.

**Step 4: Verify and commit**

```bash
npx tsx --test tests/manifest.test.ts tests/runtime-image-scan.test.ts
git add docs/upstream docs/security docs/EVIDENCE.md tests
git commit -m "security: audit remediated runtime images"
```

### Task 7: Run the Complete Package Gate

**Files:**

- Modify as evidence requires: `README.md`
- Modify as evidence requires: `instructions.md`
- Modify: `docs/operations/COMMUNITY_REGISTRY_READINESS.md`
- Modify: `TODO.md`

**Step 1: Clean-install and run every automated check**

```bash
npm ci
npm run audit:signatures
npm run audit:vulnerabilities
npm test
npm run prettier:check
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
npm run verify:images
npm run verify:device-evidence
npm run build
git diff --check
```

Expected: all pass. Device structure still reports 46 `NOT RUN` cells; that is
the correct pre-device-test state, not an automated failure.

**Step 2: Reconcile documentation**

Keep README and instructions explicit that current unmodified Android pairing
and remote mobile use are unsupported; the dedicated pairing relay fixes the
server-side 404 but not Android trust of the private StartOS CA. Record the
future StartTunnel/VPS direction without claiming it is implemented.

**Step 3: Update readiness evidence and commit**

Mark steps 1–3 technically clear only with exact command outputs. Keep device
testing pending and do not claim Community Registry readiness yet.

```bash
git add README.md instructions.md docs/operations/COMMUNITY_REGISTRY_READINESS.md TODO.md
git commit -m "docs: stage remediated registry candidate"
```

### Task 8: Build, Verify, and Freeze the Candidate

**Files:**

- Modify after artifact build: `docs/testing/DEVICE_CANDIDATE.json`
- Modify after artifact build: `docs/testing/DEVICE_TEST_RUNBOOK.md`
- Modify after artifact build: `docs/operations/COMMUNITY_REGISTRY_READINESS.md`
- Modify: `scripts/device-evidence-validator.ts`
- Modify: `tests/device-evidence.test.ts`

**Step 1: Select the immutable source commit and tag**

Require a clean tree, record `git rev-parse HEAD`, and create the package tag
matching `startos/versions/current.ts`. The package source commit must not move
after this point.

**Step 2: Build both signed packages from that exact commit**

```bash
make x86
make arm
```

**Step 3: Inspect and verify artifacts**

```bash
start-cli s9pk inspect buzz_x86_64.s9pk manifest
start-cli s9pk inspect buzz_x86_64.s9pk commitment
start-cli s9pk inspect buzz_aarch64.s9pk manifest
start-cli s9pk inspect buzz_aarch64.s9pk commitment
scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk buzz_aarch64.s9pk
sha256sum buzz_x86_64.s9pk buzz_aarch64.s9pk > SHA256SUMS
sha256sum -c SHA256SUMS
```

Require architecture, version, source commit, packaged image digests, and signer
to match the reviewed candidate.

**Step 4: Remove the circular pre-device identity requirement test-first**

Add a failing validator test proving a `FROZEN` package candidate may retain
null StartOS architecture `buildId` and `imageSha256` fields before device
testing. Package tag, package commit, archive hashes, sizes, version, upstream
commit, and signer remain mandatory. Each device record must still supply its
actual stable StartOS build/image identity, and cross-record consistency remains
enforced during step 5 and step 6.

Run:

```bash
npx tsx --test tests/device-evidence.test.ts
```

Expected before implementation: FAIL because the current validator requires
device identities to freeze package bytes. Update the validator and runbook,
then rerun and require PASS.

**Step 5: Freeze package evidence after the tag**

Update `DEVICE_CANDIDATE.json` to `FROZEN` with the tag, package commit, exact
artifact hashes/sizes, version, upstream commit, and signer. Leave StartOS
device image/build identities null until the user records the actual stable
build used by each architecture in step 5. This evidence commit intentionally
follows the immutable package tag, so it does not create a recursive artifact
hash.

**Step 6: Copy accessible artifacts and verify copies**

Copy the final `.s9pk` files and `SHA256SUMS` to
`/home/missydog/Desktop/Learnding/Tools/Buzz/` with candidate-specific names,
then compare hashes byte-for-byte with the worktree originals.

**Step 7: Validate and commit the freeze**

```bash
npx tsx --test tests/device-evidence.test.ts
npm run verify:device-evidence
git add docs/testing/DEVICE_CANDIDATE.json \
  docs/testing/DEVICE_TEST_RUNBOOK.md \
  docs/operations/COMMUNITY_REGISTRY_READINESS.md \
  scripts/device-evidence-validator.ts tests/device-evidence.test.ts
git commit -m "test: freeze Buzz StartOS device candidate"
```

Stop here and hand the user the two accessible artifact paths, hashes, and the
step-5 runbook. Do not perform or fabricate physical-device tests. Step 6 begins
only after the user returns evidence for these exact hashes.
