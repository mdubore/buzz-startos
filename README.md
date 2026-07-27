<p align="center">
  <img src="icon.svg" alt="Buzz logo" width="21%" />
</p>

# Buzz for StartOS

> [!WARNING]
> The current `:2` prerelease packages the frozen Buzz snapshot `dd222a5` and
> predates upstream fix [`00ecf2c`](https://github.com/block/buzz/commit/00ecf2cac7544d986b4eb111ad0a8b1d7560791f)
> for unauthorized channel-role changes, including owner demotion. The
> published `:2` artifacts are unsuitable for production. A new package
> revision must sync the fix and pass the StartOS device matrix.

This repository packages the Buzz relay and its data services for the official
stable StartOS `0.4.0` release. Production acceptance targets an exact stable
device build; the SDK-generated manifest minimum `0.4.0-beta.10` is only a
compatibility floor and does not count as device validation.

The machine-readable release identity is
[`docs/testing/DEVICE_CANDIDATE.json`](docs/testing/DEVICE_CANDIDATE.json). It
intentionally remains `UNFROZEN` until final native package artifacts and both
StartOS device-image identities exist. `npm run verify:device-evidence` checks
the template and linked records during execution; the release-only
`npm run verify:device-promotion` command additionally requires one frozen
identity and exactly 46 linked passing cells.

## What Buzz Is

[Buzz](https://github.com/block/buzz) is a self-hosted workspace where people
and AI agents collaborate under Nostr identities. Messages and workspace
activity are signed events, giving people and agents the same identity model
and an attributable, tamper-evident audit history.

The upstream product combines channels, direct messages, media, canvases,
workflows, search, audit history, and Git collaboration. Buzz is not a
blockchain service. Nostr supplies signed identities and events without adding
a chain or token.

## What This Package Runs

This package runs the **Buzz relay/backend**, not the full Buzz client. Use an
external Buzz desktop client for the complete workspace interface. Upstream
mobile clients are under development and have not been validated with this
package.

The relay image includes a limited browser surface for invite and repository
routes. Those routes do not provide the complete channels, DMs, canvases,
workflows, or agent experience available in the external client.

No other StartOS service is a dependency. PostgreSQL, Redis, MinIO, and the
MinIO client are packaged as private subcontainers in the same service.

## StartOS Architecture

| Component | StartOS purpose |
| --- | --- |
| Buzz | Serves the Nostr relay, HTTP APIs, WebSocket connections, limited browser routes, media gateway, and Git Smart HTTP endpoint. |
| PostgreSQL | Stores authoritative events, communities, membership, search data, workflow state, audit history, and repository metadata. |
| Redis | Provides pub/sub, coordination, presence, rate limiting, and NIP-98 replay state. AOF persistence is enabled for continuity. |
| MinIO | Stores authoritative media and durable Git objects, manifests, and packs in the `buzz-media` bucket. |
| MinIO client | Runs the idempotent bucket-creation and private-access setup one-shot, then exits. |

All images come from upstream publishers. The exact OCI index and native
platform digests are recorded in
[`startos/image-pins.ts`](startos/image-pins.ts); the README deliberately does
not duplicate mutable tags.

## Network Model

StartOS binds one service port:

| Scope | Port | Purpose |
| --- | ---: | --- |
| StartOS interface | `3000` | Buzz HTTP, WebSocket relay, media, and Git traffic |
| Internal only | `5432` | PostgreSQL |
| Internal only | `6379` | Redis |
| Internal only | `9000` | MinIO API |
| Internal only | `9001` | MinIO console binding |
| Internal only | `8080` | Buzz health endpoints |
| Internal only | `9102` | Buzz metrics |

The StartOS proxy must preserve the external `Host` header and WebSocket
upgrades. Buzz binds each community to its canonical host; tenant-bearing HTTP
and WebSocket requests for an unknown host fail closed.

Buzz itself serves plain HTTP on the internal binding and does not terminate
TLS. The enabled StartOS address and proxy supply TLS for HTTPS and secure
WebSockets.

LAN, Tor, and public gateway reachability are StartOS choices made by the
operator for this interface. This package does not enable Tor or public access
automatically. Enable only the gateway addresses you intend to operate, and do
not assume that adding a second address makes it an alias for the selected
Buzz community.

## Sideload

Release bundles contain separate native archives:

- `buzz_x86_64.s9pk` for an x86_64 StartOS device
- `buzz_aarch64.s9pk` for an aarch64 StartOS device

There is no universal archive. Before uploading an artifact:

1. Download the architecture-matched `.s9pk`, `SHA256SUMS`, and this
   repository's committed signer files.
2. Verify the downloaded checksum:

   ```bash
   sha256sum --ignore-missing -c SHA256SUMS
   ```

3. Verify the S9PK v2 header signer and archive signature:

   ```bash
   scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk
   # or: scripts/verify-s9pk-signer.sh buzz_aarch64.s9pk
   ```

The committed Ed25519 public key is
[`assets/signing-pubkey.pem`](assets/signing-pubkey.pem). Its raw-key
fingerprint is recorded in
[`assets/signing-pubkey.sha256`](assets/signing-pubkey.sha256):

```text
sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c
```

After verification, open the target StartOS device, select **Sideload** in the
top navigation, choose the architecture-matched archive, review its package
details, and install it. Sideloading bypasses a registry; checksum and signer
verification are therefore part of the trust decision.

## First Run

Buzz will not start an unconfigured or ambiguously restored community.

1. Run the critical **Complete Initial Setup** task presented by StartOS.
2. Enter the owner's Nostr public key as an `npub` or 64-character hexadecimal
   key.
3. Select the StartOS URL that will permanently identify this Buzz community.
4. Confirm the normalized URL, then start Buzz after the critical task clears.

Treat the selected canonical URL as immutable. Buzz uses it for tenant
identity, NIP-42 and NIP-98 challenges, media links, Git URLs, and CORS.
Changing only an address would identify a different empty community, so this
package blocks startup instead of silently substituting another host.

StartOS can present three distinct blocking tasks:

| Task | Meaning | Resolution |
| --- | --- | --- |
| Complete Initial Setup | Stable secrets exist, but owner identity and canonical URL have not been chosen. | Enter the owner key and select the permanent URL. |
| Verify Stable State | The wrapper store is missing, unreadable, or malformed. | Restore a known-good StartOS backup, or reset and reinstall; then verify the recovered state. |
| Verify Canonical URL | Restored state is valid, but the original URL is not currently available on the interface. | Restore that exact StartOS address, then verify it. |

Stable secrets are generated only on a fresh installation. Restart, container
rebuild, update, and restore do not rotate them.

StartOS stores only the owner's public key. Never enter an `nsec` or other
private key into a StartOS action. The owner must control the matching private
key in the external client to authenticate as that identity.

## Connect A Buzz Client

1. Run **Connection Information** in the StartOS Actions view.
2. Copy the **Relay WebSocket URL**.
3. Add that relay to the external Buzz desktop client.
4. Authenticate with the matching private key for the owner or an admitted
   member.

The action also shows the canonical web URL and normalized owner public key.
It never returns relay, database, Redis, MinIO, or HMAC secrets. Mobile client
support remains upstream work in progress and is not part of the current
device-test claim.

## Private Relay Management

The relay requires membership. These user-only actions are available while it
is running:

| Action | Input | Result |
| --- | --- | --- |
| Add Member | Nostr `npub` or hex public key; `member` or `admin` role | Admits a new normalized identity; re-adding an existing identity is a no-op and does not change its role |
| Remove Member | Nostr `npub` or hex public key; current `member` or `admin` role | Removes the selected role |
| List Members | None | Returns the current relay roster |

The immutable owner cannot be added or removed through membership actions.
Add and remove operations are serialized across callers and persist their last
attempted event second so upstream membership events cannot collide after a
package-process restart.

Relay membership grants admission to the community; channel membership is a
separate Buzz workspace control. The relay `admin` role is also separate from
the disabled upstream admin dashboard/API.

## Data And Backups

| Volume | Contents | Backup policy |
| --- | --- | --- |
| `startos` | Wrapper schema, stable secrets, owner key, canonical URL, membership scheduling timestamp | Included |
| `postgres` | PostgreSQL data directory | Excluded as raw files; replaced by an SDK-managed logical dump and restore |
| `redis` | Redis AOF and useful transient coordination state | Included |
| `media` | MinIO's authoritative media and durable Git object storage | Included |
| `git-cache` | Rebuildable Git scratch repositories and pack cache | Excluded and disposable |

PostgreSQL is authoritative for structured metadata and Nostr events. MinIO is
authoritative for media and durable Git objects. Redis is transient but its
AOF is retained for continuity. Deleting `git-cache` must not destroy a
repository; Buzz is expected to hydrate it again from MinIO.

StartOS stops the service for a backup. The package validates stable state,
creates a logical PostgreSQL dump, and copies `startos`, `redis`, and `media`.
Restore runs before wrapper migrations, interfaces, actions, and setup checks.
The restored owner, canonical URL, relay key, database password, Redis
password, MinIO credentials, and HMAC secret are preserved rather than
regenerated.

## Health And Startup

Startup is ordered:

1. Start PostgreSQL, Redis, and MinIO and wait for their private readiness
   checks.
2. Create the MinIO bucket idempotently and keep anonymous bucket access
   disabled.
3. Run `buzz-admin migrate` with only the database environment.
4. Start Buzz with automatic migrations disabled.
5. Let Buzz run its S3 conditional-write conformance probe.
6. Report the user-facing **Buzz Relay** health check only when Buzz readiness
   and MinIO liveness both succeed.

PostgreSQL uses `pg_isready`, Redis requires an authenticated `PONG`, and MinIO
uses its liveness endpoint. A sidecar, bucket, migration, S3 conformance, relay,
or later MinIO failure prevents a healthy service state.

## Security And Limitations

- **Canonical URL is immutable.** There is no host-rename migration. An
  unavailable original address blocks startup.
- **Unknown hosts fail closed for tenant data.** A generic NIP-11 document or
  static shell may be served before tenant binding, but tenant-bearing HTTP and
  WebSocket operations cannot select a fallback community.
- **Media links are link-accessible.** MinIO is private, but a mapped relay
  host serves content-addressed media GET/HEAD requests without membership
  authentication in this compatibility configuration. Media URLs are not
  automatically discoverable, but possession of a URL is sufficient to read
  it; treat it as a bearer link.
- **Nostr signatures are the client credential.** WebSockets use NIP-42 and
  HTTP/Git routes use NIP-98. Production REST enforcement, relay membership,
  and NIP-OA support remain enabled. No manual generic-token credential or
  StartOS token-management action is exposed to normal clients.
- **Protected browser flows require NIP-07.** Joining through an invite and
  other durable browser identity operations require a compatible NIP-07
  signer. Anonymous ephemeral browser identities are not used for durable
  membership.
- **Hosted iOS push delivery is disabled.** The upstream hosted delivery URL
  is deliberately empty, so hosted/background iOS push notifications are
  unavailable. Ordinary iOS relay connectivity is not disabled by this flag.
- **The upstream admin web application is disabled.** Membership management
  is exposed through StartOS actions instead.
- **There is no full browser client.** Only the limited invite and repository
  routes in the relay image are enabled.
- **PostgreSQL loopback access requires its password.** Clean initialization
  and logical restore both configure SCRAM authentication for TCP clients;
  private loopback networking is not treated as an authentication boundary.
- **Restore diagnostics are sensitive.** The accepted Start SDK 2.0.9
  residual can include the PostgreSQL password in local restore error argv/log
  output if password restoration fails. Do not publish or attach unredacted
  restore diagnostics.
- **Resource requirements are not declared yet.** CPU, memory, and disk
  measurements remain part of the fixed
  [`production-v1` resource profile](docs/testing/RESOURCE_PROFILE.production-v1.json);
  see [`RESOURCE_SIZING.md`](docs/operations/RESOURCE_SIZING.md).

## Upstream And Reproducibility

Application source and StartOS packaging stay in separate repositories:

- `mdubore/buzz9` is a clean, fast-forward-only mirror of `block/buzz`.
- `mdubore/buzz-startos` contains the StartOS integration and no Buzz
  application patches.

The packaged Buzz source is frozen at commit
[`dd222a509b156ba52ed3219e895d7bf1cf322c92`](https://github.com/block/buzz/commit/dd222a509b156ba52ed3219e895d7bf1cf322c92).
Manifest image inputs combine the upstream SHA reference with an immutable OCI
index digest, and record native amd64 and arm64 platform digests. The live
image verifier rejects tag drift, missing platforms, revision mismatches, and
unexpected runtime metadata.

CI uses only reviewed, full-commit action pins and repository-local reusable
workflows. Pull requests, main-branch pushes, and manual builds create separate
x86_64 and aarch64 sideload artifacts with ephemeral signing identities.
Matching version tags use the protected `release` environment to build both
architectures with the release key, verify each signer, and publish an
idempotent GitHub prerelease with checksums and the signing public key. The
workflow does not publish to a StartOS registry or S3. See
[`UPDATING.md`](UPDATING.md) for the reviewed upstream-update procedure and
[`docs/upstream/dd222a5-runtime-contract.md`](docs/upstream/dd222a5-runtime-contract.md)
for the frozen runtime evidence.

The package version and localized release notes live only in
[`startos/versions/current.ts`](startos/versions/current.ts).

## Build And Test

The reviewed local toolchain is:

| Tool | Required version | Pin or reviewed x86_64 binary checksum |
| --- | --- | --- |
| Node.js | `22.23.1` | Managed through NVM |
| Start SDK | `2.0.9` | Locked by `package-lock.json` |
| Start CLI | `1.1.0` | `70eff67b6e9a936acd8aaaf787b783819252ecedaa5c74d462e3b15ed4dd843a` |
| Docker Buildx | `0.35.0` | `d41ece72044243b4f58b343441ae37446d9c29a7d6b5e11c61847bbcf8f7dfda` |

Use a StartOS packaging workspace containing `.startos/`,
`start-technologies/`, `buzz9/`, and this package repository. From the package
root:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22.23.1

# Bootstrap the SDK Makefile include, then remove every generated output.
npm ci
make clean
npm ci

npm test
npm run prettier:check
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
npm run verify:images
npm run verify:device-evidence
npm run build

make x86
make arm

start-cli s9pk inspect buzz_x86_64.s9pk manifest
start-cli s9pk inspect buzz_x86_64.s9pk commitment
start-cli s9pk inspect buzz_aarch64.s9pk manifest
start-cli s9pk inspect buzz_aarch64.s9pk commitment
scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk buzz_aarch64.s9pk
```

Each archive contains native images for only its target architecture. Packing
selects OCI manifests and assembles filesystems; it does not execute target
binaries. QEMU is therefore unnecessary for these local package builds.
Runtime behavior still requires real x86_64 and aarch64 StartOS device tests.

## Status

- The automated suite covers identity, immutable URL state, secrets, runtime
  configuration, daemon health, membership serialization, backup policy,
  release workflow policy, and production evidence validation.
- Type checking, formatting, SDK lint, and package compilation are automated
  gates.
- The public
  [`:2` prerelease](https://github.com/mdubore/buzz-startos/releases/tag/v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2)
  contains signed native x86_64 and aarch64 packages built from package commit
  `0103ba8`. Its release workflow, checksums, S9PK signatures, signer identity,
  commitments, and manifests passed static verification.
- The canonical published SHA-256 hashes are
  `8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2`
  for x86_64 and
  `72e4e73e413df327af11eba48c4808b1e011729c3a1f6113d25a6c63138c2638`
  for aarch64. See the release's
  [`PUBLISHED-ARTIFACT-VERIFICATION.md`](https://github.com/mdubore/buzz-startos/releases/download/v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2/PUBLISHED-ARTIFACT-VERIFICATION.md).
- All 46 StartOS device-matrix cells remain **NOT RUN**. Install, client,
  authorization, media, Git, persistence, failure, backup/restore, upgrade,
  lifecycle, and resource behavior remain unproven on both architectures.
- At final verification on 2026-07-27, upstream `main` was 22 commits beyond
  `dd222a5` and included an authorization security fix. A new runtime-contract
  review, image-pin refresh, package revision, and device validation are
  required before stable use.
- This package has not been published to a registry.

See [`DEVICE_TEST_MATRIX.md`](docs/testing/DEVICE_TEST_MATRIX.md) for current
status and [`DEVICE_TEST_RUNBOOK.md`](docs/testing/DEVICE_TEST_RUNBOOK.md) for
the ordered evidence procedure. Updating from the published `:2` revision also
requires [`PRE_UPGRADE_AUDIT.md`](docs/operations/PRE_UPGRADE_AUDIT.md).

## AI Quick Reference

```yaml
package_id: buzz
purpose: private Buzz relay and backend for a Nostr-signed human/agent workspace
startos_target: official stable v0.4.0
minimum_startos: "0.4.0-beta.10"
release_status: "prerelease; sideload only; not production-ready"
device_validation: "46 matrix cells NOT RUN"
upstream_snapshot: dd222a509b156ba52ed3219e895d7bf1cf322c92
security_status: ":2 predates unauthorized role-change fix 00ecf2c"
full_client:
  required: true
  desktop: external Buzz desktop application
  mobile: upstream work in progress; not validated
public_ports:
  buzz_http_websocket: 3000
internal_ports:
  postgres: 5432
  redis: 6379
  minio_api: 9000
  minio_console: 9001
  buzz_health: 8080
  buzz_metrics: 9102
actions:
  visible:
    - connection-information
    - add-member
    - remove-member
    - list-members
  blocking:
    - complete-initial-setup
    - verify-stable-state
    - verify-canonical-url
volumes:
  startos: wrapper state and stable secrets
  postgres: authoritative structured data and events
  redis: persisted transient state
  media: authoritative media and Git objects
  git-cache: disposable Git hydration cache
backup_authority:
  included:
    - logical PostgreSQL dump
    - startos
    - redis
    - media
  excluded:
    - raw postgres volume
    - git-cache
canonical_url:
  immutable: true
  unknown_tenant_hosts_fail_closed: true
privacy_caveats:
  media_get: link-accessible but not automatically discoverable
  ios_push: hosted background delivery disabled; relay connectivity unaffected
  admin_web: disabled
  browser_client: limited routes only
  restore_logs: may expose PostgreSQL password on SDK restore failure
build_targets:
  x86_64: buzz_x86_64.s9pk
  aarch64: buzz_aarch64.s9pk
dependencies: none
provenance:
  image_pins: startos/image-pins.ts
  package_version: startos/versions/current.ts
  runtime_contract: docs/upstream/dd222a5-runtime-contract.md
  signing_key: assets/signing-pubkey.pem
  signing_fingerprint: assets/signing-pubkey.sha256
  upstream_runbook: UPDATING.md
```
