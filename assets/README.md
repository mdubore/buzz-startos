# Package Assets

## Buzz Icon And License

`../icon.svg` is the upstream-owned Buzz icon imported without modification
from:

```text
https://raw.githubusercontent.com/block/buzz/dd222a509b156ba52ed3219e895d7bf1cf322c92/desktop/public/buzz.svg
```

- Source commit:
  `dd222a509b156ba52ed3219e895d7bf1cf322c92`
- Size: 646 bytes
- SHA-256:
  `1668a9d8ceeee11f88bc260d1ec168b44ac1336951843147c96ff2dd8144c771`
- License: Apache License 2.0

`../LICENSE` is the Apache License 2.0 text imported without modification from:

```text
https://raw.githubusercontent.com/block/buzz/dd222a509b156ba52ed3219e895d7bf1cf322c92/LICENSE
```

Its SHA-256 is
`108cb15997e51b75a8d18b0c1e2c52bd3879d051ab02118973387df1e4aab584`.

## S9PK Signing Identity

`signing-pubkey.pem` contains only the Ed25519 public key used to identify
reviewed sideload archives. `signing-pubkey.sha256` is SHA-256 over the final
raw 32-byte Ed25519 public key, not over the PEM or DER text:

```text
sha256:93c525225ec039e29fea53463c4e6dd489c4fe58698bb4867f65307c6279098c
```

Run [`../scripts/verify-s9pk-signer.sh`](../scripts/verify-s9pk-signer.sh)
against a downloaded `.s9pk` to validate the committed key and fingerprint,
the S9PK v2 header signer, and the archive signature.

The private signing key is workspace-local secret material used by Start CLI
to sign builds. It is never committed, copied into this repository, or
embedded in an archive; only its public half is published here.
