# StartOS 0.4.0 Production Device Test Runbook

Use this runbook to decide whether one immutable Buzz package candidate is ready
for production sideloading. Run every gate on native x86_64 and native aarch64
hardware. The target is the official stable StartOS `0.4.0` release with its
exact build identity recorded. Manifest minimum `0.4.0-beta.10` is only the
compatibility floor; a beta installation cannot satisfy this runbook.

The staged candidate is **SECURITY-BLOCKED** and therefore **NO-GO** for both
Community Registry beta submission and production promotion. It remains
`UNFROZEN`, and no automated, static, image, or host-only result may be promoted
to real-device evidence.

This document defines the procedure. It does not report that any procedure has
run. [`DEVICE_CANDIDATE.json`](DEVICE_CANDIDATE.json) is the machine-readable
candidate identity and [`DEVICE_TEST_MATRIX.md`](DEVICE_TEST_MATRIX.md) is the
authoritative execution status. The proposed package version is
`0.2.0-main.20260803.h.17.m.33.s.19.sha.651.f.637:1`, built from reviewed
upstream commit `651f6372754e60e3f936b3397040eb0f1e44c9f3`. The candidate remains
`UNFROZEN` until final native artifacts and official StartOS image identities
are recorded during the release task.

The currently ignored `buzz_x86_64.s9pk`, `buzz_aarch64.s9pk`, and `SHA256SUMS`
files are preparatory and non-final. Tasks 8 and 9 change tracked package bytes,
so rebuild the artifacts after the final tracked commit and after the security
gates clear. Do not use their current hashes, sizes, commitments, or manifests
as candidate identity or device evidence.

The accepted OS lineage is the official `start-os/v0.4.0` tag from
`https://github.com/Start9Labs/start-technologies/releases/tag/start-os/v0.4.0`
at commit `514af0c2fa076c8b597d9861f882bdb1b3411d9e`. Record the distinct build ID
and image SHA-256 used on each architecture in the candidate contract before
executing production evidence.

## Roles And Equipment

- Assign an operator and a different independent reviewer. The reviewer verifies
  the record, attachments, result, and linked issues before approving it.
- Prepare primary and clean restore-target devices for each architecture. Use
  physical devices for `RES-01`; record virtualization honestly for every other
  gate.
- Install the same official stable StartOS image on each device. Record the
  reported version, build ID, source URL, image SHA-256, kernel, CPU, memory, and
  storage.
- Prepare architecture-matched Buzz clients and Nostr identities for one owner,
  one admin, one member, and one unauthorized identity. Record client versions.
- Use synthetic, disposable workspace data. Do not use production identities,
  private repositories, personal media, or irreplaceable state.
- Keep a separate recovery path for the published `:2` upgrade source. Do not
  reuse the primary clean-install instance for that lane.

Never record secrets in evidence: no private keys, `nsec` values, authorization
headers, service credentials, connection strings, database dumps, or unredacted
restore diagnostics.

## Freeze The Candidate

The unfrozen contract already records the proposed package version and upstream
commit. Before the first gate, and only after security remediation and the final
tracked commit, record one candidate tag, package commit, signer fingerprint,
SDK version, native archive names, byte sizes, SHA-256 hashes, and observed
native StartOS device-image identities in `DEVICE_CANDIDATE.json`, then change
its state to `FROZEN`. Both architectures must use those exact values. Do not
invent an identity to exercise the release workflow; automated tests use a
separate injected frozen fixture. The candidate contract is closed: unknown
fields at any level are rejected rather than ignored.

The candidate tag and release assets are immutable. Evidence may be committed
after the candidate tag, but the tested tag must not move and its assets must not
be rebuilt or replaced. Any package, source, image, manifest, signature,
commitment, or archive-byte change creates a new candidate and resets the
matrix.

## Evidence Workflow

1. Copy [`device-evidence.example.json`](device-evidence.example.json) to
   `docs/testing/evidence/<candidate>/<architecture>/<gate-id>.json`.
2. Set `example` to `false`; replace every example value with observed candidate,
   device, execution, state-hash, assertion, evidence, issue, and review data.
3. Store sanitized attachments beside the record and reference them only by a
   local relative `path`, never by a URL or absolute path. Hash every attachment
   and reference it by a unique evidence ID. Attachments are limited to 16 MiB,
   and symbolic links are rejected. The validator confines each file to the
   record directory, opens it with no-follow semantics, and streams SHA-256
   verification and credential scanning through the same file handle while
   checking for changes. Matrix record links must likewise be local relative
   paths to regular, non-symbolic files within the matrix directory. Record
   commands as program and argument arrays only when no password, secret, or
   token argument is present.
4. Use `pass` only when every required assertion in
   [`DEVICE_GATES.json`](DEVICE_GATES.json) passes, each assertion cites retained
   evidence, no high or critical issue is open, and the independent reviewer
   approves.
5. Use `fail` for an observed acceptance failure and `blocked` when a prerequisite
   or environment prevents a valid observation. Link the record from the matching
   matrix cell in either case; neither result can be waived.
6. Run `npm run verify:device-evidence`. This checks the template and any linked
   evidence but deliberately allows `NOT RUN` cells. Commit the evidence and
   matrix link together after review.

Capture timestamps in UTC. Before persistence, restore, update, and lifecycle
gates, hash a deterministic sanitized state inventory covering identities,
channels, event IDs, media content hashes, Git refs/object IDs, canonical URL,
and non-secret stable-state fingerprints. Recompute it afterward and explain any
expected change.

## Community Registry Beta Minimum

Clear the documented security gate and rebuild both final native artifacts
before any beta device run. Community Registry beta readiness then requires
independently reviewed evidence on both native x86_64 and native aarch64 for
every outcome below:

1. Verify final artifact checksum, signer, manifest, commitment, and native
   image architecture.
2. Perform a clean install and observe the expected pre-setup startup block.
3. Complete the Complete Initial Setup and Configure Pairing Relay initial setup
   tasks.
4. Confirm UI access through the canonical StartOS address and healthy service
   state.
5. Complete an authenticated main-relay WebSocket publish/query relay round
   trip.
6. Connect both Buzz Desktop and ACP to the main WSS endpoint.
7. Generate a pairing QR code through the dedicated pairing WSS endpoint.
8. Complete formal `UPG-01` from the exact published cross-architecture source
   recorded in `DEVICE_CANDIDATE.json`, verify preserved state, and return both
   interfaces to health:
   - tag `v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2`
   - version `0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2`
   - package commit `0103ba850c08ae84cca5c623ea76c855d7a7f1a4`
   - upstream commit `dd222a509b156ba52ed3219e895d7bf1cf322c92`
   - signer `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c`
   - x86_64 archive SHA-256
     `8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2`
   - aarch64 archive SHA-256
     `72e4e73e413df327af11eba48c4808b1e011729c3a1f6113d25a6c63138c2638`
9. Perform a hard uninstall and clean reinstall, confirming empty service data
   and fresh initial-setup state.

This is the exact minimum beta workflow; it is not production acceptance. All
of these checks are currently unperformed and must remain `NOT RUN` until their
real-device evidence is captured and independently reviewed.

## Operator-Specific Local x86_64 Transition Preflight

The operator's actual alpha-test path currently begins with one independently
inspected local x86_64 sideload archive:

- version `0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2`
- package commit `2ae96a9aa150d3fd50a19eaf5fa30a81b452c9e4`
- upstream commit `63496cc1d4c6f1b7c613801bdcc694169dcf391a`
- x86_64 archive SHA-256
  `acc6224859b5fc4c945ab43d3a81ea961938459262616650bcd31851b8133b4e`

This archive is not published and has no immutable release tag or corresponding
aarch64 artifact. Its upgrade to the final candidate may be exercised on the
operator's x86_64 StartOS device as a separate transition preflight after the
security gate clears. Record the observed source hash, candidate hash, StartOS
identity, commands, and result in local operator notes only.

This preflight is outside the signed 46-cell evidence matrix. It cannot count
toward Community Registry beta or production readiness, cannot complete formal
`UPG-01`, and must never create a matrix `PASS`. Formal cross-architecture
acceptance continues to use the published `dd222a5:2` source above.

## Execution Order

Run gates in the order below on each architecture. Independent branches may be
run in parallel only after all listed dependencies pass. Complete `BKP-01`
before any dependent destructive fault or recovery gate. Run `UPG-01` on its
separate published-`:2` source instance.

### ART-01

Verify the downloaded archive SHA-256 against the candidate checksum file. Run
`scripts/verify-s9pk-signer.sh`, confirm the reviewed signer fingerprint, and
inspect the manifest and commitment with `start-cli`. Confirm the manifest
version and minimum StartOS value match the candidate. Inspect every embedded OCI
manifest and prove the x86_64 archive contains only amd64 images while the
aarch64 archive contains only arm64 images.

Retain sanitized checksum, signature, manifest, commitment, and architecture
inspection output.

### INS-01

On a clean stable StartOS device, sideload the matching native archive. Confirm
StartOS reports the candidate package version and no unexpected dependency.
Before completing setup, attempt to start Buzz and confirm the critical initial
setup task prevents service startup.

Retain the installed-package details, task state, and service state.

### SET-01

Complete initial setup with the synthetic owner's public key and one permanent
test address. Confirm the stored owner is normalized to lowercase hex, the
canonical URL exactly matches the selected address, the setup task clears, and
Buzz reaches healthy. Record only the public owner key and canonical URL.

### NET-01

Exercise the canonical HTTPS host. Confirm documented health, invite, repository,
media, and API routes behave as expected and that protected routes require their
documented authentication. Confirm the browser surface remains limited and does
not present itself as the full Buzz client.

### NET-02

Connect by secure WebSocket through the canonical host. Complete NIP-42 as the
owner and admitted member, reject the unauthorized identity, publish a signed
synthetic event, query it back, and compare its ID and signature. Capture a
sanitized protocol transcript without authentication material.

### AUTH-01

Through StartOS actions, add and list a member, remove it, then repeat the
lifecycle for an admin. Confirm the roster matches after each step, duplicate
addition is idempotent, and attempts to add or remove the immutable owner are
rejected. Confirm StartOS actions never return service secrets.

### AUTH-02

Create a synthetic channel with an active owner, admin, member, and unauthorized
identity. Fill `authorizationRegression.roleAuthorization.cases` with exactly
the four named invariants: `non-admin-role-change-rejected`,
`owner-demotion-rejected`, `owner-set-preserved`, and
`active-owner-per-channel`. Every attempt must be rejected without persisting an
event, return the generic client error `request rejected`, and expose no raw
database or SQL text. Record before and after persisted state hashes, owner
public-key sets, and the active owner public keys for every channel. The before
and after state must be identical, the owner set must be preserved, and every
channel must retain at least one active owner.

Separately, fill the structured `authorizationRegression.cases` restriction
matrix for event kinds `9030`, `9031`, `9032`, `9033`, `41010`, `41011`,
`41012`, `30620`, `46020`, `46030`, and `46031`.

For every listed kind, test owner, admin, and member identities under both an
active ban and an active timeout. All 66 attempts must be rejected, produce no
event write, return the same generic client error `request rejected`, and expose
no raw database or SQL text. Then, as an owner authorized for the operation,
test every kind after each expired restriction and again without a restriction.
All 33 authorized attempts must succeed and persist the intended event. A role
that is not otherwise authorized is not made authorized merely because a
restriction expired.

Retain sanitized client responses and before/after event identifiers or counts
for every case. This gate specifically covers the authorization defect fixed
upstream after the published `:2` package.

### MED-01

Upload deterministic media through an authenticated client. Confirm the returned
content hash matches the uploaded bytes, retrieve it through the canonical URL,
and compare the bytes. Also record the documented link-accessible GET behavior so
the package does not imply membership protection that is not present.

### GIT-01

Create a synthetic repository using NIP-98, push deterministic branches, tags,
and files, then clone it into a clean client directory. Compare refs and Git
object IDs between source and clone. Reject missing or invalid NIP-98
authentication.

### PER-01

Hash the deterministic state inventory, restart the Buzz service through StartOS,
wait for health, and re-run client reads. Confirm identities, canonical URL,
events, media, Git objects, membership, and stable-state fingerprints are
preserved.

### PER-02

Hash the state inventory, force a package-container rebuild using the supported
StartOS operation, wait for health, and compare the post-rebuild inventory.
Confirm no stable secret or service identity rotated.

### PER-03

Hash the state inventory, reboot the StartOS host, wait for all private services
and Buzz to become healthy, and compare the post-reboot inventory. Re-run one
authenticated WebSocket read, media read, and Git clone.

### PER-04

After a verified inventory and recovery point exist, delete only the documented
disposable Git cache through an approved test mechanism. Do not alter PostgreSQL
or MinIO. Clone the repository again, confirm Buzz hydrates the cache from MinIO,
and compare refs and object IDs.

### BND-01

Send tenant-bearing HTTP and WebSocket requests with the canonical host, a wrong
host, and no host where the client permits it. Wrong or absent tenant hosts must
not select the configured community. If a generic response is served, prove it
does not disclose tenant data or act as a fallback tenant.

### BKP-01

Create and verify a StartOS backup after recording the state inventory. The
official StartOS 0.4.0 documentation says
[backup archives are architecture-specific](https://github.com/Start9Labs/start-technologies/blob/start-os/v0.4.0/projects/start-os/docs/src/backup-create.md)
but [restore across architectures is supported](https://github.com/Start9Labs/start-technologies/blob/start-os/v0.4.0/projects/start-os/docs/src/backup-restore.md);
cross-architecture services should then be reinstalled, not uninstalled, to use
their native package.

Record all four structured trials in each `BKP-01` record:

- x86_64 source to x86_64 target
- aarch64 source to aarch64 target
- x86_64 source to aarch64 target
- aarch64 source to x86_64 target

For every source and clean target, record architecture, model, CPU, core count,
memory, storage, StartOS build ID, and StartOS image SHA-256. Cross-architecture
trials must reinstall the frozen candidate's native target package before Buzz
validation. Confirm logical PostgreSQL restore, wrapper state, Redis continuity,
media, identities, stable secrets, and the original canonical address are
preserved. Confirm the excluded Git cache is rebuilt from MinIO, compare the
full restored inventory, and confirm the source service restarts after backup.

Sanitize restore logs before retention because the accepted SDK has a sensitive
error-diagnostic residual.

### HLT-01

Using the restored disposable instance, induce a reversible MinIO outage. Confirm
the user-facing health check fails, then restore MinIO, wait for recovery, and
compare media and Git-object inventories. Do not mark this gate passed if the
service remains healthy while authoritative object storage is unavailable.

### HLT-02

Induce a reversible PostgreSQL outage. Confirm Buzz cannot report healthy or
perform authoritative writes, restore PostgreSQL, wait for recovery, and compare
the event, membership, channel, and repository metadata inventories.

### HLT-03

Induce a reversible Redis outage. Confirm the expected health or functional
failure, restore Redis, and exercise publish, presence/coordination, rate-limit,
and authenticated request paths. Verify authoritative PostgreSQL and MinIO data
remain intact.

### REC-01

Remove the configured canonical address through the supported StartOS interface
operation. Confirm startup blocks, **Verify Canonical URL** appears, and no other
address is substituted. Restore the exact address, complete verification, wait
for health, and compare the state inventory.

### REC-02

On a backup-protected disposable instance, corrupt only the wrapper state using a
reviewed and recorded test procedure. Confirm startup blocks, **Verify Stable
State** appears, and backup fails closed. Confirm retained diagnostics contain no
secret. Restore the verified backup and compare state after recovery.

### UPG-01

Use only synthetic data on a network-isolated source device installed from the
exact published revision `:2` identity:

- tag `v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2`
- version `0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2`
- package commit `0103ba850c08ae84cca5c623ea76c855d7a7f1a4`
- upstream commit `dd222a509b156ba52ed3219e895d7bf1cf322c92`
- signer `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c`
- x86_64 archive SHA-256
  `8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2`
- aarch64 archive SHA-256
  `72e4e73e413df327af11eba48c4808b1e011729c3a1f6113d25a6c63138c2638`

Record the architecture-matched values in `upgradeSource`; the validator rejects
any other identity or artifact and rejects `upgradeSource` on other gates.
Complete
[`PRE_UPGRADE_AUDIT.md`](../operations/PRE_UPGRADE_AUDIT.md), obtain operator
approval, and verify a rollback backup before updating to the candidate. Confirm
the new version, stable state, client data, canonical URL, and identities are
preserved. Re-run `AUTH-02` assertions and confirm the updater does not invent,
promote, or silently repair an arbitrary owner.

### RES-01

Run [`RESOURCE_PROFILE.production-v1.json`](RESOURCE_PROFILE.production-v1.json)
exactly as specified on physical x86_64 and physical aarch64 devices. Capture
five-second samples for every phase, complete five cold starts, full and
differential backups, clean-target restore, representative load, and a continuous
24-hour soak. Retain raw sanitized measurements and the derived report described
in [`RESOURCE_SIZING.md`](../operations/RESOURCE_SIZING.md). Do not infer hardware
minimums from a single device or an incomplete run.

### LIF-01

Only after every dependency has passed, record the final state inventory and
perform a hard uninstall. Confirm all Buzz package volumes and service data are
removed. Sideload the same archive again, confirm a new service identity and
empty data set, and confirm initial setup is required. This gate is destructive
and no prior instance is expected to remain.

## Promotion Decision

Production promotion requires all 46 matrix cells to link valid passing records
for the same candidate, with independent review and no open high or critical
issues. That includes same-architecture backup and restore, both directions of
cross-architecture restore, and the complete physical x86_64 and aarch64
24-hour resource soak. Compare candidate identity across every record, run
`npm run verify:device-promotion`, and verify the tag and release-asset hashes
one last time. The strict command rejects `UNFROZEN` candidates and every
`NOT RUN`, `FAIL`, `BLOCKED`, unlinked, stale, mismatched, or unreviewed cell.

The repository does not yet have a protected evidence workflow that can bind
authenticated operator and reviewer identities, immutable run IDs/URLs, and
retained attachment IDs to each record. A self-asserted JSON flag cannot provide
that authentication. `authenticatedOperatorReviewerBinding` therefore remains
`PENDING`, and promotion is disabled until authenticated binding is implemented
and machine-verifiable. Do not manually change this field to claim enforcement;
the candidate loader rejects that shortcut.
