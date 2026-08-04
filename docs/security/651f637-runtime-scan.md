# `651f637` Runtime Vulnerability Checkpoint

Date: 2026-08-04

This checkpoint records the fail-closed dependency and native-image scan for
Buzz commit `651f6372754e60e3f936b3397040eb0f1e44c9f3`. It is diagnostic
evidence, not a frozen release-candidate scan. The candidate is blocked from
Community Registry submission.

## Dependency Gate

`npm ci`, `npm run audit:signatures`, and `npm run build` completed. The
signature audit verified 178 registry signatures and 47 attestations.

`npm run audit:vulnerabilities` exited 1 on the unwaived high-severity
`GHSA-7p8r-x3mc-p8w7` finding in `fast-uri@3.1.4`. `npm explain fast-uri`
located it at `node_modules/fast-uri` through the root development dependency
`ajv@8.20.0`; the npm advisory covers `fast-uri >=3.0.0 <3.1.5` and reports a
fix as available. No waiver was added. This dependency must be updated and the
gate rerun.

## Scanner and Database Identity

- Grype: `0.116.0`, release archive SHA-256
  `40aff724297312f91ea390d003bed8d8651c74cc7f5b26732db80b3a408d2fc5`
- Grype commit: `3b014b00097d43933e5cce485e744db8289a406f`
- Syft: `v1.48.0`
- database schema: `v6.1.9`
- database built: `2026-08-04T07:02:51Z`
- database source checksum:
  `sha256:ba52a8506bd87694e01aa84c9cb90c86105de38b75a419791e6721ff72094946`
- effective configuration SHA-256:
  `c12a9608de881cb3ac97be666629a1a1e17fb515d74701ae44a0d0881548a9ff`
- target manifest SHA-256:
  `7e0da5c6fd851d552cdb273e22cd5c3a4ad997bb9a6a8757b69f4391aaf9499a`

The effective configuration scanned squashed images from the registry,
included fixed, not-fixed, and wont-fix findings, had no ignore, exclude, or
VEX rules, and validated the database hash and age. The scan script cleared
ambient `GRYPE_*` and `SYFT_*` variables before recording that configuration.

## Immutable Target Set

The scan used the five pinned OCI indexes and both native manifests for each:

| Image        | Tag reference                              | OCI index digest                                                          |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------- |
| Buzz         | `ghcr.io/block/buzz:sha-651f637`           | `sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c` |
| PostgreSQL   | `postgres:17.10-alpine3.24`                | `sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193` |
| Redis        | `redis:7.4.9-alpine3.21`                   | `sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99` |
| MinIO        | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` |
| MinIO Client | `minio/mc:RELEASE.2025-08-13T08-35-41Z`    | `sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727` |

All ten expected report files were produced. `Raw C/H/U` counts every
Critical, High, or Unknown occurrence in the Grype `matches` array. `Distinct
C/H/U` deduplicates those occurrences within each report by advisory ID and
component package URL. Unknown findings are retained because the policy
correctly rejects an unrecognized severity instead of silently discarding it.

| Target                                                                                       | Report SHA-256                                                     | Raw C/H/U  | Distinct C/H/U |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------- | -------------- |
| `ghcr.io/block/buzz@sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632` | `a89f82e86f5f094b33c1e572a1ca7dc898c3c9d4c45871d50c14f32c4e521e38` | `35/58/16` | `35/58/16`     |
| `ghcr.io/block/buzz@sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688` | `9bd91215409c768b2fd839a18650ee6a6c2ef205b1d265f767013fb67147ef3e` | `35/58/16` | `35/58/16`     |
| `postgres@sha256:af194ccf3e2d7fe367012c7b88ce8b816c5c889b18a5b316799a1f0d7eac746a`           | `c261ca082eb2b2aa708fbb492d176cea39acefcd6300e19d23d6c26fcb268916` | `0/0/0`    | `0/0/0`        |
| `postgres@sha256:b797483593b82cbea9a7ee41c88f324a90d10d9c2504d40e755d91c75456366d`           | `35b4c6a5ec2419311bfb651b68b1c33c06b13077db574dced3c72b86eef246f8` | `0/0/0`    | `0/0/0`        |
| `redis@sha256:b1addbe72465a718643cff9e60a58e6df1841e29d6d7d60c9a85d8d72f08d1a7`              | `ec671decca5271f709a366f9131b3857ed2a1aa1a00c73948f2706dc8a43e311` | `0/0/0`    | `0/0/0`        |
| `redis@sha256:084f4bcb3fedf990ba43d26774f58ed4697a2c044156544ac4717934ad1d57c8`              | `a58c96d21fcd2cb83fcd9d0c1ec87b0baea825a8472a4a793c2af80ff5686f9a` | `0/0/0`    | `0/0/0`        |
| `minio/minio@sha256:a1a8bd4ac40ad7881a245bab97323e18f971e4d4cba2c2007ec1bedd21cbaba2`        | `73a5185796bbbcf2c807f01f39ed413d84c09635c2c4623cc3db9a9358dc2564` | `13/55/0`  | `12/40/0`      |
| `minio/minio@sha256:9966a92a734f9411e32f4f41d7d9d826fcdc0f68c4e20b70295bd4e7c11f8a2f`        | `2c2975e8f3d8728fa34fece3f77e90e98db3c2dbdee9505a0aba9f5a7692a875` | `13/55/0`  | `12/40/0`      |
| `minio/mc@sha256:eb4ea9884b77704230e2423e9004d2fa738dc272876b9cc41a297d29443b8780`           | `f5bb5cb744c85311a92ecf49cc13b424545fd0ec94ddf28a37f17d6f19d9aa73` | `2/19/0`   | `2/19/0`       |
| `minio/mc@sha256:37d109dddbbb2c95873f5fc81ac93f37023264770fc580a7564148892087b1b7`           | `38d113bfb2a39d996fd37723e243ba3b37bdf70da75defeae1d624624477606d` | `2/19/0`   | `2/19/0`       |

## Critical and High Findings

The two native reports for each image family had identical advisory and
component sets, with architecture-specific package URLs where applicable.

### Buzz

Each native Buzz report contained 35 raw and distinct critical findings, 58
raw and distinct high findings, and 16 raw and distinct unknown findings.

The 11 critical advisories were:

```text
CVE-2026-10536
CVE-2026-11856
CVE-2026-12087
CVE-2026-13221
CVE-2026-42496
CVE-2026-5450
CVE-2026-57433
CVE-2026-7598
CVE-2026-8376
CVE-2026-8924
CVE-2026-8927
```

They affected `curl@7.88.1-10+deb12u15`,
`libcurl3-gnutls@7.88.1-10+deb12u15`,
`libcurl4@7.88.1-10+deb12u15`, `libc-bin@2.36-9+deb12u14`,
`libc6@2.36-9+deb12u14`, `libssh2-1@1.10.0-3+b1`, and the Perl
`5.36.0-7+deb12u3` packages `libperl5.36`, `perl-base`,
`perl-modules-5.36`, and `perl`.

The 28 high advisories were:

```text
CVE-2023-2953 CVE-2025-13151 CVE-2025-59375 CVE-2025-69720
CVE-2026-12064 CVE-2026-25210 CVE-2026-41080 CVE-2026-41992
CVE-2026-42497 CVE-2026-45186 CVE-2026-48959 CVE-2026-48962
CVE-2026-5435 CVE-2026-54369 CVE-2026-54370 CVE-2026-55199
CVE-2026-55200 CVE-2026-57432 CVE-2026-5928 CVE-2026-6276
CVE-2026-66032 CVE-2026-66033 CVE-2026-66034 CVE-2026-66035
CVE-2026-7017 CVE-2026-8286 CVE-2026-8932 CVE-2026-9538
```

They affected the critical component set above plus `gzip@1.12-1`,
`libacl1@2.3.1-3`, `libexpat1@2.5.0-1+deb12u2`,
`libldap-2.5-0@2.5.13+dfsg-5`, `libtasn1-6@4.19.0-2+deb12u1`, and
the ncurses `6.4-4` packages `libtinfo6`, `ncurses-base`, and `ncurses-bin`.

Grype also reported `CVE-2026-53613` and `CVE-2026-53615` with `Unknown`
severity against eight `util-linux 2.38.1-5+deb12u3` components:
`bsdutils@1:2.38.1-5+deb12u3`, `libblkid1`, `libmount1`, `libsmartcols1`,
`libuuid1`, `mount`, `util-linux-extra`, and `util-linux`. The other seven
components use version `2.38.1-5+deb12u3`.

### MinIO

Each native MinIO report contained 13 raw critical and 55 raw high
occurrences. Deduplication by advisory ID and component package URL produced
12 distinct critical and 40 distinct high findings; there were no unknown
findings.

The 11 critical advisories were:

```text
CVE-2026-10536 CVE-2026-11856 CVE-2026-8924 CVE-2026-8927
CVE-2026-9079 GHSA-89gr-r52h-f8rx GHSA-p77j-4mvh-x3m3
GHSA-rm3j-f69w-wqmq GHSA-vgwf-h737-ff37 GHSA-x527-x647-q7gg
GO-2026-4337
```

They affected `curl@8.11.0`, `golang.org/x/crypto@v0.37.0`,
`google.golang.org/grpc@v1.71.0`, `google.golang.org/grpc@v1.72.0`, and
the Go standard library at `go1.24.6`.

The 37 high advisories were:

```text
CVE-2025-0725 CVE-2025-9086 CVE-2026-12064 CVE-2026-4878
CVE-2026-54369 CVE-2026-5773 CVE-2026-6276 CVE-2026-8286
CVE-2026-8932 CVE-2026-9545 CVE-2026-9547 GHSA-78h2-9frx-2jm8
GHSA-8rm2-7qqf-34qm GHSA-9h8m-3fm2-qjrq GHSA-hrxh-6v49-42gf
GHSA-q4h4-gmj2-qvw2 GHSA-w879-237q-wc7r GHSA-wf45-q9ch-q8gh
GHSA-wg65-39gg-5wfj GO-2025-4006 GO-2025-4007 GO-2025-4009
GO-2025-4013 GO-2025-4155 GO-2026-4341 GO-2026-4601 GO-2026-4870
GO-2026-4918 GO-2026-4946 GO-2026-4947 GO-2026-4971 GO-2026-4977
GO-2026-4981 GO-2026-4986 GO-2026-5026 GO-2026-5037 GO-2026-5970
```

They affected `curl@8.11.0`, `github.com/apache/thrift@v0.21.0`,
`github.com/go-jose/go-jose/v4@v4.1.0`,
`github.com/prometheus/prometheus@v0.303.0`,
`go.opentelemetry.io/otel/sdk@v1.35.0`,
`golang.org/x/crypto@v0.37.0`, `golang.org/x/net@v0.39.0`,
`golang.org/x/text@v0.24.0`, `golang.org/x/text@v0.27.0`,
`google.golang.org/grpc@v1.71.0`, `google.golang.org/grpc@v1.72.0`,
`libacl@2.3.1-4.el9`, `libcap@2.48-9.el9_2`, and the Go standard library
at `go1.24.6`.

### MinIO Client

Each native MinIO Client report contained 2 raw and distinct critical findings
and 19 raw and distinct high findings, with no unknown findings.

The critical advisories were `GHSA-p77j-4mvh-x3m3` against
`google.golang.org/grpc@v1.71.0` and `GO-2026-4337` against the Go standard
library at `go1.24.6`.

The 19 high advisories were:

```text
CVE-2026-4878 CVE-2026-54369 GHSA-8rm2-7qqf-34qm
GHSA-hrxh-6v49-42gf GHSA-wg65-39gg-5wfj GO-2025-4007 GO-2025-4009
GO-2025-4013 GO-2025-4155 GO-2026-4341 GO-2026-4601 GO-2026-4870
GO-2026-4918 GO-2026-4946 GO-2026-4947 GO-2026-4971 GO-2026-4981
GO-2026-5037 GO-2026-5970
```

They affected `github.com/prometheus/prometheus@v0.303.0`,
`golang.org/x/text@v0.27.0`, `google.golang.org/grpc@v1.71.0`,
`libacl@2.3.1-4.el9`, `libcap@2.48-9.el9_2`, and the Go standard library at
`go1.24.6`.

PostgreSQL and Redis had no critical, high, or unknown-severity findings in
either native report, so their raw and distinct counts were all zero.

## Gate Decision

`npm run scan:images -- <new-empty-directory>` produced the version,
database, effective configuration, target manifest, and all ten reports, then
exited 1 when the policy rejected the first `Unknown` severity. The recorded
critical findings independently block the candidate and cannot be waived by
`security/vulnerability-waivers.json`.

No OCI waiver was added: there is no exact reachability analysis,
compensating-control evidence, reviewed owner/issue, and expiry that could
justify any high waiver, and critical findings are never waivable. Raw reports
remain outside Git; their hashes above identify the exact outputs summarized
here.

The package must not be represented as Community Registry ready. A future
candidate requires refreshed Buzz, MinIO, and MinIO Client runtime images with
no critical findings; resolution of unknown severities and the npm dependency
gate; a new ten-manifest scan; and all remaining device and repository-control
evidence.
