# Security Policy

## Supported Versions

This repository packages Buzz for StartOS 0.4.0. No published package is
currently security-supported. The published
`0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2` prerelease predates the
required security, upgrade, and device-validation gates. It is explicitly
unsupported and must not be treated as production-ready.

Security support begins only when a validated replacement passes the
production-readiness gates and its release notes explicitly designate it as
supported. Until then, reports are still accepted and fixes may land on `main`
or a draft candidate, but neither is a published support target.

| Release line                                         | Security support |
| ---------------------------------------------------- | ---------------- |
| `0.2.0-main.20260726.h.7.m.57.s.31.sha.dd.222.a.5:2` | Unsupported      |
| Earlier published revisions                          | Unsupported      |
| Validated replacement                                | Not yet released |
| Unreleased `main` or draft candidates                | Best effort      |

## Private Reporting

Report a vulnerability through
[GitHub private vulnerability reporting](https://github.com/mdubore/buzz-startos/security/advisories/new).
Do not open a public issue, pull request, discussion, or release comment for an
unresolved vulnerability.

Include only the information needed to reproduce and assess the issue:

- the package version, release tag, architecture, and full StartOS build;
- whether the issue is in packaging, configuration, update/restore behavior,
  release integrity, or Buzz itself;
- minimal reproduction steps, expected behavior, impact, and prerequisites;
- sanitized logs and artifact checksums when relevant; and
- whether active exploitation or signing-key exposure is suspected.

Do not send private keys, credentials, authentication headers, database dumps,
or unsanitized restore diagnostics. If the defect is clearly in the Buzz
application rather than this StartOS integration, also follow the
[`block/buzz` security policy](https://github.com/block/buzz/blob/main/SECURITY.md).
When ownership is uncertain, report it here first and the maintainers will
coordinate upstream.

## Response Targets

Maintainers aim to:

- acknowledge a report within three business days;
- provide an initial severity and ownership assessment within seven business
  days;
- send a status update at least every seven business days while remediation is
  active; and
- coordinate disclosure only after affected users have a practical mitigation
  or fixed package.

These are response targets, not guaranteed remediation deadlines. Severity,
upstream coordination, device validation, and signing-key impact determine the
release timeline. A suspected signer compromise is treated as an incident and
follows the
[signing-key runbook](docs/security/SIGNING-KEY-RUNBOOK.md).

## Disclosure Expectations

Keep report details private until the maintainers confirm a disclosure date.
The final advisory should credit the reporter when requested, describe affected
versions and mitigations, and avoid exposing credentials or operational
details that would create additional risk.
