# StartOS Mobile Pairing Relay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the upstream Buzz pairing relay to the StartOS package, advertise its selected WSS address through NIP-11, and document the beta as LAN-only.

**Architecture:** Run `buzz-pair-relay` as a stateless second daemon from the existing immutable Buzz image and export it through a dedicated StartOS host/interface. Persist a mutable pairing WSS URL selected from that interface, block startup when it is missing or unavailable, and inject it into the main relay as `BUZZ_PAIRING_RELAY_URL`.

**Tech Stack:** TypeScript 6, `@start9labs/start-sdk` 2.0.9, Node test runner through `tsx`, upstream Rust `buzz-pair-relay`, StartOS MultiHost interfaces.

---

### Task 1: Pairing interface contract and address discovery

**Files:**
- Modify: `startos/constants.ts`
- Modify: `startos/interfaces.ts`
- Modify: `startos/utils.ts`
- Modify: `tests/interface-addresses.test.ts`

**Step 1: Write the failing constants and address-discovery tests**

Extend the constants assertion with:

```typescript
PAIRING_HOST_ID: 'buzz-pairing'
PAIRING_INTERFACE_ID: 'pairing-relay'
PAIRING_PORT: 5000
PAIRING_SETUP_TASK_REPLAY_ID: 'buzz:configure-pairing-relay'
```

Add fixtures whose pairing host contains
`bindings[PAIRING_PORT].interfaces[PAIRING_INTERFACE_ID]`. Assert that
`selectPairingInterfaceUrls()`:

- reads only `addressInfo.nonLocal`;
- accepts root `ws://` and `wss://` URLs;
- normalizes hostname case, trailing dots, default ports, and trailing `/`;
- rejects HTTP, HTTPS, credentials, paths, queries, fragments, and malformed
  values; and
- removes duplicates.

**Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test tests/interface-addresses.test.ts
```

Expected: FAIL because the pairing constants and selector do not exist.

**Step 3: Implement the interface contract**

Add the four constants. In `setInterfaces`, keep the existing main host and add
a second `MultiHost` binding:

```typescript
const pairingHost = sdk.MultiHost.of(effects, PAIRING_HOST_ID)
const pairingOrigin = await pairingHost.bindPort(PAIRING_PORT, {
  protocol: 'http',
  preferredExternalPort: PAIRING_PORT,
})

const pairingRelay = sdk.createInterface(effects, {
  name: i18n('Buzz Pairing Relay'),
  id: PAIRING_INTERFACE_ID,
  description: i18n('Ephemeral WebSocket endpoint for pairing Buzz devices.'),
  type: 'api',
  masked: false,
  schemeOverride: { ssl: 'wss', noSsl: 'ws' },
  username: null,
  path: '',
  query: {},
})
```

Return both export receipts. Add a WebSocket-origin normalizer and
`selectPairingInterfaceUrls()`/`readPairingInterfaceUrlsOnce()`/
`readPairingInterfaceUrlsConst()` alongside the existing HTTP-origin helpers.

**Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test tests/interface-addresses.test.ts
npm run check
```

Expected: all interface tests pass and TypeScript exits 0.

**Step 5: Commit**

```bash
git add startos/constants.ts startos/interfaces.ts startos/utils.ts tests/interface-addresses.test.ts
git commit --signoff -m "feat: expose Buzz pairing relay interface"
```

### Task 2: Mutable pairing URL action and stored-state validation

**Files:**
- Create: `startos/domain/pairing-url.ts`
- Create: `startos/actions/configure-pairing-relay.ts`
- Create: `tests/pairing-configuration.test.ts`
- Modify: `startos/fileModels/store.json.ts`
- Modify: `startos/domain/state-validation.ts`
- Modify: `startos/actions/index.ts`
- Modify: `tests/state-validation.test.ts`

**Step 1: Write failing domain/action tests**

Test that `normalizePairingRelayUrl()` returns only canonical root WS/WSS
origins and rejects HTTP(S), credentials, paths, queries, and fragments. Test
`configurePairingRelayWith()` with injected dependencies:

```typescript
{
  readStoredStateOnce,
  readPairingUrls,
  mergeStore,
  withStoreMutation,
}
```

Assert that it rejects a URL not currently exported by the pairing interface,
serializes mutations, persists only `{ pairingRelayUrl }`, supports idempotent
retries, and allows replacing an existing pairing URL.

Extend state tests so an absent `pairingRelayUrl` remains backward-compatible
ready state, a valid value is normalized and retained, and a malformed present
value produces `needs-state-recovery` with only the field name.

**Step 2: Run focused tests and verify RED**

```bash
npx tsx --test tests/pairing-configuration.test.ts tests/state-validation.test.ts
```

Expected: FAIL because the domain helper, action, and state field do not exist.

**Step 3: Implement the mutable pairing setting**

Add `pairingRelayUrl` as an optional raw stored-state field and optional member
of `CompleteStore`. Normalize it with the new domain helper. Do not increment
`schemaVersion`; the field is backward-compatible and can be filled by the
action.

Implement `configurePairingRelayWith()` under the existing store mutation
queue. The StartOS action uses a dynamic select populated from
`readPairingInterfaceUrlsOnce()`, is allowed only while stopped, and is visible
so the operator can change the rendezvous endpoint later.

Register the action in `startos/actions/index.ts`.

**Step 4: Run focused tests and verify GREEN**

```bash
npx tsx --test tests/pairing-configuration.test.ts tests/state-validation.test.ts
npm run check
```

Expected: all focused tests pass and TypeScript exits 0.

**Step 5: Commit**

```bash
git add startos/domain/pairing-url.ts startos/actions/configure-pairing-relay.ts startos/actions/index.ts startos/fileModels/store.json.ts startos/domain/state-validation.ts tests/pairing-configuration.test.ts tests/state-validation.test.ts
git commit --signoff -m "feat: configure advertised pairing relay URL"
```

### Task 3: Blocking task and runtime configuration

**Files:**
- Modify: `startos/init/reconcile-blocking-tasks.ts`
- Modify: `startos/main.ts`
- Modify: `startos/runtime/config.ts`
- Modify: `tests/blocking-state.test.ts`
- Modify: `tests/runtime-config.test.ts`

**Step 1: Write failing task/configuration tests**

Extend `selectBlockingTask()` to receive both main origins and pairing WSS
origins. Assert this priority:

1. state recovery;
2. initial setup;
3. canonical main URL recovery;
4. missing/unavailable pairing URL configuration; and
5. no blocking task.

Assert that a ready state containing `pairingRelayUrl` produces:

```typescript
BUZZ_PAIRING_RELAY_URL: 'wss://pair.buzz.example'
```

and that runtime configuration rejects a missing value at its boundary.

**Step 2: Run focused tests and verify RED**

```bash
npx tsx --test tests/blocking-state.test.ts tests/runtime-config.test.ts
```

Expected: FAIL because the new task decision and environment variable are
absent.

**Step 3: Implement task reconciliation and runtime injection**

Add the `configure-pairing-relay` decision using
`PAIRING_SETUP_TASK_REPLAY_ID`. Missing and unavailable pairing URLs create the
same critical task with a reason that tells the user to select an address
currently available on the pairing interface. Ensure every other decision
clears this replay ID.

In `main`, reactively read both interface address sets, reconcile tasks, and
reject startup with fixed value-safe errors when pairing configuration is
missing or unavailable. Add `BUZZ_PAIRING_RELAY_URL` to `buzzEnv` only after
validated state reaches `buildRuntimeConfig`.

**Step 4: Run focused tests and verify GREEN**

```bash
npx tsx --test tests/blocking-state.test.ts tests/runtime-config.test.ts
npm run check
```

Expected: all focused tests pass and TypeScript exits 0.

**Step 5: Commit**

```bash
git add startos/init/reconcile-blocking-tasks.ts startos/main.ts startos/runtime/config.ts tests/blocking-state.test.ts tests/runtime-config.test.ts
git commit --signoff -m "feat: require an available pairing relay URL"
```

### Task 4: Pairing daemon, readiness, and ongoing health

**Files:**
- Modify: `startos/main.ts`
- Modify: `tests/health.test.ts`

**Step 1: Write failing daemon tests**

Extend the recorded native stack assertion with a `pairing` subcontainer using
image `buzz`, no mounts, and this daemon:

```typescript
{
  command: ['/usr/local/bin/buzz-pair-relay'],
  env: { BUZZ_PAIR_RELAY_BIND_ADDR: '0.0.0.0:5000' },
  requires: [],
}
```

Assert its readiness probe runs:

```typescript
[
  'curl', '-sS', '-o', '/dev/null', '-w', '%{http_code}',
  'http://127.0.0.1:5000/',
]
```

and succeeds only for exit code 0 with stdout `400`, the upstream relay's
expected response to a non-WebSocket HTTP request. Assert an ongoing
`pairing-relay` health check requires the `pairing` daemon and reports fixed
localized success/failure messages.

**Step 2: Run focused test and verify RED**

```bash
npx tsx --test tests/health.test.ts
```

Expected: FAIL because the daemon and health check are absent.

**Step 3: Implement the daemon and health check**

Create a mountless `pairingSub` from the existing Buzz image. Add the independent
daemon before the main Buzz daemon. Keep the main daemon independent so a
pairing outage does not remove an already-running collaboration relay. Append
an `addHealthCheck('pairing-relay', ...)` entry requiring `pairing`.

**Step 4: Run focused tests and verify GREEN**

```bash
npx tsx --test tests/health.test.ts
npm run check
```

Expected: all health tests pass and TypeScript exits 0.

**Step 5: Commit**

```bash
git add startos/main.ts tests/health.test.ts
git commit --signoff -m "feat: run the Buzz pairing relay daemon"
```

### Task 5: User-visible actions, localization, and documentation

**Files:**
- Modify: `startos/actions/connection-information.ts`
- Modify: `startos/i18n/dictionaries/default.ts`
- Modify: `startos/i18n/dictionaries/translations.ts`
- Modify: `tests/manifest.test.ts`
- Modify: `README.md`
- Modify: `instructions.md`

**Step 1: Write failing action/localization assertions**

Add manifest/localization keys for the pairing interface, configuration action,
blocking reason, and health messages. Assert `Connection Information` exposes
the selected **Pairing Relay WebSocket URL** without masking it.

Add source assertions or a small documentation test confirming both documents
contain the LAN-only beta statement and do not claim that the package enables
Tor, clearnet, or StartTunnel reachability.

**Step 2: Run focused tests and verify RED**

```bash
npx tsx --test tests/manifest.test.ts tests/pairing-configuration.test.ts
```

Expected: FAIL because the strings and action result are absent.

**Step 3: Update user surfaces**

Document:

- why the old NIP-43 `/pair` fallback returned 404;
- that the dedicated pairing relay is temporary and stateless;
- how to select its WSS address;
- that normal mobile traffic uses the main relay after pairing;
- the exact LAN-only beta limitation;
- the StartOS Root CA requirement and the unresolved unmodified-Android trust
  gate; and
- the deferred StartTunnel VPS/public-certificate project.

Keep `README.md` and `instructions.md` aligned. Add complete translations for
all new i18n keys without renumbering existing keys.

**Step 4: Run focused tests and verify GREEN**

```bash
npx tsx --test tests/manifest.test.ts tests/pairing-configuration.test.ts
npm run prettier:check
```

Expected: focused tests and formatting pass.

**Step 5: Commit**

```bash
git add startos/actions/connection-information.ts startos/i18n/dictionaries/default.ts startos/i18n/dictionaries/translations.ts tests/manifest.test.ts README.md instructions.md
git commit --signoff -m "docs: describe LAN-only mobile pairing beta"
```

### Task 6: Beta version and image/runtime contract

**Files:**
- Modify: `startos/versions/current.ts`
- Modify: `tests/manifest.test.ts`
- Modify: `UPDATING.md`

**Step 1: Write the failing version assertion**

Change the manifest test to require revision `:3` and localized release notes
that identify the dedicated local pairing relay beta without claiming remote
mobile support.

**Step 2: Run focused test and verify RED**

```bash
npx tsx --test tests/manifest.test.ts
```

Expected: FAIL because the package is still revision `:2`.

**Step 3: Update version and runtime audit instructions**

Edit `startos/versions/current.ts` in place to revision `:3`; do not create a
historical version file because this change has no store migration. Update
`UPDATING.md` so every future Buzz snapshot audit checks both native image
platforms for `/usr/local/bin/buzz-pair-relay` in addition to `buzz-relay`,
`buzz-admin`, and `curl`.

**Step 4: Run focused test and verify GREEN**

```bash
npx tsx --test tests/manifest.test.ts
git diff --check
```

Expected: manifest tests pass and the diff has no whitespace errors.

**Step 5: Commit**

```bash
git add startos/versions/current.ts tests/manifest.test.ts UPDATING.md
git commit --signoff -m "chore: mark local mobile pairing beta"
```

### Task 7: Full automated verification

**Files:**
- Modify only if a verification failure exposes a defect in this feature.

**Step 1: Run all package gates**

```bash
npm test
npm run check
npm run prettier:check
npm run build
npm run verify:images
git diff --check main...HEAD
git status --short --branch
```

Expected: 0 failures, 0 TypeScript errors, all files formatted, bundle build
exit 0, immutable image metadata verified, clean diff, and clean worktree.

**Step 2: Verify the pinned image contains the pairing binary**

For both pinned native Buzz image digests, inspect the filesystem and require:

```text
/usr/local/bin/buzz-relay
/usr/local/bin/buzz-admin
/usr/local/bin/buzz-pair-relay
/usr/bin/curl or /usr/local/bin/curl
```

Expected: every required executable exists on amd64 and arm64.

**Step 3: Build both S9PK architectures when the signing/build environment is available**

Use the exact Makefile targets documented by the package and inspect each
manifest/commitment. Do not publish while the package remains pinned to the
known-unsafe upstream snapshot.

**Step 4: Record unresolved device gates**

Update `docs/testing/DEVICE_TEST_MATRIX.md` only with evidence from an actual
StartOS device. Leave desktop QR, Android transfer, main-relay authentication,
restart, and certificate-trust rows explicitly pending until exercised.

**Step 5: Commit verification-only fixes, if any**

```bash
git add <only-files-changed-to-fix-a-real-gate>
git commit --signoff -m "fix: satisfy pairing beta verification"
```

Skip this commit when verification requires no changes.
