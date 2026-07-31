# StartOS WSS Client Compatibility Documentation Design

## Goal

Explain the certificate-trust requirements for a Buzz client connecting to the
StartOS-packaged relay, including the separate desktop and ACP WebSocket paths,
the remediation used by the current local client build, and the StartOS
deployment alternative that can avoid private-CA trust.

## Current Package Configuration

The package binds Buzz port `3000` as plain HTTP inside StartOS and exports a
web interface plus a relay interface from the same origin. StartOS terminates
TLS at its edge. The relay interface formats a TLS-enabled address as `wss://`
and a non-TLS address as `ws://`.

During initial setup, the operator selects one enabled StartOS web address as
the canonical URL. The package derives the matching relay URL (`https://`
becomes `wss://`) and permanently binds the Buzz community to that host.
Changing or aliasing the canonical host after setup is not supported.

## Certificate Cases

### Local and private addresses

StartOS signs certificates for `.local`, private-domain, and IP addresses with
the server's private Root CA. The client machine must trust that Root CA in its
operating-system certificate store. A Buzz binary built with
`tokio-tungstenite`'s `rustls-tls-webpki-roots` feature still fails because it
loads only the compiled public WebPKI roots and does not read the operating
system store.

The current client-side remediation is to use
`rustls-tls-native-roots` instead of `rustls-tls-webpki-roots` in both:

- `desktop/src-tauri/Cargo.toml`, for the desktop relay connection; and
- the workspace `Cargo.toml`, for the separately built `buzz-acp` relay
  connection.

Both binaries must be rebuilt and packaged. Fixing only the desktop connection
does not fix ACP agent sessions. Certificate-chain and hostname validation stay
enabled; the remediation is not an invalid-certificate bypass.

### Public domains

StartOS can obtain and serve a publicly trusted certificate for a public domain
through an ACME provider such as Let's Encrypt. A client using the normal
public WebPKI bundle can validate that certificate without installing the
StartOS Root CA.

This is an operator-selected deployment alternative, not something the Buzz
package enables automatically. The operator must configure and enable the
public domain on the Buzz interface before completing initial setup, then
select its HTTPS URL as the immutable canonical address. It also carries the
network exposure, DNS, gateway, and port-forwarding considerations of a public
domain.

## Non-Solutions

- Do not disable TLS certificate or hostname validation.
- Do not describe plain `ws://` as an equivalent production remediation.
- Do not move TLS into the Buzz container merely to work around client trust.
  The current HTTP/WebSocket interface intentionally relies on StartOS edge
  termination and also carries media, HTTP APIs, and Git traffic.
- Do not imply that the package provisions Tor, a public gateway, a domain, or
  an ACME certificate. StartOS leaves those choices to the operator.

## Documentation Changes

Add a builder-facing compatibility section near `Connect A Buzz Client` in
`README.md`. It will:

1. describe the observable private-CA WSS failure;
2. state the current package and canonical-URL behavior;
3. show the exact native-root dependency changes for desktop and ACP;
4. require rebuilding and packaging both binaries;
5. preserve certificate validation;
6. explain the public-domain/ACME alternative and its initial-setup timing;
7. identify the native-root change as the current remediation, not the only
   possible long-term architecture; and
8. provide focused verification guidance for both WebSocket paths.

Add a shorter matching note to `instructions.md` for operators installing an
external or locally rebuilt client.

## Verification

- Confirm the README matches `startos/interfaces.ts`,
  `startos/actions/complete-initial-setup.ts`, and
  `startos/domain/public-url.ts`.
- Confirm the client dependency examples match the implemented desktop and ACP
  changes.
- Run Markdown/prettier checks used by the package, plus `git diff --check`.
- Review the final wording for the StartOS rule that packages declare
  interfaces while operators select gateways and addresses.
