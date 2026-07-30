# Buzz `63496cc` Test Sideload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and statically verify one test-only x86_64 StartOS package using the official Buzz `63496cc` image.

**Architecture:** Preserve the existing StartOS service topology and replace only the reviewed Buzz source/image identity. Run PostgreSQL as a single writer, apply upstream migrations through the existing `buzz-admin migrate` one-shot, disable replica routing explicitly, and force path-style S3 access to the bundled MinIO service.

**Tech Stack:** StartOS 0.4.0, Start SDK 2.0.9, TypeScript 6, Node.js 22.23.1, Start CLI 1.1.0, Docker Buildx, OCI images.

---

### Task 1: Specify The New Frozen Identity

**Files:**

- Modify: `tests/image-pins.test.ts`
- Modify: `tests/manifest.test.ts`

**Step 1: Change the image-pin expectation**

Require:

```ts
assert.equal(UPSTREAM.commit, '63496cc1d4c6f1b7c613801bdcc694169dcf391a')
assert.equal(
  IMAGE_PINS.buzz.indexDigest,
  'sha256:9de8aff13af33f3b17659e6eacda024b3070efda911c5e08d4d85a6c01c4deb6',
)
assert.equal(
  IMAGE_PINS.buzz.platforms.amd64,
  'sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf',
)
```

**Step 2: Change the package-version expectation**

Set the expected version to:

```text
0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:0
```

**Step 3: Run the focused tests**

Run:

```bash
npx tsx --test tests/image-pins.test.ts tests/manifest.test.ts
```

Expected: FAIL because the package still identifies `dd222a5`.

**Step 4: Commit the failing specification**

```bash
git add tests/image-pins.test.ts tests/manifest.test.ts
git commit -m "test: specify 63496cc package identity"
```

### Task 2: Specify The Runtime Adaptation

**Files:**

- Modify: `tests/runtime-config.test.ts`

**Step 1: Extend the expected Buzz environment**

Require these exact settings:

```ts
BUZZ_S3_ADDRESSING_STYLE: 'path',
BUZZ_DB_POOL_SIZE: '50',
BUZZ_REPLICA_READ_MAX_AGE_MS: '0',
```

Also add `READ_DATABASE_URL`, `BUZZ_DB_READ_POOL_SIZE`, and
`BUZZ_REPLICA_HEAD_MAX_AGE_SECS` to the list of variables that must remain
absent.

**Step 2: Run the focused test**

Run:

```bash
npx tsx --test tests/runtime-config.test.ts
```

Expected: FAIL because the new settings are absent.

**Step 3: Commit the failing specification**

```bash
git add tests/runtime-config.test.ts
git commit -m "test: specify 63496cc runtime configuration"
```

### Task 3: Update The Package Identity And Runtime

**Files:**

- Modify: `startos/image-pins.ts`
- Modify: `startos/versions/current.ts`
- Modify: `startos/runtime/config.ts`

**Step 1: Replace the Buzz source and OCI identity**

Set:

```ts
export const UPSTREAM = {
  commit: '63496cc1d4c6f1b7c613801bdcc694169dcf391a',
  shortCommit: '63496cc',
  committedAt: '2026-07-30T00:35:15Z',
  relayVersion: '0.2.0',
} as const
```

Use the reviewed index and platform digests from Task 1.

**Step 2: Reset the package version**

Set:

```text
0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:0
```

Update all five localized notes to describe a test-only package of upstream
snapshot `63496cc`, including the authorization fix absent from `:2`.

**Step 3: Add the explicit runtime settings**

Add to `buzzEnv`:

```ts
BUZZ_S3_ADDRESSING_STYLE: 'path',
BUZZ_DB_POOL_SIZE: '50',
BUZZ_REPLICA_READ_MAX_AGE_MS: '0',
```

Do not configure a read database URL or reader pool size.

**Step 4: Run focused tests**

Run:

```bash
npx tsx --test tests/image-pins.test.ts tests/manifest.test.ts tests/runtime-config.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add startos/image-pins.ts startos/versions/current.ts startos/runtime/config.ts
git commit -m "feat: package Buzz 63496cc for local testing"
```

### Task 4: Record The Runtime Contract

**Files:**

- Create: `docs/upstream/63496cc-runtime-contract.md`
- Modify: `README.md`

**Step 1: Write the exact source and image identity**

Record the full commit, commit timestamp, image tag, OCI index, native
manifests, image revision label, user, entrypoint, ports, and bundled
executables.

**Step 2: Document database behavior**

Record:

- migrations 25 and 26;
- migration execution before relay startup;
- the single local writer topology;
- absent `READ_DATABASE_URL`;
- `BUZZ_REPLICA_READ_MAX_AGE_MS=0`;
- `BUZZ_DB_POOL_SIZE=50`;
- the fail-closed writer fallback.

**Step 3: Document S3 behavior**

Record `BUZZ_S3_ADDRESSING_STYLE=path`, the loopback MinIO endpoint, private
bucket initialization, and unchanged media/Git authority.

**Step 4: Update README status**

Describe `63496cc:0` as the current local test candidate. Preserve the warning
that it has critical vulnerabilities, lacks device validation, and is not a
production release.

**Step 5: Format and commit**

Run:

```bash
npx prettier --check README.md docs/upstream/63496cc-runtime-contract.md
git diff --check
```

Commit:

```bash
git add README.md docs/upstream/63496cc-runtime-contract.md
git commit -m "docs: record 63496cc runtime contract"
```

### Task 5: Verify The Package

**Files:**

- No source changes expected.

**Step 1: Run the complete automated suite**

```bash
npm test
npm run prettier:check
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
npm run build
```

Expected: all commands exit zero.

**Step 2: Verify live image metadata**

```bash
npm run verify:images
```

Expected: the tag resolves to the recorded index; amd64 and arm64 configs
identify upstream revision `63496cc1d4c6f1b7c613801bdcc694169dcf391a`.

**Step 3: Confirm the production gate still rejects**

```bash
npm run verify:device-promotion
```

Expected: nonzero because the candidate is unfrozen and the device matrix is
not complete.

### Task 6: Build And Stage The Server Pure Artifact

**Files:**

- Generate: `buzz_x86_64.s9pk`
- Generate: `artifacts/test-sideload/63496cc/buzz_x86_64.s9pk`
- Generate: `artifacts/test-sideload/63496cc/SHA256SUMS`
- Generate: `artifacts/test-sideload/63496cc/TEST-ONLY.txt`

**Step 1: Build only x86_64**

```bash
make x86
```

Expected: `buzz_x86_64.s9pk` exists and the Make summary identifies only
`x86_64`.

**Step 2: Inspect the package**

```bash
start-cli s9pk inspect buzz_x86_64.s9pk manifest
start-cli s9pk inspect buzz_x86_64.s9pk commitment
```

Verify:

- package ID is `buzz`;
- version is `0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:0`;
- every image supports `x86_64`;
- the Buzz image uses the recorded immutable index;
- minimum StartOS is `0.4.0-beta.10`.

**Step 3: Stage local sideload files**

Copy the archive to `artifacts/test-sideload/63496cc/`, write its SHA-256
checksum, and create `TEST-ONLY.txt` stating the known vulnerability and device
validation blockers. Do not add the artifact directory to Git.

**Step 4: Re-inspect the staged bytes**

Run the manifest and commitment inspections against the staged archive and
verify its checksum with:

```bash
sha256sum -c artifacts/test-sideload/63496cc/SHA256SUMS
```

Expected: all checks pass and the package worktree contains only ignored build
artifacts.
