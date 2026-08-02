# StartOS WSS Client Compatibility Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Document how Buzz desktop and ACP clients must handle certificates when connecting to the StartOS-packaged relay over WSS, including the current native-root remediation and the public-domain/ACME alternative.

**Architecture:** Add the full builder-facing compatibility contract to the package README next to the client connection workflow. Keep `instructions.md` concise and operator-focused, while linking the certificate behavior to the immutable canonical address selected during initial setup.

**Tech Stack:** Markdown, StartOS interfaces and gateways, Rust `tokio-tungstenite`/rustls feature configuration

---

### Task 1: Add the builder-facing WSS compatibility contract

**Files:**

- Modify: `README.md` near `## Connect A Buzz Client`
- Reference: `startos/interfaces.ts`
- Reference: `startos/actions/complete-initial-setup.ts`
- Reference: `startos/domain/public-url.ts`

**Step 1: Add a current-configuration preface**

State that the package binds plain HTTP internally on port `3000`, StartOS
terminates external TLS, and the selected canonical HTTPS address produces the
matching `wss://` relay URL.

**Step 2: Document the private-CA failure**

Explain that `.local`, IP, and private-only domain interface addresses marked
**Root CA** terminate at the StartOS Root CA. The client OS must trust that CA,
and a Buzz binary restricted to `rustls-tls-webpki-roots` cannot see it even
when the OS trust store can.

**Step 3: Show the complete current remediation**

Include dependency examples for:

```toml
# desktop/src-tauri/Cargo.toml
tokio-tungstenite = { version = "0.29", features = ["rustls-tls-native-roots"] }

# workspace Cargo.toml, used by buzz-acp
tokio-tungstenite = { version = "0.29", features = ["rustls-tls-native-roots"] }
```

State that `rustls-tls-webpki-roots` must not remain enabled for these paths,
and that both `buzz-desktop` and `buzz-acp` must be rebuilt and packaged.
Explicitly prohibit disabling certificate or hostname validation.

**Step 4: Document the StartOS-side alternative**

Explain that an operator can configure a public domain on the Buzz interface
and select a publicly trusted ACME certificate such as Let's Encrypt. That
address must be enabled and selected as the immutable canonical HTTPS URL
before initial setup. State that the package does not provision the domain,
gateway, DNS, exposure, port forwarding, or certificate. Include the split-DNS
option, where the same real domain and public certificate are also used for
LAN-direct routing.

**Step 5: Add verification guidance**

Require a WSS handshake through both desktop and ACP paths against the actual
canonical relay URL. For a Root-CA-backed address, install that CA in the OS
trust store first. Clarify that testing only the desktop path does not validate
ACP sessions.

### Task 2: Keep operator instructions aligned

**Files:**

- Modify: `instructions.md` near `## Connect An External Client`

**Step 1: Add a concise private-address note**

Tell operators that clients using a StartOS interface address marked **Root
CA** need the StartOS Root CA in the OS trust store. State that the current
downstream remediation reads native roots for both desktop and ACP
connections.

**Step 2: Add the public-domain timing note**

Tell operators who prefer a publicly trusted ACME certificate to configure and
enable the public domain before completing Buzz initial setup and select it as
the canonical URL.

### Task 3: Verify documentation and repository state

**Files:**

- Verify: `README.md`
- Verify: `instructions.md`
- Verify: `docs/plans/2026-07-31-startos-wss-client-compatibility-design.md`
- Verify: `docs/plans/2026-07-31-startos-wss-client-compatibility.md`

**Step 1: Run formatting and whitespace checks**

Run:

```bash
npm run prettier:check
git diff --check
```

Expected: both commands exit successfully.

**Step 2: Confirm required content**

Run:

```bash
rg -n 'rustls-tls-native-roots|rustls-tls-webpki-roots|buzz-acp|Let.s Encrypt|immutable canonical' README.md instructions.md
```

Expected: the README covers both client paths and both certificate strategies;
the instructions contain the concise operator warning.

**Step 3: Review the final diff**

Run:

```bash
git diff -- README.md instructions.md docs/plans/2026-07-31-startos-wss-client-compatibility.md
```

Expected: only the approved documentation changes appear.

**Step 4: Commit**

```bash
git add README.md instructions.md docs/plans/2026-07-31-startos-wss-client-compatibility.md
git commit -m "docs: explain StartOS WSS client trust"
```
