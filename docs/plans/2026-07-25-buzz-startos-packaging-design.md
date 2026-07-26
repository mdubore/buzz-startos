# Buzz for StartOS Packaging Design

Date: 2026-07-25
Status: Approved

## Summary

Create a dedicated `buzz-startos` repository that packages the Buzz relay and
its production data services for StartOS 0.4.0 sideloading. Keep
`mdubore/buzz9` as a clean, fast-forward-only mirror of `block/buzz`.

The first package will track an exact commit from upstream `main`, not the
stable relay release. It will therefore be labeled as a development snapshot
and pinned to the immutable `ghcr.io/block/buzz:sha-<commit>` image. The package
will produce separate x86_64 and aarch64 `.s9pk` files.

StartOS will host the Buzz relay/backend. Users will connect with Buzz desktop
or mobile clients. The limited web assets bundled in the relay image remain
available, but the package will not claim to provide the complete desktop
experience in a browser.

## Goals

- Package Buzz for StartOS 0.4.0 using the current TypeScript Start SDK and
  signed S9PK v2 format.
- Preserve a low-conflict path for synchronizing `buzz9` with `block/buzz`.
- Pin all application and sidecar images reproducibly for x86_64 and aarch64.
- Default to a private, owner-controlled relay.
- Generate and preserve all stable service secrets.
- Provide native StartOS setup, membership, health, backup, and restore flows.
- Produce a detailed package README and concise in-product instructions.
- Make upstream snapshot updates reviewable and repeatable.

## Non-Goals

- Do not modify Buzz application source for StartOS.
- Do not make the Tauri desktop client run as a browser application.
- Do not run Docker Compose or a nested container engine inside StartOS.
- Do not expose PostgreSQL, Redis, MinIO, metrics, or health ports publicly.
- Do not automatically merge new upstream commits into a published package.
- Do not publish to a StartOS registry in the first iteration. Sideloadable
  artifacts are the initial distribution target.

## Repository Topology

### `mdubore/buzz9`

`buzz9` remains a clean source mirror:

```text
origin   https://github.com/mdubore/buzz9.git
upstream https://github.com/block/buzz.git
```

Rules:

- `main` advances only by fast-forwarding to `upstream/main`.
- No StartOS package files or application patches are committed here.
- No history rewrites are used on published commits.
- The fork exists as an inspectable source mirror and future customization
  point, but the initial StartOS package consumes Block's published image.

### `mdubore/buzz-startos`

The new package repository owns:

- `startos/` SDK integration
- `assets/`
- `README.md`
- `instructions.md`
- `UPDATING.md`
- `CONTRIBUTING.md`
- `TODO.md`
- package metadata and lockfiles
- build and release workflows
- package-specific tests

Keeping this repository separate avoids collisions with Buzz's existing root
`package.json`, lockfile, Dockerfile, README, and GitHub workflows.

## Upstream Pinning And Versioning

The first package targets an exact snapshot of upstream `main`. The discovery
baseline was `c7089d3b52a6758596cb516f7b3e65989428d26b` on 2026-07-25, but the
implementation will re-check upstream and pin the selected latest commit before
building.

The package will:

1. Verify `ghcr.io/block/buzz:sha-<short-commit>` exists.
2. Verify native linux/amd64 and linux/arm64 manifests.
3. Resolve and record the OCI index and platform digests.
4. Use the immutable SHA tag in the StartOS manifest.
5. Encode the relay crate version, commit date, and short SHA in an explicit
   prerelease ExVer.
6. Validate the final ExVer syntax with `start-cli` before committing it.

The README will not duplicate live image tags or versions. The manifest is the
package source of truth; `UPDATING.md` records how to find and update each pin.

## Runtime Architecture

The package translates the upstream production Compose topology into native
StartOS subcontainers:

```text
Buzz desktop/mobile client
            |
StartOS LAN, Tor, or gateway proxy
            |
Buzz HTTP and WebSocket interface on port 3000
            |
            +-- PostgreSQL on 127.0.0.1:5432
            +-- Redis on 127.0.0.1:6379
            +-- MinIO on 127.0.0.1:9000
            +-- Git repositories at /data/git
```

All subcontainers share the StartOS service network namespace. Internal URLs
use loopback addresses rather than Docker Compose service names.

### Images

The manifest includes pinned images for:

- Buzz relay
- PostgreSQL 17
- Redis 7
- MinIO
- MinIO client

Every image must be verified for x86_64 and aarch64 before a package build. The
package will produce separate architecture-specific S9PK files because a
universal archive containing this stack would be unnecessarily large for
sideloading.

### Startup Order

1. Start PostgreSQL, Redis, and MinIO.
2. Wait for each internal ready check.
3. Run an idempotent MinIO bucket-creation one-shot.
4. Run an idempotent `buzz-admin migrate` one-shot.
5. Start the Buzz relay.
6. Mark the user-facing interface ready only after Buzz `/_readiness` succeeds.

`BUZZ_AUTO_MIGRATE` remains disabled when the explicit migration one-shot is
used, preventing two migration paths from racing.

## Networking And Canonical URL

Only Buzz port 3000 is exported through a StartOS HTTP interface. StartOS proxy
handling must preserve WebSocket upgrades.

These ports stay internal:

- 5432 PostgreSQL
- 6379 Redis
- 9000 MinIO API
- 9001 MinIO console, if present
- 8080 Buzz health
- 9102 Buzz metrics

Buzz uses a canonical relay URL for authentication challenges, media links,
domain handling, and CORS. Initial setup will require the owner to select one
of the StartOS-known interface URLs. The package derives and updates these
settings as one atomic configuration:

- `RELAY_URL`
- `BUZZ_MEDIA_BASE_URL`
- `BUZZ_MEDIA_SERVER_DOMAIN`
- `BUZZ_CORS_ORIGINS`

LAN access is available according to StartOS interface settings. Tor and public
gateways are user-enabled StartOS capabilities and will not be described as
automatic.

## Configuration And Secrets

A persistent StartOS file model stores wrapper-owned state. Fresh installation
generates:

- PostgreSQL password
- Redis password
- MinIO access key and secret key
- Buzz relay private key
- Git-hook HMAC secret
- fixed bucket and internal database identifiers where appropriate

Secrets are generated only for a fresh install. Restart, rebuild, update, and
restore must never rotate them.

The first-run task requires:

- an owner Nostr public key, accepted as `npub` or 64-character hex
- a canonical StartOS interface URL

The package validates both values before modifying stored state. The owner key
is normalized to the format required by Buzz. Until setup is complete, a
critical StartOS task remains visible and secure relay startup is blocked.

The package enforces private-mode settings:

- token authentication required
- relay membership required
- stable owner identity required
- stable relay signing identity required

Settings unrelated to the StartOS runtime remain managed by upstream Buzz.

## StartOS Actions

The package exposes:

| Action | Purpose |
| --- | --- |
| Complete Initial Setup | Set and validate owner identity and canonical URL |
| Set Primary URL | Atomically update URL-derived Buzz configuration |
| Add Member | Add a member or administrator Nostr identity |
| Remove Member | Revoke a member or administrator identity |
| List Members | Display the private-relay roster |
| Connection Information | Display the relay URL used by external clients |

Membership actions execute upstream `buzz-admin` commands in the Buzz image.
Inputs are validated before execution, command failures are returned without
changing wrapper state, and secret values are never emitted in logs or action
results.

## Volumes And Ownership

Use separate StartOS volumes:

| Volume | Contents |
| --- | --- |
| `startos` | Wrapper file models, stable secrets, owner, and primary URL |
| `postgres` | PostgreSQL data |
| `redis` | Redis AOF data |
| `media` | MinIO objects and uploaded media |
| `git` | Buzz Git repositories and pack cache |

Image users and mount ownership must be inspected and tested. Buzz `/data/git`
must be writable by UID/GID 1000. PostgreSQL, Redis, and MinIO ownership must be
derived from their pinned images and represented with StartOS idmaps or
initialization logic as needed.

## Backup And Restore

Every package defines a backup strategy. StartOS stops the full service before
backup, giving a quiescent maintenance window.

The backup includes:

- SDK-managed PostgreSQL dump and restore
- `startos`
- `redis`
- `media`
- `git`

`restoreInit` remains first in the initialization sequence. Restore preserves
all identities and credentials, revalidates the canonical URL, and creates a
setup task if the restored URL is no longer one of the available interface
origins.

Buzz database schema changes remain owned by `buzz-admin migrate`. The StartOS
version graph handles only wrapper-owned file model, configuration, or volume
changes.

## Health And Failure Handling

Internal checks:

- PostgreSQL: `pg_isready`
- Redis: authenticated `PING`
- MinIO: `/minio/health/live`
- bucket initialization: successful one-shot completion
- database migration: successful one-shot completion
- Buzz: `/_readiness`

Internal sidecar checks are not displayed as separate user-facing services.
The user-facing health state reports whether the Buzz interface is ready, with
specific underlying failures retained in logs and daemon status.

Failure behavior:

- Invalid owner keys or URLs are rejected without partial writes.
- Missing first-run configuration blocks relay startup.
- Sidecar, bucket, or migration failures block dependent daemons.
- Secrets are not regenerated to recover from failures.
- A failed restore or migration does not report the relay as healthy.
- Package requirements such as memory and disk are measured before being
  declared; they are not guessed.

## Upstream Update Workflow

For each selected upstream snapshot:

1. Fetch `upstream/main` in `buzz9`.
2. Confirm the local branch can fast-forward.
3. Fast-forward and push `origin/main`.
4. Inspect changes since the packaged commit, especially:
   - `Dockerfile`
   - `crates/buzz-relay/`
   - `crates/buzz-admin/`
   - migrations and schema
   - `deploy/compose/`
   - `.env.example`
5. Verify the exact SHA image and both architectures.
6. Review new environment variables, ports, files, permissions, health checks,
   migrations, and persistent paths.
7. Update `buzz-startos` image pins, prerelease ExVer, localized release notes,
   and wrapper behavior.
8. Build and validate both S9PK artifacts.
9. Open a reviewed update PR. Do not auto-merge.

## Documentation

`README.md` will contain:

- a concise high-level explanation of Buzz
- a clear statement that this is the StartOS backend package
- runtime topology and image provenance
- architecture-specific build artifacts
- sideload and first-run steps
- external client connection steps
- StartOS-managed and upstream-managed configuration
- interfaces and canonical URL behavior
- actions
- volumes and ownership
- backup and restore
- health checks
- external dependencies, explicitly none
- limitations and differences from upstream
- upstream synchronization policy
- contributor build and test commands
- an AI-readable YAML quick reference

The README follows StartOS guidance by documenting downstream differences
instead of copying upstream documentation. It does not embed version numbers or
mutable image references.

`instructions.md` is a shorter, user-facing post-install guide rendered inside
StartOS. `UPDATING.md` contains exact commands and fields for updating every
upstream image. `CONTRIBUTING.md` records the package-specific workflow.

## Verification

### Static And Unit Checks

- `npm ci`
- TypeScript type checking
- formatting checks
- focused tests for:
  - Nostr identity parsing and normalization
  - canonical URL parsing and derived environment variables
  - fresh-install-only secret generation
  - action input validation
  - version and update metadata helpers, if introduced

### Image And Package Checks

- Verify every image tag and digest from its registry.
- Verify linux/amd64 and linux/arm64 manifests.
- Build `buzz_x86_64.s9pk`.
- Build `buzz_aarch64.s9pk`.
- Inspect both package manifests and signatures with `start-cli`.
- Run `git diff --check`.
- Generate SHA-256 checksums for distributable artifacts.

### On-Device Checks

- Sideload and install on x86_64 StartOS 0.4.0.
- Sideload and install on aarch64 StartOS 0.4.0.
- Complete initial owner and URL setup.
- Confirm HTTP access and WebSocket upgrade.
- Connect an external Buzz client.
- Add, list, and remove members.
- Upload and retrieve media.
- Exercise persistent Git storage.
- Restart and confirm all state remains.
- Back up, remove or replace state, and restore.
- Confirm invalid setup, unavailable sidecars, and migration failures do not
  produce a false healthy state.

If both hardware targets are not locally available, the unexecuted on-device
matrix item must remain explicitly reported rather than inferred from a
successful build.

## Acceptance Criteria

- `buzz9` is synchronized without downstream source commits.
- `buzz-startos` follows the StartOS 0.4 package layout.
- The Buzz snapshot and every sidecar are pinned and reproducible.
- Separate x86_64 and aarch64 S9PK artifacts build successfully.
- Private first-run setup is enforced.
- The relay and all sidecars start in the correct order.
- Only the intended Buzz interface is exposed.
- Membership actions work through StartOS.
- Restart, backup, and restore preserve all required data and identities.
- The README accurately explains Buzz and every StartOS-specific behavior.
- All completed verification commands and remaining device-test gaps are
  reported.
