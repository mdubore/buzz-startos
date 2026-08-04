# Remaining Release Work

- [ ] Resolve the `651f637` security gate before Community Registry
      submission. Replace or rebuild the Buzz, MinIO, and MinIO Client images
      so a new ten-native-manifest scan has no critical findings; resolve the
      Buzz `CVE-2026-53613` and `CVE-2026-53615` unknown-severity results; and
      update the development dependency lock from vulnerable
      `fast-uri@3.1.4` to a reviewed fixed version. Do not waive a critical or
      unknown-severity finding. Rerun dependency signatures, dependency
      vulnerability policy, image-pin verification, and the complete scan
      after every remediation. See
      [`docs/security/651f637-runtime-scan.md`](docs/security/651f637-runtime-scan.md).
- [ ] After the security gate clears, build and inspect native x86_64 and
      aarch64 candidate artifacts. Generate `SHA256SUMS`, inspect both
      manifests and commitments, verify both archives against the committed
      signing public key, and confirm each archive contains only its target
      architecture.
- [ ] Perform clean installs of the remediated candidate on real x86_64 and
      aarch64 StartOS devices. Complete initial and pairing setup, start all
      daemons, and confirm both exported relay interfaces and their health
      checks.
- [ ] Validate live StartOS upgrades from the published
      `0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2` package to the
      remediated candidate on both architectures. Confirm the no-op forward
      migration preserves state, setup and recovery actions behave correctly,
      and both interfaces become healthy.
- [ ] On a real Buzz Desktop client, verify NIP-11 discovery, the dedicated
      pairing-root WebSocket handshake, and QR-code generation without any
      request to the main relay's `/pair` path.
- [ ] Keep unmodified Android unsupported. On a real Android device on the LAN,
      test the complete pairing flow and record whether the app accepts the
      StartOS Root CA certificate. The dedicated pairing interface has already
      resolved the diagnosed server topology; this task measures the separate
      TLS trust and device result.
- [ ] Create and validate a remote-mobile VPS architecture and user guide using
      StartTunnel or an equivalent public tunnel. Cover public DNS, publicly
      trusted certificates, and routing for both the main and pairing WSS
      interfaces; optional split DNS; and LAN/cellular acceptance testing.
      Ideally no `buzz-startos`, desktop, or mobile client changes are needed,
      but verify that rather than assuming it.
- [ ] Freeze the final reviewed architecture artifacts and observed
      per-architecture StartOS build/image hashes in
      [`docs/testing/DEVICE_CANDIDATE.json`](docs/testing/DEVICE_CANDIDATE.json);
      do not replace its `UNFROZEN` state with synthetic values.
- [ ] Complete every x86_64 and aarch64 row in
      [`docs/testing/DEVICE_TEST_MATRIX.md`](docs/testing/DEVICE_TEST_MATRIX.md),
      including the full client/device matrix and filling all 46 cells with
      independently reviewed real-device and artifact evidence only.
- [ ] Obtain an independent final review of the runtime contract, security
      remediation and re-scan, native artifacts, clean-install evidence,
      upgrade evidence, client/device matrix, backup/restore results, and
      Community Registry documentation before any submission request.
- [ ] Implement a protected evidence workflow that records authenticated,
      distinct operator/reviewer identities plus immutable workflow run and
      attachment IDs, verify that provenance in `verify:device-promotion`, and
      only then replace the fail-closed `PENDING` binding contract.
- [ ] Run
      [`PRE_UPGRADE_AUDIT.md`](docs/operations/PRE_UPGRADE_AUDIT.md) and
      `UPG-01` from the exact historical published `dd222a5 :2` artifacts on
      both architectures.
- [ ] Run
      [`RESOURCE_PROFILE.production-v1.json`](docs/testing/RESOURCE_PROFILE.production-v1.json)
      on physical x86_64 and aarch64 devices, complete both 24-hour soaks, and
      derive reviewed hardware guidance from the measurements before adding
      requirements or operational sizing claims.
- [ ] Track an upstream Start SDK fix for the 2.0.9 PostgreSQL restore error
      path that can include the database password in local argv/log output.
      Until resolved, treat exported restore diagnostics as sensitive.
