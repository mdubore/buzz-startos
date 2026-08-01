# StartOS Mobile Pairing Relay Design

## Status

Approved for implementation on 2026-07-31.

This design fixes the missing Buzz device-pairing endpoint for the current
local-network alpha configuration. It does not claim remote Android support.
The next project will design and document a StartTunnel VPS deployment that
lets an unmodified upstream Buzz mobile client use publicly trusted WSS
endpoints without requiring changes to `buzz-startos`.

## Problem

The StartOS package enables relay membership enforcement, so the main relay
advertises NIP-43. It does not set `BUZZ_PAIRING_RELAY_URL` and does not start
the `buzz-pair-relay` binary included in the upstream Buzz image.

When Buzz Desktop sees NIP-43 without an advertised pairing relay, it uses the
legacy `wss://<main-relay>/pair` fallback. StartOS forwards that request to the
main Buzz relay, which has no `/pair` route, and the WebSocket handshake
receives `404 Not Found` instead of `101 Switching Protocols`.

## Goals

- Run the upstream pairing relay from the already packaged Buzz image.
- Expose it as a dedicated StartOS WSS interface.
- Advertise the selected pairing WSS URL from the main relay through NIP-11.
- Allow the pairing address to change independently of the immutable main
  community URL.
- Verify desktop QR creation and a complete Android pairing exchange on the
  local network.
- State the current mobile reachability limits unambiguously in both developer
  and user documentation.

## Non-Goals

- Do not modify the Buzz pairing protocol or mobile application.
- Do not add a reverse proxy solely to implement the legacy `/pair` path.
- Do not claim that a Root-CA-backed WSS address works in an unmodified Android
  client until a physical-device test proves it.
- Do not provide or claim remote mobile access in this release.
- Do not publish a release using the known-unsafe `dd222a5` snapshot; upstream
  snapshot synchronization and its runtime-contract review remain a separate
  release gate.

## Architecture

### Pairing daemon

Create a second daemon from the existing `buzz` image. Run
`/usr/local/bin/buzz-pair-relay` with
`BUZZ_PAIR_RELAY_BIND_ADDR=0.0.0.0:5000`. The daemon is stateless and receives
no database, Redis, MinIO, relay-key, owner-key, or membership secrets.

The daemon starts independently of PostgreSQL, Redis, and MinIO. Its readiness
probe verifies that the internal listener responds with the expected bounded
HTTP/WebSocket behavior. An ongoing user-visible health check reports pairing
availability separately from the main relay.

### StartOS interface

Bind internal port `5000` as HTTP and let StartOS terminate TLS. Export one
unmasked API interface named **Buzz Pairing Relay** with WSS/WS scheme
overrides. Use a dedicated host/interface identifier so the operator can later
assign a distinct real domain such as `pair.buzz.example.com`.

The package declares the endpoint; the operator decides which LAN, VPN, Tor,
or public addresses are enabled. This beta validates only a LAN address.

### Pairing URL selection

Add a user action that lists normalized non-bridge addresses exported by the
pairing interface. The selected root WSS URL is stored separately from the
main canonical URL. It is mutable because the pairing relay is rendezvous
infrastructure, not the Buzz community identity.

Fresh setup must select a main canonical URL and a pairing URL before the
service reports mobile pairing as configured. An existing alpha installation
without a pairing selection receives an explicit StartOS task/action rather
than silently advertising a guessed `/pair` URL.

At runtime, the package validates that the stored pairing URL is still present
on the pairing interface. It then sets `BUZZ_PAIRING_RELAY_URL` in the main
relay environment. Buzz includes that value in its NIP-11 document, allowing
desktop and mobile clients to connect directly to the dedicated relay.

### Failure behavior

- Missing pairing selection: present a blocking setup task with a fixed,
  value-safe explanation.
- Stored pairing address unavailable after a gateway/address change: present a
  recovery task and do not silently substitute another address.
- Pairing daemon unhealthy: keep the main collaboration relay available but
  report **Buzz Pairing Relay** unhealthy.
- Main relay unhealthy: preserve the existing composite Buzz/MinIO health
  behavior.

## Documentation

`README.md` and `instructions.md` must state:

> This release has been validated only while the desktop, Android device, main
> relay, and pairing relay are reachable on the same LAN. The package does not
> enable remote mobile access. Outside-LAN operation requires a separately
> configured StartOS gateway and suitable addresses and certificates, and is
> not supported or validated by this beta.

They must also distinguish the temporary pairing relay from the main relay:
the pairing relay transfers encrypted device credentials, while normal mobile
operation uses the main canonical relay URL.

## Verification

Automated tests cover constants, interface exports, address normalization and
selection, stored-state validation, task reconciliation, least-privilege
environment construction, daemon dependency order, and documentation claims.

Package verification includes TypeScript compilation, formatting, unit tests,
bundle construction, image-pin verification, and both architecture package
builds when the release snapshot is ready.

Physical StartOS verification must prove:

1. NIP-11 advertises the selected pairing WSS URL.
2. That URL completes a WebSocket upgrade without a `/pair` 404.
3. Buzz Desktop displays a pairing QR code.
4. Android scans it and completes the encrypted transfer.
5. Android authenticates against the main relay and exchanges events.
6. Pairing and normal use survive a Buzz service restart.

If Android next reports a certificate-validation error, that is recorded as a
separate interoperability result. The long-term remediation is a publicly
trusted StartTunnel domain, not a permanent downstream mobile patch.

## Deferred StartTunnel Project

The next project will produce a tested VPS setup and user guide for unmodified
mobile clients. Its target design is:

- StartTunnel on an operator-controlled VPS;
- a real main domain and a separate pairing domain;
- publicly trusted certificates;
- optional StartOS split DNS for direct LAN traffic;
- cellular-data and LAN acceptance tests using an unmodified upstream Android
  client; and
- no additional `buzz-startos` application changes beyond selecting the new
  interface addresses.
