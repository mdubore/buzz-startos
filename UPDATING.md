# Updating The Upstream Snapshot

Buzz application source and StartOS packaging have separate histories:

- `../buzz9` mirrors `block/buzz` with no StartOS commits.
- this repository contains only packaging, tests, assets, and documentation.

Never auto-merge an upstream commit into a release. Every selected snapshot
requires a runtime-contract review, immutable image pins, both package builds,
and a reviewed pull request.

## 1. Fast-Forward The Source Mirror

Run from the `buzz-startos` package root. The expected `buzz9` remotes are:

```text
origin   https://github.com/mdubore/buzz9.git
upstream https://github.com/block/buzz.git
```

Read the currently packaged commit before entering or changing the source
mirror. Then fetch both remotes, prove that the package baseline and fork are
ancestors of upstream, incorporate only a fast-forward from `origin`, and
accept only an upstream fast-forward:

```bash
(
  set -euo pipefail

  test -f startos/image-pins.ts
  test -z "$(git status --porcelain -- startos/image-pins.ts)"
  old_sha="$(
    sed -nE "s/^  commit: '([0-9a-f]{40})',$/\1/p" startos/image-pins.ts
  )"
  [[ "$old_sha" =~ ^[0-9a-f]{40}$ ]]
  printf 'package baseline=%s\n' "$old_sha"

  cd ../buzz9
  test -z "$(git status --porcelain)"
  test "$(git remote get-url --all origin)" = "https://github.com/mdubore/buzz9.git"
  test "$(
    git remote get-url --push --all origin
  )" = "https://github.com/mdubore/buzz9.git"
  test "$(git remote get-url --all upstream)" = "https://github.com/block/buzz.git"
  git status --short --branch
  git remote -v
  git fetch --prune origin main
  git fetch --prune upstream main
  git cat-file -e "$old_sha^{commit}"
  git merge-base --is-ancestor "$old_sha" upstream/main
  git switch main
  git pull --ff-only origin main

  git merge-base --is-ancestor origin/main upstream/main
  read -r ahead behind < <(
    git rev-list --left-right --count main...upstream/main
  )
  printf 'main ahead=%s behind=%s\n' "$ahead" "$behind"
  test "$ahead" -eq 0

  git merge --ff-only upstream/main
  new_sha="$(git rev-parse HEAD)"
  [[ "$new_sha" =~ ^[0-9a-f]{40}$ ]]
  test "$old_sha" != "$new_sha"
  git merge-base --is-ancestor "$old_sha" "$new_sha"

  git push origin main
  git fetch --prune origin main
  test "$(git rev-parse origin/main)" = "$new_sha"
  test "$(git rev-parse upstream/main)" = "$new_sha"
  read -r origin_ahead upstream_ahead < <(
    git rev-list --left-right --count origin/main...upstream/main
  )
  test "$origin_ahead" -eq 0
  test "$upstream_ahead" -eq 0
  test -z "$(git status --porcelain)"
  git status --short --branch
)
```

If `ahead` is nonzero, the mirror contains downstream commits. Stop and review
the history; do not force-push, rebase published commits, or merge around the
condition.

## 2. Audit The Runtime Contract

Review the complete range before touching package pins:

```bash
(
  set -euo pipefail

  test -f startos/image-pins.ts
  test -z "$(git status --porcelain -- startos/image-pins.ts)"
  old_sha="$(
    sed -nE "s/^  commit: '([0-9a-f]{40})',$/\1/p" startos/image-pins.ts
  )"
  new_sha="$(git -C ../buzz9 rev-parse HEAD)"
  [[ "$old_sha" =~ ^[0-9a-f]{40}$ ]]
  [[ "$new_sha" =~ ^[0-9a-f]{40}$ ]]

  cd ../buzz9
  git cat-file -e "$old_sha^{commit}"
  git merge-base --is-ancestor "$old_sha" "$new_sha"
  git log --oneline --decorate "$old_sha..$new_sha"
  git diff --stat "$old_sha..$new_sha"
  git diff --name-status "$old_sha..$new_sha"
  git diff "$old_sha..$new_sha" -- \
    Dockerfile \
    crates/buzz-relay \
    crates/buzz-pair-relay \
    crates/buzz-admin \
    crates/buzz-db \
    crates/buzz-media \
    migrations \
    deploy/compose \
    docker-compose.yml \
    .env.example \
    Cargo.lock
)
```

Audit at least:

- image user, entrypoint, installed binaries, health tools, and exposed ports;
- relay, `buzz-pair-relay`, and `buzz-admin` commands, arguments, required
  environment, binding behavior, and exit behavior;
- migrations, automatic-migration behavior, and PostgreSQL compatibility;
- Compose sidecars, versions, volumes, ownership, ports, and startup order;
- every new, removed, renamed, or default-changed environment variable;
- authentication, membership, media-read, Git, admin, browser, push, and
  canonical-host behavior;
- new persistent paths, backup authorities, health endpoints, and resource
  needs.

Write a new immutable record under `docs/upstream/` for the selected short SHA.
Do not edit an older snapshot record to describe a newer image.

## 3. Wait For The SHA Image

Upstream publishes `ghcr.io/block/buzz:sha-<7-character-sha>`. Do not substitute
`main`, `latest`, or another mutable tag.

```bash
(
  set -euo pipefail

  new_sha="$(git -C ../buzz9 rev-parse HEAD)"
  [[ "$new_sha" =~ ^[0-9a-f]{40}$ ]]
  buzz_ref="ghcr.io/block/buzz:sha-${new_sha:0:7}"

  published=false
  for _ in $(seq 1 60); do
    if docker buildx imagetools inspect "$buzz_ref" >/dev/null 2>&1; then
      published=true
      break
    fi
    sleep 30
  done
  test "$published" = true
)
```

If publication does not complete in the bounded wait, stop. Do not package a
different commit's image.

## 4. Resolve Immutable Digests

Resolve the OCI index plus the two native runtime manifests:

```bash
(
  set -euo pipefail

  new_sha="$(git -C ../buzz9 rev-parse HEAD)"
  [[ "$new_sha" =~ ^[0-9a-f]{40}$ ]]
  buzz_ref="ghcr.io/block/buzz:sha-${new_sha:0:7}"
  index_digest="$(
    docker buildx imagetools inspect "$buzz_ref" |
      awk '$1 == "Digest:" { print $2; exit }'
  )"
  raw_index="$(docker buildx imagetools inspect "$buzz_ref" --raw)"
  amd64_digest="$(
    printf '%s' "$raw_index" |
      jq -er '.manifests[]
        | select(.platform.os == "linux" and .platform.architecture == "amd64")
        | .digest'
  )"
  arm64_digest="$(
    printf '%s' "$raw_index" |
      jq -er '.manifests[]
        | select(.platform.os == "linux" and .platform.architecture == "arm64")
        | .digest'
  )"

  [[ "$index_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$amd64_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$arm64_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  test "$amd64_digest" != "$arm64_digest"
  printf 'index=%s\namd64=%s\narm64=%s\n' \
    "$index_digest" "$amd64_digest" "$arm64_digest"
)
```

Ignore `unknown/unknown` provenance attestations when selecting runtime
manifests.

## 5. Verify Image Metadata

Inspect both native image configs without executing either architecture:

```bash
(
  set -euo pipefail

  new_sha="$(git -C ../buzz9 rev-parse HEAD)"
  [[ "$new_sha" =~ ^[0-9a-f]{40}$ ]]
  buzz_ref="ghcr.io/block/buzz:sha-${new_sha:0:7}"
  raw_index="$(docker buildx imagetools inspect "$buzz_ref" --raw)"
  amd64_digest="$(
    printf '%s' "$raw_index" |
      jq -er '.manifests[]
        | select(.platform.os == "linux" and .platform.architecture == "amd64")
        | .digest'
  )"
  arm64_digest="$(
    printf '%s' "$raw_index" |
      jq -er '.manifests[]
        | select(.platform.os == "linux" and .platform.architecture == "arm64")
        | .digest'
  )"
  [[ "$amd64_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$arm64_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  test "$amd64_digest" != "$arm64_digest"

  for platform_digest in \
    "linux/amd64@$amd64_digest" \
    "linux/arm64@$arm64_digest"; do
    platform="${platform_digest%@*}"
    digest="${platform_digest#*@}"
    image="ghcr.io/block/buzz@$digest"
    docker pull --platform "$platform" "$image"

    test "$(
      docker image inspect "$image" \
        --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
    )" = "$new_sha"
    test "$(
      docker image inspect "$image" --format '{{ .Config.User }}'
    )" = "buzz:buzz"
    test "$(
      docker image inspect "$image" --format '{{ json .Config.Entrypoint }}'
    )" = '["/usr/local/bin/buzz-relay"]'
  done
)
```

Also inspect the filesystem on each platform for `curl`, `buzz-relay`,
`buzz-pair-relay`, and `buzz-admin`, and rerun the four packaged CLI help
commands:

```text
buzz-admin migrate --help
buzz-admin add-member --help
buzz-admin remove-member --help
buzz-admin list-members --help
```

Update the Buzz entry in `startos/image-pins.ts` only after every check agrees
with the selected source commit.

## 6. Review Every Sidecar Pin

Review PostgreSQL, Redis, MinIO, and MinIO client release notes and registries.
Choose exact, non-floating tags that publish native linux/amd64 and linux/arm64
manifests. For each selected tag:

```bash
(
  set -euo pipefail

  tag='<exact-tag>'
  docker buildx imagetools inspect "$tag"
  raw_index="$(docker buildx imagetools inspect "$tag" --raw)"
  amd64_digest="$(
    printf '%s' "$raw_index" |
      jq -er '.manifests[]
        | select(.platform.os == "linux" and .platform.architecture == "amd64")
        | .digest'
  )"
  arm64_digest="$(
    printf '%s' "$raw_index" |
      jq -er '.manifests[]
        | select(.platform.os == "linux" and .platform.architecture == "arm64")
        | .digest'
  )"
  [[ "$amd64_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  [[ "$arm64_digest" =~ ^sha256:[0-9a-f]{64}$ ]]
  test "$amd64_digest" != "$arm64_digest"
  printf 'amd64=%s\narm64=%s\n' "$amd64_digest" "$arm64_digest"
)
```

Inspect the actual image user, entrypoint, writable paths, health commands, and
required tools. Update each `tagReference`, `indexDigest`, `amd64`, and `arm64`
field in `startos/image-pins.ts` together. Never change a tag without changing
and reviewing its resolved digests.

Then run the live tag-drift and metadata checks:

```bash
(
  set -euo pipefail

  source "$HOME/.nvm/nvm.sh"
  nvm use 22.23.1
  npm run verify:images
)
```

## 7. Update Package Metadata

Update these package-owned sources in one reviewed change:

- `startos/image-pins.ts`: source SHA/timestamp/crate version and all image
  pins;
- `startos/versions/current.ts`: the runtime-valid prerelease ExVer and release
  notes;
- all five release-note locales: `en_US`, `es_ES`, `de_DE`, `pl_PL`, and
  `fr_FR`;
- the new `docs/upstream/<short-sha>-runtime-contract.md`;
- `.github/workflows/`, keeping every third-party action on a deliberately
  reviewed full commit rather than a mutable branch or version tag;
- runtime code, tests, README, instructions, and release limitations affected
  by the upstream delta.

The version date/time segments come from the selected commit's UTC timestamp,
not the local update time. Keep the current file as `current.ts` unless the
update includes a wrapper migration; a release alone does not require a
historical version file.

Validate ExVer through the normal StartOS type/build path. Do not invent a
version string that only TypeScript accepts but the StartOS runtime rejects.

## 8. Verify Both Packages

From `buzz-startos`, use the reviewed Node runtime:

```bash
(
  set -euo pipefail

  source "$HOME/.nvm/nvm.sh"
  nvm use 22.23.1
  npm ci
  make clean
  npm ci

  npm test
  npm run prettier:check
  npm run check
  node node_modules/@start9labs/start-sdk/lint.mjs
  npm run verify:images
  npm run build
  git diff --check

  make x86
  make arm

  start-cli s9pk inspect buzz_x86_64.s9pk manifest
  start-cli s9pk inspect buzz_x86_64.s9pk commitment
  start-cli s9pk inspect buzz_aarch64.s9pk manifest
  start-cli s9pk inspect buzz_aarch64.s9pk commitment
  scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk buzz_aarch64.s9pk
  sha256sum buzz_x86_64.s9pk buzz_aarch64.s9pk > SHA256SUMS
  sha256sum -c SHA256SUMS
)
```

Confirm each manifest contains only its intended architecture, the expected
upstream Git hash and package metadata, the required StartOS release line, and
the same committed signing identity.

## 9. Test On Devices

Exercise every row in
[`docs/testing/DEVICE_TEST_MATRIX.md`](docs/testing/DEVICE_TEST_MATRIX.md) on
real x86_64 and aarch64 StartOS devices. Record device OS version, hardware,
artifact SHA-256, commands, observations, and logs for each checked item.

A successful package build is not evidence for install, startup, client,
media, Git, restart, backup/restore, failure handling, or resource behavior.
Leave any unexecuted row unchecked.

## 10. Review And Merge

Open a pull request containing:

- selected old and new upstream SHAs;
- proof that `buzz9` fast-forwarded and is `0 0` against upstream;
- audited runtime-contract changes;
- immutable index/platform digest evidence;
- exact automated checks and both build results;
- archive manifest, commitment, checksum, and signer results;
- device-test evidence and explicit gaps;
- security, backup, migration, and compatibility review.

Require human review. Merge only after the evidence supports the package
claims. Never auto-merge an upstream update or publish directly from an
unreviewed branch.
