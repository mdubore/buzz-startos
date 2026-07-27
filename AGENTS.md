# Buzz StartOS Package Agent Guide

This repository builds architecture-specific `.s9pk` packages for StartOS. It
does not own the Buzz application source.

## Workspace And Repository Boundaries

Develop in a StartOS packaging workspace created by
`start-cli s9pk init-workspace`. The conventional sibling layout is:

```text
<workspace>/
├── .startos/              workspace configuration and private signing key
├── start-technologies/    packaging guide, SDK, and StartOS source
├── buzz9/                 clean fast-forward-only Buzz source mirror
└── buzz-startos/          this package repository
```

The workspace root is not a Git repository. Run Git commands in
`buzz-startos/` or, when auditing upstream, in `buzz9/`.

- `block/buzz` is the application source of truth.
- `mdubore/buzz9` mirrors upstream and receives no StartOS files or application
  patches.
- `buzz-startos` owns SDK integration, tests, assets, docs, and workflows.
- Never rewrite published `buzz9` history. Follow
  [`UPDATING.md`](UPDATING.md) and use fast-forward-only synchronization.

## Packaging Guide

Start every package task at the local recipe index:

```text
../start-technologies/projects/start-sdk/docs/src/recipes.md
```

If the workspace guide is unavailable, use
<https://docs.start9.com/packaging/recipes.html>. A recipe and its named
reference implementation outrank a neighboring package found by search.

Relevant package references include:

- `../start-technologies/projects/start-sdk/docs/src/workflow.md`
- `../start-technologies/projects/start-sdk/docs/src/main.md`
- `../start-technologies/projects/start-sdk/docs/src/actions.md`
- `../start-technologies/projects/start-sdk/docs/src/versions.md`
- `../start-technologies/projects/start-sdk/docs/src/writing-readmes.md`
- `../start-technologies/projects/start-sdk/docs/src/writing-instructions.md`

If `start-technologies/` is a real checkout rather than a symlink, fast-forward
it at the beginning of a session:

```bash
git -C ../start-technologies pull --ff-only
```

## Package Sources Of Truth

| Concern | Path |
| --- | --- |
| Frozen Buzz commit and image digests | `startos/image-pins.ts` |
| Package ExVer and five-locale release notes | `startos/versions/current.ts` |
| Frozen upstream runtime evidence | `docs/upstream/dd222a5-runtime-contract.md` |
| Daemons, oneshots, and user health | `startos/main.ts` |
| Environment and secret projection | `startos/runtime/config.ts` |
| Interfaces and canonical address | `startos/interfaces.ts`, `startos/domain/public-url.ts` |
| StartOS actions | `startos/actions/` |
| Backup authority | `startos/backups.ts` |
| Remaining release evidence | `TODO.md`, `docs/testing/DEVICE_TEST_MATRIX.md` |

Keep `README.md` as the technical downstream contract and `instructions.md` as
the concise end-user workflow. Update both whenever behavior visible to an
operator changes.

## Toolchain And Commands

Node commands require the reviewed runtime:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22.23.1
npm ci
```

Run the smallest focused test first, then the full gates:

```bash
npm test
npm run prettier:check
npm run check
node node_modules/@start9labs/start-sdk/lint.mjs
npm run build
npm run verify:images
git diff --check
```

Build and inspect native packages when package inputs or runtime behavior
change:

```bash
make x86
make arm
start-cli s9pk inspect buzz_x86_64.s9pk manifest
start-cli s9pk inspect buzz_x86_64.s9pk commitment
start-cli s9pk inspect buzz_aarch64.s9pk manifest
start-cli s9pk inspect buzz_aarch64.s9pk commitment
scripts/verify-s9pk-signer.sh buzz_x86_64.s9pk buzz_aarch64.s9pk
```

Compilation and packing are not runtime verification. Leave device matrix
items unchecked until they are exercised on real matching hardware.

## Development Rules

- Use test-driven development for behavior changes: write and run the failing
  test before production code.
- Preserve existing SDK and package patterns; read types/source when semantics
  are uncertain.
- Keep commands as argv arrays. Do not introduce shell interpolation for
  secrets or user input.
- Preserve immutable owner, canonical URL, and install-only secret behavior.
- Do not expose PostgreSQL, Redis, MinIO, health, or metrics ports.
- Do not claim automatic Tor/public reachability; gateways are user-enabled
  StartOS capabilities.
- Do not claim a full browser or mobile experience that upstream does not
  provide.
- Never read, print, copy, stage, or commit the workspace private signing key.
  Only the committed public key and raw-key fingerprint are public.
- Treat restore diagnostics as sensitive because the pinned SDK may expose the
  PostgreSQL password in a failed restore command's argv/log output.
- Do not commit `.s9pk`, `SHA256SUMS`, `javascript/`, `node_modules/`, logs,
  credentials, dumps, or workspace `.startos/` state.

## Inspecting A Running Install

Use the subcontainer **name** with `-n`:

```bash
start-cli package attach buzz -n buzz -- <command>
start-cli package attach buzz -n postgres -- <command>
start-cli package attach buzz -n redis -- <command>
start-cli package attach buzz -n minio -- <command>
```

`-s/--subcontainer` selects an internal GUID, not the configured name. A
multi-subcontainer service needs an explicit selector in non-interactive
shells. Sanitize all output before saving or sharing it.
