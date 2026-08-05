# Updating The Upstream Snapshot

Buzz application source and StartOS packaging have separate histories:

- `../buzz9` is the `mdubore/buzz9` downstream companion-client fork of
  `block/buzz`; it currently carries the reviewed native-root changes for the
  desktop and `buzz-acp` relay clients.
- this repository contains the StartOS server packaging, tests, assets, and
  documentation. Its Buzz container pin is an official `block/buzz` image and
  does not embed the companion fork's application commits.

Never auto-merge an upstream commit into a release and never select a moving
`upstream/main` head merely because it is newer. Choose an explicit reviewed
upstream release tag, verify the remote tag ref and its exact commit identity,
and then use only that commit throughout the update. Every selected snapshot
requires a runtime-contract review, immutable image pins, both package builds,
and a reviewed pull request. In particular, do not derive the release target
with `git rev-parse upstream/main`.

## Current Candidate And Upgrade Baselines

The checked-out, test-only candidate identity is:

```text
0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:1
```

Its upstream portion is the exact official Buzz snapshot
`651f6372754e60e3f936b3397040eb0f1e44c9f3`; `:1` records the first downstream
runtime-image security rebuild of that snapshot. The candidate retains the
production-readiness controls, disposable Git-cache repair, and dedicated
LAN-only pairing relay. It is not submission-ready: the dependency gate has an
unwaived High finding, the Buzz, MinIO, and MinIO Client native images have
Critical findings, the Buzz images also have Unknown-severity findings, and
live StartOS/device validation remains incomplete. The complete fail-closed
result is in `docs/security/651f637-runtime-scan.md`.

The candidate's immutable Buzz image pins are:

| Input         | Exact candidate value                                                     |
| ------------- | ------------------------------------------------------------------------- |
| Upstream tag  | `ghcr.io/block/buzz:sha-651f637`                                          |
| OCI index     | `sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c` |
| `linux/amd64` | `sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632` |
| `linux/arm64` | `sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688` |

`docs/upstream/651f637-runtime-contract.md` is the candidate runtime evidence.
The latest local sideload upgrade baseline is
`0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2`, documented by
`docs/upstream/63496cc-runtime-contract.md`. The older
`docs/upstream/dd222a5-runtime-contract.md` remains historical only. Neither
historical contract describes the candidate snapshot or downstream revision.

## 1. Prepare A Reviewed Companion-Fork Update

Run from the `buzz-startos` package root. The expected `buzz9` remotes are:

```text
origin   https://github.com/mdubore/buzz9.git
upstream https://github.com/block/buzz.git
```

Read the currently packaged official commit before entering the companion
fork. Set `BUZZ_RELEASE_TAG` to one specific release reviewed by a human and
`BUZZ_RELEASE_COMMIT` to its independently reviewed full 40-character commit;
for example, `desktop-v0.5.4` and
`651f6372754e60e3f936b3397040eb0f1e44c9f3`. Carry that immutable commit through
every later step. Buzz currently publishes lightweight desktop release tags,
so the tag carries no independent annotated-tag signature. Verify the exact
remote ref, exact commit, and GitHub's commit-signature result separately. If
the tag format or verification result changes, stop for review.

Fetch that tag explicitly, prove that the package baseline is an ancestor of
its exact commit, and create an update branch from the current fork head. Never
update `main` directly:

```bash
(
  set -euo pipefail

  test -f startos/image-pins.ts
  test -z "$(git status --porcelain -- startos/image-pins.ts)"
  old_sha="$(
    sed -nE "s/^  commit: '([0-9a-f]{40})',$/\1/p" startos/image-pins.ts
  )"
  release_tag="${BUZZ_RELEASE_TAG:?set an explicit reviewed Buzz release tag}"
  release_commit="${BUZZ_RELEASE_COMMIT:?set its reviewed full commit}"
  [[ "$old_sha" =~ ^[0-9a-f]{40}$ ]]
  [[ "$release_tag" =~ ^[A-Za-z0-9._-]+$ ]]
  [[ "$release_commit" =~ ^[0-9a-f]{40}$ ]]
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
  git fetch --prune upstream \
    "refs/tags/$release_tag:refs/tags/$release_tag"
  git cat-file -e "$old_sha^{commit}"
  test "$(git cat-file -t "refs/tags/$release_tag")" = commit
  test "$(
    git rev-parse --verify "refs/tags/$release_tag^{commit}"
  )" = "$release_commit"
  remote_tag_sha="$(
    git ls-remote --exit-code --tags upstream "refs/tags/$release_tag" |
      awk 'NR == 1 { print $1 }'
  )"
  fork_sha="$(git rev-parse origin/main)"
  [[ "$remote_tag_sha" =~ ^[0-9a-f]{40}$ ]]
  [[ "$fork_sha" =~ ^[0-9a-f]{40}$ ]]
  test "$remote_tag_sha" = "$release_commit"
  verification="$(
    gh api "repos/block/buzz/commits/$release_commit" \
      --jq '.commit.verification | [.verified, .reason] | @tsv'
  )"
  test "$verification" = $'true\tvalid'
  git merge-base --is-ancestor "$old_sha" "$release_commit"
  test "$old_sha" != "$release_commit"
  printf 'release tag=%s\nselected commit=%s\n' \
    "$release_tag" "$release_commit"

  git rev-list --left-right --count "$release_commit"...origin/main
  git log --oneline --left-right --cherry-pick "$release_commit"...origin/main

  update_branch="update/upstream-${release_commit:0:12}"
  ! git show-ref --verify --quiet "refs/heads/$update_branch"
  git switch -c "$update_branch" origin/main

  if ! git merge-base --is-ancestor "$release_commit" HEAD; then
    git merge --no-ff --no-commit "$release_commit"
  fi
  git status --short --branch
)
```

The `cat-file` assertion above intentionally records the current lightweight
tag contract; it must not be described as a signed tag. The separately checked
GitHub result applies to the selected commit. Record the tag, remote ref,
commit, verification result, and UTC commit time in the audit.

The divergence count is informational: this is a maintained downstream fork,
so commits on the origin side are expected. Review the complete graph and
reassess whether each downstream client commit is still needed after the
upstream integration. In particular, preserve or deliberately replace the
native-root behavior in both Buzz Desktop and `buzz-acp`; do not silently drop
one path or copy those client changes into the StartOS server image.

Run the checks and client packaging process documented by the fork's current
`README.md` and `AGENTS.md`. After the upstream integration and downstream
client behavior have been reviewed, commit the update branch, push that branch,
and land it into the fork's `main` only through a reviewed pull request. Do not
blindly merge, push directly to `main`, force-push, or assume the fork should be
identical to upstream.

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
  new_sha="${BUZZ_RELEASE_COMMIT:?set the tag-verified full commit from step 1}"
  [[ "$old_sha" =~ ^[0-9a-f]{40}$ ]]
  [[ "$new_sha" =~ ^[0-9a-f]{40}$ ]]

  cd ../buzz9
  git cat-file -e "$old_sha^{commit}"
  test "$(git cat-file -t "$new_sha")" = commit
  git merge-base --is-ancestor "$old_sha" "$new_sha"
  git log --oneline --decorate "$old_sha..$new_sha"
  git diff --stat "$old_sha..$new_sha"
  git diff --name-status "$old_sha..$new_sha"
  git diff "$old_sha..$new_sha" -- \
    Dockerfile \
    Cargo.toml \
    Cargo.lock \
    crates/buzz-core \
    crates/buzz-pubsub \
    crates/buzz-sdk \
    crates/buzz-relay \
    crates/buzz-pair-relay \
    crates/buzz-admin \
    crates/buzz-db \
    crates/buzz-media \
    migrations \
    deploy/compose \
    docker-compose.yml \
    .env.example \
    schema/schema.sql

  for package in buzz-relay buzz-admin buzz-pair-relay; do
    cargo tree --locked -p "$package" -e normal,build
  done
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

The runtime-linked audit closure includes every changed shared crate in the
normal/build dependency graph of `buzz-relay`, `buzz-admin`, and
`buzz-pair-relay`; it is not limited to files under those three package
directories. Classify root workspace and lockfile changes as runtime,
build-only, or unrelated only after checking the package dependency graph and
source call sites.

## 3. Wait For The SHA Image

Upstream publishes `ghcr.io/block/buzz:sha-<7-character-sha>`. Do not substitute
`main`, `latest`, or another mutable tag.

```bash
(
  set -euo pipefail

  new_sha="${BUZZ_RELEASE_COMMIT:?set the tag-verified full commit from step 1}"
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

  new_sha="${BUZZ_RELEASE_COMMIT:?set the tag-verified full commit from step 1}"
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

Inspect both native image configs and exported filesystems. Creating and
exporting the arm64 container does not execute it; only the amd64 admin CLI is
run. Container IDs are unique, and the traps remove every created container
and temporary file on success, failure, or interruption:

```bash
(
  set -euo pipefail

  new_sha="${BUZZ_RELEASE_COMMIT:?set the tag-verified full commit from step 1}"
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

  audit_tmp="$(mktemp -d /tmp/buzz-image-audit.XXXXXX)"
  amd64_container=
  arm64_container=
  cleanup() {
    set +e
    test -z "$amd64_container" || docker rm "$amd64_container" >/dev/null
    test -z "$arm64_container" || docker rm "$arm64_container" >/dev/null
    test ! -e "$audit_tmp/amd64.tar" || rm -- "$audit_tmp/amd64.tar"
    test ! -e "$audit_tmp/arm64.tar" || rm -- "$audit_tmp/arm64.tar"
    rmdir "$audit_tmp"
  }
  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  for platform_digest in \
    "linux/amd64@$amd64_digest" \
    "linux/arm64@$arm64_digest"; do
    platform="${platform_digest%@*}"
    digest="${platform_digest#*@}"
    image="ghcr.io/block/buzz@$digest"
    docker pull --platform "$platform" "$image"

    docker image inspect "$image" |
      jq -e --arg revision "$new_sha" '
        .[0].Config.User == "buzz:buzz" and
        .[0].Config.WorkingDir == "/var/lib/buzz" and
        .[0].Config.Entrypoint == ["/usr/local/bin/buzz-relay"] and
        .[0].Config.Cmd == null and
        (.[0].Config.ExposedPorts | keys | sort) ==
          ["3000/tcp", "8080/tcp", "9102/tcp"] and
        any(.[0].Config.Env[]; . == "BUZZ_WEB_DIR=/srv/buzz/web") and
        any(.[0].Config.Env[]; . == "BUZZ_ADMIN_WEB_DIR=/srv/buzz/admin-web") and
        .[0].Config.Labels["org.opencontainers.image.revision"] == $revision
      ' >/dev/null
  done

  amd64_image="ghcr.io/block/buzz@$amd64_digest"
  arm64_image="ghcr.io/block/buzz@$arm64_digest"
  amd64_container="$(docker create --platform linux/amd64 "$amd64_image")"
  arm64_container="$(docker create --platform linux/arm64 "$arm64_image")"
  docker export --output "$audit_tmp/amd64.tar" "$amd64_container"
  docker export --output "$audit_tmp/arm64.tar" "$arm64_container"

  required_paths=(
    data/git/
    srv/buzz/admin-web/
    srv/buzz/web/
    usr/bin/curl
    usr/bin/git
    usr/bin/openssl
    usr/local/bin/buzz-admin
    usr/local/bin/buzz-pair-relay
    usr/local/bin/buzz-relay
  )
  executable_paths=(
    usr/bin/curl
    usr/bin/git
    usr/bin/openssl
    usr/local/bin/buzz-admin
    usr/local/bin/buzz-pair-relay
    usr/local/bin/buzz-relay
  )
  for archive in "$audit_tmp/amd64.tar" "$audit_tmp/arm64.tar"; do
    for path in "${required_paths[@]}"; do
      tar -tf "$archive" "$path" >/dev/null
    done
    for path in "${executable_paths[@]}"; do
      tar --numeric-owner -tvf "$archive" "$path" |
        awk '$1 == "-rwxr-xr-x" { found = 1 } END { exit !found }'
    done
    tar --numeric-owner -tvf "$archive" data/git/ |
      awk '$1 == "drwxr-xr-x" && $2 == "1000/1000" {
        found = 1
      } END { exit !found }'
  done

  for admin_args in \
    "migrate --help" \
    "add-member --help" \
    "remove-member --help" \
    "list-members --help"; do
    read -r -a args <<<"$admin_args"
    docker run --rm --platform linux/amd64 --network none \
      --entrypoint /usr/local/bin/buzz-admin "$amd64_image" "${args[@]}"
  done
)
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

## Vulnerability Review Gate

Run dependency integrity and policy checks after every lockfile, SDK, image, or
runtime-entrypoint change:

```bash
(
  set -euo pipefail

  source "$HOME/.nvm/nvm.sh"
  nvm use 22.23.1
  npm ci
  npm run audit:signatures
  npm run build
  npm run audit:vulnerabilities

  # Requires checksum-verified Grype 0.116.0 on PATH.
  npm run scan:images -- runtime-scan-results
)
```

`security/vulnerability-waivers.json` is the only exception mechanism; scanner
suppression is forbidden. Each high-severity waiver names one advisory and
installed component, lists every affected path or immutable image digest,
documents runtime reachability and a compensating control, assigns an owner and
tracking issue, and expires within 90 days. Critical findings cannot be waived.
The checker also rejects stale waivers, changed paths, new findings, nonempty
Grype `ignoredMatches`, inconsistent npm audit summary counts, and tooling-only
npm code that appears in the compiled runtime bundle.

The current npm exceptions are limited to ESLint and TypeScript ESLint
dependencies bundled by Start SDK 2.0.9 and tracked in
[Start9Labs/start-technologies#3592](https://github.com/Start9Labs/start-technologies/issues/3592).
Replace the SDK and remove the waivers as soon as a compatible fixed release is
available. Do not run `npm audit fix` or add a broad lockfile override without
rebuilding, linting, and device-testing the package.

The image scanner removes inherited `GRYPE_*` and `SYFT_*` settings, uses an
isolated home, and passes the reviewed `security/grype-ci.yaml` to every Grype
0.116.0 operation. It records the scanner version, full effective
configuration, exact database identity and status, exact target manifest, and
one JSON report for each of the ten native platform digests. The checker binds
each report to its pinned digest, requested `linux/amd64` or `linux/arm64`
platform, scanner build, database, and configuration. Missing or inconsistent
evidence fails closed. Review every new high or critical image finding before
updating a pin. Add an OCI waiver only when the installed component and
affected image digests have been independently verified; never waive a moving
tag.

The `dd222a5` and `63496cc` scan records are historical evidence for their
respective package snapshots. They are not evidence for the checked-out
`651f637:1` candidate. Candidate evidence comes from the `651f637` runtime
contract, `651f637` security checkpoint, and immutable pins.

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

After editing the pins and version, prove that they still derive from the full
commit verified in step 1. Do not re-resolve the release tag or use its short
prefix as source identity:

```bash
(
  set -euo pipefail

  release_commit="${BUZZ_RELEASE_COMMIT:?set the tag-verified full commit from step 1}"
  [[ "$release_commit" =~ ^[0-9a-f]{40}$ ]]
  test "$(git -C ../buzz9 cat-file -t "$release_commit")" = commit
  pinned_commit="$(
    sed -nE "s/^  commit: '([0-9a-f]{40})',$/\1/p" startos/image-pins.ts
  )"
  test "$pinned_commit" = "$release_commit"
  pinned_short="$(
    sed -nE "s/^  shortCommit: '([0-9a-f]{7})',$/\1/p" startos/image-pins.ts
  )"
  test "$pinned_short" = "${release_commit:0:7}"
  expected_time="$(
    TZ=UTC git -C ../buzz9 show -s \
      --date=format-local:'%Y-%m-%dT%H:%M:%SZ' --format='%cd' "$release_commit"
  )"
  pinned_time="$(
    sed -nE "s/^  committedAt: '([^']+)',$/\1/p" startos/image-pins.ts
  )"
  test "$pinned_time" = "$expected_time"
  rg -F "ghcr.io/block/buzz:sha-${release_commit:0:7}" startos/image-pins.ts

  relay_version="$(
    sed -nE "s/^  relayVersion: '([^']+)',$/\1/p" startos/image-pins.ts
  )"
  version_stamp="$(
    TZ=UTC git -C ../buzz9 show -s \
      --date=format-local:'%Y%m%d.h.%H.m.%M.s.%S' \
      --format='%cd' "$release_commit"
  )"
  package_version="$(
    sed -nE "s/^  version: '([^']+)',$/\1/p" startos/versions/current.ts
  )"
  # Canonically split the seven hex characters at digit/letter boundaries
  # for ExVer: 651f637 becomes 651.f.637; dd222a5 becomes dd.222.a.5.
  sha_segments="$(
    printf '%s' "$pinned_short" |
      sed -E 's/([0-9])([a-f])/\1.\2/g; s/([a-f])([0-9])/\1.\2/g'
  )"
  test "${sha_segments//./}" = "$pinned_short"
  expected_prefix="${relay_version}-main.${version_stamp}.sha.${sha_segments}:"
  package_revision="${package_version#"$expected_prefix"}"
  test "$package_revision" != "$package_version"
  [[ "$package_revision" =~ ^[0-9]+$ ]]
)
```

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

For a tagged candidate, the release workflow downloads the two signed S9PK
artifacts plus the independently produced vulnerability and SBOM artifacts.
`scripts/prepare-release-assets.sh` accepts only the exact expected filenames,
reconstructs the package verification record from the S9PK bytes, validates all
SBOM subjects and vulnerability evidence, and writes a closed
`RELEASE-ASSETS.json` and `SHA256SUMS`. A separate job grants only the
attestation permissions needed by `actions/attest`; a read-only verifier
redownloads the same `release-assets` workflow artifact, reruns
`scripts/verify-release-assets.sh`, and verifies every GitHub provenance
attestation. Only after that succeeds does a minimal write-enabled finalizer
redownload the immutable workflow artifact and perform the only release upload.

The draft release reservation consumes the tag even if signing, assembly,
attestation, or publication later fails. Preserve the failed draft and
sanitized evidence, increment the package revision, and use a new tag. Never
replace assets or recycle the reserved identity.

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
- proof that the previous official package baseline is an ancestor of the
  selected upstream snapshot, plus the recorded fork divergence and reviewed
  disposition of its downstream companion-client commits;
- audited runtime-contract changes;
- immutable index/platform digest evidence;
- exact automated checks and both build results;
- archive manifest, commitment, checksum, and signer results;
- device-test evidence and explicit gaps;
- security, backup, migration, and compatibility review.

Require human review. Merge only after the evidence supports the package
claims. Never auto-merge an upstream update or publish directly from an
unreviewed branch.
