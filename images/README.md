# Runtime image sources

These Dockerfiles build the public runtime images used by the StartOS package.
They preserve upstream application behavior while refreshing vulnerable runtime
packages and, for MinIO and MC, applying a focused reviewed Go module update.

| Image | Upstream source | Exact source | License |
| --- | --- | --- | --- |
| Buzz | `https://github.com/block/buzz` | `651f6372754e60e3f936b3397040eb0f1e44c9f3` | Apache-2.0 |
| MinIO | `RELEASE.2025-10-15T17-29-55Z` | `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` | AGPL-3.0-only |
| MC | `RELEASE.2025-08-13T08-35-41Z` | `7394ce0dd2a80935aded936b09fa12cbb3cb8096` | AGPL-3.0-only |

Prepare a clean, detached source tree before building:

```bash
scripts/prepare-runtime-image-source.sh buzz /tmp/buzz-source
scripts/prepare-runtime-image-source.sh minio /tmp/minio-source
scripts/prepare-runtime-image-source.sh mc /tmp/mc-source
```

The script fetches and verifies the exact source commit. For MinIO and MC it
then replaces only `go.mod` and `go.sum` with the checked-in reviewed versions.
It refuses to overwrite an existing destination or accept an unexpected source
or patch state.

Build using the prepared source as the context and the corresponding downstream
Dockerfile, for example:

```bash
docker buildx build --load \
  --file images/minio/Dockerfile \
  --tag buzz-minio:local \
  /tmp/minio-source
```

All base images are pinned to multi-architecture index digests. The runtime
stages use Alpine 3.24 so the package receives its current curl, libc, and
system-package security fixes without changing Buzz application source.
Publication is performed by native amd64 and arm64 jobs; the resulting
immutable manifests are scanned and recorded before the StartOS package pins
them. Published bytes are revisioned rather than replacing an existing tag.
