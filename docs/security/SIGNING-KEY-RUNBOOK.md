# Signing-Key Runbook

## Scope And Invariants

The Buzz StartOS release signer is an Ed25519 key used to identify reviewed
`.s9pk` artifacts. Only the public key and its raw-key fingerprint belong in
Git:

- public key: `assets/signing-pubkey.pem`
- raw-key fingerprint: `assets/signing-pubkey.sha256`
- current fingerprint:
  `sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c`

Never commit, print, transmit in an issue, or place private-key material in
workflow arguments or artifacts. Do not document private-key or backup
locations in this repository. Production signing requires a protected release
environment and an independent reviewer. The outstanding repository controls
are tracked in
[`REPOSITORY-CONTROLS.md`](REPOSITORY-CONTROLS.md).

## Verify The Public Identity

Compute the SHA-256 fingerprint over the final 32-byte Ed25519 public key, not
over the PEM text:

```bash
ACTUAL="$(
  openssl pkey -pubin -in assets/signing-pubkey.pem -outform DER |
    tail -c 32 |
    sha256sum |
    awk '{ print "sha256:" $1 }'
)"
EXPECTED="$(tr -d '\n' < assets/signing-pubkey.sha256)"
test "$ACTUAL" = "$EXPECTED"
printf '%s\n' "$ACTUAL"
```

Before accepting an artifact, verify its checksum, the committed public key,
and the package signer:

```bash
sha256sum --check SHA256SUMS
scripts/verify-s9pk-signer.sh \
  buzz_x86_64.s9pk \
  buzz_aarch64.s9pk
```

Compare the displayed fingerprint with a separately obtained trusted copy.
Checksums alone do not establish signer identity.

## Offline Backup Standard

The signing key requires two encrypted offline backups under separate trusted
custodians. Backup media stays disconnected except during creation, rotation,
or a controlled recovery drill. Unlock material must be kept separately from
the encrypted backup and must not be stored in this repository or GitHub.

Maintain a non-secret custody record outside the repository containing:

- the public fingerprint and key generation date;
- custodian roles and the date each backup was sealed;
- the encryption and recovery procedure version;
- the last successful isolated recovery drill; and
- destruction acknowledgments for superseded backups.

Run an isolated recovery drill at least every six months and after any custody
change. The drill derives the public key and verifies the expected fingerprint,
then destroys all temporary material. It must not sign or publish a release.

## Release Signing Procedure

Do not perform a production release while a blocker in
`REPOSITORY-CONTROLS.md` remains open.

1. Confirm the reviewed commit, version tag, release notes, image digests, and
   package policy gates.
2. Create the durable draft reservation for the pre-existing protected tag.
3. Obtain independent approval through the protected `release` environment.
4. Install the unconditional cleanup trap before creating a signer file.
   Disable shell tracing before reading or testing `DEV_KEY`.
5. Write one protected signer file, immediately `unset DEV_KEY`, and prove it
   is absent from the environment inherited by every later subprocess. Derive
   any additional required signer copy from the protected file.
6. Run build, inspection, and signer-verification subprocesses with an explicit
   `env -u DEV_KEY`.
7. Delete every working copy of the private key before uploading any artifact
   or transferring it to another job.
8. Independently verify package checksums, signer, manifest, commitment, SBOM,
   vulnerability results, and provenance.
9. Upload to and publish only the draft reserved by this workflow attempt.
   Never move the tag or overwrite an existing release or asset.

The release workflow must make cleanup unconditional and fail closed if signer
verification, environment sanitization, or deletion fails.

The signing step must preserve this order. `SIGNER_HOME_FILE` and
`SIGNER_WORKSPACE_FILE` below stand for workflow-defined ephemeral files; their
locations are intentionally not recorded here.

```bash
set -euo pipefail
set +x

: "${SIGNER_HOME_FILE:?workflow must define SIGNER_HOME_FILE}"
: "${SIGNER_WORKSPACE_FILE:?workflow must define SIGNER_WORKSPACE_FILE}"
cleanup_signer() {
  set +x
  unset DEV_KEY
  rm -f -- "$SIGNER_HOME_FILE" "$SIGNER_WORKSPACE_FILE"
}
trap cleanup_signer EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

test -n "${DEV_KEY:-}"
test -d "${SIGNER_HOME_FILE%/*}"
test -d "${SIGNER_WORKSPACE_FILE%/*}"
umask 077
printf '%s' "$DEV_KEY" > "$SIGNER_HOME_FILE"
unset DEV_KEY

test -z "${DEV_KEY+x}"
if printenv DEV_KEY >/dev/null 2>&1; then
  printf 'DEV_KEY remained in the child-process environment\n' >&2
  exit 1
fi
cp -- "$SIGNER_HOME_FILE" "$SIGNER_WORKSPACE_FILE"
chmod 0600 "$SIGNER_HOME_FILE" "$SIGNER_WORKSPACE_FILE"
env -u DEV_KEY bash -c '
  set -euo pipefail
  if grep -zq "^DEV_KEY=" "/proc/$$/environ"; then
    printf "DEV_KEY reached the sanitized subprocess environment\n" >&2
    exit 1
  fi
'

env -u DEV_KEY make "$TARGET"
env -u DEV_KEY start-cli s9pk inspect "$ARCHIVE" manifest
env -u DEV_KEY start-cli s9pk inspect "$ARCHIVE" commitment
env -u DEV_KEY ./scripts/verify-s9pk-signer.sh "$ARCHIVE"

cleanup_signer
trap - EXIT HUP INT TERM
```

### Step-Level Environment Inheritance Risk

A GitHub Actions step-level `env` entry is placed in the bootstrap shell's
initial environment before the script starts. Without an immediate `unset`,
every build and inspection subprocess inherits the signer secret. The checks
above prove that newly launched subprocesses do not receive `DEV_KEY`.

On Linux, unsetting a variable does not guarantee that the bootstrap shell's
initial bytes disappear from `/proc/<pid>/environ` before that shell exits.
Therefore the signing step must run alone on a trusted, isolated runner; it
must not launch background work or untrusted same-UID processes. The explicit
`env -u DEV_KEY` boundary and sanitized subprocess `/proc/$$/environ` check
reduce inheritance risk but do not turn a shared or persistent runner into an
acceptable signing environment.

## Create-Once Release State Machine

The release entry point is a tag-push workflow. It accepts and validates the
pre-existing protected tag created by the release path, then requires that tag
to resolve to the reviewed commit. The tag ruleset, not the mere existence of a
Git reference, supplies the update and deletion protection.

Before the protected environment is entered, the workflow creates a durable
draft reservation with no assets. Creation fails if a release already exists.
This reservation is the attempt marker: once it exists, the version and tag are
consumed even when no key was provisioned and no signed bytes were produced.

| State                                                    | Rerun rule                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Before reservation, with no GitHub release or asset      | A same tag rerun is allowed after preflight revalidates the unchanged protected tag and reviewed commit.                  |
| After reservation, before or after key provisioning      | Do not rerun the same tag. Preserve the draft as attempt evidence and use a new version and tag.                           |
| After signed bytes exist, even before asset upload        | Destroy unpublished working copies, preserve sanitized incident evidence, and use a new version and tag.                  |
| Draft, published release, or any release asset exists     | Refuse a new attempt. Never append, edit, replace, or delete assets to recycle the identity.                               |

Never move or delete the triggering tag or draft reservation to recycle a
release identity.

## Planned Rotation

Review the key annually and rotate it after a custodian change, loss of custody
assurance, algorithm or tooling concern, or policy change.

1. Freeze releases and open a private rotation record naming the responsible
   roles and reason.
2. Generate the replacement with the reviewed Start CLI in an isolated
   environment under two-person control.
3. Create and test two encrypted offline backups before the key is authorized
   for release use.
4. Derive the new public key and raw fingerprint twice using independent
   operators.
5. Submit a reviewed change updating the committed public key, fingerprint,
   verifier evidence, and release notes. Record both old and new fingerprints.
6. Replace the protected environment secret through GitHub's secret-management
   interface without exposing it in command history or workflow logs.
7. Build a new version, verify both architectures against the new public key,
   and publish a transition notice.
8. Remove superseded online copies and destroy old offline backups according to
   the custody record. Retain the old public key and fingerprint as historical
   verification evidence.

Do not rotate by replacing assets on an existing release.

## Suspected Compromise And Revocation

Treat unexplained signatures, unauthorized environment access, lost backup
custody, or accidental key disclosure as a signer incident.

1. Stop pending release workflows and remove the protected signing secret.
2. Revoke affected GitHub access and preserve sanitized audit evidence.
3. Determine the earliest possible compromise time and inventory every package
   signed after it.
4. Verify published artifact hashes against retained build evidence. Do not
   download or inspect private material during triage.
5. Publish a security advisory and revocation notice identifying the public
   fingerprint, affected versions, artifact hashes, and user action.
6. Withdraw affected packages from registries and installation guidance.
7. Rotate the signer through the planned-rotation procedure and publish a new
   version only after independent review and device validation.

A signature does not become cryptographically invalid when a key is revoked.
Users need an explicit advisory, affected checksum list, and trusted
replacement fingerprint.

## Release Withdrawal

Withdraw a release when its signer is untrusted, its artifacts do not match
reviewed evidence, or a critical vulnerability makes continued distribution
unsafe.

- Stop promotion and registry publication immediately.
- Preserve the original tag, hashes, attestations, and incident evidence.
- Do not replace or silently delete release assets.
- Publish a linked advisory naming affected versions and mitigation.
- Remove the package from active registry channels where supported.
- Publish a newly versioned replacement after the normal release gates pass.

Immutable releases cannot be repaired in place. Publish a separate revocation
record and replacement release, and treat the preserved immutable artifacts as
evidence rather than supported downloads.

## Closeout

The incident owner records the timeline, affected artifacts, access changes,
backup disposition, new public fingerprint, user notification, and follow-up
actions. All retained records must exclude private keys, credentials, raw
database data, and unsanitized logs.
