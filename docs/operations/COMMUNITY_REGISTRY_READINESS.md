# Community Registry Readiness — Buzz `0.5.4:0`

Date: 2026-08-06

## Decision

| Promotion boundary | Decision | Current reason |
| --- | --- | --- |
| Start9 Community Registry beta | **NO-GO** | Runtime-security gates pass, but final signed artifacts are not frozen and the required native StartOS beta device checks are unperformed. |
| Start9 Community Registry production | **NO-GO** | The candidate is not beta-qualified and all 46 production device cells remain `NOT RUN`. |

The candidate is `UNFROZEN` and remains **NO-GO**. Source and runtime-image
checks do not turn into signed-artifact or StartOS device evidence and do not
authorize a registry submission.

## Candidate Identity

| Field | Reviewed value |
| --- | --- |
| Package version | `0.5.4:0` |
| Upstream Buzz | `desktop-v0.5.4`, commit `651f6372754e60e3f936b3397040eb0f1e44c9f3` |
| Candidate state | `UNFROZEN` |
| Candidate tag/commit | Pending source commit and immutable `v0.5.4_0` tag |
| Final x86_64 archive | Pending build and verification |
| Final aarch64 archive | Pending build and verification |
| Release signer | `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c` |
| Minimum manifest StartOS | `0.4.0-beta.10` compatibility floor, not test evidence |

The staged identity is authoritative in
[`DEVICE_CANDIDATE.json`](../testing/DEVICE_CANDIDATE.json). The source tag,
package commit, hashes, and sizes must be recorded there before any bytes are
eligible for a device run.

## Cleared Automated Gates

### Dependencies And Package Source

- `fast-uri` resolves to patched 3.1.5 through AJV 8.20.0;
- `npm audit signatures` verified 178 signatures and 47 attestations;
- the fail-closed npm policy passes with no critical finding and only the
  existing exact SDK-tooling waivers;
- TypeScript, formatting, Start SDK lint, the compiled entrypoint, and the
  complete test suite pass; and
- `npm run verify:images` confirms every recorded index and native manifest.

The final clean source gate and native archive verification remain pending.
A passing automated or artifact gate does not prove installation or service
behavior on StartOS.

### Rebuilt Runtime Images

Runtime Images workflow run
[`31002688940`](https://github.com/mdubore/buzz-startos/actions/runs/31002688940)
built Buzz, MinIO, and the MinIO client natively on amd64 and arm64 from exact
source commits. All six build/smoke jobs and all three merge/provenance jobs
passed at package source commit
`5dd0ff1d20e3a7e1a6edb763524849ac09d3fab5`.

| Runtime | Index digest |
| --- | --- |
| Buzz r2 | `sha256:61c2c9008e3853264b3df6dbc3119ee7ba1d6278340a1780eaec0b955f2dd985` |
| MinIO r2 | `sha256:5cff18515d059362060790bb17928a25b8b3653f5ac842a7742e9953ffa3a5d9` |
| MinIO Client r2 | `sha256:b1a507ecdf3ef5272791bd3e5b66e9f6e9b73d093f3aab9a0f481fd1e729baf6` |

The exact source, build-input, native manifest, provenance, filesystem,
command, and storage checks are recorded in
[`651f637-startos-r2-runtime-contract.md`](../upstream/651f637-startos-r2-runtime-contract.md).

### Dependency And OCI Security

The fresh Grype 0.116.0 scan covered the five pinned indexes and both native
manifests for each. All 10 target reports were bound to their exact digest,
architecture, scanner, database, and no-suppression configuration.

| Result | Count |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Unknown severity | 0 |
| Waived OCI High | 0 |

The current database, report hashes, per-image Medium/Low counts, and policy
output are recorded in
[`651f637-startos-r2-runtime-scan.md`](../security/651f637-startos-r2-runtime-scan.md).
The older failing scan remains historical evidence and does not describe these
r2 bytes.

## Client And Mobile Boundary

The dedicated root pairing relay fixes the diagnosed server-side HTTP 404:
clients use the NIP-11 `pairing_relay_url` root rather than deriving
`<main relay>/pair`. Pairing health requires a valid WebSocket HTTP 101 upgrade;
HTTP 400 and 404 responses fail the probe.

This candidate does not claim current unmodified Android support. In the
observed private-CA configuration, Android rejects the private StartOS Root CA
during secure pairing. Remote mobile is also unsupported. A future StartTunnel
or equivalent VPS design may provide public DNS, publicly trusted certificates,
and routing for both main and pairing WSS interfaces, but that design is not
implemented or validated by this package.

Buzz Desktop and `buzz-acp` must still be tested independently against the
actual StartOS WSS endpoint. Source and host-side client tests are not a
substitute for that device evidence.

## Remaining Community Registry Beta Work

1. Run the minimum beta matrix on official stable StartOS for both native
   architectures: artifact verification, clean install, pre-setup block,
   initial/pairing setup, UI and both health checks, authenticated relay round
   trip, Desktop WSS, ACP WSS, pairing QR, formal published-source upgrade,
   hard uninstall, and clean reinstall.
2. Obtain independent review of the exact frozen artifacts and returned device
   evidence.
3. Only after those steps pass, manually email the public repository to
   `submissions@start9.com`, address review in the resulting
   `Start9-Community` fork, and test the immutable `community-beta` build.

No submission email, Start9 fork PR, `community-beta` publication, or promotion
has occurred for this candidate.

## Production Boundary

Production remains a later phase. Preserve the same immutable beta bytes and
complete all 46 device cells in dependency order, including the full
authorization/client matrix, persistence, backup/restore and both
cross-architecture restores, failure/recovery behavior, both 24-hour resource
soaks, and final lifecycle checks. Then add authenticated distinct
operator/reviewer binding and pass `npm run verify:device-promotion` before
requesting `community` promotion.

## Repository Governance

Repository governance is not a gate for Start9 Community Registry submission.
Rulesets, immutable GitHub Releases, and an independent repository release
approver remain worthwhile optional maintainer hardening, documented in
[`REPOSITORY-CONTROLS.md`](../security/REPOSITORY-CONTROLS.md). The Start9
submission path evaluates the package repository and later applies review and
publication controls through the `Start9-Community` fork.
