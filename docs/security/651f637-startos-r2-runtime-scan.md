# Buzz `651f637` StartOS r2 Runtime Scan

Date: 2026-08-04

This checkpoint records the fail-closed dependency and OCI scan for package
revision `0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:2`. It covers the
three rebuilt r2 image indexes plus the unchanged PostgreSQL and Redis indexes.
It is security evidence for the current candidate, not proof of real StartOS
device behavior.

## Dependency Gate

`npm run audit:signatures` verified 178 registry signatures and 47
attestations. `fast-uri` resolves to patched version 3.1.5 through AJV 8.20.0.
`npm run audit:vulnerabilities` passed with no critical finding. Its seven
waived High matches are the exact SDK-only tooling paths already recorded in
`security/vulnerability-waivers.json`; the checker confirms their vulnerable
markers are absent from the compiled runtime bundle.

## Scanner And Database Identity

- Grype version: `0.116.0`
- Grype commit: `3b014b00097d43933e5cce485e744db8289a406f`
- Grype version-record SHA-256:
  `0b2d34eec2316aec4325fafc645f26db012c87a04ed1a55cb9872b27dc4883c8`
- database schema: `v6.1.9`
- database built: `2026-08-05T07:04:14Z`
- database source checksum:
  `sha256:d929b4ee3f8c535f76847d46d08b6844b86b7d150e60da578b5ea5e9755dc6ba`
- database-status record SHA-256:
  `76595c4d300e5f8de6a9724b1db4f9feb663c0f06d0599dae9a984c6c365d414`
- effective configuration SHA-256:
  `c12a9608de881cb3ac97be666629a1a1e17fb515d74701ae44a0d0881548a9ff`
- target manifest SHA-256:
  `b06e9f356af2874738b31198af89a88eb05ff1bb4def2ba75eb0ede001c9a5f8`

The scanner removed inherited `GRYPE_*` and `SYFT_*` variables, used an
isolated state directory, validated the database hash and age, and passed the
reviewed `security/grype-ci.yaml` to every invocation. That configuration has no
ignore, exclude, suppression, or VEX rules and includes fixed, not-fixed, and
wont-fix findings.

## Ten Immutable Native Targets

The command `npm run scan:images -- <new-empty-directory>` generated 10 image
target(s) directly from `startos/image-pins.ts`. Every report was bound to its
exact manifest digest, requested architecture, Grype version, database, and
configuration before policy evaluation.

| Report | Native manifest | Report SHA-256 | Critical | High | Medium | Low | Unknown |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `buzz-amd64.grype.json` | `sha256:169af34712fa2d8e2de95626689a2580b0b3231a780d7512322a6fb69641542a` | `f106cf778355e367382d52ba22e5727b53a7fb3298b25528061ba3d58cdfc1d7` | 0 | 0 | 4 | 0 | 0 |
| `buzz-arm64.grype.json` | `sha256:5966d41571e6a79e70ff13eda2fbcf06fec886d74a07b413c51d8c04198b823f` | `6224f91404a268ade24bff43dffddd19b9b9d2da6ecfac29aa27670a8ad363f9` | 0 | 0 | 4 | 0 | 0 |
| `postgres-amd64.grype.json` | `sha256:af194ccf3e2d7fe367012c7b88ce8b816c5c889b18a5b316799a1f0d7eac746a` | `6509099a54f652656161122a8eb93004bc1c76aa8b050ba830091a0047a088bf` | 0 | 0 | 3 | 0 | 0 |
| `postgres-arm64.grype.json` | `sha256:b797483593b82cbea9a7ee41c88f324a90d10d9c2504d40e755d91c75456366d` | `0342d37238bc8686549aac77614047c09cd72bebfb12aa0b948cf64c1ac0ec09` | 0 | 0 | 3 | 0 | 0 |
| `redis-amd64.grype.json` | `sha256:b1addbe72465a718643cff9e60a58e6df1841e29d6d7d60c9a85d8d72f08d1a7` | `16ab1284d993f4d71cf074ffa32127c5492f800586a355b39bb321119b30e4c1` | 0 | 0 | 3 | 2 | 0 |
| `redis-arm64.grype.json` | `sha256:084f4bcb3fedf990ba43d26774f58ed4697a2c044156544ac4717934ad1d57c8` | `649422450ac3d21ae04fe3b71ea4dfd5504c6e29fabcbc2052ca834a35e69018` | 0 | 0 | 3 | 2 | 0 |
| `minio-amd64.grype.json` | `sha256:cf33684eacfc87dbde1e2bedc24c85f85ca1dc7bc7f566b220a8b04fc38667e9` | `66ec5a93992d841de72c795dd13db1c731a3b6f0c6c6306f863bc36ab2dddc1b` | 0 | 0 | 6 | 0 | 0 |
| `minio-arm64.grype.json` | `sha256:3c9bb9f4ef4e50aeb875365cf405d7ea36dac0fdfd8c294daa43808783e50821` | `b2df307a67ccda3b88760615f7cf0e5288cf9d3738047e777c9730c734602496` | 0 | 0 | 6 | 0 | 0 |
| `minioClient-amd64.grype.json` | `sha256:4c75881d7a130597c444d9d233ad0ec41dc62e6c025374f93365e7c7fa1fbd1c` | `93bcbc0f4d9ceca223ce7bf98a323550290d33f485807ecb84798e891db90238` | 0 | 0 | 3 | 0 | 0 |
| `minioClient-arm64.grype.json` | `sha256:c0ea7881bae5f9e0df24bda610c6fe9ed2f51504924474a0eef0a2c4ec2a1827` | `5ebded2924855db947084d73787bbc0625d54a3d89e2cdea396a72f3852d7a55` | 0 | 0 | 3 | 0 | 0 |

Across the complete target set there are zero Critical findings, zero High
findings, and zero Unknown findings. The policy result was:

```text
OCI vulnerability policy passed: 10 image target(s), 0 waived High finding(s), no critical findings
```

Raw reports remain outside Git because of their size; the hashes above bind the
exact files reviewed. The prior
[`651f637-runtime-scan.md`](651f637-runtime-scan.md) remains historical failure
evidence for the official/r1 image path and is not evidence for these r2 bytes.

## Gate Decision

The dependency and OCI vulnerability gates are clear for this candidate. No OCI
waiver was added. Package compilation, immutable image verification, and the
automated repository tests also pass. The remaining promotion boundary is the
frozen signed package plus real x86_64/aarch64 StartOS device evidence; this
checkpoint does not claim those tests have run.
