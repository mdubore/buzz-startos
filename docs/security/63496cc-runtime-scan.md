# `63496cc` Runtime Vulnerability Checkpoint

Date: 2026-07-30

This checkpoint records why the StartOS package did not advance when the clean
source mirror was fast-forwarded to Buzz commit
`63496cc1d4c6f1b7c613801bdcc694169dcf391a`. It is diagnostic evidence, not a
frozen release-candidate scan.

## Scanner Identity

- Grype: `0.116.0`, release archive SHA-256
  `40aff724297312f91ea390d003bed8d8651c74cc7f5b26732db80b3a408d2fc5`
- database schema: `v6.1.9`
- database built: `2026-07-29T07:08:29Z`
- database source checksum:
  `sha256:ea7bc3b89f29dfd4e8b10c12532caefb76f3df0bf55f604015b376cda3ed1275`
- configuration: full squashed-image scan; fixed, not-fixed, and wont-fix
  findings included

## Image Identity

| Item        | Immutable digest                                                          |
| ----------- | ------------------------------------------------------------------------- |
| OCI index   | `sha256:9de8aff13af33f3b17659e6eacda024b3070efda911c5e08d4d85a6c01c4deb6` |
| linux/amd64 | `sha256:5ac4697562230d32de4473d2eaf2eab098300c8aae1721e6bd4bf00b2956a5bf` |
| linux/arm64 | `sha256:414d8e183f3ccd45eb228cfdb1d6d88da463dd7440bc726c500abd435d0e7c3c` |

The reviewed tag was `ghcr.io/block/buzz:sha-63496cc`.

## Observed Results

| Platform    | Raw report SHA-256                                                 | Critical matches | High matches | Distinct critical CVEs | Distinct high CVEs |
| ----------- | ------------------------------------------------------------------ | ---------------: | -----------: | ---------------------: | -----------------: |
| linux/amd64 | `89d06806f30e820ac6feb163fb42b4651192eb71dd439a9e0e037551aae5f2e0` |               35 |           58 |                     11 |                 28 |
| linux/arm64 | `c9a00c95a7b0c85c660f5468a43166573b0191a0eabd71ceeb66246bd9286d71` |               35 |           58 |                     11 |                 28 |

The 11 distinct critical advisories were:

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

The raw JSON reports are retained outside Git for local investigation. Their
hashes identify the exact scanner output but do not make these reports
production evidence.

## Decision

Critical findings cannot be waived by
`security/vulnerability-waivers.json`. The `63496cc` Buzz image is therefore
ineligible for a production candidate even though it contains upstream
security and runtime improvements absent from the currently packaged
`dd222a5` snapshot.

The package image pins, version, and release identity remain unchanged. A
future candidate requires an upstream runtime image with no critical findings,
a complete ten-native-digest scan, a fresh runtime-contract review, and the
full StartOS device matrix.
