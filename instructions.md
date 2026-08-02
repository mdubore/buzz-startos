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
- [Historical published-package pre-upgrade audit][pre-upgrade-audit] -
  required recovery and channel-authority checks before updating the older
  `dd222a5` package.

## Getting Set Up

1. Open the critical **Complete Initial Setup** item shown after installation.
2. Enter the owner's Nostr public key as an `npub` or 64-character hexadecimal
   key.
3. Select the StartOS URL that you intend to keep for this community.
4. Complete **Configure Pairing Relay** by selecting the WebSocket address
   shown for the pairing interface.
5. Start Buzz after both setup items clear.
6. Run **Connection Information** and copy the **Relay WebSocket URL**.
7. Choose a compatible Buzz desktop client using the certificate guidance
   below, configure it with that relay URL, and authenticate using the private
   key that matches the stored owner public key.

Enter only the public `npub` or hex key in StartOS. Never enter an `nsec` or
other private key into a StartOS action.

> [!IMPORTANT]
> A compatible upstream Buzz client can validate an interface address with a
> publicly trusted certificate normally. For a private StartOS address marked
> **Root CA**, use the reviewed
> [`mdubore/buzz9` companion build][companion-merge] at merge `78a155f92`, or a
> later reviewed build that retains desktop native-root commit `b953803bc` and
> ACP native-root commit `4ac56fce1`. The desktop client and its bundled
> `buzz-acp` sidecar make independent WSS connections, so both paths must load
> native certificate roots and the StartOS Root CA must be installed in the
> operating-system certificate store. Keep certificate and hostname validation
> enabled.

No published installer asset for that exact companion revision has been
verified. Build or use the reviewed revision and follow its pinned
[README development commands][companion-readme] and
[agent build guidance][companion-agents]. This companion change affects the
desktop and ACP clients only; it does not modify Buzz Android or another mobile
app, prove mobile support, or replace the future public-tunnel and publicly
trusted certificate design for remote use.

If you prefer a publicly trusted certificate, add and enable a public domain
with an ACME certificate such as Let's Encrypt on the Buzz interface before
running **Complete Initial Setup**, then select that HTTPS address as the
canonical URL. Adding the address does not by itself make the interface public;
you must separately configure and enable the corresponding gateway, DNS, and
port forwarding. The package cannot change the canonical host after setup. If
you also configure that real domain privately with StartOS split DNS, LAN
clients can use the same hostname and public certificate without routing out to
the public gateway.

The StartOS browser interface exposes only limited invite and repository
routes. Use the external client for channels, direct messages, media,
canvases, workflows, search, agents, and the rest of the workspace. The
server-side mobile pairing path is available as a local-network beta, with the
Android certificate limitation described below.

## Local Mobile Pairing Beta

The current verified beta configuration is LAN-only. The package exposes the
main and pairing interfaces, but it does not enable remote access. Mobile use
outside your local network is not supported or validated by this setup.

Previously, the main relay advertised pairing support without a NIP-11
`pairing_relay_url`, so Buzz Desktop fell back to `<main-relay>/pair`. The main
relay does not serve WebSocket pairing at `/pair`; StartOS correctly routed the
request there, and the main relay correctly returned `404 Not Found`. This was
a discovery, configuration, and topology mismatch. It was not the Android TLS
issue, did not mean the main relay was down, and did not indicate that normal
relay traffic had failed.

The package now exports a separate **Buzz Pairing Relay** interface backed by
Buzz's temporary, stateless pairing service. **Configure Pairing Relay** stores
the exported root `wss://` address, and the main relay advertises that exact
address in NIP-11. Buzz Desktop connects directly to the dedicated root address
instead of adding `/pair` to the main relay URL. Health requires a bounded,
successful WebSocket 101 Switching Protocols handshake rather than merely an
HTTP listener response. This server-side change fixes the prior 404 without a
Buzz client modification.

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
the StartOS Root CA. Depending on its trust-store behavior, the unmodified
Android client may not trust that private/local CA even on LAN. This is a
separate TLS trust and interoperability limitation from the fixed 404. Android
support remains unverified until it passes a real-device test. Keep certificate
and hostname validation enabled; do not use an invalid-certificate bypass or
modify the mobile app as a long-term workaround.

Remote use is a separate future project: a VPS running StartTunnel or an
equivalent public tunnel, public DNS, publicly trusted certificates, and
routing for both the main and pairing WSS interfaces. Optional split DNS can
keep local traffic on the LAN. The goal is an architecture and user guide that
requires no changes to `buzz-startos`, Buzz Desktop, or Buzz Android, but that
future result is not implemented or guaranteed here. StartOS may support other
valid reachability designs. Until one is configured and tested, this package
does not provide supported mobile use away from your home network and does not
claim Tor, clearnet, or StartTunnel reachability.

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

During startup, a root-only one-shot recursively repairs ownership only on the
disposable `/data/git` cache for the unprivileged Buzz account, including
populated legacy caches. This supports overlay-backed Server Pure installations
without running the relay as root. Durable Git objects remain authoritative in
MinIO, so the cache can rehydrate; persistent repository data is not treated as
disposable.

Before updating the older published `dd222a5` package, complete
[`PRE_UPGRADE_AUDIT.md`][pre-upgrade-audit]. It requires a
verified backup and clean-target restore, and confirmation that an active owner
exists in every channel. Stop if a channel has no active owner or has unexplained
role changes. The updater will not automatically promote an arbitrary owner;
governance repair requires a separate, explicitly reviewed recovery procedure.

## Limitations

- Media files are available to anyone who has their content-addressed Buzz
  link, although the package does not make those links automatically
  discoverable. Do not treat media URLs as private credentials.
- Hosted/background iOS push delivery is disabled; normal relay connectivity
  is unaffected.
- The upstream admin web application and full browser client are not enabled.

[pre-upgrade-audit]: https://github.com/mdubore/buzz-startos/blob/main/docs/operations/PRE_UPGRADE_AUDIT.md
[companion-merge]: https://github.com/mdubore/buzz9/commit/78a155f9221a8872b62706867fd017692ede0886
[companion-readme]: https://github.com/mdubore/buzz9/blob/78a155f9221a8872b62706867fd017692ede0886/README.md#going-further
[companion-agents]: https://github.com/mdubore/buzz9/blob/78a155f9221a8872b62706867fd017692ede0886/AGENTS.md
