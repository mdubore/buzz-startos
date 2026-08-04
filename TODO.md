# Remaining Release Work

Complete each section in order. The current decision and exact gate evidence
are recorded in
[`docs/operations/COMMUNITY_REGISTRY_READINESS.md`](docs/operations/COMMUNITY_REGISTRY_READINESS.md).

## Community Registry Beta

- [ ] Update the dependency lock from vulnerable `fast-uri@3.1.4` to a
      reviewed fixed version. Rerun dependency signatures, dependency
      vulnerability policy, the full source suite, formatting, type checking,
      SDK lint, build, and image-pin verification. Do not waive
      `GHSA-7p8r-x3mc-p8w7`.
- [ ] Replace or rebuild the Buzz, MinIO, and MinIO Client images, update every
      affected immutable index/native pin, and run a new ten-native-manifest
      scan with no forbidden Critical, High, or Unknown findings. Resolve the
      Buzz `CVE-2026-53613` and `CVE-2026-53615` Unknown results. Do not waive
      a Critical or Unknown result, add a new High waiver, or accept a
      suppressed match. See
      [`docs/security/651f637-runtime-scan.md`](docs/security/651f637-runtime-scan.md).
- [ ] After choosing any replacement image bytes and before final pack or
      freeze, re-verify authoritative source, release tag and target, full
      commit, signature, time, ancestry, OCI index, and native manifests.
      Re-audit changed runtime-linked source plus both native image
      configurations/filesystems, CLI, ports, environment, mounts, startup,
      health, migrations, storage, and client compatibility. Create exact new
      runtime/security evidence and never reuse the `651f637` contract for
      different bytes. If source or time changes, derive the new ExVer identity
      and reset its revision to `:0`; if reviewed downstream rebuild bytes
      change at the same source, increment the downstream revision and document
      reproducible build provenance and review rationale. Reconcile image pins,
      current release notes, `docs/EVIDENCE.md`, the `UNFROZEN` proposed
      candidate identity, relevant README/instructions, and all tests together.
- [ ] Clear the four failed repository controls: enable and read back immutable
      releases, active `main` and release-tag rulesets, and independent release
      approval with a second trusted reviewer and self-review prevention.
- [ ] Build and inspect native x86_64 and aarch64 artifacts from the final
      reviewed commit. The ignored archives built at `f8612ccc` are preparatory
      and non-final. Generate and validate `SHA256SUMS`, inspect manifests and
      commitments, verify the committed signer, confirm each archive contains
      only its target architecture, and confirm both manifests record the exact
      final package Git hash.
- [ ] Freeze the final reviewed architecture artifacts and observed
      per-architecture stable StartOS build/image hashes in
      [`docs/testing/DEVICE_CANDIDATE.json`](docs/testing/DEVICE_CANDIDATE.json).
      Do not replace `UNFROZEN` or its null final identities with preparatory
      hashes or synthetic values.
- [ ] Perform clean installs on real x86_64 and aarch64 stable StartOS devices.
      Complete initial and pairing setup, start all daemons, and confirm UI
      access, both exported relay interfaces, both health checks, and an
      authenticated main-relay publish/query round trip.
- [ ] On a real Buzz Desktop client, verify NIP-11 discovery, the dedicated
      pairing-root WebSocket handshake, main WSS connectivity, and QR-code
      generation without any request to the main relay's `/pair` path. Verify
      real `buzz-acp` main-WSS connectivity separately.
- [ ] Run [`PRE_UPGRADE_AUDIT.md`](docs/operations/PRE_UPGRADE_AUDIT.md), then
      complete formal `UPG-01` on both architectures from the exact published
      `dd222a5:2` artifacts recorded in
      [`docs/testing/DEVICE_CANDIDATE.json`](docs/testing/DEVICE_CANDIDATE.json).
      Confirm the no-op forward migration preserves state, setup and recovery
      actions behave correctly, and both interfaces become healthy.
- [ ] Optionally exercise the operator's local x86_64 `63496cc:2` transition as
      a separate preflight. That archive is unpublished, has no aarch64 peer,
      cannot satisfy formal `UPG-01`, and must not create a matrix `PASS`.
- [ ] Perform hard uninstall and clean reinstall on both architectures,
      including empty service data and fresh initial-setup state. These checks,
      together with the clean install, setup, health, relay, Desktop/ACP,
      pairing QR, and formal upgrade evidence, are the minimum beta device
      gate.
- [ ] Obtain independent final beta review of the runtime contract, security
      remediation and re-scan, repository controls, native artifacts, both
      architecture device runs, client compatibility, upgrade evidence, and
      Community Registry documentation.
- [ ] After every beta prerequisite passes, manually email the public
      repository to `submissions@start9.com`, address feedback in PRs against
      the resulting `Start9-Community` fork, and test the immutable
      `community-beta` build. No tag, release, email, registry PR, beta
      publication, or promotion has been performed for this candidate.

## Production Promotion

- [ ] For the exact immutable beta candidate, complete every remaining
      prerequisite production row except `RES-01` and `LIF-01`. Follow matrix
      dependencies and capture independently reviewed x86_64 and aarch64
      evidence for the full authorization/client matrix, persistence,
      same-architecture and both cross-architecture restores, and
      failure/recovery gates.
- [ ] Run
      [`RESOURCE_PROFILE.production-v1.json`](docs/testing/RESOURCE_PROFILE.production-v1.json)
      as `RES-01` only after its backup/restore and upgrade prerequisites pass.
      Complete both 24-hour soaks on physical x86_64 and aarch64 devices, and
      derive reviewed hardware guidance from the measurements before adding
      requirements or operational sizing claims.
- [ ] Run final `LIF-01` hard uninstall and clean reinstall only after every
      destructive and resource gate passes. Then confirm all 46 cells in
      [`docs/testing/DEVICE_TEST_MATRIX.md`](docs/testing/DEVICE_TEST_MATRIX.md)
      link valid passing evidence for the same immutable candidate.
- [ ] Implement a protected evidence workflow that records authenticated,
      distinct operator/reviewer identities plus immutable workflow run and
      attachment IDs. Verify that provenance in `verify:device-promotion` and
      only then replace the fail-closed `PENDING` binding contract.
- [ ] Obtain independent final production review of all 46 evidence cells,
      backup/restore and cross-architecture results, resource soaks, repository
      controls, immutable beta artifacts, and authenticated evidence binding.
- [ ] Pass the strict `npm run verify:device-promotion` gate for those exact
      reviewed records and immutable assets.
- [ ] Only after the production review passes, request promotion of the tested
      immutable beta bytes by email to `submissions@start9.com` or an issue on
      the `Start9-Community` fork.

## Unsupported And Follow-Up Work

- [ ] Keep unmodified Android unsupported. On a real Android device on the LAN,
      test the complete pairing flow and record whether the app accepts the
      StartOS Root CA certificate. The dedicated pairing interface has resolved
      the diagnosed server topology; this task measures the separate TLS trust
      and device result and does not create a support claim by itself.
- [ ] Create and validate a remote-mobile VPS architecture and user guide using
      StartTunnel or an equivalent public tunnel. Cover public DNS, publicly
      trusted certificates, routing for both main and pairing WSS interfaces,
      optional split DNS, and LAN/cellular acceptance testing. Ideally no
      `buzz-startos`, desktop, or mobile client changes are needed, but verify
      that rather than assuming it.
- [ ] Track an upstream Start SDK fix for the 2.0.9 PostgreSQL restore error
      path that can include the database password in local argv/log output.
      Until resolved, treat exported restore diagnostics as sensitive.
