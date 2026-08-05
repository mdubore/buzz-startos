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

- [Audited rebuilt-runtime contract](upstream/651f637-startos-r2-runtime-contract.md)
- [Passing dependency and native-image security checkpoint](security/651f637-startos-r2-runtime-scan.md)
- [Underlying upstream application contract](upstream/651f637-runtime-contract.md)

The fail-closed dependency and OCI security gates are clear for the rebuilt r2
runtime. The candidate still requires a frozen signed package and real StartOS
device evidence. This index does not replace or summarize those records; follow
the linked documents for exact identities, scanner results, and remaining
gates. The historical failing checkpoint remains at
[`651f637-runtime-scan.md`](security/651f637-runtime-scan.md).
