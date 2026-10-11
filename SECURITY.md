# Security Policy

## Supported Versions

Security fixes are applied to the default branch (`main`) and included in the next release.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Earlier branches/tags | No |

## Reporting a Vulnerability

If you discover a security issue, do not create a public GitHub issue.

Use one of these private channels:

1. Preferred: [open a private GitHub Security Advisory](https://github.com/hiltonbrown/team-calendar/security/advisories/new) for this repository.
2. Alternative: contact the maintainers through your organisation's established private Team Calendar support channel.

If your organisation has a dedicated account manager or support contact for Team Calendar, use that private channel and mark the report as **Security: Confidential**.

## What to Include

Please include as much of the following as possible:

- Affected endpoint, package, or component
- Clear reproduction steps
- Expected and actual behaviour
- Impact assessment (data exposure, privilege escalation, tenant isolation risk, etc.)
- Proof of concept, logs, or screenshots (redacted)
- Any suggested remediation

## Response Targets

- Initial acknowledgement: within 2 business days
- Triage and severity assessment: within 5 business days
- Remediation timeline: provided after triage, based on severity and exploitability
- Coordinated disclosure: after a fix is available and affected users are notified

## Scope Highlights

This repository handles multi-tenant availability data and integrations. High-priority findings include:

- Cross-tenant data access or broken organisation scoping
- Authentication or authorisation bypass
- Unauthorised exposure of feed URLs, internal feed token material, or OAuth credentials
- Insecure handling of Xero tokens or raw payroll payloads
- Injection, SSRF, or deserialisation risks in API or job handlers

## Out of Scope

The following are generally out of scope unless chained with a meaningful impact:

- Low-risk UI-only issues without security impact
- Self-XSS requiring unrealistic social engineering
- Denial of service requiring unreasonable resources
- Reports without reproducible detail

## Safe Harbour

We support good-faith security research. If you act in good faith, avoid privacy violations and service disruption, and provide us reasonable time to remediate before public disclosure, we will not pursue action against your research.

## Disclosure Policy

Please do not publicly disclose vulnerabilities until:

1. A fix or mitigation is available, and
2. We confirm affected users have had reasonable time to apply it.

Thank you for helping keep Team Calendar and its customers safe.

## Database isolation

Tenant requests use `DATABASE_APP_URL` and the restricted `team_calendar_app` role. PostgreSQL RLS applies the transaction-local `app.clerk_org_id` to reads and writes, checks company ownership and denies access without context. Application filters retain both account and company scope. `tenantDatabase(clerkOrgId)` binds one query; `tenantTransaction` binds related queries and raw SQL without leaking context to pooled connections.

`DATABASE_URL` is the owner connection for migrations and narrowly allowlisted system operations. Canonical Xero authorisations and Stripe routing events are unavailable to the app role. Global schedulers and public feed-token discovery resolve the account, then hand off to tenant clients. The import-boundary test guards system-client usage.

Apply migrations with the owner, provision `team_calendar_app` with a unique login password, and configure `DATABASE_APP_URL` for each environment. Do not grant superuser, `BYPASSRLS`, elevated Neon membership or table ownership. Local/CI provisioning uses `packages/database/scripts/provision-local-app-role.ts` only with local URLs. Run `bun run preflight app` and `bun run preflight api` as deployment gates: it requires the restricted URL and checks the connected role in the database catalogue. Next configuration does not automatically perform that catalogue check. Preview branch URLs must use the provisioned restricted role.
