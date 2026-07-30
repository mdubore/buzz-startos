# Buzz `63496cc` Runtime Contract

Date: 2026-07-30
Package status: local test-only sideload candidate

This record freezes the upstream and container contract used by the local
x86_64 StartOS test package. It does not approve the image for production. See
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
| Admin binary       | `/usr/local/bin/buzz-admin`                |

The StartOS package continues to disable the upstream admin surface. The
bundled `buzz-admin` binary is used for migrations and the package's constrained
membership actions.

## StartOS Topology

The package runs these processes in one StartOS service:

| Process       | Role                                                             |
| ------------- | ---------------------------------------------------------------- |
| Buzz relay    | HTTP, WebSocket, media, Git, and health endpoints                |
| PostgreSQL 17 | authoritative event, membership, workflow, and metadata store    |
| Redis 7       | pub/sub, coordination, presence, rate limiting, and replay state |
| MinIO         | authoritative media and durable Git object store                 |
| MinIO client  | idempotent private-bucket initialization                         |

PostgreSQL, Redis, and both MinIO processes bind only to loopback. StartOS
exposes Buzz port 3000 through the package interface.

## Startup And Migrations

The native stack starts in this order:

1. PostgreSQL and MinIO start.
2. The MinIO client creates `buzz-media` if absent and enforces a private ACL.
3. The Buzz image runs `buzz-admin migrate` with only `DATABASE_URL`.
4. Redis and all storage dependencies must be ready.
5. The relay starts with `BUZZ_AUTO_MIGRATE=false`.

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

## Test-Only Decision

Both native Buzz manifests produced 35 critical and 58 high scanner matches.
The x86_64 artifact may therefore be used only for a controlled local sideload
test with disposable data. It must not be promoted, published as stable, or
treated as evidence that the 46-cell StartOS device matrix passed.

## Reproduction Commands

```bash
git show -s --format='%H%n%cI%n%s' 63496cc1d4c6f1b7c613801bdcc694169dcf391a
git merge-base --is-ancestor 00ecf2cac7544d986b4eb111ad0a8b1d7560791f 63496cc1d4c6f1b7c613801bdcc694169dcf391a
docker buildx imagetools inspect ghcr.io/block/buzz:sha-63496cc
docker buildx imagetools inspect \
  ghcr.io/block/buzz@sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf \
  --format '{{json .Image}}'
```
