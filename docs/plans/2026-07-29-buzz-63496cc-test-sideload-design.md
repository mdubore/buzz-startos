# Buzz `63496cc` Test Sideload Design

Date: 2026-07-29
Status: Approved

## Purpose

Produce one x86_64 `.s9pk` for local sideload testing on a Start9 Server Pure.
The package will use the official Buzz image built from reviewed upstream commit
`63496cc1d4c6f1b7c613801bdcc694169dcf391a`.

This is not a production candidate. The Buzz image has known critical and high
vulnerability findings, the package has not passed the StartOS device matrix,
and repository promotion controls remain incomplete. The build must not create
or update a Git tag, GitHub release, registry entry, or production evidence
record.

## Frozen Inputs

The package will pin:

- source commit `63496cc1d4c6f1b7c613801bdcc694169dcf391a`;
- Buzz OCI index
  `sha256:9de8aff13af33f3b17659e6eacda024b3070efda911c5e08d4d85a6c01c4deb6`;
- amd64 manifest
  `sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf`;
- arm64 manifest
  `sha256:414d8e183f3ccd45eb228cfdb1d6d88da463dd7440bc726c500abd435d0e7c3c`.

The arm64 digest remains part of the immutable package declaration and image
verifier, but this task builds only `buzz_x86_64.s9pk`.

The test package version is derived from the upstream commit time and resets the
StartOS revision:

```text
0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:0
```

## Database And Replica Fencing

Upstream adds relay-invite migration 25 and the deployment-global
`replica_heartbeat` migration 26. The existing StartOS startup order remains
correct:

1. start PostgreSQL;
2. initialize the private MinIO bucket;
3. run `buzz-admin migrate` with the writer `DATABASE_URL`;
4. start the relay with `BUZZ_AUTO_MIGRATE=false`.

The StartOS package provides one local PostgreSQL writer and no read replica.
It will therefore omit `READ_DATABASE_URL`, set
`BUZZ_REPLICA_READ_MAX_AGE_MS=0`, and keep all reads on the writer. The
heartbeat table is still created by migration 26, but the replica fence cannot
route traffic without a reader pool.

The package will set `BUZZ_DB_POOL_SIZE=50`, matching the selected upstream
relay default. `BUZZ_DB_READ_POOL_SIZE` remains absent because no read pool is
configured.

## S3 Addressing

Upstream `63496cc` makes S3 URL addressing explicit. The in-package MinIO
endpoint is `http://127.0.0.1:9000`; virtual-host addressing would attempt to
resolve a bucket-prefixed hostname that does not exist inside the StartOS
container network.

The Buzz environment will therefore set:

```text
BUZZ_S3_ADDRESSING_STYLE=path
```

The existing bucket name, credentials, region, MinIO initialization, private
ACL, and Git/media volume ownership remain unchanged.

## Verification And Artifact

Identity and runtime tests will be changed first and observed failing against
the old package. After implementation, verification will include:

- focused package identity and runtime configuration tests;
- the complete package test suite;
- formatting, type checking, Start SDK lint, and JavaScript build;
- live immutable-image metadata verification;
- x86_64 package construction;
- `start-cli s9pk inspect` for manifest and commitment;
- architecture, version, upstream image, file size, and SHA-256 checks.

The final file will be copied to:

```text
artifacts/test-sideload/63496cc/buzz_x86_64.s9pk
```

That directory will also contain a SHA-256 checksum file and a short warning
record. These local artifacts are not committed.
