# Community Registry Readiness — Buzz `651f637`

Date: 2026-08-04

## Decision

| Promotion boundary                   | Decision  | Reason                                                                                                                |
| ------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Start9 Community Registry beta       | **NO-GO** | The dependency and native-image security gates fail, repository controls fail, and beta device tests are unperformed. |
| Start9 Community Registry production | **NO-GO** | Every beta blocker remains, all 46 production cells are `NOT RUN`, and production review controls are incomplete.     |

This is a fail-closed report. A successful source build does not override a
security, repository-control, artifact, client, or real-device blocker. The
package must not be submitted, tagged, released, or represented as registry
ready from the evidence below.

## Candidate Identity

The package implementation reviewed for this report is commit
`60430669f7d2a5b1ac218320a13d950317c1ce45`. This report is a documentation-only
successor to that implementation commit; its commit is recorded in the task
handoff rather than embedded recursively in its own contents.

| Field                    | Reviewed value                                                            |
| ------------------------ | ------------------------------------------------------------------------- |
| Package version          | `0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:0`                      |
| Candidate state          | `UNFROZEN`                                                                |
| Candidate tag            | Not created; `DEVICE_CANDIDATE.json` contains `null`                      |
| Frozen package commit    | Not selected; `DEVICE_CANDIDATE.json` contains `null`                     |
| Release signer           | `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c` |
| Minimum manifest StartOS | `0.4.0-beta.10` compatibility floor; not device-test evidence             |

The upstream stable release is `desktop-v0.5.4` at exact commit
`651f6372754e60e3f936b3397040eb0f1e44c9f3`. The package uses the official Buzz
image `ghcr.io/block/buzz:sha-651f637` with these immutable identities:

| OCI object     | Digest                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| Image index    | `sha256:3f8d3ff503dc735e5578e68194b1dbf543e6e792ae1c7e906c735ee269d2841c` |
| amd64 manifest | `sha256:e47c31ff9bdd0359e25b9115e69c4a46c1f9cf3c508295d5a020fee6a8f40632` |
| arm64 manifest | `sha256:40a76804867eb9880bec2e191dcb21c28ffae9c3e053e317199b9aaae0177688` |

The audited runtime contract is
[`651f637-runtime-contract.md`](../upstream/651f637-runtime-contract.md). The
upstream range does not change the container entrypoint, ports, automatic
migration switch, installed migration set, PostgreSQL compatibility, storage
authority, pairing source and declared interface/deployment contract, or health
routes. The StartOS wrapper therefore needed no new runtime adaptation for this
source update: it only changed the audited Buzz pin and package version. The
forward wrapper migration remains a no-op, and downgrade remains `IMPOSSIBLE`.

## Companion Client Boundary

The companion fork was merged with upstream at
`07015305c7cb3c6249ed746b06597235079120f3`. It retains narrow downstream
native-root selection in both Buzz Desktop and `buzz-acp`: each uses
`rustls-tls-native-roots`, and neither enables the bundled WebPKI-root feature.
Those patches remain necessary for the current private StartOS CA configuration
and are not part of the official server image.

The companion verification completed its focused native-root checks, 669 ACP
unit tests plus 9 ACP integration tests with one intentional ignore, and 4,022
Desktop tests. Desktop formatting, JavaScript checks, and the 4,592-module build
also passed. The host could not perform the Desktop Rust/Tauri check because it
lacked the system ALSA development package (`libasound2-dev` / `alsa.pc`). The
ignored live tests also do not by themselves prove an OS-only private-CA trust
path. Final beta evidence must therefore connect released Desktop and ACP builds
to the actual StartOS WSS interface; these source checks are not device evidence.

## Pairing, Android, And Remote Mobile

The diagnosed HTTP `404` came from Desktop deriving `<main relay>/pair` when
NIP-11 did not advertise a dedicated pairing relay. The main relay does not
serve that route. The package runs `buzz-pair-relay` from the audited image on a
separate StartOS interface. Its pairing source and declared interface/deployment
contract are unchanged across the audited upstream range; this is not a
byte-identity claim about the compiled binary. Native-image filesystem evidence
confirms that the executable is present, and the package source/tests establish
the root static-probe contract described below. The package supplies its
selected root WSS URL through `BUZZ_PAIRING_RELAY_URL` and advertises that exact
root in NIP-11. Desktop uses the root without appending `/pair`, fixing the
server-side 404 without another client modification.

The package's bounded root probe requires a complete RFC 6455 HTTP `101
Switching Protocols` response, including the derived accept value and required
headers; HTTP `400` or `404` is rejected. The fresh automated suite passed the
package probe implementation and health-contract tests, including local
WebSocket-upgrade admission. This verifies the server-side topology and static
probe implementation. Live behavior with the new native image and on-device
pairing, QR generation, and account transfer remain unperformed device gates.

Unmodified Android currently rejects the certificate path signed by the private
StartOS Root CA, so secure pairing failed in the observed alpha configuration.
The server-side 404 remediation does not change Android's TLS trust behavior.
Android LAN pairing remains unsupported and unverified, and remote mobile use is
unsupported.

The long-term direction is a separate StartTunnel or equivalent VPS deployment
with public DNS, publicly trusted certificates, and routing for both main and
pairing WSS interfaces, optionally with split DNS. That future design is not
implemented or validated here. No Android modification and no remote-mobile
claim is part of this candidate.

## Automated Verification

The following commands were run fresh from the clean implementation head before
this report was written:

| Command                                                     | Result                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| `npm ci`                                                    | PASS — clean lockfile install for the security checkpoint     |
| `npm test`                                                  | PASS — 312 tests, 312 passed, 0 failed                        |
| `npm run prettier:check`                                    | PASS                                                          |
| `npm run check`                                             | PASS — TypeScript emitted no errors                           |
| `node node_modules/@start9labs/start-sdk/lint.mjs`          | PASS                                                          |
| `npm run verify:images`                                     | PASS — all five OCI indexes matched                           |
| `npm run verify:device-evidence`                            | PASS structurally — 46 cells exist; it does not run them      |
| `npm run build`                                             | PASS — NCC produced `javascript/index.js`                     |
| `npm run audit:signatures`                                  | PASS — 178 signatures and 47 attestations verified            |
| `npm run audit:vulnerabilities`                             | **FAIL** — unwaived `GHSA-7p8r-x3mc-p8w7` in `fast-uri@3.1.4` |
| `git diff --check main...HEAD`                              | PASS                                                          |
| `scripts/audit-repository-controls.sh mdubore/buzz-startos` | **FAIL** — 7 PASS, 4 FAIL, and 2 informational readbacks      |

The successful type, lint, build, pin, and structural-evidence checks do not
make the candidate installable or promotable. A current final pack was not run:
the ignored packages described below were built at an older tracked commit.

## Security Gate

The approved checkpoint is
[`651f637-runtime-scan.md`](../security/651f637-runtime-scan.md). The dependency
gate fails on high-severity `GHSA-7p8r-x3mc-p8w7` in `fast-uri@3.1.4`, reached
through the root development dependency `ajv@8.20.0`. A fix is available. No
waiver was added for this finding.

The native scan covered five pinned OCI indexes and both native manifests for
each. `Raw C/H/U` counts every Critical, High, or Unknown occurrence in Grype's
`matches`; `Distinct C/H/U` deduplicates within one report by advisory ID and
component package URL. Unknown severities are retained and rejected
fail-closed. Each row below applies independently to both native manifests:

| Image family | Raw C/H/U  | Distinct C/H/U | Decision                               |
| ------------ | ---------- | -------------- | -------------------------------------- |
| Buzz         | `35/58/16` | `35/58/16`     | Blocked by Critical, High, and Unknown |
| PostgreSQL   | `0/0/0`    | `0/0/0`        | Clear in this checkpoint               |
| Redis        | `0/0/0`    | `0/0/0`        | Clear in this checkpoint               |
| MinIO        | `13/55/0`  | `12/40/0`      | Blocked by Critical and High           |
| MinIO Client | `2/19/0`   | `2/19/0`       | Blocked by Critical and High           |

The Buzz Unknown results are `CVE-2026-53613` and `CVE-2026-53615` across the
recorded `util-linux` components. The scanner exited on the first Unknown; the
Critical results independently block promotion. No OCI waiver was created for
these findings, and Critical findings cannot be waived. The repository contains
older, separately justified high-severity npm waivers, but none applies to
`fast-uri` or any current OCI blocker.

## Replacement Runtime Identity Gate

Any Buzz, MinIO, or MinIO Client replacement creates a new fail-closed audit
boundary before a final pack or candidate freeze. The replacement must not
inherit this `651f637` runtime contract merely because its tag or intended
source looks related. Before packaging replacement bytes:

1. Re-verify the authoritative source repository, release tag and exact target,
   full source commit, commit signature, commit time, ancestry, OCI index, and
   both native manifest digests. A lightweight tag must be resolved to and
   carried as its exact commit; mutable tag drift is a failure.
2. Re-audit every changed runtime-linked source path and both native image
   configurations and filesystems. Re-run the native CLI checks and verify the
   complete ports, environment, mounts, startup, health, migration, storage,
   and Desktop/ACP/mobile compatibility contracts against the wrapper.
3. Create or update runtime-contract and security evidence for the exact new
   bytes, including the full ten-manifest scan. Never reuse
   [`651f637-runtime-contract.md`](../upstream/651f637-runtime-contract.md) or
   its scan record for a different index or native manifest.
4. If the Buzz source commit or commit time changes, derive a new timestamp/SHA
   ExVer identity and reset the downstream revision to `:0`. If the source is
   unchanged but a reviewed downstream image rebuild changes its digests,
   increment the downstream package revision and document the reproducible
   build inputs, builder, source-to-image binding, attestations, and review
   rationale. A republished official tag with unexplained byte drift is not an
   acceptable rebuild.
5. Reconcile every identity consumer together: `startos/image-pins.ts`,
   `startos/versions/current.ts` and release notes, `docs/EVIDENCE.md`, the
   `UNFROZEN` proposed identity in `docs/testing/DEVICE_CANDIDATE.json`, runtime
   and security records, README/instructions where behavior changed, and all
   pin, manifest, documentation, and evidence tests.

Only after this gate and the replacement vulnerability policy pass may final
native packages be built and the candidate be frozen.

## Preparatory Artifacts — Non-Final

Task 7 built and inspected two ignored preparatory archives at package commit
`f8612ccc2c5c657b6baeb9438fb3d39ac12b63f7`. They verify that both architecture
pack paths could complete at that point; they are **NON-FINAL** and are not the
candidate artifacts.

| Architecture | SHA-256                                                            | Size (bytes) | Commitment root sighash                       |
| ------------ | ------------------------------------------------------------------ | ------------ | --------------------------------------------- |
| x86_64       | `5a3913f3f1e753ac44bd30ce6aefd3d51007ee3b3ea39be54a8c586877f42a95` | `240324032`  | `pq2RovMK1h9x3BwNmcDjZJ+koo9xYX5URzRxW0KrPgs` |
| aarch64      | `6a2b6a27ae7ab074da0e67ab8699aeb59c376bde8fe6fcce20713d750fb7e1a5` | `220904903`  | `Faqb8rPFgdsRZfWpkLa3l/QCkpKdhelaAfARXjT/iuk` |

Both archives reported the expected package version, contained only their
declared target architecture, passed their `SHA256SUMS`, and verified against
the committed signer fingerprint. Their manifests record Git hash
`f8612ccc2c5c657b6baeb9438fb3d39ac12b63f7`.

The exact preparatory commands and results at that Task 7 head were:

| Command                                                            | Task 7 result                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `make x86`                                                         | PASS — created the x86_64 archive                                  |
| `make arm`                                                         | PASS — created the aarch64 archive                                 |
| `start-cli s9pk inspect buzz_x86_64.s9pk manifest`                 | PASS — x86_64-only manifest, expected version and Task 7 Git hash  |
| `start-cli s9pk inspect buzz_x86_64.s9pk commitment`               | PASS — commitment recorded above                                   |
| `start-cli s9pk inspect buzz_aarch64.s9pk manifest`                | PASS — aarch64-only manifest, expected version and Task 7 Git hash |
| `start-cli s9pk inspect buzz_aarch64.s9pk commitment`              | PASS — commitment recorded above                                   |
| `scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk buzz_aarch64.s9pk` | PASS — both matched the committed signer                           |
| `sha256sum buzz_x86_64.s9pk buzz_aarch64.s9pk > SHA256SUMS`        | PASS — recorded the two non-final hashes above                     |
| `sha256sum -c SHA256SUMS`                                          | PASS — both archives matched                                       |

Tracked source changed after that build, including the candidate-evidence and
upgrade-provenance changes at `895e905` and `6043066`, and this report adds
another tracked change. Both archives must be rebuilt from the final reviewed
commit after all security remediation. Their hashes, sizes, commitments, and
old Git hash must not populate the frozen candidate.

## Repository And Public-Boundary Audit

The exact public-boundary audit found:

- a clean tracked branch at implementation head `6043066`;
- eight reviewed branch commits over `main`;
- no `main...HEAD` whitespace errors;
- no tracked `auth.json`, `history.jsonl`, SQLite, `log`, or `sessions` state;
- two secret-pattern matches, both deliberate synthetic detector vectors in
  `tests/device-evidence.test.ts` (a PEM-header fixture and a synthetic bearer
  authorization fixture), not credentials; and
- no evidence of a private key or live bearer credential in the reviewed diff.

The external repository-control audit reported 7 PASS, 4 FAIL, and 2 INFO
results across its 13 readbacks. It failed on these four required controls:

1. immutable releases are disabled;
2. no active `main` ruleset exists;
3. no active release-tag ruleset exists; and
4. independent release approval is not enforced.

The two informational results are absent optional legacy readbacks for main
branch protection and commit-signature protection. They are neither passes nor
additional blockers; the active ruleset checks above are authoritative.

The release environment still needs a second trusted reviewer and self-review
prevention. The exact required remediation is documented in
[`REPOSITORY-CONTROLS.md`](../security/REPOSITORY-CONTROLS.md). These failures
block both beta submission and production promotion.

## Device And Upgrade Evidence

[`DEVICE_CANDIDATE.json`](../testing/DEVICE_CANDIDATE.json) remains
`UNFROZEN`. Its final tag, package commit, both artifact hashes and sizes, and
both observed StartOS device build/image identities are null. The matrix has 23
gate rows and 46 architecture cells; every cell is `NOT RUN`.

The formal `UPG-01` source is the published cross-architecture
`dd222a5:2` release recorded in the candidate contract, not the local pairing
build. The local x86_64 `63496cc:2` archive is unpublished, has no immutable
release tag and no aarch64 counterpart, and can be used only for a separate
operator transition preflight. It cannot satisfy a Community Registry beta or
production matrix cell.

No stable StartOS x86_64 or aarch64 clean install, setup, health, main-relay
round trip, Desktop/ACP connection, pairing QR, formal upgrade, uninstall, or
reinstall result exists for this candidate. Automated tests cannot be promoted
to those device outcomes.

## Publishing Checklist And Manual Boundary

The current README describes the package architecture, interfaces, actions,
volumes, dependencies, WSS remediation, Android/private-CA boundary, and
LAN-only/remote-mobile limitations. [`EVIDENCE.md`](../EVIDENCE.md) points to
the current runtime contract and security checkpoint. Both correctly state that
the candidate is security-blocked.

The local StartOS publishing guide requires the version-tag convention, all
checks and pack steps green, a current README, and clean-install/start/UI/health/
uninstall/reinstall testing before a Community Registry PR. This checklist is
incomplete: the security checks, final pack identity, and real-device tests are
not green.

No candidate tag or GitHub release has been created. No email has been sent to
`submissions@start9.com`; Start9 has not forked this candidate into
`Start9-Community`; no registry PR has been opened or merged; no
`community-beta` build has been published; and no production promotion has been
requested. All remain manual, unperformed approval-boundary actions.

Once every beta prerequisite is green, the verified local guide's flow is:

1. email the public repository link to `submissions@start9.com`;
2. address feedback through PRs against the resulting `Start9-Community` fork;
3. let a Start9 merge build and publish to `community-beta`;
4. test the immutable beta; and
5. only after production gates pass, request `community` promotion by email or
   an issue on the fork.

## Required Order To Reach GO

### Community Registry Beta

1. Update the dependency lock to a reviewed fixed `fast-uri` version, then rerun
   install, signatures, vulnerability policy, tests, type checks, formatting,
   SDK lint, build, and image verification.
2. Replace or rebuild the Buzz, MinIO, and MinIO Client images; update every
   affected immutable index/native pin; rerun the complete ten-manifest scan;
   and require zero forbidden Critical, High, or Unknown findings with no new
   waiver or suppressed match.
3. Before final pack or freeze, run the complete Replacement Runtime Identity
   Gate above. Re-verify source/tag/commit/signature/ancestry and OCI identities,
   re-audit the changed runtime and compatibility contract, publish exact new
   runtime/security evidence, and update the full identity cascade. Do not reuse
   the `651f637` evidence for different bytes.
4. Enable and read back immutable releases, active `main` and release-tag
   rulesets, and independent approval with a distinct trusted reviewer.
5. Rebuild x86_64 and aarch64 packages from the final reviewed commit. Verify
   checksum, signer, manifest, commitment, native-only image contents, and exact
   package Git hash; then freeze one immutable candidate identity.
6. On official stable StartOS x86_64 and aarch64 devices, independently review
   clean install, pre-setup block, complete setup, both interface health checks,
   authenticated main-relay publish/query, Desktop and ACP WSS connectivity,
   pairing QR generation, formal `UPG-01` from the published `dd222a5:2`
   artifacts, hard uninstall, and clean reinstall.
7. Re-run the public-boundary and submission checklist and obtain final
   independent approval before the manual submission email.

Unmodified Android LAN pairing and remote mobile remain explicitly unclaimed;
they are not silently converted into beta support.

### Production Promotion

After beta eligibility and beta testing, preserve the same immutable candidate
and complete production gates in dependency order:

1. Complete every remaining prerequisite row except `RES-01` and `LIF-01`,
   including the full authorization/client matrix, persistence, same-architecture
   and both cross-architecture restores, and failure/recovery gates.
2. After its backup/restore and upgrade prerequisites pass, run `RES-01` and
   both 24-hour physical-device resource soaks.
3. Run `LIF-01` last, after all destructive and resource gates, then confirm all
   46 cells link valid passing evidence for the same candidate.
4. Implement authenticated distinct operator/reviewer binding.
5. Obtain independent final review of every record and immutable asset.
6. Pass `npm run verify:device-promotion`.
7. Only then request promotion of the already-tested beta bytes.

Android and remote-mobile support must still not be claimed without their own
successful public-certificate design and real-device evidence.
