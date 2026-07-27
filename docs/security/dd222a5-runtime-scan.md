# `dd222a5` Runtime Vulnerability Baseline

Date: 2026-07-27

This diagnostic scan confirms that the currently pinned Buzz runtime is not a
production candidate. It does not replace the complete ten-digest scan required
for a frozen release candidate.

## Scanner Identity

- Grype: `0.116.0`, release archive SHA-256
  `40aff724297312f91ea390d003bed8d8651c74cc7f5b26732db80b3a408d2fc5`
- database schema: `v6.1.9`
- database built: `2026-07-27T07:24:06Z`
- database source checksum:
  `sha256:9d32360e16bb29e7895e7ae2bcc73bd0e7b3a9fcfe63941af8a7122e097b4ee6`
- configuration: full squashed-image scan; fixed, not-fixed, and wont-fix
  findings included

## Observed Results

Both pinned Buzz platform manifests produced 93 unique
vulnerability/component/version matches at high or critical severity: 35
critical matches and 58 high matches. The 35 critical package matches represent
11 distinct Debian advisories:

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

| Target                                                                                       | Report SHA-256                                                     | Unique critical | Unique high |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------: | ----------: |
| `ghcr.io/block/buzz@sha256:a0a8049cd1349f997ea1108571df4af6f5cdc1af23ba1ae16aee95c37292c152` | `b08b0aa628170a8052826d9e4505bf74ae6d94fd8f850c931c63e862c87de931` |              35 |          58 |
| `ghcr.io/block/buzz@sha256:ff4d22c5cc747b61a83441bfdb4bd0a5902630b958e68be9976ea50e478bc6e7` | `5efd27957b49fe74e4f396aa64ac540c1ea9e01b33dd09e1746838459dbd7ac7` |              35 |          58 |
| `postgres@sha256:af194ccf3e2d7fe367012c7b88ce8b816c5c889b18a5b316799a1f0d7eac746a`           | `acced33457c7cd67599334b07837b9ba822d26df0658851e84160f4423695f08` |               0 |           0 |

Counts are deduplicated by advisory ID, package URL or component/version, and
image digest. The raw reports are retained outside Git for local review; they
are not candidate evidence.

## Decision

Critical findings cannot be waived by
`security/vulnerability-waivers.json`. The `dd222a5` Buzz platform digests are
therefore blocked regardless of reachability analysis. A production candidate
requires an upstream runtime built from a reviewed, refreshed base image, then a
new complete scan of all five images on both architectures.

The exploratory run stopped after the production-blocking Buzz result and one
clean PostgreSQL platform result to release resources for upstream Rust
verification. Redis, MinIO, MinIO client, and the second PostgreSQL platform
remain unscanned in this baseline. The CI scanner still requires all ten exact
platform reports before a candidate can pass.
