# Buzz `63496cc:2` Pairing Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce an x86_64 StartOS package that upgrades normally from the installed `63496cc:1` test package and advertises a dedicated LAN-only mobile pairing relay.

**Architecture:** Merge the security-focused `release/production-readiness` history with the pairing implementation on `main` in an isolated worktree. Preserve the existing uncommitted overlay-compatible Git-cache patch by applying it to the integration branch without modifying its source worktree. Keep the official immutable `sha-63496cc` image pins and release the combined wrapper as downstream revision `:2` with a no-op forward migration.

**Tech Stack:** TypeScript 6, `@start9labs/start-sdk` 2.0.9, Node test runner through `tsx`, Prettier, Docker Buildx, and `start-cli` 1.1.0.

---

### Task 1: Create the Isolated Integration Worktree and Preserve the Git-Cache Patch

**Files:**

- Modify in the new worktree: `README.md`
- Modify in the new worktree: `instructions.md`
- Modify in the new worktree: `startos/main.ts`
- Modify in the new worktree: `startos/runtime/mounts.ts`
- Modify in the new worktree: `startos/versions/current.ts`
- Test in the new worktree: `tests/health.test.ts`
- Test in the new worktree: `tests/manifest.test.ts`
- Preserve unchanged: `/home/missydog/.config/superpowers/worktrees/buzz-startos/production-ready-00ecf2c`

**Step 1: Create a dedicated worktree**

Use `@superpowers:using-git-worktrees`. Create the integration branch from the committed production-readiness head, not from its dirty filesystem state:

```bash
git -C /home/missydog/Desktop/Learnding/Tools/Buzz/buzz-startos worktree add \
  /home/missydog/.config/superpowers/worktrees/buzz-startos/63496cc-pairing-upgrade \
  -b feature/63496cc-pairing-upgrade \
  release/production-readiness
```

Expected: a clean worktree at `f1c83a0` or its current committed successor.

**Step 2: Install the exact locked development dependencies**

Run:

```bash
cd /home/missydog/.config/superpowers/worktrees/buzz-startos/63496cc-pairing-upgrade
npm ci
```

Expected: exit 0 with `@start9labs/start-sdk` locked to `2.0.9`.

**Step 3: Reproduce the existing uncommitted Git-cache patch**

Apply only the seven known files from the source worktree directly through a pipe so no patch file or source-worktree mutation is needed:

```bash
git -C /home/missydog/.config/superpowers/worktrees/buzz-startos/production-ready-00ecf2c \
  diff --binary -- \
  README.md \
  instructions.md \
  startos/main.ts \
  startos/runtime/mounts.ts \
  startos/versions/current.ts \
  tests/health.test.ts \
  tests/manifest.test.ts \
| git apply -
```

Expected: the integration worktree contains the overlay-compatible root `chown` one-shot and version `63496cc:1`. The source worktree remains dirty in exactly the same seven files.

**Step 4: Verify the preserved patch before committing it**

Run:

```bash
git diff --check
npx tsx --test tests/health.test.ts tests/manifest.test.ts
npm run check
```

Expected: all focused tests and TypeScript checks pass.

**Step 5: Commit the preserved work as its own provenance boundary**

```bash
git add \
  README.md \
  instructions.md \
  startos/main.ts \
  startos/runtime/mounts.ts \
  startos/versions/current.ts \
  tests/health.test.ts \
  tests/manifest.test.ts
git commit -m "fix: support overlay-backed git cache"
```

Expected: one clean commit, with the original production-readiness worktree still untouched.

### Task 2: Merge Pairing and Add the Upgrade-Compatibility Regression Test

**Files:**

- Merge: all committed pairing and WSS files from `main`
- Modify: `startos/runtime/config.ts`
- Modify: `startos/versions/current.ts`
- Test: `tests/health.test.ts`
- Test: `tests/manifest.test.ts`
- Test: `tests/runtime-config.test.ts`

**Step 1: Start a real history merge without committing**

```bash
git merge --no-ff --no-commit main
```

Expected: pairing-only files merge automatically. Conflicts are expected in `README.md`, `TODO.md`, `UPDATING.md`, `instructions.md`, `startos/runtime/config.ts`, `startos/versions/current.ts`, `tests/health.test.ts`, `tests/manifest.test.ts`, and `tests/runtime-config.test.ts`. The pre-applied Git-cache patch may also make `startos/main.ts` conflict.

**Step 2: Resolve runtime conflicts by retaining both behaviors**

Resolve `startos/runtime/config.ts` so `buzzEnv` contains both the `63496cc` S3 setting and the pairing advertisement:

```typescript
BUZZ_PAIRING_RELAY_URL: pairingRelayUrl,
BUZZ_S3_FORCE_PATH_STYLE: 'true',
```

Resolve `startos/main.ts` and `tests/health.test.ts` so the native stack contains all of the following:

- `prepare-git-cache` root one-shot;
- `buzz-pair-relay` daemon on `0.0.0.0:5000`;
- pairing readiness and ongoing health checks;
- `migrate` requiring `prepare-git-cache` in addition to database and bucket setup;
- main Buzz daemon requiring both migration completion and the stateful services;
- pairing daemon remaining independent of the main relay so pairing health cannot take down an active community relay.

Resolve `tests/runtime-config.test.ts` so its expected environment includes both exact keys and values.

**Step 3: Resolve the version temporarily at the installed revision**

Resolve `startos/versions/current.ts` to the `63496cc` upstream identity at revision `:1` while retaining a no-op `up` migration and `down: IMPOSSIBLE`. This temporary state makes the regression test fail for the intended reason.

Resolve `tests/manifest.test.ts` to use:

```typescript
import { ExtendedVersion, IMPOSSIBLE } from '@start9labs/start-sdk'

const PREVIOUS_VERSION = '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:1'
const VERSION = PREVIOUS_VERSION
```

Retain the existing pairing documentation assertions and the production-readiness image/security assertions.

**Step 4: Write the failing ExVer regression test**

Add to `tests/manifest.test.ts`:

```typescript
test('upgrades from the previously sideloaded 63496cc revision', () => {
  const previous = ExtendedVersion.parse(PREVIOUS_VERSION)
  const next = versionGraph.currentVersion()

  assert.equal(previous.compareForSort(next) < 0, true)
  assert.equal(previous.satisfies(versionGraph.canMigrateFrom()), true)
  assert.equal(next.satisfies(versionGraph.canMigrateTo()), true)
})
```

**Step 5: Run the regression test and verify it fails**

Run:

```bash
npx tsx --test tests/manifest.test.ts
```

Expected: FAIL because `PREVIOUS_VERSION` and the current version are equal, so `compareForSort(next) < 0` is false.

**Step 6: Implement the minimal compatible version bump**

Change the current version to:

```typescript
version: '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2',
```

Change the test constant accordingly:

```typescript
const VERSION = '0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2'
```

Update all localized release notes to state that revision `:2` combines the overlay-compatible Git-cache startup fix with the dedicated LAN-only pairing relay. Do not create a historical version file: the forward migration is a no-op and `VersionGraph` synthesizes the compatible lower range.

**Step 7: Run the focused tests and verify they pass**

```bash
npx tsx --test \
  tests/manifest.test.ts \
  tests/runtime-config.test.ts \
  tests/health.test.ts \
  tests/interface-addresses.test.ts \
  tests/pairing-configuration.test.ts
```

Expected: all focused tests pass, including the exact `63496cc:1` upgrade assertion.

### Task 3: Reconcile Developer and User Documentation

**Files:**

- Modify: `README.md`
- Modify: `instructions.md`
- Modify: `TODO.md`
- Modify: `UPDATING.md`
- Modify: `docs/upstream/63496cc-runtime-contract.md`
- Preserve as historical evidence: `docs/upstream/dd222a5-runtime-contract.md`
- Test: `tests/manifest.test.ts`

**Step 1: Resolve README and instructions around the actual current package**

Keep the production-readiness security controls and `63496cc` provenance. Keep all pairing sections from `main`, including:

- why the old main-relay `/pair` fallback returns 404;
- the dedicated `buzz-pair-relay` interface and `BUZZ_PAIRING_RELAY_URL` remediation;
- LAN-only scope;
- unmodified Android Root CA limitation;
- the future StartTunnel/VPS project;
- the overlay-backed Git-cache one-shot.

Remove statements that describe `dd222a5` as the current package or say the current package lacks authorization fix `00ecf2c`. Retain the `dd222a5` runtime-contract file only as historical evidence.

**Step 2: Reconcile tracking documents**

Update `UPDATING.md` to identify `63496cc` and its immutable image digests as current. Update `TODO.md` so completed local pairing work is not listed as pending, while remote mobile interoperability and real Android validation remain pending.

Update `docs/upstream/63496cc-runtime-contract.md` to record that the pinned image contains executable `buzz-pair-relay` support and the NIP-11 `pairing_relay_url` configuration contract.

**Step 3: Run documentation and focused behavior checks**

```bash
git diff --check
npx prettier --check README.md instructions.md TODO.md UPDATING.md docs/upstream/63496cc-runtime-contract.md
npx tsx --test tests/manifest.test.ts tests/pairing-configuration.test.ts
```

Expected: no whitespace or formatting errors and all documentation-boundary tests pass.

### Task 4: Run Complete Static Verification and Commit the Integration

**Files:**

- Verify: all source, tests, scripts, security controls, and documentation
- Generate but do not commit: `javascript/index.js`

**Step 1: Run the complete package checks**

Use `@superpowers:verification-before-completion` before making any success claim.

```bash
npm run check
npm run prettier:check
npm test
npm run verify:images
git diff --check
```

Expected: TypeScript, Prettier, the complete test suite, and immutable multi-architecture image verification all pass.

**Step 2: Build and inspect the generated JavaScript bundle**

```bash
npm run build
node -e "const p=require('./javascript/index.js'); console.log(p.manifest.version)"
```

Expected:

```text
0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2
```

**Step 3: Review the merged diff**

Use `@superpowers:requesting-code-review`. Review specifically for:

- accidental loss of production-readiness controls;
- accidental loss of the Git-cache fix;
- stale `dd222a5` current-version claims;
- pairing URL/path inconsistencies;
- secrets in docs, fixtures, or generated output;
- source-worktree changes outside the isolated integration worktree.

**Step 4: Complete the merge commit**

```bash
git add -A
git commit -m "feat: add pairing relay to 63496cc package"
git status --short --branch
```

Expected: clean integration branch. Do not tag, publish, or push a registry release.

### Task 5: Build and Verify the x86_64 Sideload Artifact

**Files:**

- Generate: `buzz_x86_64.s9pk`
- Verify: `assets/signing-pubkey.pem`
- Verify: `assets/signing-pubkey.sha256`

**Step 1: Verify the local build endpoint without weakening TLS**

The workspace hostname currently has unreliable mDNS resolution, while the box certificate includes `192.168.1.102`. Confirm the address before packing:

```bash
start-cli -H https://192.168.1.102 echo build-host-check
```

Expected: `build-host-check`.

**Step 2: Rebuild the JavaScript and pack to an isolated filename**

Do not rely on `make x86` while `dev-vm.local` is unresolved: its hidden `list-ingredients` call can produce an empty prerequisite list and reuse stale JavaScript.

```bash
make javascript/index.js
node -e "const p=require('./javascript/index.js'); console.log(p.manifest.version)"
start-cli -H https://192.168.1.102 s9pk pack \
  --arch=x86_64 \
  -o buzz_x86_64.candidate.s9pk
```

Expected: the bundle reports `63496cc:2` and packaging exits 0.

**Step 3: Inspect the archive before promotion**

```bash
start-cli -H https://192.168.1.102 s9pk inspect \
  buzz_x86_64.candidate.s9pk manifest
start-cli -H https://192.168.1.102 s9pk inspect \
  buzz_x86_64.candidate.s9pk commitment
```

Require all of the following:

- version is `0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2`;
- `canMigrateFrom` includes exact `63496cc:1`;
- Git hash equals the clean integration commit without `-modified`;
- every image and hardware architecture is exactly `x86_64`;
- SDK is `2.0.9`;
- all five expected packed images are present.

**Step 4: Verify signer and checksum**

Run signer verification outside the workspace so its internal local `start-cli inspect` call does not encounter the broken workspace mDNS profile:

```bash
cd /tmp
/home/missydog/.config/superpowers/worktrees/buzz-startos/63496cc-pairing-upgrade/scripts/verify-s9pk-signer.sh \
  /home/missydog/.config/superpowers/worktrees/buzz-startos/63496cc-pairing-upgrade/buzz_x86_64.candidate.s9pk
sha256sum \
  /home/missydog/.config/superpowers/worktrees/buzz-startos/63496cc-pairing-upgrade/buzz_x86_64.candidate.s9pk
```

Expected: signer fingerprint `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c` and a recorded SHA-256 checksum.

**Step 5: Promote only the verified candidate**

After every check passes, atomically rename the candidate to `buzz_x86_64.s9pk`. Preserve any rejected candidate outside the repository rather than presenting it as the final build.

### Task 6: Verify the Update and Pairing Workflow on StartOS

**Files:**

- Sideload: `buzz_x86_64.s9pk`
- Do not commit: device credentials, logs containing secrets, or local StartOS state

**Step 1: Sideload the verified package**

Upload `buzz_x86_64.s9pk` through the StartOS web interface and choose the update operation.

Expected: StartOS accepts `63496cc:1 → 63496cc:2`; the `uninit target range !` error does not recur.

**Step 2: Configure the dedicated pairing address**

Stop Buzz if prompted, complete **Configure Pairing Relay**, select the exported pairing WebSocket address, and start Buzz.

Expected: Buzz reports both **Buzz Relay** and **Buzz Pairing Relay** healthy.

**Step 3: Verify NIP-11 discovery**

Fetch the main relay root with `Accept: application/nostr+json`. If local mDNS remains unavailable to the development machine, use `curl --resolve` with the exact StartOS hostname, external port, and verified LAN IP.

Expected: the JSON document contains:

```json
{
  "pairing_relay_url": "wss://<dedicated-pairing-address>"
}
```

The value must equal **Connection Information → Pairing Relay WebSocket URL** and must not be the main relay URL plus `/pair`.

**Step 4: Verify the dedicated WebSocket upgrade**

Send a standards-compliant WebSocket upgrade to the dedicated pairing URL.

Expected: HTTP `101 Switching Protocols`. A non-WebSocket request should return the relay's expected HTTP `400`, not StartOS/main-relay `404`.

**Step 5: Verify the user-visible workflow**

In Buzz Desktop, choose **Add mobile device**.

Expected: a QR code appears and no `WebSocket connection failed: HTTP error: 404 Not Found` event occurs. Record separately whether unmodified Android trusts the StartOS certificate; that is a distinct known limitation and does not invalidate the server-side 404 fix.

### Task 7: Handoff Without Publishing

**Files:**

- Verify: integration branch status and final artifact metadata

**Step 1: Report exact evidence**

Report:

- source commit;
- package version;
- architecture;
- artifact size and absolute path;
- SHA-256;
- signer fingerprint;
- exact static commands and results;
- StartOS update result;
- live NIP-11 and WebSocket results;
- Android TLS status as verified, failed, or not tested.

**Step 2: Preserve release boundaries**

Do not create a tag, GitHub Release, registry publication, or production claim. Do not merge or push the integration branch until the user explicitly requests that external state change after reviewing the live result.
