# LeaveSync Broad Codebase Audit

Date: 10 June 2026
Commit audited: df90cfe
Auditor: Claude Code

## 1. Launch-readiness verdict

Status: not-ready
Blockers: 1  High: 2  Medium: 7  Low: 6

The application code is in strong shape. Tenant isolation is enforced through a central `scopedQuery` helper and held up in every spot check; package boundaries hold; the OAuth flow validates the encryption key at startup, encrypts tokens with AES-256-GCM, and CSRF-protects `state`; both blockers from the previous finalisation audit relating to token refresh have been fixed (proactive refresh is now wired into all four sync handlers and the write adapter, and connecting Xero enqueues an initial people sync). All 9 test suites pass and the source tree is lint-clean. The single biggest risk to launch is unchanged: the Prisma migration history does not build the current schema. Eight tables, including `xero_oauth_sessions` which the OAuth connect flow writes to, have no `CREATE TABLE` in any migration, so a production `bun run migrate:deploy` against a fresh database fails partway through. A ready-to-adopt baseline repair exists at `tasks/slice-1-migration-repair/` but has not been adopted.

## 2. Findings

### 2.1 Tenant isolation

No findings. Evidence of compliance:

- Central helper `scopedQuery(clerkOrgId, organisationId)` defined at `packages/database/src/tenant-query.ts` and composed across 26 non-test files.
- Spot checks of direct `database.*` calls in apps all carry both IDs: `apps/app/app/(authenticated)/calendar/page.tsx:57` (spread of `scopedQuery`), `apps/app/app/(authenticated)/feeds/new/page.tsx:21` (explicit `clerk_org_id` and `organisation_id`), `apps/api/app/api/notifications/stream/route.ts:42-47` (organisation validated against `clerk_org_id` before the SSE stream opens).
- The Clerk webhook handler scopes its cross-session writes by the webhook's own `data.organization.id` (`apps/api/app/webhooks/auth/route.ts:219-227`), which is correct for that context.
- XeroTenant is resolved via `organisation_id` or the full scoped pair, never bare `clerk_org_id`: `packages/availability/src/sync/sync-monitor-service.ts:474-480`, `packages/xero/src/adapter/xero-write-adapter.ts`.
- All Inngest job payloads carry both `clerkOrgId` and `organisationId` (`packages/jobs/src/events.ts`).
- No custom workspace, membership, or role tables exist in `packages/database/prisma/schema.prisma`.

### 2.2 Package boundaries

| ID | Severity | Location (file:line) | Finding | Why it matters | Recommendation | Status |
|----|----------|----------------------|---------|----------------|----------------|--------|
| B2-01 | low | apps/app/app/(authenticated)/settings/integrations/xero/xero-client.tsx:7; .../xero/matches/matches-client.tsx:3; .../integrations/integrations-client.tsx:7 | Three client components import types from `@repo/database/generated/client` directly | Letter-of-the-law deviation from "all database access through packages/database". These are `import type` only, erased at compile time; no runtime Prisma client reaches the apps | Re-export the needed types from the `@repo/database` package root and import from there | flagged |

Otherwise clean: no `@repo/xero` or `xero-node` imports in `packages/availability` or `packages/feeds`; `ical-generator` confined to `packages/feeds` (the hit in `apps/web/src/data/changelog.ts:70` is changelog copy, not an import); no `@clerk/*` usage outside `packages/auth` and `packages/design-system`.

### 2.3 Forbidden packages

No findings. Zero imports of `@repo/{ai,cms,collaboration,feature-flags,internationalization,payments,rate-limit,security,storage,webhooks}` anywhere in `apps/` or `packages/`; none of those directories exist under `packages/`. `apps/studio` and `apps/storybook` are absent. `packages/analytics` is in use and is not on the forbidden list. `apps/api/app/webhooks/auth/route.ts` is a Clerk user webhook using svix and does not import `@repo/webhooks`.

### 2.4 Schema and migrations

| ID | Severity | Location (file:line) | Finding | Why it matters | Recommendation | Status |
|----|----------|----------------------|---------|----------------|----------------|--------|
| S4-01 | blocker | packages/database/prisma/migrations/ | Migration history does not build the schema. Eight tables declared in `schema.prisma` have no `CREATE TABLE` in any migration: `audit_events`, `failed_records`, `public_holidays`, `public_holiday_jurisdictions`, `public_holiday_assignments`, `sync_runs`, `xero_oauth_sessions`, `xero_person_matches`. Roughly 14 `xero_connections` columns and several `xero_tenants` columns are likewise absent. Proven against an empty PostgreSQL 16 database: deploy fails at `20260418005000_notifications_slice_09` with `relation "sync_runs" does not exist` (tasks/slice-1-migration-repair/README.md) | `bun run migrate:deploy`, the documented production command, fails on a fresh environment. The OAuth connect flow writes to `xero_oauth_sessions`, so onboarding cannot begin on a migrate-deployed database. The dev database was built with `db push`, which masks this | Adopt the drafted baseline squash at `tasks/slice-1-migration-repair/proposed-migrations/00000000000000_init`, or author forward migrations; verify `migrate deploy` against an empty database. Maintainer decision required (Section 5) | flagged |
| S4-02 | medium | CI configuration; packages/database/*.integration.test.ts | CI has no migrate step; integration suites (uniqueness invariants, partial indexes) assume a schema-direct `db push` database | The partial unique indexes and uniqueness assertions are never exercised against the migration-built schema, so S4-01 regressions go undetected | Add a `migrate reset && migrate deploy` step to CI once S4-01 is resolved | flagged |

Locked decisions are all correctly reflected in `schema.prisma`: `LeaveBalance.xero_tenant_id` nullable (`schema.prisma:652`) with a partial unique index for manual balances (`migrations/20260605001000_leave_balances_nullable_tenant`); `clerk_org_id` on `feed_tokens` (`schema.prisma:843`), `feed_scopes` (`schema.prisma:825`), and `availability_publications` (`schema.prisma:624`); the NULL-distinct unique on `availability_records` documented with its partial-index guard (`schema.prisma:603-611`, `migrations/20260606000000_manual_availability_partial_unique`); the `availability_failed_action` enum present (`schema.prisma:150-156`). Migrations are timestamp-ordered with no evidence of hand-editing; the defect is omission, not tampering.

### 2.5 Xero sync and write-back

| ID | Severity | Location (file:line) | Finding | Why it matters | Recommendation | Status |
|----|----------|----------------------|---------|----------------|----------------|--------|
| X5-01 | medium | packages/xero/src/rate-limit; BLOCKED.md (item D) | The 5,000/day per-org rate cap is enforced in process memory only; on Vercel serverless each instance has its own counter | The daily ceiling cannot be guaranteed across instances. Practical exposure is bounded by single-flight sync scheduling, but it is not exact | Maintainer decision: add a durable KV-backed daily counter, or accept the per-instance cap (Section 5) | flagged |
| X5-02 | low | packages/xero/src/crypto/tokens.ts (decrypt fallback) | Decrypt returns the input as plaintext when `iv`/`authTag` are absent (legacy-row fallback) | Acceptable for migration of pre-encryption rows, but it weakens the "never plaintext" guarantee if it survives indefinitely | Remove the fallback once all rows carry IV and auth tag | flagged |

Otherwise compliant:

- All six required jobs exist in `packages/jobs/src/handlers/`: `sync-xero-people`, `sync-xero-leave-records`, `sync-xero-leave-balances`, `reconcile-feed-publications`, `rebuild-feed-cache`, `reconcile-xero-approval-state`.
- Proactive token refresh (the previous audit's blocker B2) is fixed: `ensureFreshXeroConnection` (`packages/xero/src/oauth/service.ts:512`) is called at the start of every sync handler (`sync-xero-people.ts:445`, `sync-xero-leave-records.ts:350`, `sync-xero-leave-balances.ts:431`, `reconcile-xero-approval-state.ts:192`) and before every outbound write (`packages/xero/src/adapter/xero-write-adapter.ts:58`).
- Inbound is pull-first via scheduled Inngest jobs; outbound writes are synchronous through the write adapter with no background queue.
- Record-level failures land in the `failed_records` dead-letter table without failing the run; raw payloads retained in `source_payload_json` and `xero_write_error_raw`.

### 2.6 Xero onboarding and OAuth

No new findings. The full trace is in Section 3. Highlights:

- `XERO_TOKEN_ENCRYPTION_KEY` is validated at module load (`packages/xero/keys.ts:6-23` checks presence, base64 form, and exact 32-byte length; `keys.ts:68` invokes validation outside tests), so a malformed key prevents boot.
- Tokens are AES-256-GCM with stored IV and auth tag (`packages/xero/src/crypto/tokens.ts`); only encrypted values are written.
- OAuth `state` is HMAC-SHA256 signed and timing-safe verified; sessions persist to `xero_oauth_sessions` bound to `clerk_org_id` and `organisation_id`.
- Exactly one XeroConnection (unique `organisation_id`) and one XeroTenant (unique `xero_connection_id`) are upserted in a transaction.
- The previous audit's onboarding gap is fixed: after tenant selection the connect action enqueues an initial people sync, best effort (`apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:94`).

### 2.7 Screens

| ID | Severity | Location (file:line) | Finding | Why it matters | Recommendation | Status |
|----|----------|----------------------|---------|----------------|----------------|--------|
| S7-01 | high | no route under apps/app/app/(authenticated)/analytics/ | S-15 (Leave reports) and S-16 (Out-of-office analytics) have no UI. Services exist: `packages/availability/src/analytics/leave-reports-service.ts`, `.../out-of-office-service.ts` | Catalogued launch screens with no surface; the sidebar spec includes an Analytics section | Maintainer scope decision: build on the existing services or defer and omit nav entries (Section 5) | flagged |
| S7-02 | high | no apps/app route for /settings/audit-log or /sync/[runId] | S-24 (Audit log viewer) and S-26 (Sync run detail) are not built. `audit_events` and `failed_records` are written but have no viewer | Admin audit visibility is a stated security baseline item ("Audit logs for all admin actions"); sync drill-down is catalogued | Maintainer scope decision (Section 5) | flagged |
| S7-03 | medium | apps/app/app/(authenticated)/feeds/ vs .../settings/feeds/; .../public-holidays/ vs .../settings/holidays/ | Two duplicate route pairs render the same underlying data through different components and role guards | Two surfaces per concept drift apart over time; the catalogue describes S-13/S-21 and S-11/S-23 as member-view vs admin-config, so this may be intentional | Maintainer decision: confirm intentional dual surfaces or consolidate (Section 5) | resolved: confirmed intentional. Both pairs are member-view (S-13 `/feeds`, S-11 `/public-holidays`, viewer read + admin writes) vs admin-config (S-21 `/settings/feeds`, S-23 `/settings/holidays`, admin/owner). Rationale documented in route comments on all four pages; settings nav "Public Holidays" renamed to "Holidays" to distinguish from the member-view label. Role guards verified correct for each surface. |
| S7-04 | medium | apps/app/app/(authenticated)/settings/billing/page.tsx:24 | S-22 Billing enforces `org:admin`; the catalogue specifies Owner only. The page computes `isOwner` (line 36) for UI but admits admins | Admins can view billing detail the catalogue reserves for owners | Tighten `requirePageRole` to owner, or confirm admin access is acceptable (Section 5) | resolved: tightened to `requirePageRole("org:owner")`. Non-owner admins are denied; the now-unreachable admin/locked branch was removed and the page renders the owner billing view directly. Catalogue S-22 annotated with the enforced rule; tests updated. |

Route-to-catalogue map (S-01 to S-26): all other screens are present at their catalogued routes with role guards via `requirePageRole`. S-02 is correctly Clerk-hosted with no custom route. `/feed/[feedId]` (retired variant) correctly does not exist; `/feeds/[feedId]` with the intercepting-route modal does. Intercepting-route modals exist for plans edit, person profile, feed detail, and new public holiday. `/availability/*` and `/leave-balances` are legacy redirects into `/plans` and `/people`, correctly deprecated. An explicit `not-found.tsx` exists at `apps/app/app/(authenticated)/not-found.tsx`.

Uncatalogued routes (flagged, not designed, per the catalogue's instruction): `/sign-up` exists (Clerk catch-all at `apps/app/app/(unauthenticated)/sign-up/[[...sign-up]]`); `/settings` exists and redirects to `/settings/general`; `/settings/members` exists (Clerk organisation members UI). `/search`, `/settings/danger`, `/support`, and `/webhooks` are not implemented in `apps/app` (the API ships `/api/support/github-issue`, with no app screen driving it). Sensible extra onboarding routes exist: `/setup`, `/settings/getting-started`, `/settings/integrations/xero/connect`, `/settings/integrations/xero/matches`.

### 2.8 Design tokens

| ID | Severity | Location (file:line) | Finding | Why it matters | Recommendation | Status |
|----|----------|----------------------|---------|----------------|----------------|--------|
| D8-01 | medium | apps/app/components/approvals/approve-confirmation-modal.tsx:129 | Hardcoded `bg-[#336A3B]` and `hover:bg-[#2b5a32]` instead of the primary token | Violates DESIGN.md hard rule 8 (CSS custom properties, never hardcoded hex); dark mode will not invert | Replace with the semantic primary classes used elsewhere; verify the app theme maps primary to `#336A3B` first | flagged |
| D8-02 | medium | apps/app/components/calendar/calendar-event-chip.tsx:11-18 | Calendar chips colour by record category (emerald for Xero leave, sky for local) rather than provenance (sage for Xero-synced, purple accent for manual) per DESIGN.md and catalogue S-07. A code comment declares the type-colour scheme deliberate, contradicting the design docs | Provenance is a first-class visual concept in v4.1; the current scheme reads as the retired v3 per-type palette | Switch chips to the sage/purple provenance tokens, or record an explicit design decision overriding DESIGN.md | flagged |
| D8-03 | low | apps/app/app/(authenticated)/components/sidebar.tsx:102,110,118 | Hardcoded SVG fills (`#57624F`, `#CAE8BC`, `#6DA671`) in the logo mark | Borderline: brand artwork is commonly fixed-colour, but tokens would track dark mode | Acceptable as brand artwork; tokenise if the logo should adapt to theme | flagged |
| D8-04 | low | apps/app/app/(authenticated)/components/recurrence-fields.tsx:342; apps/app/app/(authenticated)/public-holidays/holidays/new/new-holiday-modal.tsx:130 | `rounded-md` (6px) used; DESIGN.md permits only 16px and 12px radii. The holiday modal row also uses a `border` for separation | Two small deviations from the radius and no-border rules | Change to `rounded-xl`; replace the border with a tonal shift | flagged |
| D8-05 | low | packages/auth (Clerk provider appearance) | Clerk `appearance` mapping does not carry the full LeaveSync token set for the Clerk-hosted S-02 surface | Sign-in and organisation selection should read as one continuous branded surface per catalogue S-02 | Complete the token-to-Clerk-variable mapping | flagged |

Confirmed compliant: amber is correctly used for pending and `xero_sync_failed` states (`calendar-event-chip.tsx:40-41` failed treatment; approvals badges in `leave-approvals-client.tsx`); frost and `backdrop-blur` appear only on permitted elevated surfaces. Note: the previous audit flagged the sticky header blur (`apps/app/app/(authenticated)/components/header.tsx:28`) as a violation; DESIGN.md explicitly permits frost on sticky app chrome, so that finding is withdrawn.

### 2.9 TypeScript and style

No findings. Evidence:

- No `any` in source (the only hits are generated `.next/types` files and one test mock).
- The ~143 `as` casts sampled are branded-ID conversions (`as ClerkOrgId`, `as OrganisationId`) and narrow union assignments, consistent with the convention in `packages/core`.
- Default exports exist only where Next.js requires them (page, layout, error, loading, not-found files) and in the two React Email templates; none in `packages/*/src`.
- No nested barrel files; all `index.ts` files sit at package roots.
- No `console.log` in production code (the three hits are Sentry configuration comments in `packages/observability`).
- Zod validates external input in API routes (`apps/api/app/api/availability/route.ts`, `.../notifications/stream/route.ts`, webhook payloads) and service inputs; services return `Result`.
- Route protection composed in `apps/app/proxy.ts`; no `middleware.ts` exists.
- Optional env vars follow the absent-not-empty rule; `packages/feeds/keys.ts` additionally enforces both-or-neither for the KV pair at startup.
- Source tree is Biome/Ultracite clean (the single `bun run check` error was a formatting nit in the git-ignored `.claude/settings.local.json`, fixed locally, nothing tracked changed).

### 2.10 Tests

| ID | Severity | Location (file:line) | Finding | Why it matters | Recommendation | Status |
|----|----------|----------------------|---------|----------------|----------------|--------|
| T10-01 | medium | CI configuration | Integration suites that assert uniqueness invariants and the manual-record duplicate guard run against a `db push` database, not a migrate-deployed one (same root cause as S4-02) | The guards the spec demands tests for are not proven against the schema production would actually have | Fold into the S4-01/S4-02 remediation: CI migrate step, then run the integration suites against it | flagged |

Coverage is otherwise present and green (all 9 turbo test tasks pass this run): UID and SEQUENCE (`packages/feeds/src/projection/feed-projection.test.ts`, `packages/feeds/src/publication/publication-service.test.ts`); privacy transforms and feed token validation (`packages/feeds/src/render/render-feed.test.ts`); approval transitions and decline-reason enforcement (`packages/availability/src/approvals/approval-service.test.ts`); uniqueness invariants and the manual duplicate guard (`packages/database/availability_records.integration.test.ts`, `leave_balances.integration.test.ts`); `clerk_org_id` isolation (`packages/jobs/src/events.test.ts` and repository tests); Xero mappers are fixture-based.

### 2.11 Language

| ID | Severity | Location (file:line) | Finding | Why it matters | Recommendation | Status |
|----|----------|----------------------|---------|----------------|----------------|--------|
| L11-01 | low | AGENTS.md, CLAUDE.md, GEMINI.md, tasks/finalisation-audit.md | Em dashes remain in agent-instruction and internal audit files | Zero shippable impact; these are governance and template material, flagged per repo convention rather than silently edited | Optional docs-hygiene pass if desired | flagged |

Shippable surfaces are clean: zero em dashes in `apps/*` or `packages/*` code, copy, CSS, or JSON. No American spellings in UI copy (the `behavior: "smooth"` hit at `apps/app/app/(authenticated)/notifications/notifications-client.tsx:157` is a DOM API argument, not copy).

## 3. Xero onboarding trace

New AU user, sign-in to a connected, syncing state:

| Step | Check | Result | Evidence |
|---|---|---|---|
| 1 | Sign in via Clerk; personal accounts disabled; org membership required | PASS | `apps/app/app/(unauthenticated)/sign-in/[[...sign-in]]`; org context enforced in `apps/app/proxy.ts` |
| 2 | Onboarding does not hard-block on Xero; records persist without a connection | PASS | `Organisation.xero_connection` is optional (`schema.prisma:286`); onboarding treats Xero as a non-blocking next task (`apps/app/lib/server/load-onboarding-state.ts:67`) |
| 3 | OAuth flow HTTP in `apps/api`, logic in `packages/xero` | PASS | `apps/api/app/api/xero/oauth/{start,callback}/route.ts` delegate to `packages/xero/src/oauth/service.ts` |
| 4 | `XERO_TOKEN_ENCRYPTION_KEY` validated at startup; absent or malformed blocks boot | PASS | `packages/xero/keys.ts:6-23` (presence, base64, 32-byte checks), `keys.ts:68` (invoked at module load outside tests) |
| 5 | OAuth `state` generated, persisted, CSRF-validated | PASS, with a caveat | HMAC-SHA256 signed, timing-safe verified; session persisted to `xero_oauth_sessions`. Caveat: on a migrate-deployed database this table does not exist (S4-01), so this step fails on a fresh production environment |
| 6 | Callback binds to the correct Organisation and `clerk_org_id`; one XeroConnection and one XeroTenant created; AU region inferred | PASS | Transactional upserts on unique `organisation_id` and `xero_connection_id`; `payroll_region` inferred from Xero Organisation CountryCode (`packages/xero/src/oauth/service.ts`) |
| 7 | Tokens AES-256-GCM at rest, never plaintext | PASS | `packages/xero/src/crypto/tokens.ts` (IV and auth tag stored; only encrypted values written). Legacy decrypt fallback noted as X5-02 |
| 8 | First sync starts without manual action | PASS | Initial people sync enqueued after tenant selection (`apps/app/.../settings/integrations/xero/connect/_actions.ts:94`) |
| 9 | Sync sustains past token expiry (about 30 minutes) | PASS | `ensureFreshXeroConnection` called at the start of every sync handler and outbound write (Section 2.5); a missing access token is treated as needing refresh (commit 7a11608) |

Verdict: the trace passes end to end on a `db push` database. On a fresh migrate-deployed database it fails at step 5 because `xero_oauth_sessions` is never created (S4-01). That is the named failing step and the launch blocker.

## 4. Recommendations and remediation plan

### Slice 1: Adopt the migration baseline repair
- Severity addressed: blocker (S4-01), medium (S4-02, T10-01)
- Scope: adopt the drafted squash baseline from `tasks/slice-1-migration-repair/proposed-migrations/` into `packages/database/prisma/migrations` per its README, or author forward migrations; add a `migrate reset && migrate deploy` step to CI; run the integration suites against the migrate-deployed schema
- Affected packages and files: `packages/database/prisma/migrations/*`, CI workflow
- Acceptance criteria:
  - `bun run migrate:deploy` succeeds against an empty PostgreSQL database
  - A XeroOAuthSession and XeroConnection can be created via the Prisma client on that database
  - CI runs the integration suites against a migrate-deployed database
- Estimated effort: medium

### Slice 2: Design-system conformance
- Severity addressed: medium (D8-01, D8-02), low (D8-03, D8-04, D8-05)
- Scope: replace the hardcoded hex in the approve modal with primary tokens; switch calendar chips to sage/purple provenance tokens (after Decision 4); fix the two `rounded-md` instances; complete the Clerk `appearance` token mapping
- Affected packages and files: `apps/app/components/approvals/approve-confirmation-modal.tsx`, `apps/app/components/calendar/calendar-event-chip.tsx`, `apps/app/app/(authenticated)/components/recurrence-fields.tsx`, `apps/app/app/(authenticated)/public-holidays/holidays/new/new-holiday-modal.tsx`, `packages/auth`
- Acceptance criteria:
  - No hardcoded hex outside the logo artwork
  - Provenance visible via sage/purple on calendar chips, or a recorded decision to the contrary
  - No 4px to 8px radii remain
- Estimated effort: small

### Slice 3: Scope-cut screens (gated on Decisions 2 and 3)
- Severity addressed: high (S7-01, S7-02)
- Scope: if in the launch cut, build S-15/S-16 on the existing analytics services, S-24 on `audit_events`, and S-26 on `sync_runs`/`failed_records`; otherwise remove their nav entries and defer explicitly
- Affected packages and files: `apps/app/app/(authenticated)/analytics/*`, `.../settings/audit-log/*`, `.../sync/[runId]/*`, `packages/availability/src/analytics/*`
- Acceptance criteria: either the screens exist with role guards and catalogue-compliant treatment, or they are deferred and not linked from navigation
- Estimated effort: large (if built); small (if deferred)

### Slice 4: Route and role tidy-up (gated on Decisions 1 and 5)
- Severity addressed: medium (S7-03, S7-04)
- Scope: consolidate or formally bless the `/feeds` vs `/settings/feeds` and `/public-holidays` vs `/settings/holidays` pairs; align S-22 billing access with the catalogue
- Affected packages and files: `apps/app/app/(authenticated)/{feeds,settings/feeds,public-holidays,settings/holidays,settings/billing}/*`
- Acceptance criteria: one canonical surface per concept or documented rationale for both; billing role matches the agreed access level
- Estimated effort: small

### Slice 5: Post-launch hardening
- Severity addressed: low and medium residuals (X5-01, X5-02, B2-01, L11-01)
- Scope: KV-backed durable daily rate counter (per Decision 6); remove the legacy decrypt fallback once all token rows are encrypted; re-export Prisma types from the `@repo/database` root; optional docs-hygiene pass for em dashes in governance files
- Affected packages and files: `packages/xero/src/rate-limit/*`, `packages/xero/src/crypto/tokens.ts`, `packages/database/index.ts`, governance docs
- Acceptance criteria: per item; none block launch
- Estimated effort: medium

## 5. Decisions required from the maintainer

1. **Route-tree duplication (S7-03).** `/feeds` + `/settings/feeds` and `/public-holidays` + `/settings/holidays` each render the same data through different components and role guards. Options: (a) keep both as intentional member-view vs admin-config surfaces and document it, (b) consolidate to one route per concept with role-conditional controls. Recommendation: (a), since the catalogue itself separates S-13/S-21 and S-11/S-23, but record the rationale so the pairs stay in sync.
2. **Launch scope for analytics (S-15, S-16).** Services exist; UI does not. Options: build for launch, or defer and remove the Analytics nav section. Recommendation: defer; the core leave loop does not depend on analytics, and PRODUCT.md's build order places it at step 15.
3. **Launch scope for audit log viewer (S-24) and sync run detail (S-26).** Events and failed records are written; viewers are absent. Options: build both, build S-24 only, or defer both. Recommendation: build S-24 (audit visibility is a stated security baseline item) and defer S-26 (the `/sync` list already surfaces run health).
4. **Calendar provenance colours (D8-02).** The chip code deliberately colours by record category, contradicting DESIGN.md's sage/purple provenance rule. Options: conform to DESIGN.md, or amend DESIGN.md to bless the category scheme. Recommendation: conform to DESIGN.md; provenance is a v4.1 first-class concept and the current scheme resembles the retired v3 palette.
5. **S-22 billing role.** Catalogue says Owner only; code enforces `org:admin`. Options: tighten to owner, or amend the catalogue. Recommendation: tighten to owner; it is a one-line change and matches the catalogue.
6. **Migration repair adoption (S4-01).** The baseline squash is drafted and proven. Options: adopt the squash (fresh environments resolve cleanly; existing environments need `migrate resolve --applied` marking), or author incremental forward migrations. Recommendation: adopt the squash per the slice-1 README; there is no production deployment yet to be disrupted. This is the launch gate.
7. **Durable daily rate cap (X5-01, BLOCKED.md item D).** Accept the in-process per-instance 5,000/day cap given single-flight sync scheduling, or add a KV-backed counter to `packages/xero`. Recommendation: accept for launch, schedule the KV counter post-launch.

## 6. Fixes applied this run

No commits were made. Every issue surfaced was either already fixed in prior commits, architectural (flagged per the fix-versus-flag rules), or outside the unambiguous-fix list. Specifically:

- The fix-list categories all came up empty: no dead forbidden-package imports, no missing `clerk_org_id` filters, no stale workspace wording, no em dashes or American spellings in shippable surfaces.
- `bun run fix` corrected one formatting nit in `.claude/settings.local.json`, which is git-ignored; nothing tracked changed, so there was nothing to commit. The source tree was already lint-clean.
- The pre-existing uncommitted change to `apps/app/next-env.d.ts` (generated file) was left untouched.

## 7. Appendix: scan commands

```bash
# Schema vs migration drift
grep -rhoP 'CREATE TABLE (IF NOT EXISTS )?"\K[^"]+' packages/database/prisma/migrations/ | sort -u > /tmp/mig_tables.txt
grep -oP '@@map\("\K[^"]+' packages/database/prisma/schema.prisma | sort -u > /tmp/schema_tables.txt
comm -13 /tmp/mig_tables.txt /tmp/schema_tables.txt

# Forbidden packages and boundaries
grep -rnE "@repo/(ai|cms|collaboration|feature-flags|internationalization|payments|rate-limit|security|storage|webhooks)\b" apps packages --include='*.ts' --include='*.tsx' --include='*.json' -l
grep -rnE "from ['\"]@prisma/client|from ['\"].*database/generated" apps --include='*.ts' --include='*.tsx'
grep -rn "@repo/xero\|xero-node" packages/availability/src packages/feeds/src --include='*.ts'
grep -rln "ical-generator" apps packages --include='*.ts' --include='*.tsx' | grep -v '^packages/feeds'
grep -rln "@clerk/" apps packages --include='*.ts' --include='*.tsx' | grep -v '^packages/auth' | grep -v '^packages/design-system'

# Tenant isolation
grep -rln "scopedQuery" apps packages --include='*.ts' | grep -v test | wc -l
grep -rnE "\bdatabase\.(person|feed|availabilityRecord|leaveBalance|notification|team|location|organisation|xero)[A-Za-z]*\.(findMany|updateMany|deleteMany|findFirst)\(" apps --include='*.ts' --include='*.tsx'

# Sync, refresh, jobs
grep -rn "ensureFresh\|refreshXero" packages/jobs/src packages/xero/src --include='*.ts' | grep -v test
grep -rhoP "(sync-xero-people|sync-xero-leave-records|sync-xero-leave-balances|reconcile-feed-publications|rebuild-feed-cache|reconcile-xero-approval-state)" packages/jobs/src -r | sort | uniq -c
grep -rn "dispatchManualSync" apps/app/app --include='*.ts' | grep -v test

# Design tokens
grep -rnE '#[0-9a-fA-F]{6}\b' apps/app/components apps/app/app --include='*.tsx' --include='*.ts' | grep -v test
grep -rn "backdrop-blur" apps/app --include='*.tsx'
grep -rnE 'rounded-(sm|md)\b' apps/app --include='*.tsx'

# TypeScript and style
grep -rnE ':\s*any\b|as any\b|<any>' apps packages --include='*.ts' --include='*.tsx' | grep -v '.test.' | grep -v generated
grep -rln "export default" packages/*/src --include='*.ts' --include='*.tsx'
find packages/*/src -mindepth 2 -name "index.ts"
grep -rn "console\.log" apps packages --include='*.ts' --include='*.tsx' | grep -v '.test.' | grep -v generated

# Language
grep -rln $'—' apps packages --include='*.ts' --include='*.tsx' --include='*.css' --include='*.json' --include='*.mdx'
grep -rniE '\b(organize|analyze|prioritize|customize)\b' apps/app/app apps/app/components apps/web/src --include='*.tsx'
grep -rni "workspace" apps/app/app apps/app/components apps/web/src packages/*/src --include='*.ts' --include='*.tsx' | grep -vi "google workspace"

# Routes
find "apps/app/app" -name "page.tsx" | sed 's|apps/app/app||;s|/page.tsx||' | sort

# Verification
bun run test
bun run check
```
