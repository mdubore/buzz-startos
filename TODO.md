# Remaining Release Work

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
      `UPG-01` from the exact published `:2` artifacts on both architectures.
- [ ] Run
      [`RESOURCE_PROFILE.production-v1.json`](docs/testing/RESOURCE_PROFILE.production-v1.json)
      on physical x86_64 and aarch64 devices, complete both 24-hour soaks, and
      derive reviewed hardware guidance from the measurements before adding
      requirements or operational sizing claims.
- [ ] Track an upstream Start SDK fix for the 2.0.9 PostgreSQL restore error
      path that can include the database password in local argv/log output.
      Until resolved, treat exported restore diagnostics as sensitive.
