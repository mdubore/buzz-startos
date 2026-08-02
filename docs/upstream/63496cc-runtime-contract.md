# Buzz `63496cc` Runtime Contract

Date: 2026-07-30
Package status: local test-only sideload candidate
Current package identity:
`0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2`

This record freezes the upstream and container contract used by the current
package source. It does not claim that a package artifact or live StartOS
workflow has passed validation, and it does not approve the image for
production. See
[`../security/63496cc-runtime-scan.md`](../security/63496cc-runtime-scan.md) for
the vulnerability blocker.

## Source Identity

| Item                | Reviewed value                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| Upstream repository | `https://github.com/block/buzz`                                           |
| Source commit       | `63496cc1d4c6f1b7c613801bdcc694169dcf391a`                                |
| Commit time         | `2026-07-30T00:35:15Z`                                                    |
| Relay crate version | `0.2.0`                                                                   |
| Published tag       | `ghcr.io/block/buzz:sha-63496cc`                                          |
| OCI index           | `sha256:9de8aff13af33f3b17659e6eacda024b3070efda911c5e08d4d85a6c01c4deb6` |
| `linux/amd64`       | `sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf` |
| `linux/arm64`       | `sha256:414d8e183f3ccd45eb228cfdb1d6d88da463dd7440bc726c500abd435d0e7c3c` |

The selected commit is 125 commits after the previously packaged `dd222a5`
snapshot and contains upstream authorization fix `00ecf2c`.

## Image Metadata

The amd64 image config records:

| Field              | Value                                      |
| ------------------ | ------------------------------------------ |
| OCI revision label | `63496cc1d4c6f1b7c613801bdcc694169dcf391a` |
| User               | `buzz:buzz`                                |
| Working directory  | `/var/lib/buzz`                            |
| Entrypoint         | `/usr/local/bin/buzz-relay`                |
| Ports              | `3000/tcp`, `8080/tcp`, `9102/tcp`         |
| Web tree           | `/srv/buzz/web`                            |
| Admin web tree     | `/srv/buzz/admin-web`                      |
| Relay binary       | `/usr/local/bin/buzz-relay`                |
| Pairing binary     | `/usr/local/bin/buzz-pair-relay`           |
| Admin binary       | `/usr/local/bin/buzz-admin`                |

The StartOS package continues to disable the upstream admin surface. The
bundled `buzz-admin` binary is used for migrations and the package's constrained
membership actions.

Filesystem inspection of both pinned native manifests confirmed that
`/usr/local/bin/buzz-pair-relay` is present and executable. This is image
evidence for the packaged binary, not evidence that a real StartOS client has
completed a pairing session.

## StartOS Topology

The package runs these processes in one StartOS service:

| Process            | Role                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Buzz relay         | HTTP, WebSocket, media, Git, and health endpoints                |
| Buzz pairing relay | temporary, stateless WebSocket rendezvous for adding a device    |
| PostgreSQL 17      | authoritative event, membership, workflow, and metadata store    |
| Redis 7            | pub/sub, coordination, presence, rate limiting, and replay state |
| MinIO              | authoritative media and durable Git object store                 |
| MinIO client       | idempotent private-bucket initialization                         |

PostgreSQL, Redis, and both MinIO processes bind only to loopback. StartOS
exports the main relay on internal port 3000 and the separate pairing relay on
internal port 5000. The package declares what those interfaces serve; the user
decides where each interface is reachable.

## Pairing Discovery And Relay Contract

At pinned commit `63496cc`,
`crates/buzz-pair-relay/src/lib.rs:7-16` documents the upstream deployment
contract: it declares that the binary binds to loopback only and must sit behind
a reverse proxy that routes only `/pair` to it, enforces HTTP header-read
timeouts, and terminates TLS. The same source explicitly says that the relay
does not enforce request paths or pre-upgrade connection limits itself.

The current package makes an intentional StartOS-specific adaptation for this
LAN-only beta. It is a deviation from the upstream shared-origin `/pair`
topology, not an upstream-equivalent deployment by omission:

1. The package starts `/usr/local/bin/buzz-pair-relay` with
   `BUZZ_PAIR_RELAY_BIND_ADDR=0.0.0.0:5000` inside its isolated pairing
   subcontainer instead of using the binary's loopback default.
2. StartOS maps a dedicated **Buzz Pairing Relay** host and interface only to
   that sidecar. The separate main host maps to `buzz-relay` and has no route to
   the pairing subcontainer. Because the pairing host serves no other
   application, host/interface isolation substitutes here for upstream's
   shared-origin route restriction; it does not make the sidecar enforce
   `/pair`.
3. **Configure Pairing Relay** accepts and stores only a normalized root
   `ws://` or `wss://` URL currently exported by the dedicated interface.
4. The package passes the exact stored value to the main Buzz daemon as
   `BUZZ_PAIRING_RELAY_URL`.
5. Upstream parses that variable as an optional WebSocket URL and includes it
   unchanged as `pairing_relay_url` in the main relay's NIP-11 document. Buzz
   Desktop consumes that advertised value unchanged and therefore connects to
   the dedicated root. It appends `/pair` only for the legacy case where NIP-43
   is advertised without `pairing_relay_url`.

For an enabled TLS interface address, the StartOS gateway terminates client TLS
before proxying plaintext HTTP to this sidecar. This was checked against local
`start-technologies` commit
`8de292a361afbd4875784a5af1ac768d0d92ef4f`:
`shared-libs/crates/start-core/src/net/host/binding.rs:376-378` identifies
`add_ssl` as the OS TLS-termination boundary, while
`shared-libs/crates/start-core/src/net/http.rs:333-338` configures the HTTP/1
proxy with a 60-second `header_read_timeout`. Package host separation is in
`startos/interfaces.ts:19-23,49-63`.

The upstream source's default loopback bind, path restriction, timeout, and TLS
requirements therefore remain explicit review criteria. For an enabled TLS
address, the current dedicated host supplies the timeout and TLS controls and
narrows routing to the isolated sidecar, but its root path and `0.0.0.0`
container bind are deliberate beta adaptations rather than claims of full
upstream production conformance.

The main `buzz-relay` router has no WebSocket pairing route at `/pair`, so the
old fallback correctly received HTTP 404. The dedicated `buzz-pair-relay`
upgrade handler does not enforce a request path; a valid WebSocket upgrade at
the exported root therefore reaches it without a client patch. The package's
readiness and ongoing health checks exercise that root with a bounded RFC 6455
request. Every probe generates a fresh cryptographically random 16-byte nonce,
derives the request-specific `Sec-WebSocket-Accept`, and requires a complete
HTTP 101 Switching Protocols response with the expected `Connection`,
`Upgrade`, and derived accept headers. Because the probe offers neither an
extension nor a subprotocol, it rejects any response that negotiates either.
The prior HTTP-400 listener probe is no longer accepted as healthy.

These configuration, source, image-filesystem, and automated handshake facts
have been statically verified. Live dedicated-host routing and security
behavior, a StartOS update from the exact `:1` revision, NIP-11 response,
desktop QR flow, unmodified Android LAN TLS behavior, and remote StartTunnel or
equivalent public-tunnel deployment remain pending on real devices. The current
verified beta configuration is LAN-only, does not enable or validate mobile use
away from the home network, and is not evidence of full upstream production
conformance.

## Startup And Migrations

Daemon declaration order is not a serial startup contract. The actual
dependency graph is:

- PostgreSQL, Redis, MinIO, the independent pairing daemon, and the root
  `prepare-git-cache` one-shot have no dependency edges and may start in
  parallel.
- `create-bucket` waits for MinIO, creates `buzz-media` if absent, and enforces
  a private ACL.
- `migrate` waits for PostgreSQL, `create-bucket`, and `prepare-git-cache`; it
  runs `buzz-admin migrate` and receives only `DATABASE_URL`.
- the main Buzz daemon waits for PostgreSQL, Redis, MinIO, `create-bucket`,
  `prepare-git-cache`, and `migrate`, then starts with
  `BUZZ_AUTO_MIGRATE=false`.
- the pairing daemon remains outside the main Buzz dependency graph, so pairing
  health cannot take down an already active main relay.

This keeps schema mutation in one bounded one-shot before the daemon starts.
The selected image embeds 26 migrations. The two migrations added after the
previous package contract are:

- migration 25: community-scoped, use-limited relay invites;
- migration 26: the deployment-global `replica_heartbeat` row used by the
  portable replica-freshness fence.

Migration 26 creates exactly one heartbeat row with an epoch UUID and monotonic
token. It registers the table in `_operator_global_tables` because the row
describes deployment replication state rather than community data.

The migration is additive for this package. Existing PostgreSQL data remains
authoritative, and StartOS backup policy continues to use a logical PostgreSQL
dump rather than copying the live database volume.

## Database And Replica Routing

Upstream `63496cc` can connect a writer pool and an optional read-replica pool.
The StartOS package supplies one local PostgreSQL writer only:

```text
DATABASE_URL=postgres://buzz:<secret>@127.0.0.1:5432/buzz
BUZZ_DB_POOL_SIZE=50
BUZZ_REPLICA_READ_MAX_AGE_MS=0
```

The package deliberately does not set:

```text
READ_DATABASE_URL
BUZZ_DB_READ_POOL_SIZE
BUZZ_REPLICA_HEAD_MAX_AGE_SECS
```

Consequences:

- no reader pool is constructed;
- bounded-staleness routing is disabled;
- all reads use the writer;
- the replica fence remains fail-closed;
- the legacy seconds-denominated setting cannot accidentally activate.

The heartbeat migration is still required because it is part of the selected
upstream schema and permits a future reviewed replica deployment without a
schema discontinuity.

## S3 And MinIO

Upstream `63496cc` adds explicit S3 URL addressing. The package sets:

```text
BUZZ_S3_ENDPOINT=http://127.0.0.1:9000
BUZZ_S3_ADDRESSING_STYLE=path
BUZZ_S3_FORCE_PATH_STYLE=true
BUZZ_S3_BUCKET=buzz-media
BUZZ_S3_REGION=us-east-1
```

Path addressing is required because the local endpoint resolves only
`127.0.0.1`; virtual addressing would require a resolvable
`buzz-media.127.0.0.1`-style host. Access and secret keys remain generated
StartOS state and are passed only to Buzz, MinIO, and the scoped MinIO client
operations.

MinIO remains authoritative for media and durable Git objects. `/data/git` is
an ephemeral workspace and pack cache that Buzz can reconstruct from the
object store.

## Git Cache Ownership Repair

The package mounts the disposable Git cache at `/data/git` and runs a root-only
`chown -R buzz:buzz /data/git` one-shot before migrations and the unprivileged
Buzz daemon. The recursive repair covers populated legacy caches and avoids
ID-mapped mounts that fail on overlay-backed Server Pure storage. It is scoped
only to the cache mount. PostgreSQL and MinIO remain authoritative, and durable
Git objects can rehydrate the cache from MinIO; the repair does not classify
authoritative repository data as disposable.

## Preserved Security Configuration

The package continues to set:

```text
BUZZ_REQUIRE_AUTH_TOKEN=true
BUZZ_REQUIRE_RELAY_MEMBERSHIP=true
BUZZ_ALLOW_NIP_OA_AUTH=true
BUZZ_GIT_CONFORMANCE_PROBE=true
BUZZ_REQUIRE_MEDIA_GET_AUTH=false
BUZZ_SERVE_GIT_WEB_GUI=true
BUZZ_PUSH_GATEWAY_DELIVERY_URL=
BUZZ_MESH=off
BUZZ_MESH_DEMO_ECHO=off
```

The hosted push gateway and mesh features remain disabled. Media GET
authentication remains disabled for client compatibility, so possession of a
media URL is sufficient to retrieve that object.

Secret scope remains least-privilege by process:

- the pairing relay receives only `BUZZ_PAIR_RELAY_BIND_ADDR` and no stable
  secret;
- the migration one-shot receives only `DATABASE_URL`;
- `list-members` receives only `DATABASE_URL` and `RELAY_URL`;
- mutating membership actions additionally receive `REDIS_URL` and the relay
  signing key required to publish the membership event;
- PostgreSQL, Redis, MinIO, and the MinIO client each receive only their own
  credential inputs; and
- the main Buzz daemon receives the complete runtime map, while **Connection
  Information** returns only public URLs and the owner's public key.

## Test-Only Decision

Both native Buzz manifests produced 35 critical and 58 high scanner matches.
Any artifact from this source may therefore be used only for a controlled local
sideload test with disposable data. It must not be promoted, published as
stable, or treated as evidence that the 46-cell StartOS device matrix passed.

## Reproduction Commands

```bash
set -euo pipefail

git show -s --format='%H%n%cI%n%s' 63496cc1d4c6f1b7c613801bdcc694169dcf391a
git merge-base --is-ancestor 00ecf2cac7544d986b4eb111ad0a8b1d7560791f 63496cc1d4c6f1b7c613801bdcc694169dcf391a
docker buildx imagetools inspect ghcr.io/block/buzz:sha-63496cc
docker buildx imagetools inspect \
  ghcr.io/block/buzz@sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf \
  --format '{{json .Image}}'
docker pull --platform linux/amd64 \
  ghcr.io/block/buzz@sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf
docker pull --platform linux/arm64 \
  ghcr.io/block/buzz@sha256:414d8e183f3ccd45eb228cfdb1d6d88da463dd7440bc726c500abd435d0e7c3c

for platform_digest in \
  "linux/amd64@sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf" \
  "linux/arm64@sha256:414d8e183f3ccd45eb228cfdb1d6d88da463dd7440bc726c500abd435d0e7c3c"; do
  platform="${platform_digest%@*}"
  digest="${platform_digest#*@}"
  image="ghcr.io/block/buzz@$digest"
  container="$(docker create --platform "$platform" "$image")"
  docker export "$container" | tar -tvf - usr/local/bin/buzz-pair-relay
  docker rm "$container"
done
```
