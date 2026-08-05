# Community Registry Security Remediation Design

## Goal

Prepare the Buzz StartOS wrapper for device testing and initial submission to
the Start9 Community Registry by removing the current dependency and runtime
image blockers, producing final packages for both supported architectures, and
freezing the exact candidate that will be tested.

## Submission Boundary

The Start9 submission gate is the package itself: a public repository, correct
tagging, passing type/tests/pack checks, current documentation, and successful
end-to-end StartOS testing. Repository-owner governance settings such as GitHub
rulesets, immutable GitHub Releases, multiple collaborators, or independent
approval of this repository's private release environment are optional
supply-chain hardening. They are not Community Registry admission requirements
and must not block this candidate.

The candidate remains blocked by technical evidence that affects shipped
bytes:

- `fast-uri@3.1.4` is within the vulnerable range for
  `GHSA-7p8r-x3mc-p8w7`;
- the official Buzz `651f637`, MinIO, and MC images contain Critical, High, or
  Unknown findings under the package's fail-closed runtime policy; and
- final x86_64 and aarch64 packages have not been built from a frozen remediated
  commit or tested on StartOS.

## Dependency Remediation

Keep AJV at its current compatible release and update `fast-uri` to `3.1.5`,
the first patched 3.x release. Resolve it through the lockfile rather than a
waiver or a major-version override. Re-run clean installation, npm signature
verification, the vulnerability policy, type checking, formatting, build, and
the full package test suite.

## Runtime Image Strategy

Publish three public, immutable, multi-architecture downstream images under
`ghcr.io/mdubore/buzz-startos`:

- `buzz`, built from Block's exact verified Buzz commit
  `651f6372754e60e3f936b3397040eb0f1e44c9f3`;
- `minio`, built from the last verified upstream MinIO release source selected
  by the implementation audit; and
- `mc`, built from the last verified upstream MC release source selected by the
  implementation audit.

The rebuilds are security maintenance, not product forks. Preserve command-line
interfaces, environment variables, ports, filesystem ownership, health routes,
data layout, MinIO S3 behavior, and the dedicated Buzz pairing-relay topology.
Use current patched build toolchains and minimal runtime filesystems. Apply only
reviewed dependency updates needed to clear the vulnerability policy and build
the verified source. Do not change Buzz application source.

The image workflow must:

1. fetch exact full source commits and reject identity drift;
2. build amd64 and arm64 natively;
3. label each image with its source and downstream revision;
4. publish architecture manifests and one immutable OCI index;
5. emit GitHub build-provenance attestations; and
6. expose immutable digests for the StartOS package pin update.

No mutable image tag is a package identity. `startos/image-pins.ts` continues to
record the OCI index and both native manifest digests, and verification fails if
any of them drift.

## Compatibility Audit

Treat every rebuilt image as a new runtime boundary. Verify both native image
configurations and filesystems plus the behavior the wrapper depends on:

- Buzz user, entrypoint, relay/admin/pairing binaries, ports, environment,
  migration CLI, health endpoints, Git support, static web assets, storage
  paths, and Desktop/ACP pairing metadata;
- MinIO server entrypoint, root credential variables, S3 port, `/data`
  persistence, readiness endpoint, bucket creation, object put/get/delete, and
  restart persistence; and
- MC entrypoint and the alias, bucket, and anonymous-policy commands used by
  the StartOS initialization path.

Run the package's ten-native-manifest scan against the new three indexes plus
the unchanged PostgreSQL and Redis indexes. Acceptance requires zero Critical,
zero Unknown, and zero unwaived High findings. Any waiver remains subject to the
existing narrow, expiring, evidence-backed policy; Critical and Unknown results
are never waived.

## Package Identity And Documentation

Because Buzz source remains `651f637` while downstream runtime bytes change,
increment the package's downstream revision rather than inventing a new
upstream version. Reconcile all identity consumers together:

- `startos/image-pins.ts`;
- `startos/versions/current.ts` and its release notes;
- runtime-contract and vulnerability evidence;
- `docs/EVIDENCE.md` and the readiness report;
- `docs/testing/DEVICE_CANDIDATE.json`; and
- README/instructions wherever the runtime provenance or limitations are
  user-visible.

Repository-governance checks may remain documented as optional maintainer
hardening, but they must be removed from beta/production package promotion
decisions and from the mandatory verification path.

## Candidate Freeze

After all source, dependency, image, and package checks pass on a clean commit:

1. build signed x86_64 and aarch64 `.s9pk` files from that same commit;
2. inspect each manifest and commitment;
3. verify architecture, package version, Git hash, and signer fingerprint;
4. generate and verify SHA-256 checksums and release metadata;
5. copy the final artifacts to the accessible workspace root; and
6. freeze `DEVICE_CANDIDATE.json` to those exact immutable identities.

The frozen candidate must not be rebuilt or altered during device testing. A
failed package requires a new revision and a new candidate freeze.

## Step Boundary

Automation and artifact preparation stop after the candidate is frozen. The
user performs the real StartOS device matrix as step 5. Only after the evidence
for those exact artifact hashes is returned does step 6 perform the independent
final review and decide whether the repository is ready to email to
`submissions@start9.com`.
