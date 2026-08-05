# Buzz

Your first setup choice is permanent: the selected StartOS URL identifies this
Buzz community and is used for authentication, media, and Git links.

> [!WARNING]
> This package is a device-test candidate. Its automated dependency, image,
> and package-source gates pass, but its final signed artifacts and StartOS
> device tests are not complete. Do not use it for production or make it the
> only copy of irreplaceable data.

## Documentation

- [Upstream Buzz documentation](https://github.com/block/buzz#readme) — product
  capabilities, clients, and upstream usage.
- [Pre-upgrade audit](https://github.com/mdubore/buzz-startos/blob/main/docs/operations/PRE_UPGRADE_AUDIT.md) — required recovery and channel-authority checks
  before updating an older published package.

## What You Get on StartOS

The package exposes three interfaces:

- **Buzz Web** provides limited invite and repository browser routes.
- **Buzz Relay** is the main HTTP and WebSocket endpoint used by Buzz clients.
- **Buzz Pairing Relay** is a temporary WebSocket rendezvous used only while
  adding a device.

PostgreSQL, Redis, and MinIO run privately inside the service. The package
manages their credentials, the immutable community identity, the pairing URL,
and relay admission. Use Buzz Desktop for channels, direct messages, media,
canvases, workflows, search, agents, and the rest of the workspace.

## Getting Set Up

1. Open **Complete Initial Setup** when StartOS presents it.
2. Enter the owner's Nostr public key as an `npub` or hexadecimal public key.
   Never enter an `nsec` or another private key into a StartOS action.
3. Select the StartOS URL that you intend to keep permanently for this
   community.
4. Complete **Configure Pairing Relay** with an address shown for the **Buzz
   Pairing Relay** interface.
5. Start Buzz after both setup items clear.
6. Run **Connection Information** and copy the **Relay WebSocket URL**.
7. Configure a compatible Buzz Desktop client with that relay URL, then
   authenticate using the private key that matches the stored owner public key.

The canonical URL cannot be renamed by this package. If the original address
is unavailable after a restore or gateway change, Buzz remains blocked until
you restore that same address. You may replace the pairing URL with another
address currently exported by the pairing interface.

## Connecting Desktop and ACP over WSS

A public-domain interface with a publicly trusted certificate works with a
normal compatible client. A private `.local`, IP, or private-domain interface
normally presents a certificate signed by the StartOS Root CA.

Buzz Desktop and `buzz-acp` make separate WSS connections. For a private
StartOS address, use a reviewed
[native-root-aware companion build](https://github.com/mdubore/buzz9) for both
paths and install the StartOS Root CA in your operating-system certificate
store. A desktop-only change can leave ACP agent sessions unable to connect.
Keep certificate and hostname validation enabled.

You may instead choose a public domain with a publicly trusted certificate as
the canonical host, but configure and enable it before **Complete Initial
Setup**. The package does not create the domain, gateway, DNS record, port
forwarding, or certificate for you.

## Local Mobile Pairing

The server-side pairing setup is **LAN-only** and does not enable remote
access. Keep the desktop and Android device on the same local network while
testing.

The earlier topology advertised pairing without a NIP-11
`pairing_relay_url`. Buzz Desktop therefore derived `<main relay>/pair`; the
main relay returned HTTP `404` because it does not serve pairing there. This
was a discovery and routing mismatch, not a failed main relay and not the
Android TLS problem.

The package now provides the dedicated **Buzz Pairing Relay** WSS interface.
**Configure Pairing Relay** stores its root address, and NIP-11 advertises the
exact `pairing_relay_url` as a dedicated root. Buzz Desktop connects directly
to it instead of appending `/pair`. This fixes the prior server-side 404
without a Buzz client modification.

To exercise the local server path:

1. Run **Configure Pairing Relay** and select a LAN-reachable WSS address.
2. Confirm **Buzz Pairing Relay** is healthy.
3. In Buzz Desktop, choose **Add mobile**.
4. Scan the displayed QR code with Buzz Android.

The pairing relay is temporary and stateless. After the encrypted account
transfer, ordinary mobile traffic uses the main relay.

In the current private-CA configuration, unmodified Android rejects the
certificate path signed by the private StartOS Root CA, so the secure pairing
connection fails with an Android TLS trust error. This observed result is
specific to the current configuration; it does not establish that Android
cannot work with a publicly trusted certificate. Unmodified Android remains
unsupported here. Do not
bypass certificate or hostname checks and do not modify the mobile app as a
long-term workaround.

Remote mobile is not supported. A future StartTunnel or equivalent VPS project
may provide public DNS, publicly trusted certificates, and routing for both the
main and pairing WSS interfaces, with optional split DNS for local traffic.
That future design and user guide are separate from this package and have not
been implemented or validated.

## Managing Relay Access

Use these visible actions:

- **Connection Information** shows the canonical web URL, main relay URL,
  pairing relay URL, and owner public key. It does not reveal service secrets.
- **Configure Pairing Relay** replaces the advertised pairing address with one
  currently exported by the pairing interface.
- **Add Member** admits a new `npub` or hexadecimal public key as a `member` or
  `admin`. Re-adding an existing identity does not change its role.
- **Remove Member** removes the selected relay role.
- **List Members** displays the current relay roster.

The owner identity is permanent and cannot be added or removed through these
membership actions. Relay admission is separate from membership and roles
inside an individual Buzz channel. The relay `admin` role does not enable the
disabled upstream admin dashboard.

## Backups and Updates

Create a StartOS backup before updating. The package is designed to preserve
the database, object storage, wrapper state, Redis continuity data, canonical
URL, pairing URL, owner identity, and stable service secrets, but this candidate
has not completed real-device backup and restore validation.

Before updating an older published package, complete
[`PRE_UPGRADE_AUDIT.md`](https://github.com/mdubore/buzz-startos/blob/main/docs/operations/PRE_UPGRADE_AUDIT.md).
It requires a verified backup and clean-target restore, plus confirmation that
an active owner exists in every channel. Stop if a channel has no active owner
or has unexplained role changes.
The updater will not automatically promote an arbitrary owner.

## Limitations

- Unmodified Android local pairing is unsupported until its private-CA trust
  path passes a real-device test.
- Mobile use outside the local network is unsupported until a separate
  public-certificate tunnel deployment is configured and validated.
- Media URLs are link-accessible. Treat a content-addressed media URL as a
  bearer link.
- Hosted background iOS push delivery is disabled; ordinary relay connections
  are unaffected.
- The upstream admin web application and full browser client are disabled.
- Failed restore diagnostics may contain the database password. Do not publish
  or attach unredacted logs.
