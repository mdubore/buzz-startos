# Buzz

Your first setup choice is permanent: the selected StartOS URL identifies this
Buzz community and is used in authentication, media, and Git links.

> [!WARNING]
> This sideload tracks a Buzz development snapshot. Backup and restore have not
> been validated on real StartOS devices. Do not use this package as the only
> copy of irreplaceable data.

## Documentation

- [Upstream Buzz documentation](https://github.com/block/buzz#readme) -
  product capabilities, supported clients, and upstream usage.

## Getting Set Up

1. Open the critical **Complete Initial Setup** item shown after installation.
2. Enter the owner's Nostr public key as an `npub` or 64-character hexadecimal
   key.
3. Select the StartOS URL that you intend to keep for this community.
4. Complete **Configure Pairing Relay** by selecting the WebSocket address
   shown for the pairing interface.
5. Start Buzz after both setup items clear.
6. Run **Connection Information** and copy the **Relay WebSocket URL**.
7. Install the external Buzz desktop client, configure it with that relay URL,
   and authenticate using the private key that matches the stored owner public
   key.

Enter only the public `npub` or hex key in StartOS. Never enter an `nsec` or
other private key into a StartOS action.

> [!IMPORTANT]
> A Buzz client using a StartOS interface address marked **Root CA** must trust
> this server's Root CA in the operating-system certificate store. The desktop
> client and its bundled `buzz-acp` sidecar make independent WSS connections,
> so the current downstream remediation loads native certificate roots in both
> paths. Fixing only the desktop connection leaves ACP agent sessions unable to
> connect. Keep certificate and hostname validation enabled.

If you prefer a publicly trusted certificate, add and enable a public domain
with an ACME certificate such as Let's Encrypt on the Buzz interface before
running **Complete Initial Setup**, then select that HTTPS address as the
canonical URL. This makes the interface publicly reachable and requires the
corresponding gateway, DNS, and port-forwarding configuration. The package
cannot change the canonical host after setup. If you also configure that real
domain privately with StartOS split DNS, LAN clients can use the same hostname
and public certificate without routing out to the public gateway.

The StartOS browser interface exposes only limited invite and repository
routes. Use the external client for channels, direct messages, media,
canvases, workflows, search, agents, and the rest of the workspace. The
server-side mobile pairing path is available as a local-network beta, with the
Android certificate limitation described below.

## Local Mobile Pairing Beta

The current verified beta configuration is LAN-only. The package exposes the
main and pairing interfaces, but it does not enable remote access. Mobile use
outside your local network is not supported or validated by this setup.

Previously, Buzz Desktop fell back to the main relay's `/pair` path because no
dedicated pairing address was advertised. That path was not served by the main
relay and returned `404 Not Found`, so the desktop could not create a QR-code
pairing session. The package now runs Buzz's temporary, stateless pairing relay
and advertises its selected WSS address.

To try local pairing:

1. Keep your desktop and Android device on the same local network.
2. Run **Configure Pairing Relay** and select a LAN-reachable WSS address.
3. Confirm **Buzz Pairing Relay** is healthy.
4. In Buzz Desktop, choose **Add mobile**, then scan the QR code with Buzz
   Android.

The pairing relay is used only for the encrypted account transfer. After
pairing, normal mobile traffic uses the main relay.

Removing the 404 does not prove that the unmodified Android application can
complete TLS. Private StartOS addresses normally use a certificate signed by
the StartOS Root CA, and the unmodified Android client has not been validated
to trust that user-installed CA. Keep certificate and hostname validation
enabled; do not use an invalid-certificate bypass.

Remote use is a separate future project: a StartTunnel gateway on a VPS, real
domains, and publicly trusted certificates for both interfaces. The goal is a
user guide and gateway deployment that requires no further `buzz-startos`
changes. Until that is configured and tested, this package does not claim Tor,
clearnet, or StartTunnel reachability.

## Managing The Private Relay

Use the StartOS Actions view:

- **Add Member** admits a new `npub` or hex identity as a `member` or `admin`.
  Re-adding an existing identity does not change its role.
- **Remove Member** revokes the selected role.
- **List Members** displays the current roster.
- **Connection Information** shows the canonical web URL, main relay URL,
  pairing relay URL, and owner public key.
- **Configure Pairing Relay** replaces the advertised pairing WSS address if
  your available StartOS addresses change.

The owner identity is permanent and cannot be added or removed through the
membership actions. Relay admission is separate from membership inside an
individual Buzz channel, and the relay `admin` role does not enable the
disabled upstream admin dashboard.

## Network And Backups

Enable LAN, Tor, or public StartOS gateways deliberately. The package does not
enable remote access, Tor, or public access automatically, and additional
addresses are not aliases for the canonical URL selected during setup. If that
original address is unavailable after a restore or gateway change, Buzz stays
blocked until the same address is restored.

Create a StartOS backup before applying an update. The package is designed to
preserve the database, object storage, wrapper state, Redis continuity data,
canonical URL, owner identity, and stable service secrets, but this behavior
has not yet been proven by a restore on a real StartOS device.

## Limitations

- Media files are available to anyone who has their content-addressed Buzz
  link, although the package does not make those links automatically
  discoverable. Do not treat media URLs as private credentials.
- Hosted/background iOS push delivery is disabled; normal relay connectivity
  is unaffected.
- The upstream admin web application and full browser client are not enabled.
