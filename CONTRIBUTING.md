# Contributing

## Repository Boundaries

This repository owns the StartOS package: SDK code under `startos/`, package
tests, assets, documentation, and build/release automation.

Buzz application changes belong upstream:

- `block/buzz` is the application source of truth.
- `mdubore/buzz9` is a clean, fast-forward-only source mirror.
- Do not add StartOS files or downstream application patches to `buzz9`.
- Do not copy Buzz application source into this package to avoid an upstream
  review.

The frozen application/runtime evidence is under `docs/upstream/`. Follow
[`UPDATING.md`](UPDATING.md) for a new upstream snapshot.

## Development Environment

Use a StartOS packaging workspace with the package, `buzz9`,
`start-technologies`, and workspace `.startos` configuration as siblings. The
reviewed package toolchain uses:

- Node.js `22.23.1`
- `@start9labs/start-sdk` `2.0.9`
- Start CLI `1.1.0`
- Docker Buildx `0.35.0`

Read the local packaging recipe index first when available:

```text
../start-technologies/projects/start-sdk/docs/src/recipes.md
```

The public fallback is <https://docs.start9.com/packaging/recipes.html>.

## Development Workflow

1. Start from a clean or fully understood package worktree.
2. Read the relevant recipe, reference page, existing package code, and frozen
   upstream contract.
3. For behavior changes, write the smallest failing test and run it to confirm
   the intended RED failure.
4. Implement only enough production code to pass, then refactor while green.
5. Run focused tests first and the full verification set before committing.
6. Keep `README.md`, `instructions.md`, release notes, and `TODO.md` aligned
   with user-visible behavior and remaining evidence.

Use short imperative commits with conventional prefixes, for example:

```text
feat: manage private relay members
fix: validate state before backup
docs: explain Buzz for StartOS
```

Do not mix unrelated refactors or generated artifacts into a focused commit.

## Verification

Activate the exact Node runtime, install the lockfile, and run:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22.23.1
npm ci

npm test
npm run prettier:check
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
npm run build
npm run verify:images
git diff --check
```

When package inputs, runtime code, manifests, backups, or release automation
change, also run:

```bash
make x86
make arm

start-cli s9pk inspect buzz_x86_64.s9pk manifest
start-cli s9pk inspect buzz_x86_64.s9pk commitment
start-cli s9pk inspect buzz_aarch64.s9pk manifest
start-cli s9pk inspect buzz_aarch64.s9pk commitment
scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk buzz_aarch64.s9pk
```

A compiler, test, or package build is not a substitute for on-device behavior.
Update [`docs/testing/DEVICE_TEST_MATRIX.md`](docs/testing/DEVICE_TEST_MATRIX.md)
only with real architecture-matched StartOS evidence.

## Secrets And Artifacts

- Never read, print, copy, stage, or commit a private StartOS signing key.
- Commit only `assets/signing-pubkey.pem` and its raw-key fingerprint.
- Never commit workspace `.startos/`, environment secrets, StartOS
  credentials, logs, database dumps, or unredacted restore diagnostics.
- `.s9pk`, `SHA256SUMS`, `javascript/`, and `node_modules/` are generated
  outputs, not source commits.
- Treat PostgreSQL restore diagnostics as sensitive because Start SDK 2.0.9
  may include the database password in a failed restore command's argv/log
  output.

## Pull Requests

Every pull request should state:

- the package behavior or documentation changed;
- upstream old/new SHAs when the source snapshot changes;
- exact focused and full commands run, with pass/fail counts;
- image index/platform digest and tag-drift evidence when pins change;
- x86_64 and aarch64 manifest, commitment, checksum, and signer evidence when
  package inputs change;
- on-device evidence, with every unrun matrix item left explicit;
- security, migration, backup, restore, and compatibility effects;
- the issue or decision the change addresses.

Require review before merge. Do not auto-merge upstream changes or publish
artifacts from an unreviewed branch.
