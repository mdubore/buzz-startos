# Remaining Release Work

- [ ] After the local pairing beta, create and validate a StartTunnel VPS setup
      and user guide for unmodified Buzz Android clients. Cover real main and
      pairing domains, publicly trusted certificates, optional split DNS, and
      LAN/cellular acceptance testing without further `buzz-startos` changes.
- [ ] Rebuild both architecture packages from the final release commit,
      generate `SHA256SUMS`, inspect both manifests and commitments, and verify
      both archives against the committed signing public key.
- [ ] Complete every x86_64 and aarch64 row in
      [`docs/testing/DEVICE_TEST_MATRIX.md`](docs/testing/DEVICE_TEST_MATRIX.md),
      attaching real device and artifact evidence only.
- [ ] Measure steady-state and startup CPU, memory, and disk use before adding
      hardware requirements or operational sizing claims.
- [ ] Track an upstream Start SDK fix for the 2.0.9 PostgreSQL restore error
      path that can include the database password in local argv/log output.
      Until resolved, treat exported restore diagnostics as sensitive.
