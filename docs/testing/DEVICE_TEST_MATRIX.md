# StartOS 0.4.0 Production Device Test Matrix

This matrix is the promotion gate for one immutable Buzz release candidate.
Production acceptance runs on native x86_64 and aarch64 devices reporting the
official stable StartOS `0.4.0` release and an exact build identifier. The
manifest value `0.4.0-beta.10` is the SDK compatibility floor; it is not the
tested device version or a substitute for device evidence.

## Candidate Identity

[`DEVICE_CANDIDATE.json`](DEVICE_CANDIDATE.json) is authoritative. Task 9
freezes its package, per-architecture artifact, and per-architecture StartOS
image values before any device run. Every evidence record must exactly match
that contract.

| Field                | Required value                                                            |
| -------------------- | ------------------------------------------------------------------------- |
| Candidate tag        | Pending immutable candidate tag                                           |
| Package version      | Pending version matching the tag                                          |
| Package commit       | Pending full 40-character commit                                          |
| Upstream Buzz commit | Pending reviewed full 40-character commit                                 |
| Release signer       | `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c` |
| x86_64 artifact      | Pending `buzz_x86_64.s9pk` size and SHA-256                               |
| aarch64 artifact     | Pending `buzz_aarch64.s9pk` size and SHA-256                              |
| StartOS source       | `start-os/v0.4.0` at `514af0c2fa076c8b597d9861f882bdb1b3411d9e`          |
| StartOS images       | Pending observed x86_64 and aarch64 build IDs and image SHA-256 hashes    |

Changing a package, image, source, version, signature, or archive byte creates a
new candidate and resets every result. Evidence may be committed after the
candidate tag, but the tested tag must not move and its assets must not be
rebuilt or replaced.

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
| UPG-01  | Published revision `:2` to candidate update                              | ART-01                             | NOT RUN | NOT RUN | `upgrade.*`                  |
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

Promotion requires valid linked evidence in all 46 cells, identical release
identity across those records, no open high or critical issue, successful
pre-upgrade audits, physical-device resource reports, and independent approval.
The immutable assets tested here are the only assets that may be promoted. Run
`npm run verify:device-promotion` for the strict check. Promotion remains
disabled until a protected evidence workflow provides machine-verifiable
authenticated operator/reviewer binding.
