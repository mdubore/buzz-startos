# Current Package Evidence

This stable index points to the exact evidence for the package candidate in the
current source tree. Update the pointers here when the upstream snapshot or
security checkpoint changes; contributor-facing documentation should link this
index instead of embedding volatile commit identities.

## Authoritative Inputs

- [Package identity and release notes](../startos/versions/current.ts)
- [Upstream source and immutable image pins](../startos/image-pins.ts)
- [Reviewed upstream update procedure](../UPDATING.md)

## Current Candidate Records

- [Audited runtime contract](upstream/651f637-runtime-contract.md)
- [Dependency and native-image security checkpoint](security/651f637-runtime-scan.md)

The security checkpoint is fail-closed and keeps this candidate test-only. This
index does not replace or summarize those records; follow the linked documents
for exact identities, scanner results, findings, and remaining gates.
