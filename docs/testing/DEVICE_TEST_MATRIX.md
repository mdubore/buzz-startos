# StartOS Device Test Matrix

No row is complete until it has been exercised on a real StartOS device with
the architecture-matched archive. Record the StartOS version, device model,
CPU architecture, package commit, archive SHA-256, date, commands, and
sanitized evidence for every completed cell.

The package targets the StartOS v0.4.0 release line. Record the exact device
build rather than treating a package manifest's minimum OS version as device
evidence.

| Scenario | x86_64 | aarch64 | Required evidence |
| --- | --- | --- | --- |
| Sideload and clean install | **NOT RUN** | **NOT RUN** | Archive name/SHA-256, signer verification, install result, service version |
| Complete initial owner and canonical-URL setup | **NOT RUN** | **NOT RUN** | Normalized public key, selected non-secret URL, critical task cleared |
| HTTP interface | **NOT RUN** | **NOT RUN** | Canonical host response and expected limited browser route; no full-client claim |
| WebSocket relay | **NOT RUN** | **NOT RUN** | Successful upgrade, NIP-42 owner/member authentication, basic event round trip |
| Membership actions | **NOT RUN** | **NOT RUN** | Add, list, remove for `member` and `admin`; owner rejection; sanitized action output |
| Media | **NOT RUN** | **NOT RUN** | Authenticated upload, content-addressed retrieval, link-accessible GET behavior |
| Git | **NOT RUN** | **NOT RUN** | NIP-98 authenticated repository create/push/clone with object integrity |
| Restart persistence | **NOT RUN** | **NOT RUN** | Owner, members, events, media, Git, canonical URL, and stable identity survive restart |
| Git cache deletion and hydration | **NOT RUN** | **NOT RUN** | Delete only `git-cache`, restart, clone successfully from MinIO authority |
| Backup and restore | **NOT RUN** | **NOT RUN** | Backup ID, restore result, logical PostgreSQL recovery, stable secrets/URL/data preserved |
| Wrong `Host` behavior | **NOT RUN** | **NOT RUN** | Tenant-bound HTTP and WebSocket requests rejected; note any generic NIP-11/static response separately |
| MinIO health failure | **NOT RUN** | **NOT RUN** | Stop or isolate MinIO, observe composite Buzz health fail, restore and recover |
| Resource measurement | **NOT RUN** | **NOT RUN** | Startup peak and steady CPU, memory, disk, backup size/time, test data scale |

## Candidate Availability Assessment (2026-07-27)

Device availability was assessed at `2026-07-27T03:05:18Z`. The two configured
host profiles could not be resolved by the system resolver or Start CLI (exit
9), so no reachable, architecture-identified StartOS device was available. The
exact device StartOS versions, models, and architectures therefore could not be
established.

Static candidate build evidence was collected for package commit:

```text
20badb81dc5735006ffcd27b93d9a59daae663ff
```

The candidate archives were:

- `buzz_x86_64.s9pk`: 239,830,138 bytes; SHA-256
  `fa1b4c4f58bce37ae6290867d22ee0de182a332b6d7f8a49d0e8fc738ba30381`
- `buzz_aarch64.s9pk`: 220,423,297 bytes; SHA-256
  `659411160e7e98194cb288df139bab9c46a5bbb46eee8653f2e2a81df19e8802`
- signing fingerprint:
  `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c`

Both candidate manifests passed static inspection for package version
`0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:0`, Start SDK 2.0.9, five
image entries, matching x86_64 or aarch64 metadata, and the clean candidate
`gitHash` above. S9PK commitments, archive signatures, signer identity, and
checksums also passed. This proves only that the candidate archives built and
passed static package verification.

The package targets the StartOS v0.4.0 release line and declares a manifest
minimum of `0.4.0-beta.10`. Those values are package metadata, not evidence of
any device version or successful sideload.

No install, initial setup, HTTP, WebSocket, membership, media, Git, restart,
cache deletion, backup/restore, wrong-`Host`, dependency-health, or resource
scenario was executed on either architecture. No candidate build result may be
treated as device evidence. This evidence commit changes the package tree, so
the candidate archives above are also non-final and must not be published.

## Evidence Record

For each future device run, replace only the corresponding `NOT RUN` cells and
create a subsection from this template:

```text
Architecture:
Device:
StartOS version:
Package commit:
Archive:
Archive SHA-256:
Signing fingerprint:
Date (UTC):
Operator:
```

Do not include private keys, database/Redis/MinIO credentials, relay signing
material, HMAC secrets, authentication headers, or unredacted restore error
argv/log output.
