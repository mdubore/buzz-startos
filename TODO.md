# Remaining Release Work

The dependency, native runtime-image, immutable-pin, provenance, compatibility,
and ten-manifest OCI gates pass for StartOS package version `0.5.4:0`. Current
evidence is indexed by [`docs/EVIDENCE.md`](docs/EVIDENCE.md); the current
decision is in
[`COMMUNITY_REGISTRY_READINESS.md`](docs/operations/COMMUNITY_REGISTRY_READINESS.md).
The exact frozen package identity is in
[`DEVICE_CANDIDATE.json`](docs/testing/DEVICE_CANDIDATE.json).

## Community Registry Beta
- [ ] Perform clean installs on real x86_64 and aarch64 stable StartOS devices.
      Complete initial and pairing setup, start all daemons, and confirm UI
      access, both exported relay interfaces, both health checks, and an
      authenticated main-relay publish/query round trip.
- [ ] On a real Buzz Desktop client, verify NIP-11 discovery, the dedicated
      pairing-root WebSocket handshake, main WSS connectivity, and QR-code
      generation without a request to the main relay's `/pair` path. Verify
      real `buzz-acp` main-WSS connectivity separately.
- [ ] Run [`PRE_UPGRADE_AUDIT.md`](docs/operations/PRE_UPGRADE_AUDIT.md), then
      complete formal `UPG-01` on both architectures from the exact published
      `dd222a5:2` artifacts recorded in the candidate contract.
- [ ] Perform hard uninstall and clean reinstall on both architectures,
      including empty service data and fresh initial-setup state.
- [ ] Obtain independent final beta review of the frozen artifacts, both device
      runs, Desktop/ACP behavior, pairing QR, upgrade evidence, and registry
      documentation.
- [ ] After every beta prerequisite passes, manually email the public
      repository to `submissions@start9.com`, address feedback in PRs against
      the resulting `Start9-Community` fork, and test the immutable
      `community-beta` build.

## Production Promotion

- [ ] For the exact immutable beta candidate, complete every remaining
      prerequisite production row except `RES-01` and `LIF-01`, including the
      full authorization/client matrix, persistence, same-architecture and both
      cross-architecture restores, and failure/recovery gates.
- [ ] Run
      [`RESOURCE_PROFILE.production-v1.json`](docs/testing/RESOURCE_PROFILE.production-v1.json)
      as `RES-01` and complete both 24-hour physical-device soaks after its
      prerequisites pass.
- [ ] Run final `LIF-01` hard uninstall and clean reinstall only after every
      destructive and resource gate passes, then validate all 46 linked cells.
- [ ] Implement authenticated, distinct operator/reviewer evidence binding and
      pass `npm run verify:device-promotion`.
- [ ] Obtain independent final production review and only then request
      promotion of the already-tested beta bytes.

## Unsupported And Follow-Up Work

- [ ] Keep unmodified Android unsupported in the current private-CA setup. A
      real Android LAN test may measure behavior, but it does not create a
      support claim by itself.
- [ ] Create and validate the separate remote-mobile VPS/StartTunnel design and
      user guide. Cover public DNS, publicly trusted certificates, both main and
      pairing WSS routes, optional split DNS, and LAN/cellular acceptance. Do
      not require a modified mobile app as the long-term solution.
- [ ] Track an upstream Start SDK fix for the PostgreSQL restore error path that
      can include the database password in local argv/log output; treat exported
      restore diagnostics as sensitive until resolved.
