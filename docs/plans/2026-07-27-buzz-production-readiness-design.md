# Buzz Production Readiness Design

Date: 2026-07-27
Status: Approved

## Summary

Turn the existing Buzz StartOS prerelease into a reviewable release candidate
without promoting or mutating the published `:2` package. The candidate will
track an exact Buzz commit that contains the upstream channel-authorization
fix, preserve `mdubore/buzz9` as a fast-forward-only mirror, and make every
automatable security, build, and release check a CI gate.

Production publication remains separate from candidate creation. CI will build
and sign one pair of architecture-specific artifacts, attach their checksums,
SBOMs, provenance, and verification record to a draft release, and never
replace those assets. Operators will run the real-device matrix against those
exact SHA-256 values. A protected promotion workflow may publish only the
already-tested draft; it cannot rebuild or upload replacement artifacts.

## Release Invariants

- Never promote, relabel, or overwrite the published `:2` prerelease.
- Freeze one reviewed Buzz source commit and immutable native OCI digests.
- Include the upstream kind `9000` authorization fix and run its ignored
  PostgreSQL/Redis-backed regressions explicitly.
- Treat databases previously exposed through `:2` as requiring an operator
  membership audit; do not infer or auto-repair owners.
- Build signed artifacts only from a version-matching tag on a reviewed commit.
- Remove the protected signing key before any artifact upload step.
- Refuse an existing release or asset instead of using `--clobber`.
- Generate the draft once, test those exact bytes, then publish without a
  rebuild.
- Keep stable publication blocked until both native architectures pass the
  complete StartOS 0.4.0 device and recovery matrix.

## Upstream And Package Flow

`mdubore/buzz9/main` remains a byte-identical fast-forward mirror of
`block/buzz/main`. The StartOS package does not follow that branch at runtime;
it records a separately reviewed commit in `startos/image-pins.ts`. This keeps
mirror synchronization simple while preventing a moving upstream branch from
changing release inputs.

For each candidate:

1. Fetch and fast-forward the source mirror.
2. Audit the delta from the previously packaged commit.
3. Select one commit containing all required security fixes.
4. Verify its published multi-platform image and runtime contract.
5. Record the index, amd64, and arm64 digests without rewriting older evidence.
6. reset the downstream ExVer revision to `:0`.

## Security Gates

The package suite will assert the frozen source and image contract. A dedicated
upstream security workflow will check out the exact frozen commit, start real
PostgreSQL and Redis services, and explicitly execute the ignored Buzz database
and relay authorization regressions. This is in addition to the downstream
unit, type, lint, image metadata, and package-build checks.

Every native runtime image will receive vulnerability and SBOM analysis.
Critical findings must be fixed. High findings must either be fixed or recorded
in a time-bounded, owner-assigned waiver that states runtime reachability and
compensating controls. JavaScript dependency auditing follows the same rule; an
automated fix is not accepted without package verification.

Previously installed `:2` systems require a verified backup and a membership
audit before upgrade. The runbook will require at least one verified active
owner per channel and a review of suspicious role changes. It will explicitly
forbid promoting an arbitrary member as an automatic repair.

## CI And Provenance

All artifact-producing jobs use reviewed, immutable tool versions, including
Buildx. GitHub Actions are pinned to full commits and checked by policy tests.
The candidate workflow:

1. verifies the tag, source commit, release notes, and clean policy gates;
2. builds unsigned packages in both architectures as a reproducibility signal;
3. enters the protected release environment for signing;
4. provisions, builds, verifies, and deletes the signing key in one step;
5. independently checks manifest, architecture, signer, commitment, and
   checksum data;
6. emits package and OCI SBOMs plus vulnerability results;
7. creates GitHub build-provenance attestations;
8. creates a new draft prerelease and fails if the tag or release already
   exists.

The promotion workflow accepts a candidate tag and device-evidence record. It
downloads and re-verifies existing release assets, checks evidence SHA-256
values against `SHA256SUMS`, and only changes draft/prerelease state. It has no
artifact upload or build permission.

## Repository Controls

Repository settings should require pull requests, passing checks, resolved
conversations, protected tags, restricted Actions, and independent release
approval. Controls that cannot be safely enabled with the current single
reviewer will be documented as explicit blockers rather than simulated.

The repository will include:

- `SECURITY.md` with disclosure and response expectations;
- Dependabot configuration for npm and GitHub Actions;
- CodeQL for repository-owned JavaScript/TypeScript;
- actionlint and zizmor workflow checks;
- scheduled upstream, dependency, image, and vulnerability drift checks;
- a release signing-key backup, rotation, revocation, and incident runbook.

## Device Acceptance

The candidate must be exercised on native x86_64 and aarch64 StartOS 0.4.0.
The existing 26 cells remain mandatory and will be expanded with:

- `:2` to candidate upgrade using synthetic populated data;
- StartOS reboot, container rebuild, hard uninstall, and reinstall;
- canonical-address loss and malformed-state recovery;
- PostgreSQL, Redis, and MinIO failure/recovery;
- authorization attacks covered by the upstream security fix;
- backup/restore across clean hosts and, where supported, architectures;
- 24-hour soak and representative resource measurements.

Evidence records the exact package SHA-256, signer fingerprint, StartOS build,
device architecture, client versions, sanitized logs, state comparisons, and
resource traces. Private keys, credentials, authentication headers, dumps, and
raw sensitive restore diagnostics are never retained.

## Exit Criteria

Stable publication is allowed only when:

- the frozen Buzz commit contains the audited authorization fix;
- all automated package, upstream, dependency, image, SBOM, and provenance
  gates pass;
- no unwaived high or critical runtime vulnerability remains;
- both native architectures pass the full device, upgrade, recovery, restore,
  uninstall, and soak matrix;
- measured minimum hardware requirements are documented with headroom;
- an independent reviewer approves the source and release environment;
- the signed, immutable published bytes are exactly the device-tested bytes.

Until every exit criterion is met, the artifact remains a draft release
candidate and the documentation must state the outstanding gates.
