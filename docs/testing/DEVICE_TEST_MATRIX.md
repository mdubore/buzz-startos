# StartOS Device Test Matrix

No row is complete until it has been exercised on a real StartOS device with
the architecture-matched archive. Record the StartOS version, device model,
CPU architecture, package commit, archive SHA-256, date, commands, and
sanitized evidence for every checked cell.

The package targets the StartOS v0.4.0 release line. Record the exact device
build rather than treating a package manifest's minimum OS version as device
evidence.

| Scenario | x86_64 | aarch64 | Required evidence |
| --- | --- | --- | --- |
| Sideload and clean install | - [ ] | - [ ] | Archive name/SHA-256, signer verification, install result, service version |
| Complete initial owner and canonical-URL setup | - [ ] | - [ ] | Normalized public key, selected non-secret URL, critical task cleared |
| HTTP interface | - [ ] | - [ ] | Canonical host response and expected limited browser route; no full-client claim |
| WebSocket relay | - [ ] | - [ ] | Successful upgrade, NIP-42 owner/member authentication, basic event round trip |
| Membership actions | - [ ] | - [ ] | Add, list, remove for `member` and `admin`; owner rejection; sanitized action output |
| Media | - [ ] | - [ ] | Authenticated upload, content-addressed retrieval, link-accessible GET behavior |
| Git | - [ ] | - [ ] | NIP-98 authenticated repository create/push/clone with object integrity |
| Restart persistence | - [ ] | - [ ] | Owner, members, events, media, Git, canonical URL, and stable identity survive restart |
| Git cache deletion and hydration | - [ ] | - [ ] | Delete only `git-cache`, restart, clone successfully from MinIO authority |
| Backup and restore | - [ ] | - [ ] | Backup ID, restore result, logical PostgreSQL recovery, stable secrets/URL/data preserved |
| Wrong `Host` behavior | - [ ] | - [ ] | Tenant-bound HTTP and WebSocket requests rejected; note any generic NIP-11/static response separately |
| MinIO health failure | - [ ] | - [ ] | Stop or isolate MinIO, observe composite Buzz health fail, restore and recover |
| Resource measurement | - [ ] | - [ ] | Startup peak and steady CPU, memory, disk, backup size/time, test data scale |

## Evidence Record

Create one subsection per device run:

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
