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
4. Complete the task, then start Buzz.
5. Run **Connection Information** and copy the **Relay WebSocket URL**.
6. Install the external Buzz desktop client, configure it with that relay URL,
   and authenticate using the private key that matches the stored owner public
   key.

Enter only the public `npub` or hex key in StartOS. Never enter an `nsec` or
other private key into a StartOS action.

The StartOS browser interface exposes only limited invite and repository
routes. Use the external client for channels, direct messages, media,
canvases, workflows, search, agents, and the rest of the workspace. Upstream
mobile clients are still under development and are not yet validated here.

## Managing The Private Relay

Use the StartOS Actions view while Buzz is running:

- **Add Member** admits a new `npub` or hex identity as a `member` or `admin`.
  Re-adding an existing identity does not change its role.
- **Remove Member** revokes the selected role.
- **List Members** displays the current roster.
- **Connection Information** shows the canonical web URL, relay URL, and owner
  public key.

The owner identity is permanent and cannot be added or removed through the
membership actions. Relay admission is separate from membership inside an
individual Buzz channel, and the relay `admin` role does not enable the
disabled upstream admin dashboard.

## Network And Backups

Enable LAN, Tor, or public StartOS gateways deliberately. The package does not
enable Tor or public access automatically, and additional addresses are not
aliases for the canonical URL selected during setup. If that original address
is unavailable after a restore or gateway change, Buzz stays blocked until the
same address is restored.

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
