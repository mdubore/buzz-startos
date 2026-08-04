# Buzz `651f637` Runtime Contract

Date: 2026-08-04
Package status: audited upstream candidate; StartOS pins and package version not
yet updated
Release target: `desktop-v0.5.4`

This record freezes the source and container contract proposed for the next
StartOS package update. It is static source, registry, image-config, and image-
filesystem evidence. It does not claim that a package artifact, vulnerability
gate, StartOS installation, upgrade, or client workflow has passed. The active
package remains pinned to `63496cc` until the pin and version change is reviewed
separately.

## Source And Image Identity

| Item                | Reviewed value                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| Upstream repository | `https://github.com/block/buzz`                                           |
| Release target      | `desktop-v0.5.4`                                                          |
| Source commit       | `651f6372754e60e3f936b3397040eb0f1e44c9f3`                                |
| Commit time         | `2026-08-03T17:33:19Z`                                                    |
| Relay crate version | `0.2.0`                                                                   |
| Published image tag | `ghcr.io/block/buzz:sha-651f637`                                          |
| OCI index           | `sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c` |
| `linux/amd64`       | `sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632` |
| `linux/arm64`       | `sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688` |

`desktop-v0.5.4` is a lightweight tag: `git cat-file -t` reports `commit`,
not an annotated tag object. The remote tag therefore does not carry its own
tag signature. Its target was verified separately as the exact commit above;
the GitHub commit-verification endpoint reported `verified=true` and
`reason=valid`. That result applies to the commit, not the lightweight tag.
The commit is 96 commits after the current package source
`63496cc1d4c6f1b7c613801bdcc694169dcf391a`, which is its ancestor.

The OCI index also contains two `unknown/unknown` provenance attestations.
They were excluded when selecting the two native runtime manifests.

## Audited Source Range

The complete repository range contains 643 changed files because the desktop,
mobile, agent, voice, Kubernetes, and release-tooling projects share the same
repository. The runtime-focused audit ran all of `git diff --stat`,
`git diff --name-status`, and the full diff over the packaged commands, their
changed normal/build dependency closure, and the surrounding image/deployment
contract:

```text
Dockerfile
Cargo.toml
Cargo.lock
crates/buzz-core
crates/buzz-pubsub
crates/buzz-sdk
crates/buzz-relay
crates/buzz-pair-relay
crates/buzz-admin
crates/buzz-db
crates/buzz-media
migrations
deploy/compose
docker-compose.yml
.env.example
schema/schema.sql
```

That scope changes 22 files with 3,750 insertions and 389 deletions:

- root `Cargo.toml` and `Cargo.lock`;
- one `buzz-core`, two `buzz-pubsub`, and one `buzz-sdk` source file;
- three `buzz-db` source files; and
- twelve `buzz-relay` files, including the Git transport, request/ingest
  handlers, relay administration, and NIP-11 document; and
- `schema/schema.sql`.

The three-line desired-state correction in `schema/schema.sql` adds the
existing `communities.icon` column already created by migration `0003`. It
closes schema-file drift; it is not a new migration and the StartOS runtime
does not apply `schema/schema.sql`.

The following source objects are byte-for-byte identical between the old and
new commits:

| Area                            | Finding                                    |
| ------------------------------- | ------------------------------------------ |
| `Dockerfile`                    | no change                                  |
| `crates/buzz-pair-relay/`       | no change                                  |
| `crates/buzz-admin/`            | no change                                  |
| `crates/buzz-media/`            | no change                                  |
| `migrations/`                   | no change; 26 SQL migrations in both trees |
| `deploy/compose/`               | no change                                  |
| `docker-compose.yml`            | no change                                  |
| `.env.example`                  | no change                                  |
| relay `config.rs` and `main.rs` | no change                                  |
| relay `router.rs`               | no change                                  |

There is therefore no source-range change to the image build stages, relay or
pairing bind variables, ports, entrypoint, automatic-migration switch, health
routes, media backend, admin commands, installed migration set, Compose
sidecars, or Compose startup topology. The rebuilt image identity still
required independent inspection; identical source was not treated as image
evidence.

### Changed Shared-Crate Closure

A normal/build dependency-tree query confirms that `buzz-relay` links
`buzz-core`, `buzz-pubsub`, and `buzz-sdk`; `buzz-admin` links `buzz-core` and
`buzz-pubsub`; and `buzz-pair-relay` links none of those three. The changed
shared sources were therefore reviewed as part of the packaged runtime rather
than dismissed as workspace-only changes.

`buzz-core` generalizes the existing persona shared-read helpers to a
`SHARED_GATED_KINDS` set and adds kind constants and replaceability assertions
for team catalogs (`30178`) and projects (`30621`). Relay and database call
sites consume those definitions for the privacy and project behavior described
below; this is runtime-linked behavior.

`buzz-pubsub` raises `PRESENCE_TTL_SECS` from 90 to 180. The relay's existing
kind-`20001` ingest path calls `set_presence`, so Redis now stores online/away
presence for up to 180 seconds; an explicit offline event or clean disconnect
still deletes it immediately. The companion Desktop heartbeat changed from 30
to 60 seconds in the same upstream change, while mobile was already at 60
seconds, preserving three heartbeat windows. The WebSocket transport ping loop
is a separate unchanged 30-second liveness mechanism.

`buzz-sdk` adds NIP-MP project validation/builders and a generic addressable
delete builder. No new SDK symbol has a call site in `buzz-relay`, `buzz-admin`,
or `buzz-pair-relay`; the relay has its own project-ingest validator. The
existing workflow-delete builder delegates to the generic helper without
changing its event shape, and its consumers are client commands. These SDK
edits expand client-facing APIs but do not add a packaged server command or
runtime path.

Root `Cargo.toml` adds `buzz-voice` and `buzz-backend-kubernetes` as workspace
members plus workspace-level `kube` and `k8s-openapi` entries. None appears in
the normal/build graph rooted at the three packaged binaries. Because the
unchanged Dockerfile runs `cargo chef cook` for the full workspace, they can
change dependency-cook time and supply-chain inputs, but the final image still
copies only the three selected binaries. Both native exported filesystems were
checked independently below.

## Native Image Contract

Both native image configs independently report:

| Field              | Value                                      |
| ------------------ | ------------------------------------------ |
| OCI revision label | `651f6372754e60e3f936b3397040eb0f1e44c9f3` |
| User               | `buzz:buzz`                                |
| Working directory  | `/var/lib/buzz`                            |
| Entrypoint         | `/usr/local/bin/buzz-relay`                |
| Command            | none                                       |
| Ports              | `3000/tcp`, `8080/tcp`, `9102/tcp`         |
| Web tree           | `/srv/buzz/web`                            |
| Admin web tree     | `/srv/buzz/admin-web`                      |

Filesystem exports, without executing the arm64 image, confirmed on both
native manifests:

- executable `/usr/local/bin/buzz-relay`;
- executable `/usr/local/bin/buzz-admin`;
- executable `/usr/local/bin/buzz-pair-relay`;
- executable `/usr/bin/curl`, `/usr/bin/git`, and `/usr/bin/openssl`;
- both web trees; and
- `/data/git` owned by UID/GID `1000:1000`.

The host is `x86_64`. `buzz-admin --help` plus `migrate`, `add-member`,
`remove-member`, and `list-members` subcommand help ran only against the amd64
digest and confirmed the existing packaged command surface. `buzz-relay
--help` is not a CLI-help path: the argument is ignored, normal startup begins,
and the isolated probe exited when its database connection timed out.
`buzz-pair-relay` likewise has no argument parser, so it was not started merely
to request help. The arm64 image was never executed.

## Relay Behavior Changes

### NIP-11 Limits And Workspace Icon

NIP-11 now advertises `limitation.max_limit=1000`, using the same
`buzz_db::DEFAULT_MAX_PAGE_LIMIT` enforced by historical REQ queries. The old
document advertised 10,000 even though the real WebSocket ceiling was already
1,000. Effective WebSocket capacity is unchanged; the advertisement is now
accurate. HTTP bridge page offsets now use the clamped page size, preventing
page-two and later queries from skipping rows when a client requested more
than the effective limit.

Kind `9033` workspace-profile writes now use a steward-wins rule:

- a closed relay still requires an admin or owner;
- an open relay that has an admin or owner row remains admin/owner-only; and
- only a genuinely rosterless open relay permits any NIP-42-authenticated
  sender to set the workspace icon.

The StartOS package sets `BUZZ_REQUIRE_RELAY_MEMBERSHIP=true` and bootstraps
`RELAY_OWNER_PUBKEY`, so its authorization posture remains admin/owner-only.
An authorized stored icon is returned through the existing NIP-11 workspace
metadata path.

### Multi-Repository Projects And Deletion Ordering

The relay now ingests NIP-MP kind `30621` multi-repository projects. It treats
them as global, parameterized-replaceable repository metadata requiring
`ReposWrite`, accepts cross-owner kind `30617` member coordinates, and grants
no repository push permission from project membership. The envelope validates
one nonempty `d` tag, no more than 64 raw member tags, canonical repository
coordinates, unique members, singleton bounded metadata fields, and permits a
zero-member project.

The same change hardens generic NIP-09 coordinate deletion: a tombstone can
delete only a live parameterized-replaceable head whose `created_at` is at or
before the tombstone. A delayed deletion can no longer erase a newer project
or repository-announcement replacement.

### Shared Team-Catalog Reads

Kind `30178` team catalogs now share the existing private-persona read gate.
Foreign readers see a catalog only when it carries the exact shared tag;
historical REQ, live fanout, COUNT, IDs lookup, search, and HTTP bridge paths
all use the generalized gate. This closes an existence/content leak for
catalogs that embed sanitized member projections and system prompts. It does
not change StartOS configuration.

### Membership Reads And Owner Limit

`Db::is_relay_member` now enters the standard bounded replica-routing path.
Only a session whose replica-freshness proof satisfies the configured budget
may answer from the reader; any disabled, stale, acquisition-failure, or query-
failure path falls back to the writer. This affects the membership check used
for authenticated HTTP and WebSocket authorization.

The StartOS package deliberately supplies no `READ_DATABASE_URL` and sets
`BUZZ_REPLICA_READ_MAX_AGE_MS=0`. Upstream defines zero as disabled, so no
reader pool is created and all StartOS membership reads remain writer-only.
The old seconds-denominated `BUZZ_REPLICA_HEAD_MAX_AGE_SECS` remains unset.

The default maximum number of communities one pubkey may own increased from
three to five. `BUZZ_MAX_COMMUNITIES_PER_OWNER` remains the deployment
override; the StartOS package does not set it, so the new default applies.

### Git Transport And Default-Branch Deletion

The Smart HTTP receive path now adds
`receive.denyDeleteCurrent=ignore` only to the ephemeral `git receive-pack`
process. The existing forced `core.hooksPath`, authorization hook, object-
store publication, and repository policy checks remain. When a current branch
is deleted and another branch survives, CAS publication selects a surviving
branch as the new manifest `HEAD`. No new persistent path or backup authority
is introduced.

## Companion Interoperability Boundary

Commit `b1b283cd4` stops `buzz-acp` from discarding cache-read usage reported
by a harness. NIP-AM kind `44200` now carries a reliable per-turn cache-read
delta when a monotonic baseline exists and preserves the cumulative value;
missing and explicit-zero values remain distinct. Cache-write tokens remain
absent because the harness does not emit them. This is a companion-client
change: the official relay image builds only `buzz-relay`, `buzz-admin`, and
`buzz-pair-relay`, not `buzz-acp`.

The maintained companion fork must still preserve its downstream native-root
selection for both Buzz Desktop and `buzz-acp`. At audited companion sync commit
`07015305c7cb3c6249ed746b06597235079120f3`, both paths use
`tokio-tungstenite` with `rustls-tls-native-roots` and exclude
`rustls-tls-webpki-roots`; this is outside the official server image and must be
tested and released as companion software.

The upstream Android pairing code is unchanged in this range. It still uses
`WebSocketChannel.connect` without an application-supplied TLS context, and
the Android manifest declares no custom network security configuration. An
unmodified Android app therefore remains unverified with, and in the observed
alpha setup rejected, the StartOS private local CA even when Chrome could
reach the HTTPS endpoint. This server update does not fix that trust boundary.

## Rust Security Dependency Changes

The lockfile updates `nostr` from `0.44.6` to `0.44.7` for
RUSTSEC-2026-0225 through RUSTSEC-2026-0230. A normal/build-only dependency
tree confirms `nostr 0.44.7` is linked into `buzz-relay` and `buzz-admin`, so
these fixes are relevant to the packaged runtime binaries.

`nostr-relay-pool` moves from `0.44.1` through `0.44.2` to `0.44.3` for
RUSTSEC-2026-0224 and RUSTSEC-2026-0231 through RUSTSEC-2026-0232. A
normal/build-only inverse dependency query prints no path from any of the three
packaged binaries, so that update applies to other workspace/client components,
not those runtime binaries. The complete lockfile also changes for voice,
Kubernetes, desktop, and dev-only mesh additions. A fresh immutable-image scan
is still mandatory; source dependency review is not a vulnerability-policy
pass.

## Unchanged Startup, Schema, Storage, And Health Contract

The StartOS dependency graph remains:

- PostgreSQL, Redis, MinIO, the independent pairing daemon, and the root
  `prepare-git-cache` one-shot may start in parallel;
- `create-bucket` waits for MinIO and enforces a private `buzz-media` bucket;
- `migrate` waits for PostgreSQL, bucket creation, and Git-cache ownership
  preparation, then runs `buzz-admin migrate` with only `DATABASE_URL`;
- the main daemon waits for its databases, storage preparation, Git-cache
  repair, and migrations, then runs with `BUZZ_AUTO_MIGRATE=false`; and
- pairing remains outside the main daemon dependency graph.

There are still 26 migrations. No migration, database command, or PostgreSQL
compatibility setting changed in the audited range. `schema/schema.sql` now
documents the `communities.icon` column that migration `0003` already created;
the package's `buzz-admin migrate` flow has no new step. Existing PostgreSQL
data remains authoritative and is backed up through a logical `pg_dump`/restore
flow.

Persistent authority also remains unchanged:

- the StartOS `startos` volume holds stable generated state and secrets;
- PostgreSQL holds authoritative events, memberships, workflow, and metadata;
- MinIO holds authoritative media and durable Git objects;
- Redis persistent state remains included in backups; and
- `/data/git` remains a reconstructible Git workspace/cache, recursively
  ownership-repaired at startup and excluded from backup authority.

The relay still binds application traffic to port 3000, health traffic to
8080, and metrics to 9102. The unchanged health router still serves
`/_liveness` and `/_readiness`; StartOS readiness still requires the relay
readiness endpoint and MinIO liveness. Pairing health remains a separate exact
WebSocket upgrade check described below. These are static/package-code
findings, not a live health result for the new image.

No StartOS CPU, memory, or storage declaration changed in this documentation-
only task, and the upstream range adds no persistent path. Actual steady-state
and peak resource use of the new binaries remains a device-test gate.

## Dedicated Pairing Topology

The upstream pairing source is byte-for-byte unchanged. Its deployment
contract remains:

- default bind `127.0.0.1:5000`;
- TLS termination and HTTP header-read timeout at a reverse proxy;
- only `/pair` should be routed in upstream's shared-origin topology; and
- the binary itself does not enforce a request path or pre-upgrade connection
  limit.

The StartOS package preserves its deliberate LAN-beta adaptation:

1. Run the unmodified binary in its isolated subcontainer with
   `BUZZ_PAIR_RELAY_BIND_ADDR=0.0.0.0:5000`.
2. Export only that subcontainer through a dedicated pairing host/interface,
   separate from the main relay host.
3. Store only a currently exported, normalized root `ws://` or `wss://`
   pairing URL and pass it to the main daemon as `BUZZ_PAIRING_RELAY_URL`.
4. Let NIP-11 advertise that exact root URL; current Desktop consumes it
   without appending `/pair`.
5. Require readiness and ongoing health to send a bounded RFC 6455 request at
   the root and receive a complete HTTP 101 response with the exact derived
   `Sec-WebSocket-Accept`, required upgrade headers, and no negotiated
   extension or subprotocol.

An ordinary browser GET returning HTTP 400 is expected from the pairing
binary. It proves only HTTP/TLS reachability. HTTP 101 under the exact dynamic
probe is the package health contract.

## Reachability And Evidence Boundary

The current documented beta configuration remains LAN-only. It does not
enable or validate Android/mobile use away from the home network. StartOS
interface declarations do not themselves place the service on Tor or the
public Internet; the user controls enabled addresses.

The long-term no-mobile-patch direction remains public DNS and a publicly
trusted certificate, with a reviewed StartTunnel/VPS or equivalent deployment
routing both the main and pairing WebSocket endpoints. That future topology is
not implemented or validated by this source sync.

Completed evidence for this record:

- exact old/new Git ancestry, stat, name-status, and full scoped diff;
- lightweight release-tag target, commit time, and crate version;
- registry index and both native manifest digests;
- both native image configs and filesystem exports;
- amd64 `buzz-admin` help; and
- source/package review of pairing, configuration, migrations, storage,
  backup, health, and client trust boundaries.

Still unperformed for this candidate:

- changing and testing StartOS pins/version;
- dependency and immutable-image vulnerability gates;
- x86_64 and aarch64 `.s9pk` builds and inspection;
- clean install, update from the exact `63496cc:2` package, daemon startup,
  health, restart, backup/restore, and uninstall/reinstall on StartOS;
- real Desktop and ACP connectivity against both exported WSS interfaces;
- QR generation and a complete device-pairing exchange; and
- Android private-CA or remote public-certificate validation.

No production, registry, or device-readiness claim follows from this record.

## Reproduction Commands

```bash
set -euo pipefail

old=63496cc1d4c6f1b7c613801bdcc694169dcf391a
new=651f6372754e60e3f936b3397040eb0f1e44c9f3
release_tag=desktop-v0.5.4
buzz_ref=ghcr.io/block/buzz:sha-651f637
index_digest=sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c
amd64_digest=sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632
arm64_digest=sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688
amd64_image="ghcr.io/block/buzz@$amd64_digest"
arm64_image="ghcr.io/block/buzz@$arm64_digest"

test "$(git cat-file -t "refs/tags/$release_tag")" = commit
test "$(
  git rev-parse --verify "refs/tags/$release_tag^{commit}"
)" = "$new"
test "$(
  git ls-remote --exit-code --tags upstream "refs/tags/$release_tag" |
    awk 'NR == 1 { print $1 }'
)" = "$new"
test "$(
  gh api "repos/block/buzz/commits/$new" \
    --jq '.commit.verification | [.verified, .reason] | @tsv'
)" = $'true\tvalid'
git merge-base --is-ancestor "$old" "$new"
TZ=UTC git show -s --date=format-local:'%Y-%m-%dT%H:%M:%SZ' \
  --format='%H%n%cd%n%s' "$new"

git diff --stat "$old..$new"
git diff --name-status "$old..$new" -- \
  Dockerfile Cargo.toml Cargo.lock crates/buzz-core crates/buzz-pubsub \
  crates/buzz-sdk crates/buzz-relay crates/buzz-pair-relay \
  crates/buzz-admin crates/buzz-db crates/buzz-media migrations \
  deploy/compose docker-compose.yml .env.example schema/schema.sql
git diff "$old..$new" -- \
  Dockerfile Cargo.toml Cargo.lock crates/buzz-core crates/buzz-pubsub \
  crates/buzz-sdk crates/buzz-relay crates/buzz-pair-relay \
  crates/buzz-admin crates/buzz-db crates/buzz-media migrations \
  deploy/compose docker-compose.yml .env.example schema/schema.sql

test "$(
  docker buildx imagetools inspect "$buzz_ref" |
    awk '$1 == "Digest:" { print $2; exit }'
)" = "$index_digest"
raw_index="$(docker buildx imagetools inspect "$buzz_ref" --raw)"
test "$(
  printf '%s' "$raw_index" |
    jq -er '.manifests[]
      | select(.platform.os == "linux" and .platform.architecture == "amd64")
      | .digest'
)" = "$amd64_digest"
test "$(
  printf '%s' "$raw_index" |
    jq -er '.manifests[]
      | select(.platform.os == "linux" and .platform.architecture == "arm64")
      | .digest'
)" = "$arm64_digest"

docker pull --platform linux/amd64 "$amd64_image"
docker pull --platform linux/arm64 "$arm64_image"
for image in "$amd64_image" "$arm64_image"; do
  docker image inspect "$image" |
    jq -e --arg revision "$new" '
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

audit_tmp="$(mktemp -d /tmp/buzz-651f637-audit.XXXXXX)"
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

# Execute amd64 only. Creating/exporting arm64 above does not start it.
for admin_args in \
  "migrate --help" \
  "add-member --help" \
  "remove-member --help" \
  "list-members --help"; do
  read -r -a args <<<"$admin_args"
  docker run --rm --platform linux/amd64 --network none \
    --entrypoint /usr/local/bin/buzz-admin "$amd64_image" "${args[@]}"
done
```
