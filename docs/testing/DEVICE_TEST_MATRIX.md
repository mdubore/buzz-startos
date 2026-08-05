# StartOS 0.4.0 Production Device Test Matrix

This matrix is the promotion gate for one immutable Buzz release candidate.
Production acceptance runs on native x86_64 and aarch64 devices reporting the
official stable StartOS `0.4.0` release and an exact build identifier. The
manifest value `0.4.0-beta.10` is the SDK compatibility floor; it is not the
tested device version or a substitute for device evidence.

The staged candidate is **AUTOMATION-CLEAR** but remains **NO-GO** for both
Community Registry beta submission and production promotion until its signed
artifacts are frozen and the required device gates pass. It remains `UNFROZEN`;
no row below has been executed and all 46 device cells remain unexecuted.

## Candidate Identity

[`DEVICE_CANDIDATE.json`](DEVICE_CANDIDATE.json) is authoritative. It records
the reviewed proposed package version and upstream source while leaving the
candidate tag, package commit, per-architecture artifact, and per-architecture
StartOS image identities null. Those frozen-only values cannot be recorded
until the final tracked commit and signed artifacts exist. Every later
evidence record must exactly match the resulting frozen contract.

| Field                     | Required value                                                            |
| ------------------------- | ------------------------------------------------------------------------- |
| Candidate state           | `UNFROZEN` — `AUTOMATION-CLEAR` / `NO-GO`                                 |
| Candidate tag             | Null until final freeze                                                   |
| Proposed package version  | `0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:2`                      |
| Package commit            | Null until final freeze                                                   |
| Upstream Buzz commit      | `651f6372754e60e3f936b3397040eb0f1e44c9f3`                                |
| Release signer            | `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c` |
| x86_64 final artifact     | Null size and SHA-256 until final freeze                                  |
| aarch64 final artifact    | Null size and SHA-256 until final freeze                                  |
| StartOS source            | `start-os/v0.4.0` at `514af0c2fa076c8b597d9861f882bdb1b3411d9e`           |
| StartOS device identities | Null x86_64/aarch64 build IDs and image hashes until observed             |

The ignored `buzz_x86_64.s9pk`, `buzz_aarch64.s9pk`, and `SHA256SUMS` files are
preparatory and non-final. Rebuild the artifacts after the final tracked commit
and before freezing the candidate.
Do not copy their present hashes, sizes, or commitments into the candidate.

Changing a package, image, source, version, signature, or archive byte creates a
new candidate and resets every result. Evidence may be committed after the
candidate tag, but the tested tag must not move and its assets must not be
rebuilt or replaced.

## Community Registry Beta Minimum

Security remediation and the final scan pass. The minimum Community Registry
beta device gate now requires independently reviewed
real-device evidence on both native x86_64 and native aarch64 for each of these
outcomes:

1. Final artifact checksum, signer, manifest, commitment, and native image
   architecture.
2. Clean install and the expected pre-setup startup block.
3. Complete Initial Setup and Configure Pairing Relay initial setup tasks.
4. UI access through the canonical StartOS address and healthy service state.
5. An authenticated main-relay WebSocket event publish/query relay round trip.
6. Buzz Desktop and ACP connectivity to the main WSS endpoint.
7. Pairing QR generation through the dedicated pairing WSS endpoint.
8. Complete formal `UPG-01` from the exact published cross-architecture source
   recorded in `DEVICE_CANDIDATE.json`, preserving state and returning both
   interfaces to health:
   - tag `v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2`
   - version `0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2`
   - package commit `0103ba850c08ae84cca5c623ea76c855d7a7f1a4`
   - upstream commit `dd222a509b156ba52ed3219e895d7bf1cf322c92`
   - signer `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c`
   - x86_64 SHA-256
     `8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2`
   - aarch64 SHA-256
     `72e4e73e413df327af11eba48c4808b1e011729c3a1f6113d25a6c63138c2638`
9. Hard uninstall and clean reinstall, including fresh initial-setup state.

Automated, static, image, or host-only checks cannot complete these device
outcomes. They all remain unperformed for this candidate.

## Operator-Specific Local x86_64 Transition Preflight

The operator also has one independently inspected local x86_64 sideload archive
for the actual alpha-test transition path:

- version `0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2`
- package commit `2ae96a9aa150d3fd50a19eaf5fa30a81b452c9e4`
- upstream commit `63496cc1d4c6f1b7c613801bdcc694169dcf391a`
- x86_64 archive SHA-256
  `acc6224859b5fc4c945ab43d3a81ea961938459262616650bcd31851b8133b4e`

This archive is not published and has no immutable release tag or corresponding
aarch64 artifact. Testing its x86_64 transition is an operator preflight outside
the signed 46-cell evidence matrix. It cannot count toward Community Registry
beta or production readiness, cannot complete `UPG-01`, and must not create a
matrix `PASS`. Keep any result as separate local operator notes.

## Status Format

An unexecuted cell contains the literal unexecuted status shown below. A
completed cell links its `PASS`, `FAIL`, or `BLOCKED` status to the corresponding
relative evidence JSON file. Required gates cannot be waived. Failure or blockage
on either architecture prevents production promotion.

The gate order and assertion identifiers are canonical in
[`DEVICE_GATES.json`](DEVICE_GATES.json).

| Gate ID | Acceptance gate                                                          | Depends on                         | x86_64  | aarch64 | Required assertion group     |
| ------- | ------------------------------------------------------------------------ | ---------------------------------- | ------- | ------- | ---------------------------- |
| ART-01  | Artifact checksum, signature, signer, manifest, and native architecture  | None                               | NOT RUN | NOT RUN | `artifact.*`                 |
| INS-01  | Clean sideload, installed version, and pre-setup startup block           | ART-01                             | NOT RUN | NOT RUN | `install.*`                  |
| SET-01  | Owner normalization, immutable canonical URL, task clearance, and health | INS-01                             | NOT RUN | NOT RUN | `setup.*`                    |
| NET-01  | Canonical HTTP and limited browser routes                                | SET-01                             | NOT RUN | NOT RUN | `http.*`                     |
| NET-02  | WebSocket upgrade, NIP-42 authentication, and event round trip           | SET-01                             | NOT RUN | NOT RUN | `websocket.*`                |
| AUTH-01 | Member/admin action lifecycle and owner rejection                        | SET-01                             | NOT RUN | NOT RUN | `membership.*`               |
| AUTH-02 | Unauthorized channel-role change and owner-demotion regression           | AUTH-01, NET-02                    | NOT RUN | NOT RUN | `authorization.*`            |
| MED-01  | Authenticated media upload and content-addressed retrieval               | NET-02, AUTH-01                    | NOT RUN | NOT RUN | `media.*`                    |
| GIT-01  | NIP-98 repository create, push, clone, and object integrity              | NET-01, AUTH-01                    | NOT RUN | NOT RUN | `git.*`                      |
| PER-01  | Service-restart persistence                                              | AUTH-02, MED-01, GIT-01            | NOT RUN | NOT RUN | `restart.*`                  |
| PER-02  | Package-container rebuild persistence                                    | PER-01                             | NOT RUN | NOT RUN | `rebuild.*`                  |
| PER-03  | StartOS reboot persistence                                               | PER-02                             | NOT RUN | NOT RUN | `reboot.*`                   |
| PER-04  | Git-cache deletion and MinIO hydration                                   | GIT-01, PER-03                     | NOT RUN | NOT RUN | `git-cache.*`                |
| BND-01  | Wrong and missing `Host` rejection                                       | NET-01, NET-02                     | NOT RUN | NOT RUN | `host.*`                     |
| BKP-01  | Cross-host backup and clean-target restore                               | PER-04                             | NOT RUN | NOT RUN | `backup.*`, `restore.*`      |
| HLT-01  | MinIO failure, unhealthy transition, and recovery                        | BKP-01                             | NOT RUN | NOT RUN | `minio.*`                    |
| HLT-02  | PostgreSQL failure and recovery                                          | BKP-01                             | NOT RUN | NOT RUN | `postgres.*`                 |
| HLT-03  | Redis failure and recovery                                               | BKP-01                             | NOT RUN | NOT RUN | `redis.*`                    |
| REC-01  | Canonical-address loss, blocking task, and recovery                      | BKP-01                             | NOT RUN | NOT RUN | `canonical-url.*`            |
| REC-02  | Malformed wrapper state, fail-closed backup, and restore recovery        | BKP-01                             | NOT RUN | NOT RUN | `stable-state.*`             |
| UPG-01  | Published `dd222a5:2` release to candidate update                        | ART-01                             | NOT RUN | NOT RUN | `upgrade.*`                  |
| RES-01  | Production resource profile and 24-hour physical-device soak             | BKP-01, UPG-01                     | NOT RUN | NOT RUN | `resources.*`                |
| LIF-01  | Hard uninstall and clean reinstall                                       | All destructive and resource gates | NOT RUN | NOT RUN | `uninstall.*`, `reinstall.*` |

## Evidence Contract

Use [`DEVICE_TEST_RUNBOOK.md`](DEVICE_TEST_RUNBOOK.md) in dependency order.
Each linked JSON file must validate against
[`DEVICE_EVIDENCE.schema.json`](DEVICE_EVIDENCE.schema.json) and pass:

```bash
npm run verify:device-evidence
```

Evidence records include the native archive identity, stable StartOS build,
device hardware, commands, client versions, timestamps, before/after state
hashes, sanitized local attachments, issues, and independent review. The
validator opens each attachment, enforces directory containment, recomputes its
SHA-256, and scans it for credentials. The example is only a schema template and
does not complete a cell.

Never retain private keys, database/Redis/MinIO credentials, relay signing
material, HMAC secrets, authentication headers, database dumps, or unredacted
restore error argv/log output.

## Production Exit

Production promotion requires valid linked evidence in all 46 cells, identical
release identity across those records, no open high or critical issue, and
successful pre-upgrade audits. It also requires same-architecture backup and
restore, both directions of cross-architecture restore, both physical-device
24-hour resource soaks, and independent review of every record. The immutable
assets tested here are the only assets that may be promoted. Run
`npm run verify:device-promotion` for the strict check. Promotion remains
disabled until a protected evidence workflow provides machine-verifiable
authenticated operator/reviewer binding.
