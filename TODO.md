# Remaining Release Work

- [ ] Validate a live StartOS update from
      `0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:1` to the current `:2`
      revision. Confirm the no-op forward migration preserves state, both
      blocking setup actions behave correctly, and both interfaces become
      healthy.
- [ ] On a real Buzz Desktop client, verify NIP-11 discovery, the dedicated
      pairing-root WebSocket handshake, and QR-code generation without any
      request to the main relay's `/pair` path.
- [ ] On an unmodified Android device on the LAN, test the complete pairing
      flow and record whether the app accepts the StartOS Root CA certificate.
      Keep the server-side 404 result separate from this TLS/device result.
- [ ] Create and validate a remote-mobile VPS architecture and user guide using
      StartTunnel or an equivalent public tunnel. Cover public DNS, publicly
      trusted certificates, and routing for both the main and pairing WSS
      interfaces; optional split DNS; and LAN/cellular acceptance testing.
      Ideally no `buzz-startos`, desktop, or mobile client changes are needed,
      but verify that rather than assuming it.
- [ ] Rebuild both architecture packages from the final release commit,
      generate `SHA256SUMS`, inspect both manifests and commitments, and verify
      both archives against the committed signing public key. Freeze those exact
      identities and the observed per-architecture StartOS build/image hashes in
      [`docs/testing/DEVICE_CANDIDATE.json`](docs/testing/DEVICE_CANDIDATE.json);
      do not replace its `UNFROZEN` state with synthetic values.
- [ ] Complete every x86_64 and aarch64 row in
      [`docs/testing/DEVICE_TEST_MATRIX.md`](docs/testing/DEVICE_TEST_MATRIX.md),
      filling all 46 cells with independently reviewed real-device and artifact
      evidence only.
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
