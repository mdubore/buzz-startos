# StartOS 0.4.0 Production Device Test Runbook

Use this runbook to decide whether one immutable Buzz package candidate is ready
for production sideloading. Run every gate on native x86_64 and native aarch64
hardware. The target is the official stable StartOS `0.4.0` release with its
exact build identity recorded. Manifest minimum `0.4.0-beta.10` is only the
compatibility floor; a beta installation cannot satisfy this runbook.

This document defines the procedure. It does not report that any procedure has
run. [`DEVICE_CANDIDATE.json`](DEVICE_CANDIDATE.json) is the machine-readable
candidate identity and [`DEVICE_TEST_MATRIX.md`](DEVICE_TEST_MATRIX.md) is the
authoritative execution status. The candidate remains `UNFROZEN` until final
native artifacts and official StartOS image identities are recorded during the
release task.

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

Before the first gate, record one candidate tag, package version, package commit,
upstream commit, signer fingerprint, SDK version, native archive names, byte
sizes, and SHA-256 hashes in `DEVICE_CANDIDATE.json`, then change its state to
`FROZEN`. Both architectures must use those exact values. Do not invent an
identity to exercise the release workflow; automated tests use a separate
injected frozen fixture.

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
3. Store sanitized attachments beside the record. Hash every attachment and
   reference it by a unique evidence ID. Record commands as program and argument
   arrays after redaction.
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
identity. Attempt a channel-role change as a non-admin and attempt to demote the
owner. Both must be rejected without altering the owner set. Confirm every
channel retains at least one active owner and ordinary authorized role management
still succeeds. This gate specifically covers the authorization defect fixed
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

Create and verify a StartOS backup after recording the state inventory. Restore it
onto a clean target host of the same architecture with the original canonical
address available. Confirm logical PostgreSQL restore, wrapper state, Redis
continuity, media, identities, and stable secrets are preserved. Confirm the
excluded Git cache is rebuilt from MinIO and compare the full restored inventory.
Also confirm the source service restarts after backup.

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
published revision `:2`. Complete
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
for the same candidate, with independent approval and no open high or critical
issues. Compare candidate identity across every record, run
`npm run verify:device-promotion`, and verify the tag and release-asset hashes
one last time. The strict command rejects `UNFROZEN` candidates and every
`NOT RUN`, `FAIL`, `BLOCKED`, unlinked, stale, mismatched, or unreviewed cell.

The release process must also enforce authenticated operator/reviewer binding
outside the self-asserted JSON record. Set
`promotionControls.authenticatedOperatorReviewerBinding` to `ENFORCED` only
after that release control is active and auditable. It remains `PENDING` during
pre-release documentation work, and strict promotion fails closed while it is
pending.
