<p align="center">
  <img src="icon.svg" alt="Buzz logo" width="21%" />
</p>

# Buzz on StartOS

> **Upstream docs:** <https://github.com/block/buzz#readme>
>
> Everything not listed here should behave as documented by upstream Buzz.

[![Security Drift](https://github.com/mdubore/buzz-startos/actions/workflows/security-drift.yml/badge.svg?branch=main)](https://github.com/mdubore/buzz-startos/actions/workflows/security-drift.yml)

> [!WARNING]
> This candidate is security-blocked and test-only. Its dependency and
> native-image gates are not clear, its StartOS device matrix has not been run,
> and it must not be submitted to the Community Registry yet. See the
> [current evidence index](docs/EVIDENCE.md) and
> [remaining work](TODO.md).

This package runs the Buzz relay/backend and its private data services on the
official stable StartOS release line. The full workspace interface remains an
external Buzz Desktop client; the relay image exposes only limited invite and
repository browser routes.

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Configuration Management](#configuration-management)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Client WSS and Mobile Interoperability](#client-wss-and-mobile-interoperability)
- [Actions](#actions)
- [Backups and Restore](#backups-and-restore)
- [Health Checks and Startup](#health-checks-and-startup)
- [Dependencies](#dependencies)
- [Limitations and Differences](#limitations-and-differences)
- [What Is Unchanged from Upstream](#what-is-unchanged-from-upstream)
- [Evidence and Build Workflow](#evidence-and-build-workflow)
- [Contributing](#contributing)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

## Image and Container Runtime

The package supports `x86_64` and `aarch64`. It uses upstream-published images
for Buzz, PostgreSQL, Redis, MinIO, and the MinIO client.
The official `block/buzz` image pins are defined in
[`startos/image-pins.ts`](startos/image-pins.ts), along with the OCI indexes and
native platform manifests.

The Buzz image supplies the main relay, `buzz-admin`, and the stateless
`buzz-pair-relay` binary. StartOS runs the main image entrypoint for the relay,
uses `buzz-admin migrate` before relay startup, and runs the pairing binary on
its own binding. The other images retain their publisher entrypoints with the
StartOS-specific arguments described under health and startup.

The immutable upstream source and inspected runtime behavior are recorded in
the [current evidence index](docs/EVIDENCE.md). Package identity and release notes live in
[`startos/versions/current.ts`](startos/versions/current.ts), not this README.
The reviewed update procedure is [`UPDATING.md`](UPDATING.md).

## Volume and Data Layout

| Volume      | Container mount            | Contents and authority                                                                  |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `startos`   | StartOS-managed file model | Wrapper schema, stable secrets, owner key, canonical URL, pairing URL, membership clock |
| `postgres`  | `/var/lib/postgresql`      | Authoritative structured metadata and signed events                                     |
| `redis`     | `/data`                    | AOF-backed coordination, presence, rate-limit, and replay state                         |
| `media`     | `/data`                    | Authoritative MinIO media and durable Git objects                                       |
| `git-cache` | `/data/git`                | Disposable Git hydration and pack cache                                                 |

A root-only startup one-shot recursively repairs ownership only on `git-cache`;
the relay itself runs as the unprivileged `buzz` user. Durable Git objects live
in MinIO, so deleting this cache must not destroy a repository.

## Installation and First-Run Flow

Buzz will not start with an unconfigured or ambiguous restored identity.

1. Complete the critical **Complete Initial Setup** item.
2. Enter the owner's Nostr public key as an `npub` or hexadecimal public key.
   Never enter an `nsec` or another private key into a StartOS action.
3. Select the StartOS URL that will permanently identify the community.
4. Complete **Configure Pairing Relay** with an address exported by the pairing
   interface.
5. Start Buzz after both setup items clear.

The canonical URL is immutable because Buzz uses its host for tenant identity,
authentication challenges, CORS, media links, and Git URLs. A restore blocks
until that same host is available; the package does not silently switch to a
different empty community. The pairing URL is mutable and may be replaced with
another address exported by the pairing interface.

## Configuration Management

| StartOS-managed                                                                                                                   | Upstream-managed                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Owner and relay identity, canonical and pairing URLs, service secrets, database/storage endpoints, auth policy, binds, migrations | Channel membership, workspace content, repositories, canvases, workflows |

The wrapper derives and supplies these runtime variables. Values and secrets
are intentionally omitted:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_INITDB_ARGS
PGDATA
REDIS_PASSWORD
MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
BUZZ_BIND_ADDR
BUZZ_HEALTH_PORT
BUZZ_METRICS_PORT
BUZZ_PAIRING_RELAY_URL
DATABASE_URL
REDIS_URL
RELAY_URL
BUZZ_MEDIA_BASE_URL
BUZZ_CORS_ORIGINS
BUZZ_S3_ENDPOINT
BUZZ_S3_ACCESS_KEY
BUZZ_S3_SECRET_KEY
BUZZ_S3_BUCKET
BUZZ_S3_REGION
BUZZ_S3_ADDRESSING_STYLE
BUZZ_S3_FORCE_PATH_STYLE
BUZZ_DB_POOL_SIZE
BUZZ_REPLICA_READ_MAX_AGE_MS
BUZZ_GIT_REPO_PATH
BUZZ_AUTO_MIGRATE
BUZZ_GIT_CONFORMANCE_PROBE
BUZZ_REQUIRE_AUTH_TOKEN
BUZZ_REQUIRE_RELAY_MEMBERSHIP
BUZZ_ALLOW_NIP_OA_AUTH
BUZZ_REQUIRE_MEDIA_GET_AUTH
BUZZ_SERVE_GIT_WEB_GUI
BUZZ_PUSH_GATEWAY_DELIVERY_URL
BUZZ_MESH
BUZZ_MESH_DEMO_ECHO
BUZZ_HUDDLE_AUDIO_AVAILABLE
RELAY_OWNER_PUBKEY
BUZZ_RELAY_PRIVATE_KEY
BUZZ_GIT_HOOK_HMAC_SECRET
RUST_LOG
```

PostgreSQL TCP access uses password authentication, Redis requires its
generated password, MinIO remains private, and the main relay requires Nostr
authentication plus relay membership. Replica reads are disabled in this
single-node package.

## Network Access and Interfaces

| StartOS interface      | Internal port | Protocol presented by StartOS | Purpose                                                                 |
| ---------------------- | ------------: | ----------------------------- | ----------------------------------------------------------------------- |
| **Buzz Web**           |        `3000` | HTTP or HTTPS                 | Limited invite and repository browser routes                            |
| **Buzz Relay**         |        `3000` | WS or WSS                     | Main Nostr relay, HTTP APIs, media gateway, and Git Smart HTTP endpoint |
| **Buzz Pairing Relay** |        `5000` | WS or WSS                     | Temporary device-pairing rendezvous                                     |

Additional internal-only ports are `5432` for PostgreSQL, `6379` for Redis,
`9000` for the MinIO API, `9001` for the MinIO console binding, `8080` for
Buzz readiness, and `9102` for Buzz metrics.

Buzz speaks plain HTTP and WebSocket internally. StartOS supplies HTTPS/WSS at
enabled interface addresses and preserves the external `Host` header and
WebSocket upgrades. Tenant-bearing requests for an unknown host fail closed.

LAN, Tor, and public gateway reachability are operator choices for each
interface. This package does not enable remote access, Tor, public DNS, port
forwarding, or public certificates automatically. A second address is not an
alias for the immutable canonical host.

## Client WSS and Mobile Interoperability

### Desktop and ACP private-CA connections

Private `.local`, IP, and private-domain StartOS addresses normally present a
certificate signed by the StartOS Root CA. Buzz Desktop and `buzz-acp` make
independent WSS connections, so local use with those addresses requires a
reviewed native-root-aware build of both paths and the StartOS Root CA installed
in the operating-system trust store. The maintained
[downstream companion-client fork](https://github.com/mdubore/buzz9) carries
that remediation. Keep certificate and hostname verification enabled.

A public domain with a publicly trusted certificate is a valid alternative.
It must be configured and enabled before initial setup if it will be the
canonical host. This package does not provision the domain, certificate,
gateway, DNS, or port forwarding.

### Fixed pairing topology and remaining Android limit

The current server-side setup is **LAN-only** and does not enable remote
access. Previously, the main relay advertised pairing capability without a
NIP-11 `pairing_relay_url`; Buzz Desktop then derived `<main relay>/pair`, and
the main relay returned HTTP `404` because it does not serve pairing there.
That was a discovery and topology mismatch, not a main-relay failure.

The package now exports the dedicated **Buzz Pairing Relay** WSS interface on
internal port `5000`. **Configure Pairing Relay** selects its root address,
`BUZZ_PAIRING_RELAY_URL` supplies that address to Buzz, and NIP-11 advertises
the exact `pairing_relay_url` as a dedicated root. Buzz Desktop connects to
that root instead of appending `/pair`. This fixes the server-side 404 without
a Buzz client modification.

The pairing relay is temporary and stateless. It transfers encrypted account
data only while a device is added; subsequent mobile traffic uses the main
relay. Pairing health requires a complete HTTP `101 Switching Protocols`
handshake, so an HTTP `400` listener response is not accepted as healthy.

In the current private-CA configuration, unmodified Android rejects the
certificate path signed by the private StartOS Root CA, so the secure pairing
connection fails with an Android TLS trust error. This observed result is
specific to the current configuration; it does not establish that Android
cannot work with a publicly trusted certificate. Unmodified Android remains
unsupported here. Do not
weaken certificate or hostname validation and do not treat a modified mobile
app as the long-term solution.

Remote mobile is not supported. A future StartTunnel or equivalent VPS design
may provide public DNS, publicly trusted certificates, and routing for both WSS
interfaces, optionally with split DNS for local traffic. That future project
and its user guide are separate from `buzz-startos`, are not implemented here,
and must be validated before any remote-mobile claim.

## Actions

| Action                      | Visibility and availability   | Input and result                                                               |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| **Connection Information**  | Visible; any state            | Shows canonical web, relay, pairing URLs, and the owner public key; no secrets |
| **Configure Pairing Relay** | Visible when stopped          | Selects an exported root WS/WSS pairing address                                |
| **Add Member**              | Visible while running         | Adds a new `member` or `admin` role for an `npub` or hexadecimal public key    |
| **Remove Member**           | Visible while running         | Removes the selected relay role                                                |
| **List Members**            | Visible while running         | Displays the current private-relay roster                                      |
| **Complete Initial Setup**  | Hidden critical item          | Sets the immutable owner and canonical URL on a fresh installation             |
| **Verify Stable State**     | Hidden critical recovery item | Requires recovery of missing, malformed, or unreadable wrapper state           |
| **Verify Canonical URL**    | Hidden critical recovery item | Confirms the original host is exported after restore or gateway change         |

**Configure Pairing Relay** is also presented as a critical setup item while
its stored address is missing or unavailable. Re-adding an existing relay
member is a no-op and does not change the role. The immutable owner cannot be
added or removed through membership actions. Relay membership is distinct from
membership and roles inside an individual Buzz channel.

## Backups and Restore

StartOS stops Buzz, validates stable state, and stores:

- a logical PostgreSQL dump;
- the `startos`, `redis`, and `media` volumes.

The raw `postgres` volume and disposable `git-cache` volume are excluded.
Restore runs before wrapper migrations, interfaces, actions, and setup checks,
and preserves the owner, canonical URL, pairing URL, relay key, service secrets,
and data-store credentials.

Before updating an older published package, follow
[`PRE_UPGRADE_AUDIT.md`](docs/operations/PRE_UPGRADE_AUDIT.md). It requires a
verified backup and clean-target restore plus proof that an active owner exists
in every channel. The updater will not automatically promote an arbitrary
owner.

## Health Checks and Startup

1. PostgreSQL, Redis, MinIO, the pairing relay, and Git-cache ownership repair
   start independently.
2. MinIO bucket creation follows MinIO readiness and keeps anonymous bucket
   access disabled.
3. Database migration waits for PostgreSQL, bucket creation, and cache repair.
4. Buzz starts after PostgreSQL, Redis, MinIO, bucket creation, cache repair,
   and migration; it performs the S3 conformance probe.
5. **Buzz Relay** is healthy only when Buzz readiness and MinIO liveness pass.
6. **Buzz Pairing Relay** is reported separately after a bounded, valid
   WebSocket upgrade.

PostgreSQL uses `pg_isready`, Redis requires an authenticated `PONG`, and MinIO
uses its readiness and liveness endpoints. Any required sidecar, one-shot,
storage probe, or relay failure keeps the service unhealthy.

Redis and the pairing relay each have a readiness grace period of 60 seconds.
PostgreSQL and MinIO each have 120 seconds, and Buzz has 180 seconds.

## Dependencies

**None.** PostgreSQL, Redis, MinIO, and the MinIO client are private packaged
subcontainers, not dependencies on other StartOS services.

## Limitations and Differences

1. The canonical URL is immutable; no host-rename migration exists.
2. The package is a security-blocked, test-only candidate and is not eligible
   for Community Registry submission until its recorded dependency and image
   findings are remediated and rescanned.
3. Remote mobile is unsupported. In the current private-CA configuration,
   unmodified Android rejects the StartOS Root CA path and secure pairing fails.
4. Tenant-bearing requests for unknown hosts fail closed.
5. Media is link-accessible: possession of a content-addressed media URL is
   sufficient to read it, so treat the URL as a bearer link.
6. Hosted background iOS push delivery is disabled; ordinary relay
   connectivity is unaffected.
7. The upstream admin web application is disabled; use StartOS actions for
   relay membership.
8. A full browser client is not included. Only limited invite and repository
   routes are enabled.
9. Protected browser identity flows require a compatible NIP-07 signer.
10. Restore diagnostics are sensitive because a failed database-password
    restore may expose the password in local command arguments or logs.
11. Resource requirements are not declared. Measurement remains governed by
    [`RESOURCE_SIZING.md`](docs/operations/RESOURCE_SIZING.md).
12. The complete real-device, upgrade, backup/restore, client, and
    architecture matrix remains unverified.

## What Is Unchanged from Upstream

Within the server-side limits above, Buzz retains upstream Nostr identities and
signed events, channels and direct messages, canvases, workflows, search,
audit history, media, Git collaboration, NIP-42 WebSocket authentication,
NIP-98 HTTP/Git authentication, and NIP-OA support. Use upstream documentation
for product behavior not changed here.

## Evidence and Build Workflow

The machine-readable device identity template is
[`DEVICE_CANDIDATE.json`](docs/testing/DEVICE_CANDIDATE.json) and remains
`UNFROZEN`. `npm run verify:device-evidence` validates evidence structure;
`npm run verify:device-promotion` additionally requires a frozen candidate,
all 46 passing cells, and authenticated independent review.

Evidence attachments must be local SHA-256-verified regular files no larger
than 16 MiB. Symbolic links are rejected. Validation uses no-follow file
handles, streams checksum and credential checks through the same handle, and
rejects changed or out-of-tree evidence.

All 46 StartOS device-matrix cells remain **NOT RUN**. Follow
[`DEVICE_TEST_RUNBOOK.md`](docs/testing/DEVICE_TEST_RUNBOOK.md), the pre-upgrade
audit above, and the resource-sizing procedure before any production claim.

From a reviewed packaging workspace, the source gates are:

```bash
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
```

The two build targets contain only their native architecture; packing does not
execute the target binaries. Runtime validation therefore requires matching
physical StartOS devices. No registry submission, push, pull request, promotion,
or publication is performed by the package build.

Community Registry work follows the official stable StartOS
[publishing guide](https://docs.start9.com/packaging/publishing.html). The
initial email, later fork pull requests, beta publication, and production
promotion remain manual and unperformed for this candidate.

## Contributing

Read [`AGENTS.md`](AGENTS.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md). Upstream
updates must follow [`UPDATING.md`](UPDATING.md) and preserve the separation
between the official server image and the downstream companion-client fork.

## Quick Reference for AI Consumers

```yaml
package_id: buzz
purpose: private Buzz relay and backend for a Nostr-signed human/agent workspace
architectures: [x86_64, aarch64]
interfaces:
  buzz_web: { port: 3000, protocol: http_https }
  buzz_relay: { port: 3000, protocol: ws_wss }
  buzz_pairing_relay: { port: 5000, protocol: ws_wss }
internal_ports:
  postgres: 5432
  redis: 6379
  minio_api: 9000
  minio_console: 9001
  buzz_health: 8080
  buzz_metrics: 9102
volumes:
  startos: wrapper state and stable secrets
  postgres: authoritative structured data and events
  redis: AOF-backed coordination state
  media: authoritative media and durable Git objects
  git-cache: disposable Git hydration cache
dependencies: none
actions:
  - connection-information
  - configure-pairing-relay
  - add-member
  - remove-member
  - list-members
  - complete-initial-setup
  - verify-stable-state
  - verify-canonical-url
provenance:
  package_version: startos/versions/current.ts
  image_pins: startos/image-pins.ts
  upstream_runbook: UPDATING.md
  evidence_index: docs/EVIDENCE.md
```
