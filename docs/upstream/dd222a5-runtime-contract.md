# Buzz `dd222a5` Runtime Contract

This record freezes the upstream and container contract used by the first
StartOS package. All upstream source links below are pinned to the full commit;
mutable branch links are intentionally absent.

## Selected snapshot

| Item | Frozen value |
| --- | --- |
| Source commit | [`dd222a509b156ba52ed3219e895d7bf1cf322c92`](https://github.com/block/buzz/commit/dd222a509b156ba52ed3219e895d7bf1cf322c92) |
| Commit timestamp | `2026-07-26T07:57:31Z` |
| Relay crate version | [`0.2.0`](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/Cargo.toml#L1-L7) |
| Published tag | `ghcr.io/block/buzz:sha-dd222a5` |
| Immutable image reference | `ghcr.io/block/buzz:sha-dd222a5@sha256:8cb0c4023a40acdd352dca8d922c193da4c9cea3beed484a62d8cfc03e9a93c9` |

Direct registry inspection returned this OCI index:

| Platform | Runtime manifest digest |
| --- | --- |
| OCI index | `sha256:8cb0c4023a40acdd352dca8d922c193da4c9cea3beed484a62d8cfc03e9a93c9` |
| `linux/amd64` | `sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152` |
| `linux/arm64` | `sha256:ff4d22c5cc747b61a83441bfdb4bd0a5902630b958e68be9976ea50e478bc6e7` |

The index also contains one `unknown/unknown` provenance attestation manifest
for each runtime manifest. Those attestations are not runtime platforms. Both
runtime manifests carry
`org.opencontainers.image.revision=dd222a509b156ba52ed3219e895d7bf1cf322c92`.

## Image runtime

The [runtime Dockerfile](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/Dockerfile#L114-L159)
creates `buzz:buzz` as UID/GID 1000, installs `curl`, copies the relay and admin
binaries, exposes the three ports, selects `USER buzz:buzz`, and sets the relay
entrypoint.

The following facts were also checked against each pulled platform manifest,
not inferred only from the Dockerfile:

| Check | `linux/amd64` | `linux/arm64` |
| --- | --- | --- |
| Config user | `buzz:buzz` | `buzz:buzz` |
| `/etc/passwd` | `buzz:x:1000:1000::/var/lib/buzz:/usr/sbin/nologin` | same |
| `/etc/group` | `buzz:x:1000:` | same |
| Entrypoint | `/usr/local/bin/buzz-relay` | same |
| Exposed TCP ports | `3000`, `8080`, `9102` | same |
| `/bin/sh` | present (`sh -> dash`) | present (`sh -> dash`) |
| `/usr/bin/curl` | present and executable | present and executable |
| `/usr/local/bin/buzz-relay` | present and executable | present and executable |
| `/usr/local/bin/buzz-admin` | present and executable | present and executable |

Port 3000 carries the HTTP/WebSocket application, port 8080 carries liveness
and readiness, and port 9102 carries Prometheus metrics, as documented by the
[image declarations](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/Dockerfile#L138-L159)
and [health router](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/router.rs#L222-L231).

The image supplies these baked defaults in addition to `PATH`:

```text
BUZZ_WEB_DIR=/srv/buzz/web
BUZZ_ADMIN_WEB_DIR=/srv/buzz/admin-web
```

`BUZZ_ADMIN_WEB_DIR` only identifies bundled files. It does not enable the
admin surface without `BUZZ_ADMIN_HOST`.

## Baseline delta

The historical planning baseline resolves to
`8eb6e3eb601174249642373a6a367262fa476753`. Exactly six commits lead from it
to the selected source:

1. [`aa51dab9da5fef7054d03cf1a1207986d0000684`](https://github.com/block/buzz/commit/aa51dab9da5fef7054d03cf1a1207986d0000684) - desktop relay-mesh supervision
2. [`ab7aa8b1200710dbc2d7a8661ed5aab95c4199c1`](https://github.com/block/buzz/commit/ab7aa8b1200710dbc2d7a8661ed5aab95c4199c1) - desktop Wayland clipboard support
3. [`5d1233e841b0efa91470bb45467b2c8e4284ebf6`](https://github.com/block/buzz/commit/5d1233e841b0efa91470bb45467b2c8e4284ebf6) - desktop Agents view refactor
4. [`cc6c4d3471629fad018bcf645f9471a01b9ffe2f`](https://github.com/block/buzz/commit/cc6c4d3471629fad018bcf645f9471a01b9ffe2f) - desktop AppImage packaging
5. [`c2a4ee711e481bb427d6cf8cd08b2c7329d1508c`](https://github.com/block/buzz/commit/c2a4ee711e481bb427d6cf8cd08b2c7329d1508c) - README diagram formatting
6. [`dd222a509b156ba52ed3219e895d7bf1cf322c92`](https://github.com/block/buzz/commit/dd222a509b156ba52ed3219e895d7bf1cf322c92) - mobile settings and themes

The newly selected `c2a4ee7..dd222a5` range is one mobile-only commit. Across
all six commits, the complete changed-path set is limited to `desktop/`,
`mobile/`, `scripts/bundle-sidecars.sh`, `.github/workflows/release.yml`, and
`README.md`. Git object IDs at all three revisions (the baseline, prior
selected commit, and new selected commit) prove the packaged runtime inputs
are byte-identical:

| Path | Object ID at all three revisions |
| --- | --- |
| `Dockerfile` | `661be6c3a7c7030d9684626da85dbccb297a040e` |
| `crates/buzz-relay` | `70727caebcdabd871cdf2249f388b1748af9c327` |
| `crates/buzz-admin` | `70754a537b83771bfc04b4960074952f970943e7` |
| `crates/buzz-db` | `2b3fe5d171609b949a0782d4a303e9877fd537f7` |
| `crates/buzz-media` | `e51b80482f890628c0cb33b487aa84594f0117de` |
| `migrations` | `52c1e9b9e620a46a73916da151f0deb89f5440fc` |
| `admin-web` | `c21ff0a3d302092d7aec717b77b76b5d85b1c9e0` |
| `web` | `8ad007cf2fab3aed0de3405a56c4dac7f6fd4754` |
| `deploy/compose` | `3e8179cfcc6199df04f3078700d893865a5aee66` |
| `docker-compose.yml` | `0056ea6a4262d0efc92d3a4f23bd8b32ad310b12` |

## Admin CLI

The command surface comes from the pinned
[`buzz-admin` clap declarations](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-admin/src/main.rs#L34-L96).
The exact packaged invocations are:

```text
buzz-admin migrate
buzz-admin add-member --pubkey <NPUB_OR_64_HEX> [--role <member|admin>]
buzz-admin remove-member --pubkey <NPUB_OR_64_HEX> [--role <member|admin>]
buzz-admin list-members
```

`add-member` defaults to role `member`; neither command may assign role
`owner`, and the owner cannot be removed. `remove-member --role` is an optional
current-role guard. The mutating member commands receive `DATABASE_URL`,
`REDIS_URL`, `RELAY_URL`, and `BUZZ_RELAY_PRIVATE_KEY`; `list-members`
receives only `DATABASE_URL` and `RELAY_URL`. The CLI resolves the same
URL-derived community as the relay and fails closed if that host is not mapped
([implementation](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-admin/src/main.rs#L386-L459)).

These four usage strings were executed from the pinned amd64 image with
`buzz-admin <command> --help`.

## Packaged environment

Only the Buzz daemon receives this complete runtime map. Values in angle
brackets are stable secrets or values derived from the one-time setup state:

```text
BUZZ_BIND_ADDR=0.0.0.0:3000
BUZZ_HEALTH_PORT=8080
BUZZ_METRICS_PORT=9102
DATABASE_URL=postgres://buzz:<percent-encoded-password>@127.0.0.1:5432/buzz
REDIS_URL=redis://:<percent-encoded-password>@127.0.0.1:6379
RELAY_URL=<canonical-ws-or-wss-url>
BUZZ_MEDIA_BASE_URL=<canonical-http-or-https-origin>/media
BUZZ_CORS_ORIGINS=<canonical-http-or-https-origin>
BUZZ_S3_ENDPOINT=http://127.0.0.1:9000
BUZZ_S3_ACCESS_KEY=<stored-access-key>
BUZZ_S3_SECRET_KEY=<stored-secret-key>
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
RELAY_OWNER_PUBKEY=<stored-lowercase-64-hex-owner-pubkey>
BUZZ_RELAY_PRIVATE_KEY=<stored-64-hex-private-key>
BUZZ_GIT_HOOK_HMAC_SECRET=<stored-64-hex-secret>
RUST_LOG=buzz_relay=info,buzz_db=info,buzz_auth=info,buzz_pubsub=info,tower_http=info
```

The pinned source reads the core URL, database, Redis, membership, media, Git,
push, admin, and web settings in
[`Config::from_env`](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/config.rs#L403-L850).
Migrations remain a separate one-shot because
[`BUZZ_AUTO_MIGRATE=false`](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/main.rs#L145-L171);
the enabled Git probe admits MinIO only after its conditional-write check
([probe](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/main.rs#L465-L500)).

Every process other than the Buzz daemon receives only its restricted
variables:

```text
# buzz-admin migrate one-shot
DATABASE_URL=postgres://buzz:<percent-encoded-password>@127.0.0.1:5432/buzz

# buzz-admin list-members action
DATABASE_URL=postgres://buzz:<percent-encoded-password>@127.0.0.1:5432/buzz
RELAY_URL=<canonical-ws-or-wss-url>

# buzz-admin add-member and remove-member actions
DATABASE_URL=postgres://buzz:<percent-encoded-password>@127.0.0.1:5432/buzz
REDIS_URL=redis://:<percent-encoded-password>@127.0.0.1:6379
RELAY_URL=<canonical-ws-or-wss-url>
BUZZ_RELAY_PRIVATE_KEY=<stored-64-hex-private-key>

# PostgreSQL daemon
POSTGRES_DB=buzz
POSTGRES_USER=buzz
POSTGRES_PASSWORD=<stored-postgres-password>
POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256
PGDATA=/var/lib/postgresql/data

# Redis daemon
REDIS_PASSWORD=<stored-redis-password>

# Redis readiness command only
REDISCLI_AUTH=<stored-redis-password>

# MinIO daemon
MINIO_ROOT_USER=<stored-access-key>
MINIO_ROOT_PASSWORD=<stored-secret-key>

# MinIO client create-bucket one-shot only
MC_HOST_local=http://<percent-encoded-access-key>:<percent-encoded-secret-key>@127.0.0.1:9000
```

The package deliberately does not emit:

- `BUZZ_RELAY_URL`: this is a client/CLI variable; the relay server reads
  `RELAY_URL`.
- `BUZZ_MEDIA_SERVER_DOMAIN`: this is stale Compose-era configuration;
  `BUZZ_MEDIA_BASE_URL` is the active relay input.
- `TYPESENSE_API_KEY`: the selected relay has no packaged Typesense service.
- `BUZZ_ADMIN_HOST`: omission is intentional and disables the admin API and
  SPA even though the image contains the admin bundle.

## State authority

- **PostgreSQL is authoritative structured state.** Upstream identifies
  `buzz-db` as the
  [Postgres event store](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-db/src/lib.rs#L1-L10);
  it also holds communities, membership, names, workflows, and other relay
  metadata. StartOS backs it up with a logical database dump, not a raw volume
  copy. Clean initialization passes
  `POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256`, and logical restore passes
  the equivalent `initdb` argument, so later loopback TCP clients must
  authenticate with the preserved password. The SDK restore hook uses a local
  Unix socket while PostgreSQL is isolated from TCP.
- **MinIO is authoritative object state.** It stores media and the durable Git
  manifests/packs. Git hydration explicitly says
  [object storage remains authoritative](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/api/git/hydrate.rs#L1-L23).
  The `media` volume is therefore backup state.
- **Redis is transient but persisted.** It carries pub/sub and coordination
  state; upstream notes that protocol-ephemeral events are
  [Redis pub/sub only](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-db/src/lib.rs#L3-L8).
  The package nevertheless enables AOF, mounts `/data`, and includes that
  volume in backups to preserve useful transient state across restarts and
  restores.
- **`/data/git` is disposable cache.** Upstream states that no authoritative
  repository data lives there and that repositories hydrate from object
  storage per request
  ([configuration contract](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/config.rs#L211-L218)).
  The `git-cache` volume may improve restart performance, but is excluded from
  backup and may be rebuilt.

## Canonical host

Initial setup stores one canonical HTTP(S) origin. The package derives
`RELAY_URL`, `BUZZ_MEDIA_BASE_URL`, and `BUZZ_CORS_ORIGINS` from that stored
origin on every start; it never discovers or silently substitutes a later
StartOS address. The canonical origin is therefore immutable package identity,
not an editable runtime preference.

This matches upstream's host-bound tenant model. Startup derives and seeds the
deployment community from `RELAY_URL`
([startup](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/main.rs#L221-L264)).
Tenant-bearing requests bind the normalized `Host` to the Postgres community
map, with no default tenant
([binding](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/tenant.rs#L61-L108)).
An unknown or missing `Host` is rejected before a WebSocket upgrade and before
any frame is read
([router](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/router.rs#L251-L298)).

The rejection is a tenant-data boundary, not a universal HTTP firewall:
upstream intentionally serves the generic NIP-11 document before host binding,
and the static SPA shell can be returned before its tenant-bound API calls.

## Access and bundled surfaces

- **Media is link-accessible.** `BUZZ_REQUIRE_MEDIA_GET_AUTH=false` makes a
  media GET/HEAD on a mapped host succeed without Blossom auth or membership;
  upstream returns public immutable cache headers in that mode
  ([media gate](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/api/media.rs#L476-L523)).
  MinIO itself remains private; access is through the relay's content-addressed
  media link.
- **The admin UI/API is disabled.** Without `BUZZ_ADMIN_HOST`, the admin config
  is `None` and the router does not merge `/api/admin/v1`
  ([config](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/config.rs#L813-L840),
  [router](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/router.rs#L52-L60)).
  StartOS actions use `buzz-admin` instead.
- **Hosted iOS push is disabled.** The package sets
  `BUZZ_PUSH_GATEWAY_DELIVERY_URL` to an explicit empty string, which upstream
  maps to `None` rather than its hosted default
  ([parser](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/config.rs#L742-L758)).
- **The bundled browser is limited.** Invite pages are limited to
  `/invite/<single-segment-code>`. With `BUZZ_SERVE_GIT_WEB_GUI=true`, the
  additional SPA routes are exactly `/`, `/repos`, and `/repos/*`; arbitrary
  paths return 404
  ([route predicates](https://github.com/block/buzz/blob/dd222a509b156ba52ed3219e895d7bf1cf322c92/crates/buzz-relay/src/router.rs#L194-L213)).
  It is not the full Buzz client; normal workspace use requires the external
  desktop or mobile client.

## Verification record

The audit used these exact references and commands. The one line containing
`<path>` is explicitly a template repeated for every runtime path in the
byte-identity table above.

```text
git rev-list --left-right --count origin/main...upstream/main
git rev-list --count 8eb6e3e..dd222a509b156ba52ed3219e895d7bf1cf322c92
git diff --name-status c2a4ee711e481bb427d6cf8cd08b2c7329d1508c..dd222a509b156ba52ed3219e895d7bf1cf322c92
git rev-parse 8eb6e3e:<path> c2a4ee711e481bb427d6cf8cd08b2c7329d1508c:<path> dd222a509b156ba52ed3219e895d7bf1cf322c92:<path>
docker buildx imagetools inspect ghcr.io/block/buzz:sha-dd222a5
docker pull --platform linux/amd64 ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152
docker pull --platform linux/arm64 ghcr.io/block/buzz@sha256:ff4d22c5cc747b61a83441bfdb4bd0a5902630b958e68be9976ea50e478bc6e7
docker image inspect ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152
docker image inspect ghcr.io/block/buzz@sha256:ff4d22c5cc747b61a83441bfdb4bd0a5902630b958e68be9976ea50e478bc6e7
AMD64_FS_CONTAINER="$(docker create --platform linux/amd64 ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152)"
docker export "$AMD64_FS_CONTAINER" | tar -tvf - bin usr/bin/sh usr/bin/dash usr/bin/curl usr/local/bin/buzz-relay usr/local/bin/buzz-admin
docker rm "$AMD64_FS_CONTAINER"
ARM64_FS_CONTAINER="$(docker create --platform linux/arm64 ghcr.io/block/buzz@sha256:ff4d22c5cc747b61a83441bfdb4bd0a5902630b958e68be9976ea50e478bc6e7)"
docker export "$ARM64_FS_CONTAINER" | tar -tvf - bin usr/bin/sh usr/bin/dash usr/bin/curl usr/local/bin/buzz-relay usr/local/bin/buzz-admin
docker rm "$ARM64_FS_CONTAINER"
docker run --rm --platform linux/amd64 --entrypoint /usr/local/bin/buzz-admin ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152 migrate --help
docker run --rm --platform linux/amd64 --entrypoint /usr/local/bin/buzz-admin ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152 add-member --help
docker run --rm --platform linux/amd64 --entrypoint /usr/local/bin/buzz-admin ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152 remove-member --help
docker run --rm --platform linux/amd64 --entrypoint /usr/local/bin/buzz-admin ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152 list-members --help
```

Before synchronization the fork comparison was `0 1`, with `origin/main` an
ancestor of `upstream/main`. After the `--ff-only` update and push, local
`main`, `origin/main`, and `upstream/main` all resolved to the selected full
SHA, the comparison was `0 0`, and the mirror worktree was clean.
