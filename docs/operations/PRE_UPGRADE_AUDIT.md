# Published `:2` Pre-Upgrade Audit

Complete this audit before running `UPG-01` from the published Buzz revision
`:2`. That package predates upstream authorization fix `00ecf2c` and can permit
unauthorized channel-role changes, including owner demotion. The audit is a
fail-closed security and recovery gate; it is not an automatic migration.

Use synthetic data on a network-isolated test instance. Do not expose a `:2`
source instance to untrusted clients while preparing production acceptance.

## Verify The Source

The only accepted `:2` source artifacts for this upgrade gate have this immutable
published identity:

| Field                   | Required value                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| Release tag             | `v0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5_2`                     |
| Package version         | `0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2`                      |
| Package commit          | `0103ba850c08ae84cca5c623ea76c855d7a7f1a4`                                |
| Upstream Buzz commit    | `dd222a509b156ba52ed3219e895d7bf1cf322c92`                                |
| Signer fingerprint      | `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c` |
| x86_64 archive SHA-256  | `8d149d724809f74354c7d905ec5c0dfd9e26db08cddb0f1b0ea5eb75a02ce0a2`        |
| aarch64 archive SHA-256 | `72e4e73e413df327af11eba48c4808b1e011729c3a1f6113d25a6c63138c2638`        |

1. Match the installed version and architecture to the table.
2. Recompute the source archive SHA-256 and verify its S9PK signature against the
   recorded signer fingerprint.
3. Record the StartOS version/build, source device, installed package identity,
   archive identity, and audit time in the `UPG-01` evidence.
4. Stop if any value differs. A locally rebuilt or republished `:2` archive is not
   this upgrade source.

## Create A Recovery Point

1. Record the original canonical URL and verify that the same address can be
   restored on the source device.
2. Create a StartOS backup while the source is in a known state.
3. Produce a deterministic sanitized inventory of owner/member public keys,
   channel IDs and role counts, signed event IDs, media hashes, Git refs/object
   IDs, and non-secret stable-state fingerprints.
4. Prove the backup is a verified backup by restoring it to a clean,
   architecture-matched target, making the original canonical address available,
   and comparing the restored inventory.
5. Preserve the source archive, checksum, signer key, verified backup, inventory,
   and documented restore steps as the rollback kit.

Do not continue if the restore rehearsal fails, the backup cannot be identified
unambiguously, or recovery depends on an unavailable address or credential.

## Audit Channel Authority

Use a supported authenticated client or a read-only, sanitized data export.
Do not mutate roles during discovery.

1. Enumerate every channel, including archived or otherwise non-default channels.
2. Resolve the current active membership and role state from signed events.
3. Confirm at least one active owner exists in every channel.
4. Compare channel owners with the expected synthetic governance inventory.
5. Review relevant audit events for suspicious role history: unexpected owner
   demotions, promotions, removals, reactivations, non-admin role changes,
   conflicting same-time changes, or signatures from unauthorized identities.
6. Record event IDs, public keys, channel IDs, and conclusions. Redact message
   bodies and never retain private keys, authorization headers, service
   credentials, or raw database dumps.

Stop and open a high-severity issue if a channel lacks an active owner, expected
governance cannot be reconstructed, a suspicious change is unexplained, or event
integrity cannot be verified.

The updater must not automatically promote or repair an arbitrary owner. Do not
choose the first member, administrator, event author, database row, or package
operator as a replacement owner. Any governance repair requires a separate,
explicitly reviewed recovery procedure with documented human authorization; it
is outside this upgrade gate.

## Operator Confirmation

The operator records an explicit go/no-go decision before the update:

| Check                               | Required result            |
| ----------------------------------- | -------------------------- |
| Published source identity           | Exact match                |
| Stable StartOS source build         | Recorded                   |
| Verified backup and clean restore   | Pass                       |
| Original canonical address recovery | Available and rehearsed    |
| Inventory before update             | Complete and hashed        |
| Active owner in every channel       | Confirmed                  |
| Suspicious role history             | None unexplained           |
| Rollback kit                        | Complete and accessible    |
| Candidate `ART-01`                  | Pass for this architecture |
| Independent audit review            | Approved                   |

Any missing, failed, uncertain, or rejected check is `NO-GO`. Link the issue and
record `UPG-01` as blocked or failed; do not update.

## Update And Validate

After a `GO` decision:

1. Sideload the architecture-matched candidate without changing the canonical
   address or source data.
2. Confirm StartOS reports the candidate version and the service reaches health.
3. Recompute the inventory and explain every expected delta. Owner sets,
   identities, stable secrets, signed events, media, Git objects, and canonical
   URL must otherwise remain unchanged.
4. Repeat the channel authority audit and the `AUTH-02` authorization regression
   checks. Unauthorized role changes and owner demotion must now be rejected.
5. Confirm the update did not add, select, promote, or repair an owner.
6. Exercise authenticated WebSocket, media, and Git reads before approving the
   result.

If validation fails, stop the instance, retain sanitized evidence, open an issue,
and execute the rehearsed rollback. Restore only the verified backup to the
original package/address context, then compare its inventory. A successful
rollback does not convert the failed update into a pass.

## Required Evidence

Attach the sanitized source-verification output, backup and restore records,
before/after inventory hashes, channel authority audit, operator confirmation,
candidate version, regression results, and rollback outcome if used. A different
person reviews the evidence and records approval or rejection in the `UPG-01`
record.
