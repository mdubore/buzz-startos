# Buzz `651f637` StartOS r2 Runtime Contract

Date: 2026-08-04

This record covers the downstream runtime images packaged by Buzz on StartOS
revision `:2`. It supplements the audited upstream application contract in
[`651f637-runtime-contract.md`](651f637-runtime-contract.md); the Buzz
application source remains exact upstream commit
`651f6372754e60e3f936b3397040eb0f1e44c9f3`.

## Reviewed Sources And Build Inputs

| Runtime | Exact source |
| --- | --- |
| Buzz | `block/buzz` commit `651f6372754e60e3f936b3397040eb0f1e44c9f3` |
| MinIO | release `RELEASE.2025-10-15T17-29-55Z`, commit `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` |
| MinIO Client | release `RELEASE.2025-08-13T08-35-41Z`, commit `7394ce0dd2a80935aded936b09fa12cbb3cb8096` |

`scripts/prepare-runtime-image-source.sh` fetches those full commits, verifies
`HEAD`, and rejects dirty or mismatched trees. The MinIO and client builds use
the reviewed `images/*/go.mod` and `go.sum` files with Go 1.26.5. Buzz uses Rust
1.95 and Node 24. Buzz application files are not patched.

The runtime stages use Alpine 3.24 index
`sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b`.
The Buzz Rust builder uses `rust:1.95-alpine3.23` index
`sha256:606fd313a0f49743ee2a7bd49a0914bab7deedb12791f3a846a34a4711db7ed2`;
the web builder uses `node:24-alpine3.24` index
`sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43`.
All base references are digest-pinned, and each runtime runs `apk upgrade`
before installing its required packages.

Reviewed build-input SHA-256 values:

| Input | SHA-256 |
| --- | --- |
| `images/buzz/Dockerfile` | `5f7fce5459c7826fcf8e65e92f02e779200e168c77b424035f28939c9b3529c9` |
| `images/minio/Dockerfile` | `12256678a3f0dde779391889b4a651a1d69e546b1735606cae1a421272e1e3a7` |
| `images/minio/go.mod` | `03146ea2df4f348f497940ed0f61faf283cdfe7ab548f1c9447628ae473e27e3` |
| `images/minio/go.sum` | `b33c65c3b595cb007b9ff5cff09fb84a1d93a4e978db520580bcb9e6137fe845` |
| `images/mc/Dockerfile` | `4dc4263dff000d97f27d2986e71e4feb58f2dba67506efb6cc03d3012da726df` |
| `images/mc/go.mod` | `263d9362279b5c2f7a5693f79335a495c3ecfb0940ce425e033d1afe5173835e` |
| `images/mc/go.sum` | `49bc9617d8c678289c256676395b06f21b859967d954825497304dfb00b3d689` |
| source-preparation script | `cdcc38c02359e96e9d9e7725b54f493c2fc72db0f3a01b17039f9a7223366554` |
| publication workflow | `d75c6e21def77e7150b1dad3ea1f7874c4fcb0c7ea1c82ca5474d71a3231f1df` |

## Native Publication And Provenance

GitHub Actions Runtime Images run `31002688940` built the six native manifests
from package commit `5dd0ff1d20e3a7e1a6edb763524849ac09d3fab5`. The amd64 jobs ran on
`ubuntu-24.04`; the arm64 jobs ran on `ubuntu-24.04-arm`. Each job proved its
native `uname`, built one digest without emulation, pulled it back, and ran the
runtime-specific smoke check. All six jobs passed.

The three merge jobs created one two-platform index per runtime, emitted GitHub
build-provenance attestations, and passed their own `gh attestation verify`
step. The workflow completed successfully at `2026-08-05T11:59:50Z`:
<https://github.com/mdubore/buzz-startos/actions/runs/31002688940>.

| Runtime | Immutable tag | Index | amd64 manifest | arm64 manifest |
| --- | --- | --- | --- | --- |
| Buzz | `ghcr.io/mdubore/buzz-startos/buzz:651f637-startos-r2` | `sha256:61c2c9008e3853264b3df6dbc3119ee7ba1d6278340a1780eaec0b955f2dd985` | `sha256:169af34712fa2d8e2de95626689a2580b0b3231a780d7512322a6fb69641542a` | `sha256:5966d41571e6a79e70ff13eda2fbcf06fec886d74a07b413c51d8c04198b823f` |
| MinIO | `ghcr.io/mdubore/buzz-startos/minio:2025-10-15-startos-r2` | `sha256:5cff18515d059362060790bb17928a25b8b3653f5ac842a7742e9953ffa3a5d9` | `sha256:cf33684eacfc87dbde1e2bedc24c85f85ca1dc7bc7f566b220a8b04fc38667e9` | `sha256:3c9bb9f4ef4e50aeb875365cf405d7ea36dac0fdfd8c294daa43808783e50821` |
| MinIO Client | `ghcr.io/mdubore/buzz-startos/mc:2025-08-13-startos-r2` | `sha256:b1a507ecdf3ef5272791bd3e5b66e9f6e9b73d093f3aab9a0f481fd1e729baf6` | `sha256:4c75881d7a130597c444d9d233ad0ec41dc62e6c025374f93365e7c7fa1fbd1c` | `sha256:c0ea7881bae5f9e0df24bda610c6fe9ed2f51504924474a0eef0a2c4ec2a1827` |

`npm run verify:images` resolved every tag and confirmed its recorded index,
one amd64 manifest, one arm64 manifest, and cross-architecture runtime metadata.

## Runtime Compatibility

### Buzz

- image user and group are `buzz:buzz`, UID/GID 1000;
- entrypoint is `/usr/local/bin/buzz-relay`, workdir is `/var/lib/buzz`, and
  exposed ports remain 3000, 8080, and 9102;
- `buzz-relay`, `buzz-admin`, and `buzz-pair-relay` are executable;
- curl, Git, OpenSSL, both static web trees, and `/data/git` are present;
- `buzz-admin migrate --help` succeeds; and
- a bounded start of `buzz-pair-relay` listens on `127.0.0.1:5000`.

The local exact-source Docker build, identity/file checks, admin command, and
pair-relay startup all passed. Grype identified the runtime distribution as
Alpine 3.24.1 on the resulting image.

### MinIO And MinIO Client

The rebuilt server reports release `RELEASE.2025-10-15T17-29-55Z`, commit
`9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`, and Go 1.26.5. The client reports
release `RELEASE.2025-08-13T08-35-41Z`, commit
`7394ce0dd2a80935aded936b09fa12cbb3cb8096`, and Go 1.26.5.

A local isolated integration run started the rebuilt MinIO image with a Docker
volume and synthetic credentials, waited for `/minio/health/ready`, used the
rebuilt client to create `buzz-media`, set anonymous access to `none`, wrote and
read an object, restarted MinIO, read the object again, and deleted it. The
bucket, private policy, object I/O, and restart-persistence contract passed.

## StartOS And Client Boundary

The wrapper contract is unchanged: PostgreSQL, Redis, MinIO, bucket creation,
Git-cache ownership repair, migrations, the main relay, and pairing relay keep
their existing dependency order and private volumes. The r2 rebuild changes
runtime provenance and patched system packages, not StartOS state or migration
semantics.

The dedicated pairing process remains separate from the main relay. StartOS
publishes its root WebSocket interface, `BUZZ_PAIRING_RELAY_URL` supplies the
selected root to Buzz, and NIP-11 advertises that exact value. Clients must not
append `/pair`; the dedicated root fixes the prior server-side HTTP 404.

This does not make the current private-CA setup a supported Android path.
Unmodified Android still rejects the private StartOS Root CA during secure
pairing in the observed configuration, and remote mobile access is not provided
by this package. A future public-domain/StartTunnel design must be implemented
and tested separately.

## Decision

The rebuilt runtime compatibility checks, native workflow smoke tests,
provenance checks, immutable-pin verification, and the linked ten-manifest
security scan pass. Real StartOS install, lifecycle, client, backup/restore, and
cross-architecture device tests remain separate required evidence.
