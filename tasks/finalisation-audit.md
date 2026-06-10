# LeaveSync Finalisation Audit

AU-only, English-only, core-loop launch readiness audit. Evidence is cited as
`file:line`. Scope: audit first, fix only unambiguous safe items, flag everything
architectural, scope, or product related.

References read: `PRODUCT.md`, `CLAUDE.md`, `AGENTS.md`, `DESIGN.md`, `.impeccable.md`,
`ScreenCatalogue-v4.1.md`, `packages/database/prisma/schema.prisma`, `BLOCKED.md`.

---

## 1. Launch-readiness verdict

**NOT READY** — 2 blockers.

The application code is in strong shape: tenant isolation is enforced through a central
helper, package boundaries hold, the OAuth flow is well structured with CSRF protection
and AES-256-GCM token encryption, and lint/style/terminology are clean. Two issues stop a
new AU customer from reaching a *sustained* connected, syncing state:

| # | Blocker | Severity | Why it blocks launch |
|---|---|---|---|
| B1 | Migration history does not build the current schema | blocker | A production `bun run migrate:deploy` fails. Eight tables (including `xero_oauth_sessions`, which the OAuth start flow writes to) and ~14 `xero_connections` columns are declared in `schema.prisma` but never created by any migration. Onboarding cannot even begin on a migrate-deployed database. |
| B2 | No proactive Xero token refresh before sync | blocker | Xero access tokens last 30 minutes. No scheduled job refreshes them; `refreshXeroOAuthConnection` is only wired to a manual UI button. Inbound sync silently stops ~30 minutes after connect until an admin manually refreshes. Violates a stated non-negotiable. |

Everything else is fixable within the remediation plan or is a scope/product decision for
the maintainer (Section 6).

---

## 2. Findings by workstream

Severity key: **blocker** / **high** / **medium** / **low**. Status: **auto-fixed** in
this run, or **flagged**.

### Workstream 1 — Repository-wide audit

#### W1-01 Forbidden packages — CLEAN (low, flagged: none)
No imports or `package.json` dependencies on any of `ai`, `cms`, `collaboration`,
`feature-flags`, `internationalization`, `payments`, `rate-limit`, `security`, `storage`,
`webhooks`. None of those directories exist under `packages/`. `apps/studio` and
`apps/storybook` are absent. The `packages/analytics` package exists and is used
(`apps/api/app/webhooks/auth/route.ts:1`) — it is **not** on the forbidden list, so this is
compliant.

#### W1-02 `/webhooks` is not a forbidden-package dependency — CLEAN
`apps/api/app/webhooks/auth/route.ts` is a Clerk user webhook using `svix`
(`route.ts:15`) and `@repo/analytics` (`route.ts:1`). It does **not** import `@repo/webhooks`.
There is no `/webhooks` screen under `apps/app`. The catalogue's "/webhooks likely relies on
a forbidden package" concern does not hold.

#### W1-03 Package boundaries — CLEAN
- No direct Prisma-client imports in `apps/*`; the three hits are `import type` only
  (e.g. `apps/app/.../settings/integrations/integrations-client.tsx:7`).
- No `@repo/xero` imports in `packages/availability` or `packages/feeds`.
- `ical-generator` is confined to `packages/feeds/src/render/render-feed.ts:7`.
- No `@clerk/nextjs` usage outside `packages/auth` / `packages/design-system`.

#### W1-04 Tenant isolation — STRONG, two defence-in-depth gaps (one auto-fixed)
A central helper `scopedQuery(clerkOrgId, organisationId)` at
`packages/database/src/tenant-query.ts` injects both IDs and is used pervasively. All
Inngest job event payloads carry both `clerkOrgId` and `organisationId`
(`packages/jobs/src/events.ts`). The SSE stream
(`apps/api/app/api/notifications/stream/route.ts`) scopes by user and org and keys the
broker by `userId:organisationId`. XeroTenant is always resolved via the `organisation_id`
FK, never a bare `clerk_org_id` lookup (e.g.
`packages/xero/src/adapter/xero-write-adapter.ts:29`).

- **W1-04a (medium, auto-fixed):** `packages/feeds/src/render/render-feed.ts:139` and `:153`
  updated `feeds` and `feed_tokens` filtering only by unique `id`, with no
  `clerk_org_id`/`organisation_id`. Reached via a unique `token_hash` lookup, so not an
  active leak, but it deviates from the "every tenant-data query filters by clerk_org_id"
  rule. **Fixed** in commit `fix(feeds): scope feed render writes ...` by adding both IDs to
  the `where` clauses (Prisma extended-where alongside the unique id; behaviour unchanged,
  tests green).

No service function was found that takes `organisation_id` without `clerk_org_id`. No job
payload missing either ID. No genuine cross-tenant read path.

#### W1-05 Terminology — CLEAN
- "workspace": 0 stale tenancy uses remain. All ~37 hits are legitimate (bun/turbo
  `workspaces` config, Google Workspace product name in
  `apps/web/.../calendar-integration-section.tsx:44`, and the resolved-decision notes in
  `BLOCKED.md:71`). The prior rename to "Account" / "Payroll entity" is complete.
- AvailabilityRecord naming (**low, flagged**): the UI calls the object "Plans"
  (`/plans` route, headings), "leave request" in approvals
  (`apps/app/.../leave-approvals/page.tsx:22`), and "availability record" in error copy
  (`apps/app/app/actions/availability/manual.ts:49`). "Plans" is the deliberate
  user-facing name per the catalogue; the variance is cosmetic, not a defect. Optional
  copy-alignment, not a launch blocker.

#### W1-06 Route trees — duplicates flagged (medium, flagged)
- `/availability`, `/availability/new`, `/availability/[recordId]/edit` and
  `/leave-balances` are legacy redirects into `/plans` and `/people` respectively
  (`apps/app/.../availability/page.tsx`, `.../leave-balances/page.tsx:13`). Correctly
  deprecated, not competing trees.
- `/feed/[feedId]` (singular) does **not** exist; only `/feeds/[feedId]` (plural). Compliant
  with the resolved S-14 decision.
- **Duplicate pairs to resolve (architectural — flagged, not changed):**
  `/feeds` vs `/settings/feeds`, and `/public-holidays` vs `/settings/holidays`. Each pair
  renders the same underlying data through different components with different role guards
  (member view vs admin defaults). May be intentional; needs a maintainer call (Section 6).
- Intercepting-route modals present and correct for plans edit
  (`/plans/@modal/(.)[planId]/edit`), people (`/people/@modal/(.)[personId]`), and feeds
  (`/feeds/@modal/(.)[feedId]`).

#### W1-07 Schema & migration state — BLOCKER (B1, flagged; do not auto-apply)
`schema.prisma` matches the locked decisions (LeaveBalance.xero_tenant_id nullable;
`clerk_org_id` on `feed_tokens`/`feed_scopes`/`availability_publications`; NULL-distinct
unique on `availability_records (organisation_id, source_type, source_remote_id)` with the
documented partial-unique guard; `availability_failed_action` enum present and used). **But
the migration history does not build that schema.**

Tables declared in `schema.prisma` with **no `CREATE TABLE` in any migration**:
`audit_events`, `failed_records`, `public_holidays`, `public_holiday_jurisdictions`,
`public_holiday_assignments`, `sync_runs`, `xero_oauth_sessions`, `xero_person_matches`.
Evidence: `comm` of migration `CREATE TABLE` names vs schema `@@map` names; e.g.
`20260418005000_notifications_slice_09/migration.sql:60` does `SELECT ... FROM "sync_runs"`
and `20260418006000_sync_health_slice_10/migration.sql:65` does `ALTER TABLE "sync_runs"`,
yet no migration creates `sync_runs`.

`xero_connections` columns declared but never created by migration (initial
`20260414002000` creates only 8 columns): `status`, `access_token_iv`,
`access_token_auth_tag`, `refresh_token_iv`, `refresh_token_auth_tag`, `token_key_version`,
`token_encrypted_at`, `last_connected_at`, `last_disconnected_at`, `last_error_code`,
`last_error_message`, `stale_since`, `disconnected_at`, `disconnected_by_user_id`. Only
`revoked_at` (`20260418000000`) and `last_refreshed_at` (`20260418006000`) were backfilled.
`xero_tenants` is likewise missing its newer status/error columns.

The shared dev/integration database has clearly been built with `db push` (schema-direct),
which masks this; `BLOCKED.md` items A and B acknowledge the drift and that CI has no
migrate step. **This is broader than BLOCKED.md item A** (which only mentions
`xero_connections` columns): entire tables, including the OAuth-session table the connect
flow writes to, are absent from the migration history. A clean `migrate:deploy` (the
documented production command) fails partway through.

Recommended fix (do not apply without confirmation, Section 5/6): regenerate a single
squashed baseline migration from the current schema for a fresh environment, OR author the
missing forward migrations and verify `migrate deploy` against an empty database. The
existing migrations must not be hand-edited.

#### W1-08 TypeScript & style — CLEAN
`any`: one occurrence in a test mock (`packages/jobs/.../sync-xero-people.integration.test.ts:16`).
No `as any`. No unjustified `as` casts (branded-ID conversions and `as const` Result
literals are self-evident). Default exports only in the two React Email templates, each
justified by a comment. No nested barrel files; all `index.ts` are package roots. Zod and
the Result pattern are used in service layers.

#### W1-09 Platform rules — CLEAN
Route protection via `apps/app/proxy.ts:1` (`authMiddleware()`); no `middleware.ts`.
`serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"]` at
`packages/next-config/index.ts:5`. Env Zod schemas in `packages/*/keys.ts` use `.optional()`
without empty-string defaults. (Note: an earlier sub-scan flagged Prisma `@default("")` on
encrypted-token columns and a Zod `reason: ...default("")` in
`packages/availability/src/approvals/approval-service.ts:168` — neither is an *env var*, so
the empty-string-env-var rule does not apply; both are intentional.)

#### W1-10 Test coverage — GOOD
112 co-located test files. Verified coverage for: UID/SEQUENCE
(`packages/feeds/src/projection/feed-projection.test.ts`,
`packages/feeds/src/publication/publication-service.test.ts`); privacy transforms; feed
token validation (`packages/feeds/src/render/render-feed.test.ts`); approval state and
decline-reason (`packages/availability/src/approvals/approval-service.test.ts`,
`.../plans/submit-service.test.ts`); uniqueness invariants
(`packages/database/availability_records.integration.test.ts`,
`leave_balances.integration.test.ts`); `clerk_org_id` isolation
(`packages/jobs/src/events.test.ts`, `packages/database/src/.../repository.test.ts`).
Gap (**medium, flagged**): integration suites assume a `migrate deploy`-built DB but CI has
no migrate step (B1 / `BLOCKED.md` B), so the uniqueness/partial-index assertions are not
exercised in CI.

#### W1-11 Australian English & em dashes — CLEAN in shippable surfaces (low, flagged)
Zero em dashes in `apps/*`/`packages/*` code, copy, CSS, or JSON. Em dashes remain only in
governance/vendored docs: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `skills/next-forge/*`.
**Flagged, not auto-fixed:** editing the agent-instruction files and vendored next-forge
templates carries risk and zero launch value; recommend a separate docs-hygiene pass if
desired. No American spellings found in UI copy ("Help centre" is correct); Clerk
`organization*` API identifiers and CSS `color`/`behavior` are not violations.

### Workstream 3 findings are folded into Section 4 (Xero trace).

---

## 3. Screen catalogue status table

S-02 is Clerk-hosted (no custom route, confirmed). Roles via `requirePageRole(...)` in each
`page.tsx` unless noted. "Expected route" reflects the implemented convention; where the
catalogue implies a screen with no built route, it is marked MISSING.

| ID | Screen | Route found | Roles | Token compliance | Modal | Notable gaps |
|---|---|---|---|---|---|---|
| S-01 | Sign in | `/sign-in` | n/a (unauth) | ok | — | Minimal Clerk theming |
| S-02 | Org selection | Clerk-hosted (no route) | n/a | n/a | — | Clerk `appearance` lacks full colour-token mapping (`packages/auth/provider.tsx`) |
| S-03 | Dashboard | `/(authenticated)` | viewer | ok | — | — |
| S-04 | Plans | `/plans` | viewer | ok | — | — |
| S-05 | New/edit plan | `/plans/new`, `/plans/[planId]/edit` | viewer | ok | modal ✓ | — |
| S-06 | Submit confirmation | embedded in S-05 | own record | ok | — | — |
| S-07 | Calendar | `/calendar` | viewer | partial | — | Provenance not shown via sage/purple tokens (see W2-prov) |
| S-08 | People | `/people` | viewer | ok | — | — |
| S-09 | Person profile | `/people/[personId]` | viewer | ok | modal ✓ | — |
| S-10 | Leave approvals | `/leave-approvals` | manager | ok | — | — |
| S-11 | Public holidays | `/public-holidays` | viewer (admin writes) | ok | modal (new) | Duplicate of `/settings/holidays` (W1-06) |
| S-12 | Notifications | `/notifications` | viewer | ok | — | — |
| S-13 | Feeds | `/feeds` | viewer (admin writes) | ok | — | Duplicate of `/settings/feeds` (W1-06) |
| S-14 | Feed detail | `/feeds/[feedId]` | admin/manager | ok | modal ✓ | `/feed/[feedId]` correctly absent |
| S-15 | Leave reports | MISSING (service exists: `packages/availability/src/analytics/leave-reports-service.ts`) | — | — | — | **UI not built — scope decision** |
| S-16 | Out-of-office analytics | MISSING (service exists: `.../analytics/out-of-office-service.ts`) | — | — | — | **UI not built — scope decision** |
| S-17 | Settings: General | `/settings/general` | admin | ok | — | — |
| S-18 | Settings: Leave approval | `/settings/leave-approval` | admin | ok | — | — |
| S-19 | Settings: Integrations | `/settings/integrations` | admin | ok | — | — |
| S-20 | Settings: Xero detail | `/settings/integrations/xero` | admin | ok | — | Standard/destructive disconnect correct (Section 4 step 8) |
| S-21 | Settings: Feeds | `/settings/feeds` | admin | ok | — | Duplicate of `/feeds` (W1-06) |
| S-22 | Settings: Billing | `/settings/billing` | **admin** (`page.tsx:24`) | ok | — | Catalogue may require owner-only — **verify (W2-role)** |
| S-23 | Settings: Holidays | `/settings/holidays` | admin | ok | — | Duplicate of `/public-holidays` (W1-06) |
| S-24 | Settings: Audit log | MISSING (`audit_events` written; no viewer route) | — | — | — | **UI not built — scope decision** |
| S-25 | Sync health | `/sync` | admin | ok | — | — |
| S-26 | Sync run detail | MISSING (no `/sync/[runId]`) | — | — | — | **UI not built — scope decision** |
| E-01 | Empty state | `components/states/*` | n/a | ok | — | — |
| E-02 | Fetch error | `components/states/fetch-error-state.tsx` | n/a | ok | — | — |
| E-03 | 404 | not found in tree | n/a | — | — | Likely Next default; add explicit `not-found.tsx` |
| E-04 | Permission denied | `components/states/permission-denied-state.tsx` | n/a | ok | — | — |
| E-05 | Xero sync failed (inline) | approval modal + calendar chip | n/a | partial | — | Names failed action via `failed_action`; chip colour/text varies |

**Uncatalogued routes (flag, do not design):**
`/sign-up` (exists, Clerk), `/settings` (exists → redirects to `/settings/general`),
`/settings/members` (exists, Clerk org members UI). `/search`, `/settings/danger`,
`/support`, `/webhooks` are **not implemented** in `apps/app` (no action needed; `/webhooks`
does not rely on a forbidden package — see W1-02). Extra onboarding routes exist and are
sensible: `/setup`, `/settings/getting-started`, `/settings/integrations/xero/connect`,
`/settings/integrations/xero/matches`.

**Design-system findings (Workstream 2, flagged — not auto-fixed):**
- **W2-hex (medium):** hardcoded `#336A3B` at
  `apps/app/components/approvals/approve-confirmation-modal.tsx:129`; hardcoded logo SVG
  fills at `apps/app/app/(authenticated)/components/sidebar.tsx:102,110,118`. Should use
  tokens (logo fills are borderline, being brand artwork).
- **W2-blur (medium):** `backdrop-blur` on the persistent sticky header
  (`apps/app/app/(authenticated)/components/header.tsx`) — DESIGN.md forbids blur on
  persistent surfaces; permitted only on transient surfaces.
- **W2-prov (medium):** calendar chips colour by type (emerald/sky) rather than provenance
  (sage = Xero-synced, purple = manual) per DESIGN.md
  (`apps/app/components/calendar/calendar-event-chip.tsx`). Amber is correctly reserved for
  pending/failed.
- **W2-role (medium):** S-22 billing enforces `org:admin`; confirm whether the catalogue
  requires owner-only and tighten if so.

---

## 4. Xero onboarding path trace

| Step | Check | Result | Evidence |
|---|---|---|---|
| 1 | OAuth HTTP in `apps/api`, logic in `packages/xero` | PASS | `apps/api/app/api/xero/oauth/{start,callback}/route.ts` delegate to `packages/xero/src/oauth/service.ts` |
| 2 | `XERO_CLIENT_ID/SECRET` + `XERO_TOKEN_ENCRYPTION_KEY` validated on startup; key 32-byte base64; absent/malformed prevents start | PASS | `packages/xero/keys.ts:6-23` (`validateEncryptionKey`, 32-byte check), `:42-55` (Zod refine), `:66-69` (`keys()` invoked at module load outside tests) |
| 3 | Tokens AES-256-GCM, never plaintext | PASS | `packages/xero/src/crypto/tokens.ts:4` (`aes-256-gcm`), IV + authTag stored; only encrypted values written. Note: decrypt has a legacy fallback returning input when iv/authTag absent (`tokens.ts:~39`) — acceptable for migration, worth removing post-launch |
| 4 | OAuth `state` generated, persisted, CSRF-validated; binds to org + clerk_org_id | PASS | HMAC-SHA256 sign/verify with timing-safe compare (`service.ts:1010-1059`); persisted to `xero_oauth_sessions` (`service.ts:139-164`); connection bound to `clerk_org_id`/`organisation_id` |
| 5 | Exactly one XeroConnection + one XeroTenant, payroll_region set, uniqueness respected | PASS | `upsert` on unique `organisation_id` / `xero_connection_id` in a transaction (`service.ts:303-382`); region inferred from Xero Organisation CountryCode (`service.ts:688-747`) |
| 6 | Token refresh proactive before sync; background uses `getToken()` | **FAIL (B2, high/blocker)** | `refreshXeroOAuthConnection` exists (`service.ts:396`) but is only called from the manual UI action (`apps/app/.../settings/integrations/xero/_actions.ts:79`). Sync handlers only check expiry via `connectionActive` (`sync-xero-people.ts:431`) and never refresh. Sync stops ~30 min after connect. |
| 7 | Optional-Xero: records persist without a connection; onboarding not hard-blocked; first sync enqueued after connect | PARTIAL | Optional-Xero PASS — `Organisation.xero_connection` is nullable; onboarding keeps Xero as a non-blocking "next" task (`apps/app/lib/server/load-onboarding-state.ts:131`). **Gap (medium):** after `completeXeroTenantSelection` the flow redirects but does **not** enqueue `sync-xero-people`; first sync waits for the scheduler or a manual click. |
| 8 | Standard vs destructive disconnect; reconnect restores history | PASS | Standard clears tokens + sets `status=disconnected`, retains rows (`service.ts:500-517`); destructive archives people/records and deletes balances/matches/runs/cursors (`service.ts:519-577`); reconnect upserts the same `organisation_id` row, reusing history (`service.ts:303-351`) |

**Onboarding blockers:** B1 (the `xero_oauth_sessions` table has no migration, so step 4 fails
on a migrate-deployed DB) and B2 (no proactive refresh, so a connected org stops syncing
after the access token expires).

---

## 5. Sequenced remediation plan (thin vertical slices, dependency order)

**Slice 1 — Make migrations build the schema (unblocks everything).** Owner:
`packages/database/prisma/migrations/*`, `schema.prisma`.
Author the missing forward migrations (or a squashed baseline for fresh envs) covering the 8
absent tables and the missing `xero_connections`/`xero_tenants` columns, plus the partial
unique indexes. Do not hand-edit existing migrations.
*Acceptance:* `migrate reset` + `migrate deploy` against an empty database succeeds; a
XeroConnection and XeroOAuthSession can be created via the Prisma client; integration suites
run in CI against a migrate-deployed DB. Add a migrate step to CI.

**Slice 2 — Proactive token refresh before sync.** Owner: `packages/xero/src/oauth/service.ts`,
`packages/jobs/src/handlers/*`.
Add an `ensureFreshConnection`/refresh-if-near-expiry call at the start of each sync handler
(and write-back path), using the refresh-token grant; background context obtains auth via
`getToken()` in the `Authorization` header. Surface refresh failure as a connection-stale
state.
*Acceptance:* a sync run with an access token within the expiry window refreshes and
succeeds; tokens are re-encrypted at rest; a test asserts refresh-before-fetch.

**Slice 3 — Enqueue first sync on connect.** Owner: `packages/xero/src/oauth/service.ts` (or
the callback action), `packages/jobs`.
After `completeXeroTenantSelection`, emit `sync-xero-people` with `{clerkOrgId,
organisationId}`.
*Acceptance:* connecting Xero triggers an automatic people sync; onboarding "people" step can
complete without a manual click.

**Slice 4 — Tenant-isolation hardening sweep (defence-in-depth).** Owner: cross-package.
The feed-render writes are fixed (commit below). Sweep remaining `update`/`delete`/`updateMany`
on tenant tables to confirm each carries `clerk_org_id`/`organisation_id` or is justified;
add a review-checklist note.
*Acceptance:* documented list of all tenant-table writes with their scoping; no unscoped
multi-row write.

**Slice 5 — Design-system conformance.** Owner: `apps/app/components/*`.
Replace hardcoded `#336A3B` with the primary token (W2-hex); remove `backdrop-blur` from the
persistent header (W2-blur); switch calendar chips to sage/purple provenance tokens
(W2-prov); confirm/repair S-22 billing role (W2-role); add `appearance` colour mapping for
Clerk-hosted S-02.
*Acceptance:* no hardcoded hex in components; no blur on persistent surfaces; provenance
visible via sage/purple; tokens-only audit passes.

**Slice 6 — Scope-cut screens (gated on Section 6 decisions).** Owner: `apps/app/.../analytics`,
`.../settings/audit-log`, `.../sync/[runId]`.
If in the launch cut, build S-15/S-16 on the existing analytics services, S-24 on
`audit_events`, and S-26 sync detail. Otherwise remove their nav entries and defer.
*Acceptance:* either the screens exist and enforce roles, or they are explicitly deferred and
not linked.

**Slice 7 — Route-tree consolidation (gated on Section 6 decision).** Owner: `apps/app`.
Resolve `/feeds` vs `/settings/feeds` and `/public-holidays` vs `/settings/holidays` per the
maintainer's intent. *Acceptance:* one canonical surface per concept, or documented rationale
for both.

---

## 6. Decisions required from the maintainer

1. **Migration repair strategy (B1).** Squashed baseline migration for fresh environments,
   or incremental forward migrations to reconcile history? Either way, add a migrate step to
   CI. (Blocks launch.)
2. **Launch scope of analytics (S-15, S-16) and audit log (S-24).** Services exist; UI does
   not. Ship in the core-loop cut, or defer and remove nav entries?
3. **Sync run detail (S-26).** Ship the drill-down, or launch with the `/sync` list only?
4. **Route duplication.** Are `/feeds` + `/settings/feeds` and `/public-holidays` +
   `/settings/holidays` intentional dual surfaces (member vs admin), or should each be
   consolidated?
5. **S-22 billing role.** Confirm intended minimum role (catalogue suggests owner-only;
   code enforces admin).
6. **Decrypt fallback.** Remove the legacy "return ciphertext as plaintext when iv/authTag
   absent" branch in `packages/xero/src/crypto/tokens.ts` once all rows are encrypted?
7. **Em dashes in governance/vendored docs.** Run a docs-hygiene pass over
   `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`skills/*`, or leave as-is (no shippable impact)?

---

## Commits made this run

- `fix(feeds): scope feed render writes by clerk_org_id and organisation_id` —
  `packages/feeds/src/render/render-feed.ts`. Adds `clerk_org_id`/`organisation_id` to the
  `feeds` and `feed_tokens` update `where` clauses. Verified: `bun install`, Prisma generate,
  `vitest run packages/feeds/src/render/render-feed.test.ts` (3/3 pass), `tsc --noEmit`
  (clean for the file), Biome clean.

No schema, migration, OAuth-flow, or architectural changes were applied. No tenancy weakened.
No `AvailabilityRecord` replaced with provider-native entities.
