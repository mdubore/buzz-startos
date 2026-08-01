# Buzz `63496cc:2` Pairing Upgrade Design

## Context

The StartOS host currently runs a test package based on upstream Buzz snapshot
`63496cc` at downstream revision `:1`. A later local pairing package was built
from the older `dd222a5` snapshot at downstream revision `:3`.

StartOS ExVer ordering compares the upstream snapshot before the downstream
revision. Therefore `dd222a5:3` sorts below `63496cc:1`. The host correctly
rejects that package as an unsupported downgrade and reports an unsatisfiable
uninit target range (`!`). Because the update never activates, the live relay's
NIP-11 document does not advertise `pairing_relay_url`, Buzz Desktop falls back
to the main relay's `/pair` path, and that request returns HTTP 404.

## Goals

- Produce an upgrade-compatible x86_64 package above installed `63496cc:1`.
- Preserve the existing StartOS data without a destructive reinstall.
- Retain the authorization fix included in upstream `63496cc`.
- Retain the overlay-compatible Git-cache startup work already present in the
  production-readiness worktree.
- Add the dedicated StartOS pairing interface and pairing daemon from `main`.
- Make the main relay advertise the dedicated pairing URL through NIP-11.
- Keep the current mobile scope LAN-only.

## Non-goals

- Do not publish a GitHub release, registry release, or git tag.
- Do not claim remote mobile support.
- Do not modify the Android or desktop applications.
- Do not force a downgrade or relabel the `dd222a5` image as a later snapshot.
- Do not modify or discard the existing dirty production-readiness worktree.

## Integration Strategy

Create an isolated integration branch from the committed
`release/production-readiness` head. Reproduce the uncommitted Git-cache changes
from that worktree on the integration branch without changing their source
worktree. Then integrate the pairing commits from `main`, resolving overlapping
runtime, tests, README, instructions, and version metadata deliberately.

The resulting package uses the immutable official `sha-63496cc` image pins and
version:

```text
0.2.0-main.20260730.h.0.m.35.s.15.sha.63496.cc:2
```

The `up` migration remains a no-op because the wrapper state and application
data formats are compatible. `VersionGraph` must generate a
`canMigrateFrom` range that includes `63496cc:1`. Downgrades remain impossible.

## Runtime Design

The package exports two StartOS hosts:

- the main Buzz HTTP/WebSocket interface backed by `buzz-relay` on port 3000;
- a dedicated pairing WebSocket interface backed by `buzz-pair-relay` on port 5000.

The user selects the exported pairing address through **Configure Pairing
Relay**. The wrapper stores the normalized root WebSocket URL and supplies it to
the main relay as `BUZZ_PAIRING_RELAY_URL`. The relay then exposes that value as
`pairing_relay_url` in its NIP-11 document. Buzz Desktop uses the advertised URL
directly instead of deriving the unsupported `/pair` route on the main relay.

The pairing relay is temporary and stateless. Normal desktop and mobile traffic
continues to use the main relay. LAN TLS and Android trust limitations remain
documented.

## Existing Work Preservation

The production-readiness worktree contains uncommitted Git-cache ownership
changes. Those files are user-owned work and must not be reset, cleaned, or
modified in place. The integration will copy their patch into the isolated
branch and verify it alongside pairing. The source worktree remains unchanged.

## Validation

Before producing the sideload artifact:

1. Add a regression test proving `63496cc:1` satisfies the new package's
   migration-from range and that the new version sorts above it.
2. Run TypeScript checks, SDK lint, formatting checks, and the complete package
   test suite.
3. Verify all immutable image pins and required executables for x86_64.
4. Build a fresh generated JavaScript bundle and confirm it reports
   `63496cc:2`.
5. Build the x86_64 `.s9pk` using the reachable StartOS host identity.
6. Inspect the archive for the expected version, commit, architecture, migration
   ranges, and image set.
7. Verify the package signer and calculate SHA-256.

After sideloading:

1. Confirm StartOS accepts the update from `63496cc:1`.
2. Complete **Configure Pairing Relay** and start Buzz.
3. Confirm the live NIP-11 response contains the selected
   `pairing_relay_url`.
4. Confirm a WebSocket upgrade to the dedicated pairing URL succeeds.
5. Confirm Buzz Desktop produces the pairing QR code without requesting the
   main relay's `/pair` path.

Successful packaging and static checks do not prove the live workflow. The
package remains a test-only beta until the device checks above pass.
