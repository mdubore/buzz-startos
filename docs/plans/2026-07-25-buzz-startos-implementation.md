# Buzz for StartOS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a reproducible, private-by-default Buzz relay package for StartOS 0.4.0, keep `mdubore/buzz9` fast-forward synchronized with `block/buzz`, and produce separately signed x86_64 and aarch64 sideload artifacts with complete operator documentation.

**Architecture:** Keep upstream source and downstream packaging in separate repositories. Package the exact upstream Buzz OCI snapshot as one StartOS service with native PostgreSQL, Redis, MinIO, and MinIO-client subcontainers, one public HTTP/WebSocket binding, wrapper-owned immutable setup state, StartOS actions, and SDK-managed backups.

**Tech Stack:** StartOS 0.4.0, `@start9labs/start-sdk` 2.0.9, TypeScript 6, Node.js 22.23.1, Node test runner through `tsx`, `nostr-tools`, Docker Buildx 0.35.0, Start CLI 1.1.0, PostgreSQL 17, Redis 7, MinIO, GitHub Actions.

---

## Execution Rules

- Work in `/home/missydog/Desktop/Learnding/Tools/Buzz/buzz-startos`.
- Treat `/home/missydog/Desktop/Learnding/Tools/Buzz` as the StartOS packaging
  workspace, not as a Git repository.
- Use `@superpowers:test-driven-development` for every behavior-bearing task.
- Use `@sync-upstream-release` for the `buzz9` synchronization and every later
  Buzz snapshot update.
- Use `@superpowers:verification-before-completion` before reporting either
  architecture as built or the package as complete.
- Use `@publishing-github-releases` before creating the first GitHub release.
- Never commit `.startos/`, a signing key, credentials, `.s9pk` files,
  `node_modules/`, `javascript/`, or pulled OCI layers.
- Do not add StartOS files or downstream source patches to `buzz9`.
- Stop and re-audit the runtime contract if `block/buzz` moves beyond the
  selected commit before Task 2 completes. Do not silently substitute a newer
  image.

## Selected Snapshot

The planning baseline was current when this plan was written:

| Component | Reference | OCI index digest |
| --- | --- | --- |
| Buzz | `ghcr.io/block/buzz:sha-dd222a5` | `sha256:8cb0c4023a40acdd352dca8d922c193da4c9cea3beed484a62d8cfc03e9a93c9` |
| PostgreSQL | `postgres:17.10-alpine3.24` | `sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193` |
| Redis | `redis:7.4.9-alpine3.21` | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| MinIO | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| MinIO client | `minio/mc:RELEASE.2025-08-13T08-35-41Z` | `sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727` |

The selected upstream commit is
`dd222a509b156ba52ed3219e895d7bf1cf322c92`, committed at
`2026-07-26T07:57:31Z`. Its relay crate version is `0.2.0`; the package ExVer
is `0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:0`.

If Task 2 selects a newer upstream commit, replace every Buzz SHA, digest,
timestamp, version, release note, and source link in this plan as one reviewed
change.

### Task 1: Prepare The StartOS Packaging Workspace

**Files:**
- Create outside repository: `../.startos/build.key.pem`
- Create outside repository: `../.startos/config.yaml`
- Create outside repository: `../start-technologies/`
- Verify: `../docs/Startos.md`

**Step 1: Verify the local prerequisites**

Run:

```bash
cd /home/missydog/Desktop/Learnding/Tools/Buzz
node --version
start-cli --version
docker --version
docker buildx version
make --version
mksquashfs -version
tar2sqfs --version
openssl version
xxd -v
jq --version
git --version
gh --version
```

Expected before remediation: Node is `v20.19.2` and `start-cli` is
`0.4.0-alpha.21`; the remaining tools are present.

**Step 2: Select Node.js 22.23.1**

Use the machine's preferred version manager. If none exists, install one, then:

```bash
nvm install 22.23.1
nvm use 22.23.1
node --version
npm --version
```

Expected: `node --version` is exactly `v22.23.1`. Do not scaffold or install
npm dependencies under Node 20 or a floating Node 22 patch.

**Step 3: Install the exact stable packaging CLIs**

Download the official Linux x86_64 asset for `start-cli/v1.1.0` and verify the
SHA-256 published in that release before installing it:

```bash
START_CLI_TMP="$(mktemp)"
curl -fL \
  'https://github.com/Start9Labs/start-technologies/releases/download/start-cli/v1.1.0/start-cli_x86_64-linux' \
  -o "$START_CLI_TMP"
printf '%s  %s\n' \
  '70eff67b6e9a936acd8aaaf787b783819252ecedaa5c74d462e3b15ed4dd843a' \
  "$START_CLI_TMP" | sha256sum --check
install -Dm755 "$START_CLI_TMP" "$HOME/.local/bin/start-cli"
rm -f "$START_CLI_TMP"
hash -r
start-cli --version
start-cli s9pk init-workspace --help
start-cli s9pk init-package --help
```

Expected: the checksum reports `OK`, `start-cli --version` reports exactly
`start-cli 1.1.0`, and both workspace commands exist. For an aarch64 or macOS
development machine, select the matching asset and checksum from the same
immutable release; do not run a mutable "latest" installer.

Install Docker Buildx 0.35.0 from its immutable official release asset:

```bash
BUILDX_TMP="$(mktemp)"
curl -fL \
  'https://github.com/docker/buildx/releases/download/v0.35.0/buildx-v0.35.0.linux-amd64' \
  -o "$BUILDX_TMP"
printf '%s  %s\n' \
  'd41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda' \
  "$BUILDX_TMP" | sha256sum --check
install -Dm755 "$BUILDX_TMP" "$HOME/.docker/cli-plugins/docker-buildx"
docker buildx version
```

Expected: the checksum reports `OK` and Buildx reports
`github.com/docker/buildx v0.35.0`. For another host architecture, use the
matching asset and entry from the same immutable `v0.35.0` checksum file.
Buildx is used for read-only OCI inspection. The package uses only prebuilt
images, so neither QEMU nor a separate BuildKit daemon is required.

**Step 4: Initialize the parent workspace**

Run from the parent, never from inside `buzz-startos`:

```bash
cd /home/missydog/Desktop/Learnding/Tools/Buzz
start-cli s9pk init-workspace .
test -f .startos/build.key.pem
test -f .startos/config.yaml
test -d start-technologies/projects/start-sdk/docs/package-template
```

Expected: all three checks succeed. Keep `.startos/build.key.pem` private and
back it up outside Git.

**Step 5: Confirm repository isolation**

Run:

```bash
git -C buzz-startos status --short --branch
git -C buzz-startos log --oneline -3
```

Expected: branch `main`, design commits `98f2f6a` and `b49744c`, and no
workspace-generated files inside the package repository.

There is no commit for this task because all created files belong to the
untracked packaging workspace.

### Task 2: Fast-Forward `buzz9` And Freeze The Runtime Contract

**Files:**
- Create: `docs/upstream/dd222a5-runtime-contract.md`
- Modify: `docs/plans/2026-07-25-buzz-startos-packaging-design.md`
- Modify: `docs/plans/2026-07-25-buzz-startos-implementation.md`
- Do not create or modify downstream files in: `../buzz9/`

**Step 1: Clone or update the source mirror**

Run:

```bash
BUZZ9=/home/missydog/Desktop/Learnding/Tools/Buzz/buzz9
test -d "$BUZZ9/.git" ||
  git clone https://github.com/mdubore/buzz9.git "$BUZZ9"
git -C "$BUZZ9" remote get-url upstream >/dev/null 2>&1 ||
  git -C "$BUZZ9" remote add upstream https://github.com/block/buzz.git
git -C "$BUZZ9" remote set-url origin https://github.com/mdubore/buzz9.git
git -C "$BUZZ9" remote set-url upstream https://github.com/block/buzz.git
test "$(git -C "$BUZZ9" remote get-url origin)" = \
  'https://github.com/mdubore/buzz9.git'
test "$(git -C "$BUZZ9" remote get-url upstream)" = \
  'https://github.com/block/buzz.git'
git -C "$BUZZ9" fetch --prune origin
git -C "$BUZZ9" fetch --prune upstream
git -C "$BUZZ9" switch main
git -C "$BUZZ9" pull --ff-only origin main
git -C "$BUZZ9" merge-base --is-ancestor origin/main upstream/main
git -C "$BUZZ9" rev-list --left-right --count origin/main...upstream/main
```

If `buzz9` already exists, skip `clone`; ensure `origin` and `upstream` exactly
match the URLs above. Expected before synchronization: the ancestor check exits
zero and the count is `0 N`, proving the fork has no downstream commits. At
this refresh the recorded count immediately before synchronization was `0 1`;
after the fast-forward and push it is `0 0`.

**Step 2: Select the current upstream commit**

Run:

```bash
BUZZ9=/home/missydog/Desktop/Learnding/Tools/Buzz/buzz9
git -C "$BUZZ9" rev-parse upstream/main
TZ=UTC git -C "$BUZZ9" show -s \
  --date=format-local:'%Y-%m-%dT%H:%M:%SZ' \
  --format='%H%n%cd%n%s' upstream/main
git -C "$BUZZ9" show upstream/main:crates/buzz-relay/Cargo.toml |
  sed -n '1,20p'
```

Expected for this plan: full SHA `dd222a509b156ba52ed3219e895d7bf1cf322c92`,
timestamp `2026-07-26T07:57:31Z`, and relay version `0.2.0`.

The refresh from the earlier planning baseline `8eb6e3e` contains six
commits. The first five affect desktop, desktop packaging, README, or the
release workflow. The sixth, from the historical prior selected commit
`c2a4ee711e481bb427d6cf8cd08b2c7329d1508c` to the current selection, is
mobile-only. The Dockerfile, relay/admin/database/media crates, migrations,
bundled web trees, and production Compose tree are byte-identical across all
three revisions. Record that evidence, but still perform the full contract
checks below for the selected image.

If the SHA differs, stop. Repeat the Dockerfile, Compose, migrations, config,
admin CLI, health, persistence, and route audit before updating the selected
snapshot table.

**Step 3: Fast-forward and push the mirror**

Run:

```bash
BUZZ9=/home/missydog/Desktop/Learnding/Tools/Buzz/buzz9
git -C "$BUZZ9" merge --ff-only upstream/main
git -C "$BUZZ9" push origin main
git -C "$BUZZ9" fetch origin main
git -C "$BUZZ9" rev-list --left-right --count origin/main...upstream/main
git -C "$BUZZ9" status --short --branch
```

Expected: `0 0` and a clean worktree. If GitHub authentication blocks the push,
leave the local branch fast-forwarded and record the exact external blocker; do
not add a merge commit.

**Step 4: Write the runtime contract record**

Create
`/home/missydog/Desktop/Learnding/Tools/Buzz/buzz-startos/docs/upstream/dd222a5-runtime-contract.md`
with:

- full source SHA, commit timestamp, relay crate version, and immutable image
  reference;
- Buzz index and per-platform digests;
- `User=buzz:buzz`, UID/GID 1000, relay entrypoint, and ports 3000/8080/9102;
- `/bin/sh`, `curl`, `buzz-relay`, and `buzz-admin` presence on both
  architectures;
- exact `buzz-admin migrate`, `add-member`, `remove-member`, and
  `list-members` syntax;
- all packaged environment variables and all deliberately omitted stale
  variables;
- PostgreSQL and MinIO as authoritative state, Redis as transient persisted
  state, and `/data/git` as disposable cache;
- immutable canonical-host behavior and unknown-Host rejection;
- link-accessible media, disabled admin UI, disabled hosted iOS push, and
  limited bundled browser routes;
- source links pinned to the full commit.

**Step 5: Check and commit**

Run:

```bash
PACKAGE=/home/missydog/Desktop/Learnding/Tools/Buzz/buzz-startos
git -C "$PACKAGE" diff --check
git -C "$PACKAGE" add -A docs/upstream
git -C "$PACKAGE" add \
  docs/plans/2026-07-25-buzz-startos-packaging-design.md \
  docs/plans/2026-07-25-buzz-startos-implementation.md
git -C "$PACKAGE" commit --amend --no-edit
```

Expected: one package-repository documentation commit and no new commit in
`buzz9`.

### Task 3: Scaffold The Canonical SDK 2.0.9 Package

**Files:**
- Create: `.dockerignore`
- Create: `.github/workflows/build.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/tagAndRelease.yml`
- Create: `.gitignore`
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `LICENSE`
- Create: `Makefile`
- Create: `README.md`
- Create: `TODO.md`
- Create: `UPDATING.md`
- Create: `assets/README.md`
- Create: `icon.svg`
- Create: `instructions.md`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `startos/**`
- Create: `tsconfig.json`
- Preserve: `docs/**`

**Step 1: Generate and copy a temporary canonical package**

`init-package` refuses to target the existing design repository. Generate into
a temporary workspace that reuses the parent Start9 checkout:

```bash
PACKAGE=/home/missydog/Desktop/Learnding/Tools/Buzz/buzz-startos
TMP_WORKSPACE="$(mktemp -d)"
trap 'rm -rf "$TMP_WORKSPACE"' EXIT
start-cli s9pk init-workspace "$TMP_WORKSPACE"
git -C "$TMP_WORKSPACE/start-technologies" fetch origin \
  'refs/tags/start-sdk/v2.0.9:refs/tags/start-sdk/v2.0.9'
git -C "$TMP_WORKSPACE/start-technologies" checkout --detach \
  f8fb04b69cb5c2a190a0c7505a2dc445c509b6ba
test "$(jq -r .version \
  "$TMP_WORKSPACE/start-technologies/projects/start-sdk/package.json")" = \
  '2.0.9'
(
  cd "$TMP_WORKSPACE"
  start-cli s9pk init-package "Buzz"
)
test -d "$TMP_WORKSPACE/buzz-startos/.git"
rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  "$TMP_WORKSPACE/buzz-startos/" \
  "$PACKAGE/"
test -d "$PACKAGE/.git"
test -f "$PACKAGE/docs/plans/2026-07-25-buzz-startos-packaging-design.md"
```

Expected: the temporary package comes from the immutable
`start-sdk/v2.0.9` commit, while the existing package `.git` and `docs/plans/`
remain intact after copying. The trap removes the temporary workspace. Do not
use `rsync --delete`.

**Step 2: Pin the SDK, test dependencies, and scripts**

Run:

```bash
npm install --save-exact nostr-tools@2.24.1
npm install --save-dev --save-exact tsx@4.23.1
```

Modify `package.json` scripts to exactly:

```json
{
  "build": "rm -rf ./javascript && ncc build startos/index.ts -o ./javascript",
  "check": "tsc --noEmit",
  "test": "tsx --test tests/*.test.ts",
  "prettier": "prettier --write startos tests scripts",
  "prettier:check": "prettier --check startos tests scripts",
  "verify:images": "tsx scripts/verify-images.ts"
}
```

Keep `@start9labs/start-sdk` exactly `2.0.9`; do not use a caret. Extend
`tsconfig.json` include to:

```json
["startos/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "node_modules/**/startos"]
```

**Step 3: Extend generated ignores**

Ensure `.gitignore` includes:

```gitignore
*.s9pk
SHA256SUMS
docker-images/
javascript/
ncc-cache.git/
node_modules/
```

Do not ignore `package-lock.json`.

**Step 4: Verify the scaffold**

Run:

```bash
npm ci
npm run check
make -s print-TARGETS
git diff --check
```

Expected: type checking passes and `print-TARGETS` outputs `x86 arm`.

**Step 5: Commit**

Run:

```bash
git add .
git commit -m "chore: scaffold StartOS package"
```

### Task 4: Pin And Verify Every OCI Image

**Files:**
- Create: `startos/image-pins.ts`
- Create: `scripts/verify-images.ts`
- Create: `tests/image-pins.test.ts`
- Modify: `package.json`

**Step 1: Write the failing pin test**

Create `tests/image-pins.test.ts` with assertions that:

```typescript
assert.equal(UPSTREAM.commit, 'dd222a509b156ba52ed3219e895d7bf1cf322c92')
assert.equal(UPSTREAM.shortCommit, UPSTREAM.commit.slice(0, 7))
assert.equal(
  IMAGE_PINS.buzz.tagReference,
  `ghcr.io/block/buzz:sha-${UPSTREAM.shortCommit}`,
)
assert.deepEqual(Object.keys(IMAGE_PINS).sort(), [
  'buzz',
  'minio',
  'minioClient',
  'postgres',
  'redis',
])
for (const pin of Object.values(IMAGE_PINS)) {
  assert.match(pin.indexDigest, /^sha256:[0-9a-f]{64}$/)
  assert.match(pin.platforms.amd64, /^sha256:[0-9a-f]{64}$/)
  assert.match(pin.platforms.arm64, /^sha256:[0-9a-f]{64}$/)
  assert.equal(
    packedImageReference(pin),
    `${pin.tagReference}@${pin.indexDigest}`,
  )
  assert.match(packedImageReference(pin), /@sha256:[0-9a-f]{64}$/)
}
```

**Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx --test tests/image-pins.test.ts
```

Expected: FAIL because `startos/image-pins.ts` does not exist.

**Step 3: Implement the pin table**

Create `startos/image-pins.ts` with an `ImagePin` type, a helper that produces
the tag-plus-index-digest reference used by the packer, and these exact values:

```typescript
export type ImagePin = {
  readonly tagReference: string
  readonly indexDigest: `sha256:${string}`
  readonly platforms: {
    readonly amd64: `sha256:${string}`
    readonly arm64: `sha256:${string}`
  }
}

export const packedImageReference = (pin: ImagePin) =>
  `${pin.tagReference}@${pin.indexDigest}`

export const UPSTREAM = {
  commit: 'dd222a509b156ba52ed3219e895d7bf1cf322c92',
  shortCommit: 'dd222a5',
  committedAt: '2026-07-26T07:57:31Z',
  relayVersion: '0.2.0',
} as const

export const IMAGE_PINS = {
  buzz: {
    tagReference: 'ghcr.io/block/buzz:sha-dd222a5',
    indexDigest: 'sha256:8cb0c4023a40acdd352dca8d922c193da4c9cea3beed484a62d8cfc03e9a93c9',
    platforms: {
      amd64: 'sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152',
      arm64: 'sha256:ff4d22c5cc747b61a83441bfdb4bd0a5902630b958e68be9976ea50e478bc6e7',
    },
  },
  postgres: {
    tagReference: 'postgres:17.10-alpine3.24',
    indexDigest: 'sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193',
    platforms: {
      amd64: 'sha256:af194ccf3e2d7fe367012c7b88ce8b816c5c889b18a5b316799a1f0d7eac746a',
      arm64: 'sha256:b797483593b82cbea9a7ee41c88f324a90d10d9c2504d40e755d91c75456366d',
    },
  },
  redis: {
    tagReference: 'redis:7.4.9-alpine3.21',
    indexDigest: 'sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99',
    platforms: {
      amd64: 'sha256:b1addbe72465a718643cff9e60a58e6df1841e29d6d7d60c9a85d8d72f08d1a7',
      arm64: 'sha256:084f4bcb3fedf990ba43d26774f58ed4697a2c044156544ac4717934ad1d57c8',
    },
  },
  minio: {
    tagReference: 'minio/minio:RELEASE.2025-09-07T16-13-09Z',
    indexDigest: 'sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e',
    platforms: {
      amd64: 'sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2',
      arm64: 'sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f',
    },
  },
  minioClient: {
    tagReference: 'minio/mc:RELEASE.2025-08-13T08-35-41Z',
    indexDigest: 'sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727',
    platforms: {
      amd64: 'sha256:eb4ea9884b77704230e2423e9004d2fa738dc272876b9cc41a297d29443b8780',
      arm64: 'sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7',
    },
  },
} as const satisfies Record<string, ImagePin>
```

**Step 4: Implement registry verification**

Create `scripts/verify-images.ts`. For each pin it must:

1. run `docker buildx imagetools inspect <tagReference> --raw`;
2. hash the exact raw bytes with SHA-256 and compare the index digest;
3. parse the OCI index JSON;
4. find non-attestation `linux/amd64` and `linux/arm64` manifests;
5. compare both platform digests;
6. inspect the image config for both platforms from the human-readable tag,
   not the digest-qualified reference;
7. collect all mismatches and exit nonzero after reporting them;
8. print one concise `OK <name> <index-digest>` line per valid image.

Require identical runtime metadata on both architectures:

| Image | Config user | Entrypoint | Declared writable volume |
| --- | --- | --- | --- |
| Buzz | `buzz:buzz` | `/usr/local/bin/buzz-relay` | none |
| PostgreSQL | empty/root | `docker-entrypoint.sh` | `/var/lib/postgresql/data` |
| Redis | empty/root | `docker-entrypoint.sh` | `/data` |
| MinIO | empty/root | `/usr/bin/docker-entrypoint.sh` | `/data` |
| MinIO client | empty/root | `mc` | none |

Also require the Buzz
`org.opencontainers.image.revision` label to equal `UPSTREAM.commit` on both
architectures. These checks are the build-time evidence for the mount strategy:
the three stateful sidecar entrypoints begin as root and can initialize their
mounted ownership; Buzz starts unprivileged and requires an explicit ID map.
Keep the later on-device write tests because image metadata alone cannot prove
StartOS mount behavior.

Use `execFileSync`, not a shell-built command string, in the TypeScript
implementation.

**Step 5: Run the tests and live verification**

Run:

```bash
npm test
npm run verify:images
```

Expected: all unit tests pass and five `OK` lines are printed. A tag that has
moved must fail rather than updating the expected digest automatically.

**Step 6: Commit**

Run:

```bash
git add package.json package-lock.json startos/image-pins.ts scripts/verify-images.ts tests/image-pins.test.ts
git commit -m "build: pin and verify runtime images"
```

### Task 5: Normalize Nostr Public Keys

**Files:**
- Create: `startos/domain/identity.ts`
- Create: `tests/identity.test.ts`

**Step 1: Write failing identity tests**

Cover:

```typescript
const HEX = '11'.repeat(32)

assert.equal(normalizeNostrPubkey(HEX), HEX)
assert.equal(normalizeNostrPubkey(HEX.toUpperCase()), HEX)
assert.equal(normalizeNostrPubkey(`  ${nip19.npubEncode(HEX)}  `), HEX)
assert.throws(() => normalizeNostrPubkey('11'), /public key/i)
assert.throws(() => normalizeNostrPubkey('g'.repeat(64)), /public key/i)
assert.throws(
  () =>
    normalizeNostrPubkey(
      nip19.nsecEncode(Uint8Array.from(Buffer.from(HEX, 'hex'))),
    ),
  /npub/i,
)
```

Also test that an encoded value whose decoded type is not `npub` is rejected.

**Step 2: Verify red**

Run:

```bash
npx tsx --test tests/identity.test.ts
```

Expected: FAIL because the module is absent.

**Step 3: Implement minimal normalization**

In `startos/domain/identity.ts`:

- trim surrounding whitespace;
- accept exactly 64 hexadecimal characters and lowercase them;
- otherwise call `nip19.decode`;
- require `decoded.type === 'npub'`;
- require decoded data to be exactly 64 lowercase hexadecimal characters;
- throw `Error('Enter an npub or 64-character hexadecimal Nostr public key')`
  for every invalid form;
- never accept or log an `nsec`.

**Step 4: Verify green**

Run:

```bash
npx tsx --test tests/identity.test.ts
npm run check
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add startos/domain/identity.ts tests/identity.test.ts
git commit -m "feat: normalize Nostr public keys"
```

### Task 6: Model The Immutable Canonical URL

**Files:**
- Create: `startos/domain/public-url.ts`
- Create: `startos/domain/setup.ts`
- Create: `tests/public-url.test.ts`
- Create: `tests/setup.test.ts`

**Step 1: Write failing URL tests**

Assert these exact derivations:

```typescript
assert.deepEqual(derivePublicConfig('https://Buzz.Example:443/'), {
  primaryUrl: 'https://buzz.example',
  relayUrl: 'wss://buzz.example',
  mediaBaseUrl: 'https://buzz.example/media',
  corsOrigins: 'https://buzz.example',
  authority: 'buzz.example',
})

assert.deepEqual(derivePublicConfig('http://buzz.local:3000'), {
  primaryUrl: 'http://buzz.local:3000',
  relayUrl: 'ws://buzz.local:3000',
  mediaBaseUrl: 'http://buzz.local:3000/media',
  corsOrigins: 'http://buzz.local:3000',
  authority: 'buzz.local:3000',
})
```

Cover lowercase normalization, one trailing hostname dot, non-default ports,
and bracketed IPv6. Reject non-root paths, query strings, fragments,
credentials, `ws:`, `wss:`, `ftp:`, and malformed URLs.

**Step 2: Write failing setup immutability tests**

Test a pure `mergeInitialSetup(existing, requested)` function:

- an empty store accepts owner plus primary URL;
- an exact retry is idempotent;
- changing owner is rejected;
- changing primary URL is rejected;
- a partial existing record may fill its missing field but may not replace a
  present field;
- validation completes before a new object is returned.

**Step 3: Verify red**

Run:

```bash
npx tsx --test tests/public-url.test.ts tests/setup.test.ts
```

Expected: FAIL because both modules are absent.

**Step 4: Implement URL derivation**

`derivePublicConfig(input)` must:

1. parse with `new URL(input)`;
2. allow only `http:` and `https:`;
3. require empty username, password, search, and hash;
4. allow only `''` or `'/'` as pathname;
5. lowercase the hostname and remove one trailing dot;
6. preserve non-default ports and IPv6 brackets;
7. map HTTP to WS and HTTPS to WSS;
8. return the exact object asserted above.

Do not derive or emit the stale `BUZZ_MEDIA_SERVER_DOMAIN` variable.

**Step 5: Implement setup merging**

Define:

```typescript
export type StoredSetup = {
  ownerPubkeyHex?: string
  primaryUrl?: string
}
```

`mergeInitialSetup` compares normalized owner keys and normalized primary
origins. It permits only missing-field completion or an exact idempotent retry.
Its replacement errors must explicitly state that owner identity and canonical
URL are immutable in this package version.

**Step 6: Verify green and commit**

Run:

```bash
npx tsx --test tests/public-url.test.ts tests/setup.test.ts
npm run check
git add startos/domain/public-url.ts startos/domain/setup.ts tests/public-url.test.ts tests/setup.test.ts
git commit -m "feat: model immutable relay identity"
```

### Task 7: Persist Stable Install Secrets

**Files:**
- Create: `startos/fileModels/store.json.ts`
- Create: `startos/fileModels/read-store.ts`
- Create: `startos/domain/secrets.ts`
- Create: `startos/domain/state-validation.ts`
- Create: `startos/init/seed-secrets.ts`
- Create: `tests/secrets.test.ts`
- Create: `tests/state-validation.test.ts`

**Step 1: Write the failing secret lifecycle tests**

Test `missingSecretsForInit(kind, current, generate)`:

- `install` fills every missing stable secret;
- `install` sets schema version `1` only when that field is absent;
- `install` preserves every existing value;
- `update`, `restore`, and `null` return no generated values;
- the generator is never called outside a fresh install;
- relay and Git-hook secrets are 64 lowercase hex characters;
- the relay private key is accepted by `nostr-tools.getPublicKey`;
- password/access-key values use only the configured alphanumeric alphabet.

**Step 2: Verify red**

Run:

```bash
npx tsx --test tests/secrets.test.ts
```

Expected: FAIL because the secret module is absent.

**Step 3: Define the store file model**

At `sdk.volumes.startos`, `./store.json`, export two helpers over the same
path:

- `storeJson = FileHelper.json(...)`, used only for writes after a safe read;
- `storeRawText = FileHelper.raw(...)`, used for every read so syntactically
  invalid JSON becomes recovery data instead of an uncaught parser exception.
  Define it exactly as a `RawStoreText` object with `toFile: ({ text }) => text`,
  `fromFile: text => ({ text })`, and a validator that requires
  `{ text: string }`. This wraps even an empty string in a truthy object and
  distinguishes an existing empty file from a missing file despite
  `FileHelperImpl.readOnce` and its watchable treating falsy parsed data as
  missing.

The JSON shape must preserve malformed values for the explicit validator
instead of coercing corruption into an apparently missing setup field. Define
every field as `z.unknown().optional().catch(undefined)`:

```typescript
const shape = z.object({
  schemaVersion: z.unknown().optional().catch(undefined),
  postgresPassword: z.unknown().optional().catch(undefined),
  redisPassword: z.unknown().optional().catch(undefined),
  s3AccessKey: z.unknown().optional().catch(undefined),
  s3SecretKey: z.unknown().optional().catch(undefined),
  relayPrivateKeyHex: z.unknown().optional().catch(undefined),
  gitHookHmacSecretHex: z.unknown().optional().catch(undefined),
  ownerPubkeyHex: z.unknown().optional().catch(undefined),
  primaryUrl: z.unknown().optional().catch(undefined),
  lastMembershipMutationUnixSecond: z.unknown().optional().catch(undefined),
})
```

Do not store derived URLs or duplicate environment variables. Only the domain
validator may narrow this raw model into runtime state. No runtime, init,
action, or backup path may call `storeJson.read()`.

**Step 4: Implement generation**

Use:

- 32 alphanumeric characters for PostgreSQL and Redis passwords;
- 24 alphanumeric characters for the MinIO access key;
- 48 alphanumeric characters for the MinIO secret key;
- `nostr-tools.generateSecretKey()` followed by lowercase hex encoding for the
  relay private key, guaranteeing a valid secp256k1 scalar;
- `randomBytes(32).toString('hex')` for the Git-hook HMAC secret.

Inject the relay-key and random-byte providers into the pure helper so tests
are deterministic. Defer the SDK init adapter until the safe reader exists in
Step 6.

**Step 5: Write the failing stored-state tests**

Test a pure `validateStoredState(raw)` discriminated result:

- `storeRawText.readData('')` returns the truthy `{ text: '' }` wrapper rather
  than `''` or `null`;
- missing text, an existing empty file, truncated JSON, invalid JSON syntax,
  and a non-object JSON root return `needs-state-recovery` without throwing;
- a fully valid record returns `ready` with a typed, normalized state;
- valid secrets with owner and/or URL still absent returns `needs-setup`;
- missing or malformed `schemaVersion` or any stable secret returns
  `needs-state-recovery`;
- a relay key that is zero or outside the secp256k1 scalar range returns
  `needs-state-recovery`;
- a nonempty malformed owner or canonical URL returns
  `needs-state-recovery`, never `needs-setup`;
- valid owner and URL values that are not already in canonical stored form
  return `needs-state-recovery`;
- invalid `lastMembershipMutationUnixSecond` returns
  `needs-state-recovery`;
- the runtime adapter normalizes the post-`.const()` `null` produced for a
  missing file into the same fixed `needs-state-recovery` result;
- a missing file that is then created or repaired causes the reactive adapter
  to reevaluate and return the new ready/setup/recovery projection;
- two ready records differing only in a valid membership timestamp have equal
  runtime projections;
- changing a secret, owner, URL, validation kind, or issue set changes the
  runtime projection;
- issue messages name fields but contain none of their values.

Run:

```bash
npx tsx --test tests/state-validation.test.ts
```

Expected: FAIL because the validator is absent.

**Step 6: Implement explicit validation**

In `read-store.ts`, implement:

```typescript
type StoredStateRead =
  | { kind: 'missing' }
  | { kind: 'parsed'; value: RawStoredState }
  | { kind: 'unreadable'; issue: 'invalid-json' | 'invalid-root' }
```

`parseStoredStateText(rawText)` returns `missing` for `null`, catches
`JSON.parse`, validates the root with the exported raw schema, and returns only
the fixed issue enum, never parser text that could include file content.
`readStoredStateOnce()` reads `storeRawText.read().once()` and passes
`raw?.text ?? null` to `parseStoredStateText`. The optional access is safe
because an existing empty file is `{ text: '' }`, while only a missing file is
`null`. Keep this module independent of the domain validator to avoid a
circular import.

Define:

```typescript
type StateValidation =
  | { kind: 'ready'; state: CompleteStore }
  | { kind: 'needs-setup'; state: StableSecrets }
  | { kind: 'needs-state-recovery'; issues: string[] }

type RuntimeStateValidation =
  | { kind: 'ready'; state: Omit<CompleteStore, 'lastMembershipMutationUnixSecond'> }
  | { kind: 'needs-setup'; state: StableSecrets }
  | { kind: 'needs-state-recovery'; issues: string[] }
```

Accept `StoredStateRead` as validator input. Map `missing` and `unreadable` to
field-name-only recovery issues. For a parsed object, require schema version
`1`; exact alphanumeric lengths for the four generated password/access-key
fields; 64 lowercase hexadecimal characters for both hex secrets; and a
successful `getPublicKey` call for the relay private key.
Normalize a present owner with `normalizeNostrPubkey` and require the stored
value to equal that canonical lowercase hex. Normalize a present primary URL
with `derivePublicConfig` and require its stored value to equal the returned
`primaryUrl`. Treat only JavaScript `undefined` as an unconfigured owner or
URL. Validate the optional membership timestamp as a nonnegative integer.

Return all field-name-only issues together. Never return a partially validated
secret and never log or interpolate a raw value.

Export the pure `projectForRuntime` and `runtimeStateEqual` helpers used by the
reactive reader. A valid timestamp update must not restart main; an invalid
timestamp must still project to recovery and stop the service.

In `state-validation.ts`, make the reactive mapping explicit:

```typescript
const runtimeStateFromText = ({ text }: RawStoreText) =>
  projectForRuntime(validateStoredState(parseStoredStateText(text)))

export async function readRuntimeStateConst(effects: T.Effects) {
  const projected = await storeRawText
    .read(runtimeStateFromText, runtimeStateEqual)
    .const(effects)
  return (
    projected ??
    projectForRuntime(validateStoredState({ kind: 'missing' }))
  )
}
```

Type `runtimeStateEqual` to accept the nullable values required by
`FileHelper.read` and handle `null` explicitly. Preserve the file watch while
the file is missing, empty, or truncated and project valid state without
`lastMembershipMutationUnixSecond`. The projection must include validation
kind/issues and every runtime-affecting schema, secret, owner, and URL field,
but not the valid membership timestamp.

Finally implement the SDK init adapter. It first uses
`readStoredStateOnce`. Only when `kind === 'install'` and the result is
`missing` or `parsed` does it call the generation helper and perform one
`storeJson.merge(effects, patch)`. The patch includes `schemaVersion: 1` and
each generated secret only when that raw field is `undefined`; it preserves
every present malformed value for recovery. If the safe read is `unreadable`,
it performs no write. On every other init kind it only uses the safe reader and
never fills, repairs, or rotates any field.

**Step 7: Verify green**

Run:

```bash
npx tsx --test tests/secrets.test.ts tests/state-validation.test.ts
npm run check
```

Expected: PASS.

**Step 8: Commit**

Run:

```bash
git add startos/fileModels/store.json.ts startos/fileModels/read-store.ts startos/domain/secrets.ts startos/domain/state-validation.ts startos/init/seed-secrets.ts tests/secrets.test.ts tests/state-validation.test.ts
git commit -m "feat: persist stable service secrets"
```

### Task 8: Define Manifest, Version, And Localized Metadata

**Files:**
- Modify: `startos/manifest/index.ts`
- Modify: `startos/manifest/i18n.ts`
- Modify: `startos/versions/current.ts`
- Modify: `startos/versions/index.ts`
- Modify: `startos/i18n/dictionaries/default.ts`
- Modify: `startos/i18n/dictionaries/translations.ts`
- Modify: `startos/main.ts`
- Modify: `startos/backups.ts`
- Create: `tests/manifest.test.ts`

**Step 1: Write a failing manifest test**

Assert:

- id `buzz`, title `Buzz`, license `Apache-2.0`;
- package repo `https://github.com/mdubore/buzz-startos`;
- upstream repo `https://github.com/block/buzz`;
- volumes exactly `startos`, `postgres`, `redis`, `media`, `git-cache`;
- no package dependencies;
- five image references come from `IMAGE_PINS`;
- every image advertises only `x86_64` and `aarch64`;
- version is `0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:0`.

**Step 2: Verify red**

Run:

```bash
npx tsx --test tests/manifest.test.ts
```

Expected: FAIL on generated hello-world placeholders.

**Step 3: Implement the manifest**

Use `setupManifest` with no marketing or donation placeholder. Map image IDs:

```typescript
images: {
  buzz: image(IMAGE_PINS.buzz),
  postgres: image(IMAGE_PINS.postgres),
  redis: image(IMAGE_PINS.redis),
  minio: image(IMAGE_PINS.minio),
  'minio-client': image(IMAGE_PINS.minioClient),
}
```

The small `image` helper returns:

```typescript
{
  source: { dockerTag: packedImageReference(pin) },
  arch: ['x86_64', 'aarch64'],
}
```

The manifest test must import the completed manifest, walk all five
`source.dockerTag` values, and prove that each ends in
`@sha256:<64-lowercase-hex>`. The verifier still resolves each
`tagReference`, so a moved tag fails even though the packer consumes the
immutable tag-plus-digest reference. Do not declare RAM or disk requirements
until Task 17 measures them.

Replace the scaffold's now-invalid `example-image` and `example-volume`
references with compile-safe interim implementations:

```typescript
export const main = sdk.setupMain(async ({ effects }) =>
  sdk.Daemons.of(effects),
)
```

and:

```typescript
export const { createBackup, restoreInit } = sdk.setupBackups(async () =>
  sdk.Backups.ofVolumes('startos'),
)
```

Tasks 11 and 13 replace these interim implementations with the designed
runtime and backup policy. This keeps every intermediate commit type-correct.

**Step 4: Implement version metadata**

Set the current ExVer literal to:

```text
0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:0
```

Use localized release notes in `en_US`, `es_ES`, `de_DE`, `pl_PL`, and
`fr_FR` stating that this is the first StartOS package of an upstream-main
snapshot. Keep `down: IMPOSSIBLE`; the initial `up` migration is empty because
there is no earlier wrapper state.

**Step 5: Implement descriptions and runtime strings**

The short English description is:

```text
A self-hosted workspace relay for people and AI agents
```

The long description must say that Buzz combines Nostr-signed collaboration,
channels, media, workflows, and Git hosting; this package runs the relay
backend; the desktop client provides the full experience, while mobile clients
are still under development.

Provide real translations for all five template locales. Add every user-facing
action, task, interface, and health string introduced in later tasks to the
default integer dictionary and implement the same keys in all translations.
Do not leave `REPLACE_ME` or `{{name}}`.

**Step 6: Verify green**

Run:

```bash
npx tsx --test tests/manifest.test.ts
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
```

Expected: PASS, including compile-time ExVer validation.

**Step 7: Commit**

Run:

```bash
git add startos/manifest startos/versions startos/i18n startos/main.ts startos/backups.ts tests/manifest.test.ts
git commit -m "feat: define Buzz package metadata"
```

### Task 9: Expose One Port And Enforce First-Run Setup

**Files:**
- Create: `startos/constants.ts`
- Modify: `startos/interfaces.ts`
- Modify: `startos/utils.ts`
- Create: `startos/actions/complete-initial-setup.ts`
- Create: `startos/actions/verify-stable-state.ts`
- Create: `startos/actions/verify-canonical-url.ts`
- Create: `startos/actions/connection-information.ts`
- Modify: `startos/actions/index.ts`
- Create: `startos/init/reconcile-blocking-tasks.ts`
- Create: `startos/init/require-setup.ts`
- Modify: `startos/init/index.ts`
- Create: `tests/interface-addresses.test.ts`
- Create: `tests/blocking-state.test.ts`
- Create: `tests/initial-setup-action.test.ts`

**Step 1: Write failing address-selection tests**

Extract a pure helper that selects the `web` interface from a host's bindings
and normalizes `addressInfo.nonLocal.format()` results. Test:

- only `http://` and `https://` root origins survive;
- duplicate normalized origins are removed;
- local bridge-only addresses are excluded by the SDK's `nonLocal` filter;
- an absent host or interface returns `[]`;
- stored canonical URL availability compares normalized origins.

Also test a pure blocking-state selector:

- `needs-state-recovery` selects only the stable-state recovery action;
- `needs-setup` selects only initial setup;
- `ready` with an unavailable canonical URL selects only URL recovery;
- `ready` with the canonical URL present selects no action;
- state recovery takes priority over setup and address symptoms;
- every result identifies the other known replay IDs to clear.

Test the setup action adapter with injected read, origin, and merge functions:

- two conflicting setup calls that enter concurrently are serialized;
- the winner performs one fresh read, origin recheck, and merge;
- the second call reads only after the first merge and is rejected as an
  immutable owner/URL replacement;
- the final store contains the winner's complete pair, never a mix;
- two concurrent identical retries are idempotent and do not overwrite state;
- a failed first call releases the queue.

**Step 2: Verify red**

Run:

```bash
npx tsx --test tests/interface-addresses.test.ts tests/blocking-state.test.ts tests/initial-setup-action.test.ts
```

Expected: FAIL because helpers and constants are absent.

**Step 3: Define ports and IDs**

In `startos/constants.ts` export:

```typescript
export const HOST_ID = 'buzz'
export const WEB_INTERFACE_ID = 'web'
export const RELAY_INTERFACE_ID = 'relay'
export const BUZZ_PORT = 3000
export const BUZZ_HEALTH_PORT = 8080
export const BUZZ_METRICS_PORT = 9102
export const POSTGRES_DB = 'buzz'
export const POSTGRES_USER = 'buzz'
export const POSTGRES_MOUNTPOINT = '/var/lib/postgresql'
export const POSTGRES_DATA_PATH = '/data'
export const S3_BUCKET = 'buzz-media'
export const SETUP_TASK_REPLAY_ID = 'buzz:complete-initial-setup'
export const STATE_RECOVERY_TASK_REPLAY_ID = 'buzz:verify-stable-state'
export const URL_RECOVERY_TASK_REPLAY_ID = 'buzz:verify-canonical-url'
```

**Step 4: Bind and export the interface**

In `startos/interfaces.ts`:

1. create `sdk.MultiHost.of(effects, HOST_ID)`;
2. bind only internal port 3000 with `protocol: 'http'` and
   `preferredExternalPort: 3000`;
3. export a visible `ui` interface `web` with normal HTTP/HTTPS schemes;
4. export a visible, copyable `api` interface `relay` with
   `schemeOverride: { ssl: 'wss', noSsl: 'ws' }`;
5. return one origin receipt containing both interfaces.

Never bind ports 5432, 6379, 9000, 9001, 8080, or 9102.

**Step 5: Implement one-time setup**

The hidden, stopped-only `complete-initial-setup` action has:

- required owner text input with a helpful npub/hex regex;
- a dynamic select populated from current `web` interface origins;
- an empty prefill owner and first available origin;
- handler-level identity and URL validation;
- a result containing the canonical web URL and relay WebSocket URL, never a
  secret.

After normalizing the request, enqueue the mutation on a module-level setup
promise queue. Inside that queued closure, perform the entire authoritative
sequence:

1. call `readStoredStateOnce()` and refuse to continue when JSON, any secret,
   or any nonempty setup field is malformed;
2. read current interface origins and recheck requested-URL availability;
3. call `mergeInitialSetup` against that fresh stored result, rejecting any
   owner or URL replacement;
4. perform exactly one `storeJson.merge` only after every validation succeeds;
5. release the queue in `finally`.

No store read used to authorize a setup write may occur before queue
acquisition. A concurrent loser must observe the winner's committed state and
fail or return an exact idempotent retry; it must never overwrite or combine
two setup requests.

**Step 6: Implement stable-state recovery verification**

Create hidden, stopped-only `verify-stable-state`. It uses
`readStoredStateOnce()` and:

- throws a field-name-only error while schema, stable secrets, owner, URL, or
  membership timestamp is corrupt;
- explains that the operator must restore a known-good StartOS backup or reset
  and reinstall the service;
- succeeds after external restore only when validation is fully `ready` or
  legitimately `needs-setup`;
- on success invokes the shared task reconciler so the next required setup or
  canonical-address task appears immediately;
- performs no write and never displays, regenerates, replaces, or logs a
  secret.

This is deliberately a verification action, not a secret-reset feature.

**Step 7: Implement canonical-address recovery verification**

Create hidden, stopped-only `verify-canonical-url`. It must:

- first require a `ready` stored-state result;
- read the immutable stored primary URL from that typed result;
- compare it with current interface origins;
- throw a clear error while the original URL is unavailable;
- succeed only after the user restores that same StartOS address;
- on success invoke the shared task reconciler to clear the stale URL task;
- never offer or write a replacement URL.

This action is the target of the recovery task after a restore or gateway
change.

**Step 8: Implement connection information**

Create visible `connection-information`, allowed in any status. Return a group
with:

- canonical web URL;
- canonical `ws://` or `wss://` relay URL;
- owner public key in hex.

All are unmasked and copyable. Explain that the full Buzz client is external.
Refuse with a field-name-only error unless stored state validates as `ready`.

**Step 9: Reconcile exactly one critical setup task**

Implement a shared
`reconcileBlockingTasks(effects, stateValidation, origins)` used by both init
and main. It creates at most one critical task and clears the other known
replay IDs:

- corrupt or missing schema/stable secrets, or malformed nonempty setup state,
  creates `verify-stable-state`;
- valid stable state with missing owner or primary URL creates
  `complete-initial-setup`;
- fully configured state with an unavailable primary URL creates
  `verify-canonical-url`;
- valid configured state with its URL available clears all three tasks.

Task reasons must identify the recovery category without including stored
values. `stateValidation` is the result of the safe full or projected reader,
not a direct JSON-model read. `requireSetup` calls
`readRuntimeStateConst(effects)`, reads current origins, and calls this
reconciler on every init kind. It must never turn invalid JSON or a corrupt
present value into a first-run setup field and must never call secret
generation.

Register actions before `requireSetup` in `setupInit`. Keep `restoreInit` first.

**Step 10: Verify and commit**

Run:

```bash
npx tsx --test tests/interface-addresses.test.ts tests/blocking-state.test.ts tests/initial-setup-action.test.ts tests/setup.test.ts tests/public-url.test.ts tests/state-validation.test.ts
npm run check
git add startos/constants.ts startos/interfaces.ts startos/utils.ts startos/actions startos/init tests/interface-addresses.test.ts tests/blocking-state.test.ts tests/initial-setup-action.test.ts
git commit -m "feat: require immutable relay setup"
```

### Task 10: Build The Buzz Runtime Environment

**Files:**
- Create: `startos/runtime/config.ts`
- Create: `tests/runtime-config.test.ts`

**Step 1: Write the failing complete-config test**

Given fixed store values and `https://buzz.example`, assert the exact
environment map contains:

```text
BUZZ_BIND_ADDR=0.0.0.0:3000
BUZZ_HEALTH_PORT=8080
BUZZ_METRICS_PORT=9102
DATABASE_URL=postgres://buzz:<encoded>@127.0.0.1:5432/buzz
REDIS_URL=redis://:<encoded>@127.0.0.1:6379
RELAY_URL=wss://buzz.example
BUZZ_MEDIA_BASE_URL=https://buzz.example/media
BUZZ_CORS_ORIGINS=https://buzz.example
BUZZ_S3_ENDPOINT=http://127.0.0.1:9000
BUZZ_S3_ACCESS_KEY=<stored>
BUZZ_S3_SECRET_KEY=<stored>
BUZZ_S3_BUCKET=buzz-media
BUZZ_S3_REGION=us-east-1
BUZZ_GIT_REPO_PATH=/data/git
BUZZ_AUTO_MIGRATE=false
BUZZ_GIT_CONFORMANCE_PROBE=true
BUZZ_REQUIRE_AUTH_TOKEN=true
BUZZ_REQUIRE_RELAY_MEMBERSHIP=true
BUZZ_ALLOW_NIP_OA_AUTH=true
BUZZ_REQUIRE_MEDIA_GET_AUTH=false
BUZZ_SERVE_GIT_WEB_GUI=true
BUZZ_PUSH_GATEWAY_DELIVERY_URL=
BUZZ_MESH=off
BUZZ_MESH_DEMO_ECHO=off
BUZZ_HUDDLE_AUDIO_AVAILABLE=true
RELAY_OWNER_PUBKEY=<stored hex>
BUZZ_RELAY_PRIVATE_KEY=<stored hex>
BUZZ_GIT_HOOK_HMAC_SECRET=<stored hex>
RUST_LOG=buzz_relay=info,buzz_db=info,buzz_auth=info,buzz_pubsub=info,tower_http=info
```

Assert the map does not contain `BUZZ_RELAY_URL`,
`BUZZ_MEDIA_SERVER_DOMAIN`, `BUZZ_ADMIN_HOST`, or `TYPESENSE_API_KEY`.

**Step 2: Write failing validation-boundary tests**

Remove each required store field in turn, pass the resulting
`StateValidation` to `buildRuntimeConfig`, and assert a field-specific error
without a value. Test URL encoding using passwords containing `@`, `:`, `/`,
and `%` through the exported pure connection-URL helper, even though
`validateStoredState` correctly rejects those values for this package's
generated v1 credentials.

**Step 3: Verify red**

Run:

```bash
npx tsx --test tests/runtime-config.test.ts
```

Expected: FAIL because the module is absent.

**Step 4: Implement minimal runtime config**

Accept either full or runtime-projected `StateValidation`, require `ready`,
and return separate `postgresEnv`, `redisEnv`, `minioEnv`, and `buzzEnv`
objects. Both ready-state variants contain every field needed for configuration;
the runtime variant merely omits the membership timestamp. This prevents
passing Buzz secrets into unrelated sidecars. Export a small pure
connection-URL helper and use `encodeURIComponent`.

Put the Redis password in `redisEnv` as `REDIS_PASSWORD`; do not interpolate it
into an SDK command array. Task 11 expands it inside the Redis container from a
static shell command, so SDK command errors cannot echo the secret.

Set `BUZZ_PUSH_GATEWAY_DELIVERY_URL` to the empty string intentionally. Keep
authenticated media reads false until current clients pass device testing.
Keep the admin host absent.

**Step 5: Verify and commit**

Run:

```bash
npx tsx --test tests/runtime-config.test.ts
npm run check
git add startos/runtime/config.ts tests/runtime-config.test.ts
git commit -m "feat: build private Buzz runtime config"
```

### Task 11: Implement Native Multi-Daemon Startup And Health

**Files:**
- Create: `startos/runtime/mounts.ts`
- Create: `startos/runtime/health.ts`
- Modify: `startos/main.ts`
- Create: `tests/health.test.ts`

**Step 1: Write failing composite-health tests**

Test a pure/injected `checkCompositeHealth`:

- Buzz readiness success plus MinIO liveness success returns `success`;
- either probe failure returns `failure`;
- thrown probe errors return `failure` without exposing credentials;
- both exact URLs are checked:
  `http://127.0.0.1:8080/_readiness` and
  `http://127.0.0.1:9000/minio/health/live`.
- the MinIO dependency-ready URL is separately fixed at
  `http://127.0.0.1:9000/minio/health/ready` and is never substituted into the
  ongoing liveness probe.

**Step 2: Verify red**

Run:

```bash
npx tsx --test tests/health.test.ts
```

Expected: FAIL because `startos/runtime/health.ts` is absent.

**Step 3: Define mounts and subcontainers**

Create one mount builder per stateful service:

- PostgreSQL volume `postgres` at `/var/lib/postgresql`, with no ID map;
- Redis volume `redis` at `/data`, with no ID map;
- MinIO volume `media` at `/data`, with no ID map;
- Buzz volume `git-cache` at `/data/git`, writable, with
  `idmap: [{ fromId: 0, toId: 1000 }]`;
- no mounts for MinIO client.

Document beside the builders why the sidecars have no ID map: the pinned
PostgreSQL, Redis, and MinIO configs start through root entrypoints and
initialize or directly write their declared volumes, while Buzz starts as
UID/GID 1000 and its cache mount begins with StartOS root ownership. Do not
generalize this assumption to future image pins; Task 4 metadata verification
and Task 17 write tests are mandatory before release.

Create five lazy subcontainers with image IDs `buzz`, `postgres`, `redis`,
`minio`, and `minio-client`. Reuse the same Buzz subcontainer for migration
and relay startup.

**Step 4: Add internal daemons in dependency order**

Build `sdk.Daemons.of(effects)` in this exact order:

1. `postgres`
2. `redis`
3. `minio`
4. `create-bucket`
5. `migrate`
6. `buzz`

PostgreSQL:

- `sdk.useEntrypoint(['-c', 'listen_addresses=127.0.0.1'])`;
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and
  `PGDATA=/var/lib/postgresql/data`;
- readiness via `pg_isready -q -h 127.0.0.1 -d buzz -U buzz`;
- `display: null`, 120-second grace period.

Redis:

- run the static command
  `sh -ec 'exec redis-server --bind 127.0.0.1 --appendonly yes
  --requirepass "$REDIS_PASSWORD"'` through the image entrypoint, with the
  password only in the restricted Redis environment;
- readiness via `redis-cli -h 127.0.0.1 ping` with password in
  `REDISCLI_AUTH`, not command arguments;
- `display: null`, 60-second grace period.

MinIO:

- entrypoint args `server /data --address 127.0.0.1:9000
  --console-address 127.0.0.1:9001`;
- root credentials from its restricted env object;
- dependency readiness via
  `curl -fsS http://127.0.0.1:9000/minio/health/ready`;
- `display: null`, 120-second grace period.

Use `/ready` here because this gate releases the bucket one-shot. Keep
`/minio/health/live` only in the ongoing composite health check.

**Step 5: Add idempotent one-shots**

`create-bucket` requires `minio` and gives each `mcSub.execFail` call this
restricted environment:

```text
MC_HOST_local=http://<percent-encoded-access>:<percent-encoded-secret>@127.0.0.1:9000
```

Run sequential, secret-free argument vectors:

```text
mc mb --ignore-existing local/buzz-media
mc anonymous set none local/buzz-media
```

Do not run `mc alias set`, place credentials in argv, construct a shell command,
or include the environment in a caught error. Keeping credentials out of argv
limits exposure through process inspection and future error/reporting changes,
even though SDK 2.0.9's `execFail` currently reports the executable and stderr
rather than the full argument vector.

`migrate` requires `postgres` and `create-bucket`, runs:

```text
buzz-admin migrate
```

with `DATABASE_URL`. This command must pass twice in later smoke testing.

**Step 6: Add the Buzz daemon**

The Buzz daemon:

- uses `sdk.useEntrypoint()` with `buzzEnv`;
- requires `postgres`, `redis`, `minio`, `create-bucket`, and `migrate`;
- has a 180-second grace period for migrations and the S3 conformance probe;
- displays one user-facing `Buzz Relay` health check;
- uses `curl -fsS` in the Buzz image to combine relay readiness and MinIO
  liveness;
- does not report healthy when MinIO fails after startup.

Before building daemons, `main` must call
`readRuntimeStateConst(effects)` and read current web origins with a reactive
`.const(effects)` context, then call the same `reconcileBlockingTasks` used
during init. If validation is not `ready` or the immutable primary URL is
unavailable, create the appropriate critical task and throw before creating
any daemon. When state and address become valid, clear all three known task
replay IDs before building the runtime config.

The host `.const()` must live for the lifetime of main so a gateway/address
change tears down and reevaluates main, recreates the URL-recovery task, and
keeps Buzz stopped. This supplements the cold-start init hook; it is not merely
a one-time startup check. The store projection deliberately ignores valid
membership-timestamp-only writes, so an Add/Remove Member action does not
restart the stack it is administering. Never start an empty tenant under a
replacement host.

**Step 7: Verify and commit**

Run:

```bash
npx tsx --test tests/health.test.ts tests/blocking-state.test.ts tests/state-validation.test.ts
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
git add startos/runtime startos/main.ts tests/health.test.ts
git commit -m "feat: run the native Buzz service stack"
```

### Task 12: Add Serialized Membership Actions

**Files:**
- Create: `startos/domain/membership.ts`
- Create: `startos/actions/membership.ts`
- Create: `startos/actions/add-member.ts`
- Create: `startos/actions/remove-member.ts`
- Create: `startos/actions/list-members.ts`
- Modify: `startos/actions/index.ts`
- Create: `tests/membership.test.ts`

**Step 1: Write failing membership validation tests**

Cover:

- npub and hex inputs normalize before command construction;
- roles are only `member` or `admin`;
- the owner cannot be added or removed;
- add command is
  `['buzz-admin', 'add-member', '--pubkey', hex, '--role', role]`;
- remove command is
  `['buzz-admin', 'remove-member', '--pubkey', hex, '--role', role]`;
- list command is `['buzz-admin', 'list-members']`;
- add/remove environments contain exactly `DATABASE_URL`, `REDIS_URL`,
  `RELAY_URL`, and `BUZZ_RELAY_PRIVATE_KEY`;
- the list environment contains exactly `DATABASE_URL` and `RELAY_URL`;
- commands are arrays and never shell strings.

**Step 2: Write failing serialization tests**

Use an injected clock and sleep function. Start two mutations concurrently and
assert:

- the second command does not begin before the first completes;
- both callers may enter during the same Unix second, but the second caller's
  authoritative stored-state read happens only after the first caller writes
  its attempted-mutation timestamp;
- successful mutations are separated into different Unix seconds;
- a failed first mutation still releases the queue;
- the last attempted mutation second persists across a package-process restart;
- no secret is included in returned action output.

**Step 3: Verify red**

Run:

```bash
npx tsx --test tests/membership.test.ts
```

Expected: FAIL because membership modules are absent.

**Step 4: Implement the shared action runner**

Normalize and validate the requested key/role before enqueueing. The queued
add/remove closure then performs this entire authoritative sequence without
yielding the queue to another mutation:

1. call `readStoredStateOnce()` and require a `ready` result;
2. read `lastMembershipMutationUnixSecond` from that fresh result and wait
   until a later Unix second;
3. build runtime config from the same validated result and project an
   add/remove environment containing exactly `DATABASE_URL`, `REDIS_URL`,
   `RELAY_URL`, and `BUZZ_RELAY_PRIVATE_KEY`;
4. create a temporary Buzz subcontainer with no persistent mounts;
5. execute `buzz-admin` with that four-variable environment through
   `execFail`;
6. write the attempted mutation second before the queued closure finishes,
   including when the command fails;
7. release the module-level promise queue in `finally`.

No state read used for scheduling a mutation may occur before queue
acquisition. This makes the persisted timestamp authoritative for the next
queued caller as well as for the first caller after a package-process restart.

List does not need the mutation delay. It still requires a fresh `ready` state,
but projects an environment containing only `DATABASE_URL` and `RELAY_URL`
before executing `buzz-admin list-members`.

**Step 5: Implement StartOS forms**

Add and remove use:

- required Nostr public key text input;
- role select with `member` and `admin`;
- `allowedStatuses: 'only-running'`;
- user-only access;
- visible actions;
- normalized key in results;
- no database URL, Redis URL, relay private key, or HMAC secret in results.

List is input-free, running-only, and returns `buzz-admin` stdout as a
copyable unmasked value. Its process environment must not include `REDIS_URL`,
`BUZZ_RELAY_PRIVATE_KEY`, or any unrelated daemon secret. Propagate nonzero
exits as action failures.

**Step 6: Verify and commit**

Run:

```bash
npx tsx --test tests/membership.test.ts tests/identity.test.ts
npm run check
git add startos/domain/membership.ts startos/actions tests/membership.test.ts
git commit -m "feat: manage private relay members"
```

### Task 13: Wire Init, Backup, And Restore Policy

**Files:**
- Modify: `startos/backups.ts`
- Modify: `startos/dependencies.ts`
- Modify: `startos/init/index.ts`
- Modify: `startos/index.ts`
- Create: `tests/backup-policy.test.ts`

**Step 1: Write the failing backup-policy test**

Export and assert:

```typescript
assert.deepEqual(BACKUP_VOLUME_IDS, ['startos', 'redis', 'media'])
assert.equal(BACKUP_VOLUME_IDS.includes('postgres'), false)
assert.equal(BACKUP_VOLUME_IDS.includes('git-cache'), false)
```

The test description must explain that PostgreSQL uses a logical dump and
MinIO is authoritative for media and Git objects.

**Step 2: Verify red**

Run:

```bash
npx tsx --test tests/backup-policy.test.ts
```

Expected: FAIL because the policy export is absent.

**Step 3: Implement backups**

Use:

```typescript
sdk.Backups.withPgDump({
  imageId: 'postgres',
  dbVolume: 'postgres',
  mountpoint: POSTGRES_MOUNTPOINT,
  pgdataPath: POSTGRES_DATA_PATH,
  database: POSTGRES_DB,
  user: POSTGRES_USER,
  password: async () => {
    const validation = validateStoredState(await readStoredStateOnce())
    if (validation.kind === 'needs-state-recovery') {
      throw new Error('Stored Buzz state requires recovery before backup')
    }
    return validation.state.postgresPassword
  },
  readyTimeout: 120_000,
})
  .addVolume('startos')
  .addVolume('redis')
  .addVolume('media')
```

Do not add the raw PostgreSQL volume and do not add `git-cache`.
The lazy callback intentionally accepts either `ready` or `needs-setup`
validated state because install-time stable secrets already exist before the
owner and canonical URL are chosen. It must reject malformed state without
printing the stored value.

**Step 4: Finalize init ordering**

Use this exact order:

```typescript
export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  setInterfaces,
  setDependencies,
  actions,
  seedSecrets,
  requireSetup,
)
```

`dependencies.ts` returns `{}`. `startos/index.ts` exports backup, main, init,
uninit, actions, and the built manifest as generated by the scaffold.

**Step 5: Verify and commit**

Run:

```bash
npx tsx --test tests/backup-policy.test.ts
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
git add startos/backups.ts startos/dependencies.ts startos/init/index.ts startos/index.ts tests/backup-policy.test.ts
git commit -m "feat: back up authoritative Buzz state"
```

### Task 14: Replace Scaffold Documentation And Assets

**Files:**
- Modify: `README.md`
- Modify: `instructions.md`
- Modify: `UPDATING.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `LICENSE`
- Modify: `icon.svg`
- Modify: `assets/README.md`
- Create: `assets/signing-pubkey.pem`
- Create: `assets/signing-pubkey.sha256`
- Create: `scripts/verify-s9pk-signer.sh`
- Create: `CONTRIBUTING.md`
- Create: `docs/testing/DEVICE_TEST_MATRIX.md`
- Create: `docs/releases/v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_0.md`

**Step 1: Import pinned upstream-owned assets**

Run:

```bash
curl -fsSLo icon.svg \
  https://raw.githubusercontent.com/block/buzz/dd222a509b156ba52ed3219e895d7bf1cf322c92/desktop/public/buzz.svg
curl -fsSLo LICENSE \
  https://raw.githubusercontent.com/block/buzz/dd222a509b156ba52ed3219e895d7bf1cf322c92/LICENSE
wc -c icon.svg
```

Expected: the icon is valid SVG and below StartOS's 40 KiB limit. Record its
source and Apache-2.0 license in `assets/README.md`.

**Step 2: Publish and verify the package signing identity**

Export only the public half of the stable workspace build key:

```bash
start-cli --id-key-path ../.startos/build.key.pem pubkey \
  > assets/signing-pubkey.pem
openssl pkey -pubin -in assets/signing-pubkey.pem -noout
KEY_DER="$(mktemp)"
openssl pkey -pubin -in assets/signing-pubkey.pem -outform DER > "$KEY_DER"
test "$(wc -c < "$KEY_DER")" -eq 44
printf 'sha256:%s\n' \
  "$(tail -c 32 "$KEY_DER" | sha256sum | cut -d' ' -f1)" \
  > assets/signing-pubkey.sha256
```

The fingerprint is SHA-256 over the raw 32-byte Ed25519 public key, not over
PEM text. Never copy the private key into the repository.

Create `scripts/verify-s9pk-signer.sh` with
`#!/usr/bin/env bash` and `set -euo pipefail`. It accepts one or more `.s9pk`
paths and, for each:

1. validates the committed PEM and derives its 32 raw public-key bytes;
2. confirms the committed fingerprint matches those bytes;
3. confirms the archive begins with S9PK v2 magic bytes `3b3b02`;
4. reads the following 32 signer bytes from the archive header and compares
   them byte-for-byte with the committed public key;
5. runs `start-cli s9pk inspect <archive> commitment`, which verifies the
   archive signature before returning the commitment;
6. prints only
   `OK <archive> signer sha256:<lowercase-hex-fingerprint>`.

Use `openssl`, `dd`, `xxd`, `cmp`, and temporary files; quote all paths and
clean temporary files in a trap. Reject a malformed key, short archive,
wrong magic, signer mismatch, invalid signature, or fingerprint mismatch.

Run:

```bash
chmod 0755 scripts/verify-s9pk-signer.sh
bash -n scripts/verify-s9pk-signer.sh
test "$(cat assets/signing-pubkey.sha256)" = \
  "sha256:$(openssl pkey -pubin -in assets/signing-pubkey.pem \
    -outform DER | tail -c 32 | sha256sum | cut -d' ' -f1)"
git diff --check
```

Expected: the shell parses, the fingerprint matches, and only public material
is staged later. Task 16 exercises the verifier against both real archives.

**Step 3: Write the detailed README**

Use this order and content:

1. centered Buzz icon, `Buzz for StartOS` heading, snapshot warning;
2. `What Buzz Is`: people and AI agents share a Nostr-signed workspace with
   channels, DMs, media, canvases, workflows, search, audit history, and Git;
3. `What This Package Runs`: relay/backend only, external desktop/mobile
   client for the full UI, limited invite/repository browser routes;
4. `StartOS Architecture`: table for Buzz, PostgreSQL, Redis, MinIO, MinIO
   client, exact purpose but no live tags;
5. `Network Model`: one StartOS HTTP/WebSocket binding on port 3000, internal
   ports, Host preservation, user-enabled gateways, no automatic Tor claim;
6. `Sideload`: choose the artifact matching the device architecture, verify
   `SHA256SUMS`, verify the archive against `assets/signing-pubkey.pem` and its
   published fingerprint with `scripts/verify-s9pk-signer.sh`, upload through
   StartOS, install;
7. `First Run`: run Complete Initial Setup, enter owner npub/hex, choose the
   permanent canonical URL, start; distinguish setup, stable-state recovery,
   and canonical-address recovery tasks;
8. `Connect A Buzz Client`: use Connection Information, copy relay URL, add it
   to Buzz desktop/mobile, authenticate as owner/member;
9. `Private Relay Management`: add/remove/list member and admin roles;
10. `Data And Backups`: PostgreSQL metadata/events, MinIO media/Git objects,
    Redis transient AOF, disposable Git cache, included/excluded backup state,
    stable secrets preserved and never regenerated during restore;
11. `Health And Startup`: sidecars, bucket, migration, conformance probe,
    composite relay/MinIO health;
12. `Security And Limitations`: immutable URL, unknown hosts, link-accessible
    media, NIP-42/NIP-98 authentication, no generic API-token requirement,
    NIP-07 requirement for protected browser routes, hosted iOS push disabled,
    admin UI disabled, and no full browser client;
13. `Upstream And Reproducibility`: separate repositories, exact SHA image,
    digest-qualified manifest inputs, tag-drift verification, pinned CI
    actions, link to `UPDATING.md`;
14. `Build And Test`: Node 22.23.1, exact Start CLI 1.1.0 and Buildx 0.35.0
    plus checksums, workspace, exact commands, and why QEMU is unnecessary;
15. `Status`: list completed device matrix facts without implying unrun tests;
16. `AI Quick Reference`: fenced YAML containing package purpose, client
    requirement, public/internal ports, actions, volumes, backup authority,
    canonical URL immutability, privacy caveats, build targets, and provenance
    file paths.

Do not copy the upstream README wholesale. Do not embed a mutable image tag or
package version; link to `startos/image-pins.ts` and
`startos/versions/current.ts`.

**Step 4: Write in-product instructions**

Keep `instructions.md` concise and user-facing:

- complete setup before starting;
- treat the selected URL as permanent;
- copy the relay URL from Connection Information;
- install and configure an external Buzz client;
- manage members from Actions;
- enable StartOS gateway addresses deliberately;
- back up before updates;
- disclose link-accessible media and unavailable iOS push.

Exclude contributor build instructions.

**Step 5: Write the update runbook**

`UPDATING.md` must contain exact commands for:

- fast-forwarding `buzz9`;
- checking ahead/behind counts;
- auditing Dockerfile, relay/admin crates, migrations, Compose, and env;
- waiting for `sha-<7>` publication;
- resolving index and platform digests with Buildx;
- checking Buzz image revision/user/entrypoint;
- reviewing and pinning exact sidecar tags;
- changing ExVer and five-locale release notes;
- running tests, image verification, both builds, archive inspection, and
  device tests;
- using a reviewed PR and never auto-merging upstream.

**Step 6: Write contributor and test guidance**

`CONTRIBUTING.md` defines repository boundaries, Node/SDK versions, TDD, commit
style, verification commands, no-secrets rule, and PR evidence.

`docs/testing/DEVICE_TEST_MATRIX.md` contains unchecked x86_64 and aarch64 rows
for install, setup, HTTP, WebSocket, membership, media, Git, restart, cache
deletion, backup/restore, wrong Host, MinIO health failure, and resource
measurement.

Create the versioned release-notes file with the exact package version,
upstream commit, separate architecture artifact names, sideload-only status,
the expected signing public-key fingerprint and verifier command,
security/backup limitations, and an explicit list of device matrix items that
are still unrun. Task 17 replaces only those status lines for which evidence
was actually collected.

Reduce `TODO.md` to genuine remaining items only. Update `AGENTS.md` and
`CLAUDE.md` with package-specific paths and commands while preserving the
generated StartOS guidance links.

**Step 7: Check for placeholders and commit**

Run:

```bash
rg -n \
  'REPLACE_ME|TODO: match|hello-world|\\{\\{(id|name)\\}\\}' \
  README.md instructions.md UPDATING.md TODO.md AGENTS.md CLAUDE.md \
  CONTRIBUTING.md startos tests scripts assets docs/releases
npm run prettier:check
git diff --check
```

Expected: `rg` finds no scaffold placeholder in package sources or
operator/contributor docs. Plans and immutable upstream audit records are
intentionally outside this gate because they may quote removed template or
upstream names. Scaffold workflows are also deferred because Task 15 replaces
and audits them with workflow-specific guards. A deliberate unchecked device
test in `TODO.md` is allowed but generic template TODOs are not.

Run:

```bash
git add README.md instructions.md UPDATING.md TODO.md AGENTS.md CLAUDE.md LICENSE icon.svg assets scripts/verify-s9pk-signer.sh CONTRIBUTING.md docs/testing docs/releases
git commit -m "docs: explain Buzz for StartOS"
```

### Task 15: Configure CI For Sideload Artifacts

**Files:**
- Create: `.github/workflows/package.yml`
- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/release.yml`
- Delete: `.github/workflows/tagAndRelease.yml`

**Step 1: Pin every third-party action**

Do not pass `DEV_KEY` to a mutable branch, tag-only action, or transitive
workflow. Use only local workflow code plus these reviewed full commits:

| Action | Full commit |
| --- | --- |
| `actions/checkout` v4 | `11d5960a326750d5838078e36cf38b85af677262` |
| `actions/setup-node` v4 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/upload-artifact` v4 | `ea165f8d65b6e75b540449e92b4886f43607fa02` |
| `actions/download-artifact` v4 | `d3f86a106a0bac45b974a628896c90dbdf5c8093` |

Keep the version comments beside the SHAs. Re-review and deliberately update
these pins rather than substituting `@main`, `@master`, or `@vN`.

**Step 2: Implement the local reusable package workflow**

Create `package.yml` with `workflow_call` and a boolean `signed_release`
input. It must not declare or accept a caller-provided signing secret. It has
one verify job and two mutually exclusive matrix jobs:

- `ephemeral-build` runs only when `signed_release` is false and never
  references `secrets.DEV_KEY`;
- `signed-build` runs only when `signed_release` is true, declares
  `environment: release`, and reads `DEV_KEY` only from that protected
  environment after approval.

Both active paths must:

- grant only `contents: read`;
- checkout with the pinned action;
- set up exact Node 22.23.1 with the pinned action;
- install both `squashfs-tools` and `squashfs-tools-ng` plus the other exact
  apt prerequisites, including `openssl` and `xxd`, providing `mksquashfs`,
  `tar2sqfs`, and signer verification;
- download the exact Start CLI 1.1.0 x86_64 binary used in Task 1 and verify
  SHA-256
  `70eff67b6e9a936acd8aaaf787b783819252ecedaa5c74d462e3b15ed4dd843a`;
- install Buildx 0.35.0 only in the unprivileged `verify` job from
  `buildx-v0.35.0.linux-amd64`, verify SHA-256
  `d41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda`,
  and assert `docker buildx version` reports exactly v0.35.0;
- run `npm ci`, `npm test`, `npm run check`, SDK lint, formatting check,
  `npm run build`, `npm run verify:images`, and `git diff --check` in a
  non-matrix `verify` job;
- use the explicit `ubuntu-24.04` runner label for verify, both build paths,
  and the release finalizer;
- run a matrix with exactly `x86` and `arm`, both on `ubuntu-24.04`, after
  verification;
- run `npm ci` and `npm run build` independently in every fresh matrix job
  before invoking Make; the verify job's `javascript/` output is not shared
  with matrix jobs;
- have `ephemeral-build` create an ephemeral identity with
  `start-cli init-key`;
- have `signed-build` fail before building when the environment `DEV_KEY` is
  empty, then use `umask 077` and write it to `~/.startos/id.key.pem` without
  echoing it;
- copy that identity to the workspace `.startos/build.key.pem`;
- run only `make "${{ matrix.target }}"`;
- in `signed-build` only, run
  `./scripts/verify-s9pk-signer.sh <the-single-produced-s9pk>` before upload;
- verify exactly one matching `.s9pk` was produced and print its SHA-256;
- upload separate `buzz-x86` and `buzz-arm` artifacts with the pinned upload
  action, no compression, and a 14-day retention.

Do not use `docker/setup-qemu-action`, `docker/setup-buildx-action`,
`tonistiigi/binfmt`, or a `docker-container` Buildx driver in any job. All five
manifest sources are prebuilt Docker-tag images. Start CLI 1.1.0 packages a
foreign architecture by `docker create --platform`, inspect, and export
without starting its entrypoint, so QEMU is unnecessary. The signed matrix
jobs do not run Buildx at all; only the secret-free verifier uses the
checksum-pinned Buildx client for `imagetools inspect`, with Docker's existing
driver and no separately pulled BuildKit daemon.

In the signed path, pass the secret through a step-level environment variable.
Quote every path and remove key material in an `always()` cleanup step. Do not
call a Start9 reusable workflow: its current implementation contains mutable
transitive action references.

**Step 3: Add build and prerelease callers**

`build.yml` triggers on manual dispatch, pushes to `main`, and non-draft PRs to
`main`. It calls local `./.github/workflows/package.yml` with
`signed_release: false` and passes no secret at all. All ordinary build,
PR, and main-branch artifacts use an ephemeral identity; PR-controlled npm,
Make, and container code must never receive the long-lived package signing
key.

Every checkout step in `build.yml`, `package.yml`, and `release.yml` must use
the pinned action with credential persistence disabled:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
  with:
    persist-credentials: false
```

This is mandatory even in read-only jobs. In `finalize-prerelease`, it prevents
the job's `contents: write` token from being stored in Git configuration where
later verifier or project-controlled steps could use it. Expose the token only
as a step-level `GH_TOKEN` on the final `gh release` step.

`release.yml` triggers only on `v*.*` tags. Its first job is an unprivileged
`preflight` with `contents: read`: check out the tag with the pinned checkout
action, require the matching versioned notes file, and run this concrete guard:

```bash
VERSION="$(
  grep -oP "version:\\s*['\"]\\K[^'\"]+" startos/versions/current.ts
)"
test -n "$VERSION"
EXPECTED_TAG="v${VERSION//:/_}"
test "$GITHUB_REF_NAME" = "$EXPECTED_TAG"
test "$(git rev-parse HEAD)" = "$(git rev-list -n 1 "$GITHUB_REF_NAME")"
test -s "docs/releases/${GITHUB_REF_NAME}.md"
```

This proves that the triggering tag is exactly the current ExVer with `:`
replaced by `_`, that the checked-out source is the tagged commit, and that
reviewed release notes exist before any job can request signing approval.

The local `signed-package` caller job needs `preflight`, calls
`package.yml` with `signed_release: true`, and passes no secret. Its internal
`signed-build` job requests the protected `release` environment and only then
receives that environment's `DEV_KEY`. A `finalize-prerelease` job needs the
signed caller, has `contents: write`, checks out and repeats the guard as
defense in depth, downloads both architecture artifacts with the pinned
download action, installs `openssl` and `xxd`, independently downloads Start
CLI 1.1.0 and verifies its published SHA-256, requires exactly one x86_64 and
one aarch64 `.s9pk`, and verifies both against the committed signing public key
before publishing. Jobs in the reusable workflow do not share their installed
CLI with this fresh finalizer runner.

Configure the pinned download action's destination explicitly so the publish
shell below does not depend on its workspace default:

```yaml
- uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4
  with:
    path: downloads
    pattern: buzz-*
    merge-multiple: false
```

Install the verifier prerequisites in `finalize-prerelease` before inspecting
the downloaded artifacts:

```bash
sudo apt-get update
sudo apt-get install -y openssl xxd
START_CLI_TMP="$(mktemp)"
curl -fL \
  'https://github.com/Start9Labs/start-technologies/releases/download/start-cli/v1.1.0/start-cli_x86_64-linux' \
  -o "$START_CLI_TMP"
printf '%s  %s\n' \
  '70eff67b6e9a936acd8aaaf787b783819252ecedaa5c74d462e3b15ed4dd843a' \
  "$START_CLI_TMP" | sha256sum --check
sudo install -Dm755 "$START_CLI_TMP" /usr/local/bin/start-cli
test "$(start-cli --version)" = 'start-cli 1.1.0'
```

Create or update the GitHub prerelease idempotently:

```bash
ARTIFACT_DIR="$(mktemp -d)"
find downloads -type f -name '*.s9pk' -exec cp '{}' "$ARTIFACT_DIR/" \;
test "$(find "$ARTIFACT_DIR" -maxdepth 1 -name '*.s9pk' | wc -l)" -eq 2
test -s "$ARTIFACT_DIR/buzz_x86_64.s9pk"
test -s "$ARTIFACT_DIR/buzz_aarch64.s9pk"
./scripts/verify-s9pk-signer.sh \
  "$ARTIFACT_DIR/buzz_x86_64.s9pk" \
  "$ARTIFACT_DIR/buzz_aarch64.s9pk"
cp assets/signing-pubkey.pem "$ARTIFACT_DIR/SIGNING-PUBKEY.pem"
cp assets/signing-pubkey.sha256 "$ARTIFACT_DIR/SIGNING-PUBKEY.sha256"
NOTES_FILE="$GITHUB_WORKSPACE/docs/releases/${GITHUB_REF_NAME}.md"
test -s "$NOTES_FILE"
(
  cd "$ARTIFACT_DIR"
  sha256sum ./*.s9pk > SHA256SUMS
)
if gh release view "$GITHUB_REF_NAME" >/dev/null 2>&1; then
  gh release upload "$GITHUB_REF_NAME" \
    "$ARTIFACT_DIR"/*.s9pk \
    "$ARTIFACT_DIR/SHA256SUMS" \
    "$ARTIFACT_DIR/SIGNING-PUBKEY.pem" \
    "$ARTIFACT_DIR/SIGNING-PUBKEY.sha256" \
    --clobber
  gh release edit "$GITHUB_REF_NAME" \
    --prerelease --notes-file "$NOTES_FILE"
else
  gh release create "$GITHUB_REF_NAME" \
    "$ARTIFACT_DIR"/*.s9pk \
    "$ARTIFACT_DIR/SHA256SUMS" \
    "$ARTIFACT_DIR/SIGNING-PUBKEY.pem" \
    "$ARTIFACT_DIR/SIGNING-PUBKEY.sha256" \
    --verify-tag --prerelease --notes-file "$NOTES_FILE"
fi
```

Set both `GH_TOKEN: ${{ github.token }}` and
`GH_REPO: ${{ github.repository }}` on the step that calls `gh`, making the
target repository explicit even though the version guard checked out the tag.
Configure no registry or S3 publication.

Delete `tagAndRelease.yml`; its reference-registry guard is inappropriate for
the sideload-only first release.

**Step 4: Lint workflow syntax and trust boundaries**

Run:

```bash
git diff --check
if rg -n 'branches:.*master|hello-world|REFERENCE_REGISTRY' .github/workflows; then
  exit 1
fi
if rg -n 'uses:.*Start9Labs/start-technologies|uses:.*@(master|main|v[0-9]+)([[:space:]]|$)' .github/workflows; then
  exit 1
fi
if rg -n 'setup-qemu|setup-buildx|tonistiigi/binfmt|moby/buildkit|driver:.*docker-container' .github/workflows; then
  exit 1
fi
mapfile -t CHECKOUTS < <(
  rg -n 'uses: actions/checkout@' .github/workflows/*.yml
)
test "${#CHECKOUTS[@]}" -gt 0
for checkout in "${CHECKOUTS[@]}"; do
  reference="$(
    printf '%s\n' "$checkout" |
      sed -E 's/^.*uses:[[:space:]]*([^[:space:]#]+)([[:space:]]+#.*)?$/\1/'
  )"
  if test "$reference" != \
    'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'; then
    printf 'unreviewed checkout reference: %s\n' "$checkout" >&2
    exit 1
  fi
  file="${checkout%%:*}"
  rest="${checkout#*:}"
  line="${rest%%:*}"
  if ! sed -n "$((line + 1)),$((line + 4))p" "$file" |
    rg -q 'persist-credentials: false'; then
    printf 'checkout persists credentials: %s\n' "$checkout" >&2
    exit 1
  fi
done
```

Expected: all three searches find no mutable helper, privileged emulator, or
marketplace workflow reference, and every checkout disables credential
persistence.
Every external `uses:` entry ends in one of the reviewed 40-character SHAs;
the only unpinned workflow call is the repository-local
`./.github/workflows/package.yml`.

If `actionlint` is available, run:

```bash
actionlint
```

Expected: no errors.

**Step 5: Commit**

Run:

```bash
git add .github/workflows
git commit -m "ci: build sideload packages for both architectures"
```

### Task 16: Run The Complete Static And Package Build Gates

**Files:**
- Modify only if a verification failure requires a scoped fix.
- Generate ignored artifact: `buzz_x86_64.s9pk`
- Generate ignored artifact: `buzz_aarch64.s9pk`
- Generate ignored artifact: `SHA256SUMS`

**Step 1: Run clean dependency and source gates**

Run:

```bash
npm ci
npm test
npm run check
npm run prettier:check
node node_modules/@start9labs/start-sdk/lint.mjs
npm run build
npm run verify:images
git diff --check
```

Expected: every command exits zero. Fix the root cause and commit it before
continuing; do not weaken a check.

**Step 2: Build both architecture-specific packages**

Run as separate commands:

```bash
make clean
npm ci
npm run build
make x86
make arm
```

SDK 2.0.9's `clean` target removes both `node_modules` and the compiled
`javascript/` tree. The intervening `npm ci` restores the included `s9pk.mk`,
and `npm run build` regenerates `javascript/index.js` before Make asks
`start-cli` to list package ingredients.

Expected:

```text
buzz_x86_64.s9pk
buzz_aarch64.s9pk
```

Do not use `make universal`.

**Step 3: Inspect both archives**

Run:

```bash
./scripts/verify-s9pk-signer.sh \
  buzz_x86_64.s9pk \
  buzz_aarch64.s9pk
start-cli s9pk inspect buzz_x86_64.s9pk manifest
start-cli s9pk inspect buzz_x86_64.s9pk commitment
start-cli s9pk inspect buzz_aarch64.s9pk manifest
start-cli s9pk inspect buzz_aarch64.s9pk commitment
```

Expected for both manifests:

- id `buzz`;
- selected ExVer;
- correct architecture;
- five images;
- only volume/interface declarations designed above;
- non-null Git hash matching the package commit;
- signer bytes matching `assets/signing-pubkey.pem` and its reviewed
  fingerprint;
- valid commitment/signature output.

**Step 4: Generate and verify checksums**

Run:

```bash
sha256sum buzz_x86_64.s9pk buzz_aarch64.s9pk > SHA256SUMS
sha256sum --check SHA256SUMS
ls -lh buzz_x86_64.s9pk buzz_aarch64.s9pk SHA256SUMS
```

Expected: both entries report `OK`. Record sizes and hashes in the execution
report, not in README.

**Step 5: Confirm repository cleanliness**

Run:

```bash
git status --short --branch
git log --oneline --decorate -15
```

Expected: no tracked changes. Ignored artifacts do not appear.

There is no commit for a clean verification task. Commit only scoped fixes
made in response to a failing gate.

### Task 17: Sideload And Exercise The Real Service

**Files:**
- Modify: `docs/testing/DEVICE_TEST_MATRIX.md`
- Modify: `docs/releases/v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_0.md`
- Modify only after measurement: `startos/manifest/index.ts`
- Modify only after measurement: localized release notes if behavior changed

**Step 1: Configure a StartOS 0.4.0 host**

Set a named host in the parent `.startos/config.yaml`, then:

```bash
cd /home/missydog/Desktop/Learnding/Tools/Buzz
start-cli -H default auth login
```

Alternatively sideload through the StartOS web UI. Never commit the host URL or
credentials.

**Step 2: Test the matching architecture**

For an x86_64 host:

```bash
cd /home/missydog/Desktop/Learnding/Tools/Buzz/buzz-startos
make x86 install
```

For an aarch64 host:

```bash
cd /home/missydog/Desktop/Learnding/Tools/Buzz/buzz-startos
make arm install
```

Expected: StartOS accepts the package signature and presents a critical
Complete Initial Setup task before allowing the service to start.

**Step 3: Verify setup and network behavior**

On each architecture:

1. enter owner as npub and confirm stored/displayed hex is correct;
2. select one current interface origin;
3. confirm setup cannot change owner or canonical URL;
4. start the service and wait through sidecar, bucket, migration, and Git S3
   conformance initialization;
5. confirm browser HTTP works for intended limited routes;
6. confirm WebSocket upgrade works through the same binding;
7. send the wrong `Host` header and confirm WS, REST, and media return 404;
8. confirm Connection Information reports the selected canonical URL only.
9. while Buzz is running, disable the selected StartOS address and confirm the
   reactive main watcher stops the daemons and creates the canonical-URL
   recovery task without a package reboot;
10. restore that exact address, run the verification action, and confirm the
    original tenant resumes with the stale task cleared.

Capture package logs around startup without capturing secret environment
values.

**Step 4: Verify private membership**

With current Buzz desktop/mobile and two test Nostr identities:

1. owner connects successfully;
2. an unlisted identity is denied;
3. Add Member with npub succeeds;
4. the member reconnects successfully;
5. List Members shows the expected role;
6. Remove Member succeeds;
7. the removed identity is denied after reconnect;
8. two deliberately concurrent mutations are serialized without roster-event
   collision;
9. adding/removing the owner is rejected.

**Step 5: Verify persistence authority**

Create representative chat/event, media, and Git state. Then:

1. prove PostgreSQL initialized and can commit a test event without a
   permission error;
2. prove Redis created and appended its AOF, then remains writable after a
   restart;
3. prove MinIO created `buzz-media`, stores a real object, and remains writable
   after a restart;
4. prove the unprivileged Buzz process creates files under `/data/git`;
5. use StartOS development inspection to record host-side and in-container
   numeric ownership for all four mounts on each architecture, without
   displaying credentials;
6. restart the package and verify chat/event, media, and Git state;
7. push and clone a real Git repository through Buzz;
8. clear only `git-cache` using a StartOS development shell or equivalent
   maintenance access;
9. restart and clone again, proving MinIO plus PostgreSQL are authoritative;
10. upload a media object and retrieve it from its link;
11. confirm an unauthenticated media GET matches the documented
   link-accessible limitation.

Any `permission denied`, unexpected UID/GID translation, or read-only mount is
a release blocker. Update the Task 11 ID-map design from evidence; do not work
around it with a privileged Buzz process or world-writable permissions.

**Step 6: Verify health failure behavior**

Stop or make each internal service unavailable in a controlled test:

- PostgreSQL failure makes Buzz readiness fail;
- Redis failure makes Buzz readiness fail;
- MinIO failure makes composite StartOS health fail even though Buzz's native
  readiness omits MinIO;
- bucket-init or migration failure prevents Buzz startup;
- restoring the dependency restores health without rotating secrets.

**Step 7: Verify backup and restore**

Stop the service, create a StartOS backup, remove/replace the service state,
then restore. Verify:

- owner and relay signing identity are unchanged;
- member roster is unchanged;
- events, media, and Git clone are intact;
- Redis continuity is restored but not treated as event authority;
- empty/rebuilt Git cache does not lose repositories;
- unavailable original canonical URL creates the blocking recovery task and
  cannot be replaced by a new URL.

With that known-good backup available, perform a separate corruption drill:
stop the package and first truncate `store.json` into invalid JSON, then repeat
with one syntactically valid malformed secret or owner/URL field. In both
cases, confirm `verify-stable-state` is the only critical task and the reactive
raw-text reader notices a repaired file. Confirm its action reports field names
only, does not rotate any other secret, and the service cannot be forced
through normal setup. Restore the backup and confirm the relay public key and
tenant state return unchanged.

**Step 8: Measure resources**

Measure idle startup peak, post-start idle, representative active memory, and
disk growth on both architectures. Add a manifest RAM requirement only if the
measurements justify a defensible minimum. Never guess.

**Step 9: Record evidence**

Update every matrix cell with:

- StartOS exact version;
- device architecture/model;
- candidate package Git commit and candidate archive SHA-256;
- pass/fail/block status;
- concise evidence or issue link.

If one architecture is unavailable, leave it explicitly `NOT RUN`; do not
infer it from the successful package build.

Update the versioned release-notes status from the same evidence. Name every
remaining `NOT RUN` architecture or scenario explicitly; do not replace the
reviewed snapshot, security, backup, or limitation text.

Label these as comprehensive candidate tests. The evidence commit that follows
changes the package tree, so these candidate hashes are not the final release
hashes. Task 18 rebuilds the final commit and performs a separate smoke test
against the exact downloaded prerelease assets without another tracked edit.

**Step 10: Re-run affected gates and commit**

Run:

```bash
npm test
npm run check
git diff --check
git add docs/testing/DEVICE_TEST_MATRIX.md docs/releases/v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_0.md startos/manifest/index.ts startos/versions/current.ts
git commit -m "test: record StartOS device verification"
```

Only stage files actually changed.

Do not publish the Task 17 candidate archives. This evidence commit invalidates
them as final-tree artifacts even when the only changes are documentation.

### Task 18: Publish The Package Repository And Snapshot Artifacts

**Files:**
- No source file should change unless release verification finds a defect.
- Publish remotely: `mdubore/buzz-startos`
- Publish release assets: both `.s9pk` files, checksums, public signer identity,
  and final verification evidence

**Step 1: Review the completed branch**

Invoke `@superpowers:requesting-code-review`. Resolve all correctness,
security, backup, migration, and documentation findings. Re-run Task 16 after
the final code commit.

**Step 2: Create or attach the GitHub repository**

Check first:

```bash
gh repo view mdubore/buzz-startos
git remote -v
```

If it does not exist:

```bash
gh repo create mdubore/buzz-startos --public --source=. --remote=origin
```

If it exists, add the exact remote URL without replacing an unrelated remote.
Then:

```bash
git push -u origin main
```

Expected: GitHub `main` matches the reviewed local branch.

**Step 3: Configure CI signing**

Create a protected `release` environment before storing the key. Configure:

- one required reviewer with at least read access;
- `Prevent self-review` off when `mdubore` is the only eligible reviewer, so
  the tag-triggered run still has a deliberate manual approval gate;
- deployment branches and tags set to `Selected branches and tags`;
- one tag rule, `v*.*`, and no branch rule.

Use repository Settings -> Environments -> `release`, or configure the same
policy with the deployment-environments and deployment-branch-policies REST
APIs. Confirm the environment reports a required-reviewer rule and a custom
tag policy before adding the secret.

From the package repository, store and verify only the environment secret:

```bash
gh secret set DEV_KEY --env release < ../.startos/build.key.pem
gh secret list --env release
gh secret list
```

Expected: `DEV_KEY` appears in the `release` environment list and does not
appear in the repository-level list; its value is never printed. Do not
configure a repository- or organization-level `DEV_KEY`, and do not configure
registry or S3 publication variables for the sideload-only release.

**Step 4: Verify the build workflow**

Run or dispatch the Build workflow and inspect both artifacts:

```bash
gh workflow run Build
gh run list --workflow Build --limit 3
```

Wait for completion. Download the run artifacts, compare their manifests and
packed file trees with local output, and record any architecture runner gap.
Do not expect whole-archive hashes to match: ordinary CI intentionally uses an
ephemeral signing identity, so its signatures differ from local release-key
builds.

**Step 5: Gate the release**

Do not tag while a required static/build gate fails. If an architecture device
test is unavailable, the release must remain an explicit prerelease and its
notes must name the untested matrix item. Never call it production-ready.

**Step 6: Create the ExVer-derived tag**

StartOS release tags replace the ExVer colon with an underscore:

```bash
git tag -a v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_0 \
  -m "Buzz relay main snapshot dd222a5 for StartOS"
git push origin v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_0
```

Expected: `release.yml` creates a GitHub prerelease containing separate x86_64
and aarch64 S9PK assets plus SHA-256 checksums, with no registry publication.

**Step 7: Download and verify the exact published artifacts**

Wait for the release workflow and its protected-environment approval to
complete. Download the release assets to a directory outside the repository:

```bash
TAG=v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_0
RELEASE_DIR="$(mktemp -d)"
printf 'Release verification directory: %s\n' "$RELEASE_DIR"
gh release download "$TAG" \
  --dir "$RELEASE_DIR" \
  --pattern '*.s9pk' \
  --pattern 'SHA256SUMS' \
  --pattern 'SIGNING-PUBKEY.pem' \
  --pattern 'SIGNING-PUBKEY.sha256'
test "$(find "$RELEASE_DIR" -maxdepth 1 -name '*.s9pk' | wc -l)" -eq 2
test -s "$RELEASE_DIR/buzz_x86_64.s9pk"
test -s "$RELEASE_DIR/buzz_aarch64.s9pk"
cmp assets/signing-pubkey.pem "$RELEASE_DIR/SIGNING-PUBKEY.pem"
cmp assets/signing-pubkey.sha256 "$RELEASE_DIR/SIGNING-PUBKEY.sha256"
(
  cd "$RELEASE_DIR"
  sha256sum --check SHA256SUMS
)
./scripts/verify-s9pk-signer.sh \
  "$RELEASE_DIR/buzz_x86_64.s9pk" \
  "$RELEASE_DIR/buzz_aarch64.s9pk"
TAG_COMMIT="$(git rev-list -n 1 "$TAG")"
test "$(start-cli s9pk inspect "$RELEASE_DIR/buzz_x86_64.s9pk" manifest |
  jq -r .gitHash)" = "$TAG_COMMIT"
test "$(start-cli s9pk inspect "$RELEASE_DIR/buzz_aarch64.s9pk" manifest |
  jq -r .gitHash)" = "$TAG_COMMIT"
```

Expected: checksums, the committed/downloaded public identity, raw signer
bytes, cryptographic signatures, and embedded Git hashes all match the tag.
These downloaded files, not the earlier Task 17 candidates or ordinary
ephemeral-key CI artifacts, are the release-verification subjects.

**Step 8: Sideload-smoke the exact published artifacts**

On a clean or disposable StartOS 0.4.0 host of each available architecture,
install the exact path downloaded in Step 7:

```bash
start-cli -H final-x86 package install \
  --sideload "$RELEASE_DIR/buzz_x86_64.s9pk"
start-cli -H final-arm package install \
  --sideload "$RELEASE_DIR/buzz_aarch64.s9pk"
```

Run only the command matching each host. On each host:

1. confirm StartOS displays the expected package signer and ExVer;
2. complete setup with disposable owner/address values;
3. start the service and wait for composite health;
4. confirm HTTP and WebSocket access through the canonical address;
5. authenticate one client and run List Members;
6. stop and restart once, confirming the same owner, URL, and relay identity.

Record the downloaded archive SHA-256, tag commit, signer fingerprint, exact
StartOS version, device model/architecture, and pass/fail result outside the
Git tree. If an architecture is unavailable, record `NOT RUN`; do not
substitute the Task 17 candidate hash and do not promote the prerelease.

**Step 9: Attach final release evidence**

Create `PUBLISHED-ARTIFACT-VERIFICATION.md` inside `RELEASE_DIR`, not the
repository. Include the exact values and results from Steps 7-8, with no host
credentials or service secrets. Upload it and use a temporary copy of the
versioned notes to append the same concise final-artifact status:

```bash
gh release upload "$TAG" \
  "$RELEASE_DIR/PUBLISHED-ARTIFACT-VERIFICATION.md" --clobber
gh release edit "$TAG" --prerelease \
  --notes-file "$RELEASE_DIR/FINAL-RELEASE-NOTES.md"
```

`FINAL-RELEASE-NOTES.md` starts as an exact copy of
`docs/releases/${TAG}.md` and adds only the published-artifact verification
summary. This external evidence step must not modify or commit any tracked
file. If the release workflow is rerun, repeat Steps 7-9 against the replaced
assets.

Using `@publishing-github-releases`, finally verify:

- tag points to the reviewed commit;
- release is marked prerelease;
- both architecture assets and both public-signer files exist and are nonempty;
- checksums validate after the fresh download;
- signer identity and signatures validate for both archives;
- release notes and the evidence asset identify the exact upstream Buzz
  commit, final artifact hashes, and exact/not-run device-smoke status;
- no signing key, database credential, MinIO credential, or runtime secret is
  present.

**Step 10: Final repository verification**

Run:

```bash
git fetch origin
git status --short --branch
git rev-list --left-right --count main...origin/main
git -C ../buzz9 fetch origin main
git -C ../buzz9 fetch upstream main
git -C ../buzz9 rev-list --left-right --count origin/main...upstream/main
```

Expected: package count `0 0`, source-mirror count `0 0` unless upstream moved
after the selected release. A later upstream commit starts a new reviewed
update; it does not invalidate the immutable released snapshot.

## Final Acceptance Checklist

- `buzz9` contains only upstream history and is fast-forward synchronized.
- `buzz-startos` uses the generated SDK 2.0.9 package structure.
- All five manifest image sources are tag-plus-index-digest references; their
  human tags, indexes, platform manifests, users, entrypoints, and volume
  metadata pass live verification.
- Node tests, TypeScript, formatting, SDK lint, NCC build, and image checks pass.
- Only port 3000 is exported; internal state services remain loopback-only.
- Owner, canonical URL, and all stable secrets survive restart and restore.
- Missing or malformed stable state creates a distinct blocking recovery task
  and never triggers secret regeneration.
- Canonical URL changes are rejected rather than creating an empty tenant.
- A live StartOS address change reactively stops Buzz and recreates the
  canonical-URL task until the same address returns.
- Membership actions use exact upstream CLI syntax and serialize mutations.
- PostgreSQL, Redis, MinIO, bucket init, migrations, and Buzz start in order.
- Composite service health fails when either Buzz readiness or MinIO liveness
  fails.
- PostgreSQL dump, MinIO data, wrapper state, and Redis AOF are backed up;
  disposable Git cache is not.
- The detailed README and in-product instructions accurately disclose external
  client use, link-accessible media, disabled iOS push, disabled admin UI, and
  gateway behavior.
- Separate signed x86_64 and aarch64 `.s9pk` archives inspect successfully and
  have verified SHA-256 checksums.
- Both release archives match the reviewed Ed25519 signing public key and
  fingerprint; their exact downloaded bytes receive an architecture-matched
  final sideload smoke or an explicit `NOT RUN`.
- CI uses only local workflow logic and full-commit third-party action pins
  before receiving the package signing key.
- Signed runners use no QEMU, mutable binfmt image, setup-buildx action, or
  separately pulled BuildKit daemon; OCI inspection uses the checksum-pinned
  Buildx client only in the secret-free verifier.
- `DEV_KEY` exists only in the protected `release` environment, whose required
  reviewer and `v*.*` tag-only policy are verified before tagging.
- Every unavailable device test is reported as unrun rather than inferred.
