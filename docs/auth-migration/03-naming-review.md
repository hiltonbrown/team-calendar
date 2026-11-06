# Neutral Account naming review

**Follow-up completed, 25 October 2026:** the naming migration is applied to the configured remote development database. The full integration inventory passes (383 tests, including 17 RLS checks); cleanup and unchanged original data are verified. See [05-development-verification.md](05-development-verification.md). The review below records the earlier implementation stage and its original verification limits.

25 October 2026. Clerk remains the authentication and membership provider. This implements only the naming slice of [the proposed design](02-design.md), preserving text identity values, `org:*` roles, SDK DTOs and authentication behaviour. The [inventory](01-inventory.md) remains a historical baseline.

## Change and migration

- Added [20261025100000_neutral_account_identity_names](../../packages/database/prisma/migrations/20261025100000_neutral_account_identity_names/migration.sql): 32 `RENAME COLUMN` operations, 40 index renames, seven constraint renames and the subscription table rename. No column drop/add, data reset or ID-type conversion.
- Recreated all 29 final tenant policies and the manager-account SECURITY DEFINER function in the same transaction. Predicates, search path and execute grants are preserved; transaction context is now `app.account_id`. The function uses positional `$2` to avoid confusing the renamed column with its parameter.
- Renamed `AccountId`, account/user columns, helper functions, subscription model/delegate, access-service files, fixtures, release-tool ownership fields and seed configuration (`SEED_ACCOUNT_ID`). Repository `getCurrentUser` is an alias of Clerk's existing `currentUser`, with its original DTO and semantics.
- Updated current copy and the requested current reference documents. `CLAUDE.md` already contains no Clerk naming and continues to import AGENTS.md. Historical migrations, reports, task evidence and the auth-migration snapshots remain historical records.
- Fixed one existing asynchronous UI-test race observed during the full gate: the Xero disconnect retry test now waits for the enabled retry button after the error toast. No component behaviour changed.

Independent source review found no substantive issues. It checked complete column/index/constraint coverage, Prisma name truncation, final RLS predicates and the manager guard. The new RLS regression checks that the old transaction setting alone cannot grant access.

## Verification

| Check | Result |
|---|---|
| Prisma generation | PASS |
| Lint | PASS: 1,325 files |
| Typecheck | PASS: 19 tasks |
| Full unit suite | PASS: 18 tasks, 3,961 tests |
| Release-tool typecheck | PASS |
| Release-tool units | PASS: 197 passed, five skipped. The local IPC test required permitted local socket execution; source-only database denial remained active. |
| Focused Xero disconnect UI | PASS: 22 tests |
| Integration suite | NOT VERIFIED: command exited at the guard because `ALLOW_LOCAL_DATABASE_TESTS` is localhost-only and the configured database is remote. |
| `row-level-security.integration.test.ts` | NOT VERIFIED: with the configured environment loaded, the same remote-target guard stopped setup; 17 tests skipped. |
| Database migration application | NOT VERIFIED: not applied to the configured database in this task. |

The repository's protected live runner requires a valid active manifest, ownership/read-back, restore/cleanup and consumer-isolation evidence. No valid active manifest was configured for these attempts. Guards were not changed or bypassed, and no local substitute was silently used. Static review and passing unit/type gates do not establish deployed migration or RLS behaviour.

Apply the migration and matching application/job code through a coordinated release: old runtime code uses the old column/context names and cannot safely run against the renamed schema. No deployment, commit or merge was requested or performed.

## Remaining Clerk references

Current executable-source/test/config scan: **96 files, 419 matching lines**, excluding generated Prisma code, historical migration SQL, Markdown and installed dependencies. The table below lists the files so remaining dependencies are reviewable. Counts are lexical matching lines, not runtime executions. SDK-owned configuration, webhook validation, components, middleware, API ports, security redaction and test mocks remain deliberately Clerk-specific.

It would be inaccurate to claim every repository occurrence is an SDK import. The following existing compatibility values are deliberately retained to honour the no-behaviour-change instruction:

| Existing value | Boundary and reason |
|---|---|
| Stripe metadata `clerk_org_id` | [billing transport](../../packages/billing/src/stripe.ts) and [Stripe event routing](../../apps/api/lib/stripe-event-delivery.ts). Existing remote subscriptions/events carry this key; the database column is `account_id`. |
| Signed OAuth JSON `clerkOrgId` | [Xero state transport](../../packages/xero/src/oauth/service.ts). Preserve existing state signatures and callbacks, mapping to internal `accountId`. |
| Aggregation fingerprint JSON `clerkOrgId` | [request cache](../../packages/availability/src/analytics/request-cache.ts). Preserve the hash representation and cache identity. |
| `people.clerk_access_reviewed`, `people.clerk_invitations_sent` | [People actions](../../apps/app/app/(authenticated)/people/_actions.ts). Preserve durable audit action identity. Display copy and business helper names are neutral. |
| `clerk-membership` UUID namespace | [auth webhook](../../apps/api/app/webhooks/auth/route.ts). Preserve analytics delivery deduplication for retried events. |
| `clerk_cookie` | [active context resolver](../../apps/app/lib/server/require-active-org-page-context.ts). This identifies the still-active Clerk session source. |

Old column/setting spellings also necessarily appear on the left side of rename DDL, in retained historical migrations and isolated historical-migration fixtures, and in the regression proving the obsolete RLS context fails closed. They are not active tenant storage fields. Historical inventory/design/report text is not rewritten as current SDK-only evidence.

### Active source/test/config file register

| File | Matching lines |
|---|---:|
| [apps/api/app/api/availability/[recordId]/route.ts](../../apps/api/app/api/availability/[recordId]/route.ts) | 2 |
| [apps/api/app/api/availability/route.ts](../../apps/api/app/api/availability/route.ts) | 1 |
| [apps/api/app/api/support/github-issue/route.test.ts](../../apps/api/app/api/support/github-issue/route.test.ts) | 2 |
| [apps/api/app/webhooks/auth/route.test.ts](../../apps/api/app/webhooks/auth/route.test.ts) | 6 |
| [apps/api/app/webhooks/auth/route.ts](../../apps/api/app/webhooks/auth/route.ts) | 40 |
| [apps/api/app/webhooks/payments/route.test.ts](../../apps/api/app/webhooks/payments/route.test.ts) | 9 |
| [apps/api/lib/stripe-event-delivery.ts](../../apps/api/lib/stripe-event-delivery.ts) | 3 |
| [apps/api/proxy.test.ts](../../apps/api/proxy.test.ts) | 1 |
| [apps/api/proxy.ts](../../apps/api/proxy.ts) | 2 |
| [apps/app/__tests__/auth-components.test.tsx](../../apps/app/__tests__/auth-components.test.tsx) | 4 |
| [apps/app/app/(authenticated)/components/custom-user-button.tsx](../../apps/app/app/(authenticated)/components/custom-user-button.tsx) | 2 |
| [apps/app/app/(authenticated)/feeds/_actions.ts](../../apps/app/app/(authenticated)/feeds/_actions.ts) | 1 |
| [apps/app/app/(authenticated)/leave-approvals/_actions.ts](../../apps/app/app/(authenticated)/leave-approvals/_actions.ts) | 1 |
| [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts) | 2 |
| [apps/app/app/(authenticated)/notifications/page.tsx](../../apps/app/app/(authenticated)/notifications/page.tsx) | 1 |
| [apps/app/app/(authenticated)/page.tsx](../../apps/app/app/(authenticated)/page.tsx) | 1 |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx) | 1 |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx](../../apps/app/app/(authenticated)/people/[personId]/page.tsx) | 1 |
| [apps/app/app/(authenticated)/people/_actions.test.ts](../../apps/app/app/(authenticated)/people/_actions.test.ts) | 8 |
| [apps/app/app/(authenticated)/people/_actions.ts](../../apps/app/app/(authenticated)/people/_actions.ts) | 8 |
| [apps/app/app/(authenticated)/people/manager-assignment-action.test.ts](../../apps/app/app/(authenticated)/people/manager-assignment-action.test.ts) | 1 |
| [apps/app/app/(authenticated)/people/new/page.tsx](../../apps/app/app/(authenticated)/people/new/page.tsx) | 1 |
| [apps/app/app/(authenticated)/people/page.tsx](../../apps/app/app/(authenticated)/people/page.tsx) | 1 |
| [apps/app/app/(authenticated)/plans/company-routing.test.ts](../../apps/app/app/(authenticated)/plans/company-routing.test.ts) | 2 |
| [apps/app/app/(authenticated)/plans/page-server.test.tsx](../../apps/app/app/(authenticated)/plans/page-server.test.tsx) | 2 |
| [apps/app/app/(authenticated)/plans/page.tsx](../../apps/app/app/(authenticated)/plans/page.tsx) | 1 |
| [apps/app/app/(authenticated)/settings/billing/page.tsx](../../apps/app/app/(authenticated)/settings/billing/page.tsx) | 1 |
| [apps/app/app/(authenticated)/settings/feeds/feeds-client.test.tsx](../../apps/app/app/(authenticated)/settings/feeds/feeds-client.test.tsx) | 1 |
| [apps/app/app/(authenticated)/settings/general/_actions.test.ts](../../apps/app/app/(authenticated)/settings/general/_actions.test.ts) | 2 |
| [apps/app/app/(authenticated)/settings/general/_actions.ts](../../apps/app/app/(authenticated)/settings/general/_actions.ts) | 4 |
| [apps/app/app/(authenticated)/settings/general/general-client.tsx](../../apps/app/app/(authenticated)/settings/general/general-client.tsx) | 1 |
| [apps/app/app/(authenticated)/settings/general/page.tsx](../../apps/app/app/(authenticated)/settings/general/page.tsx) | 3 |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts) | 9 |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts) | 3 |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx) | 1 |
| [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts) | 7 |
| [apps/app/app/(authenticated)/settings/leave-approval/leave-approval-settings-client.test.tsx](../../apps/app/app/(authenticated)/settings/leave-approval/leave-approval-settings-client.test.tsx) | 1 |
| [apps/app/app/(authenticated)/settings/members/page.tsx](../../apps/app/app/(authenticated)/settings/members/page.tsx) | 4 |
| [apps/app/app/(authenticated)/setup/_actions.test.ts](../../apps/app/app/(authenticated)/setup/_actions.test.ts) | 2 |
| [apps/app/app/(authenticated)/sync/[runId]/page.tsx](../../apps/app/app/(authenticated)/sync/[runId]/page.tsx) | 1 |
| [apps/app/app/(authenticated)/sync/_actions.test.ts](../../apps/app/app/(authenticated)/sync/_actions.test.ts) | 1 |
| [apps/app/app/(authenticated)/sync/page.tsx](../../apps/app/app/(authenticated)/sync/page.tsx) | 1 |
| [apps/app/app/(setup)/onboarding/_actions.test.ts](../../apps/app/app/(setup)/onboarding/_actions.test.ts) | 1 |
| [apps/app/app/(setup)/onboarding/page.tsx](../../apps/app/app/(setup)/onboarding/page.tsx) | 1 |
| [apps/app/app/actions/settings/invite-member.test.ts](../../apps/app/app/actions/settings/invite-member.test.ts) | 5 |
| [apps/app/app/actions/settings/invite-member.ts](../../apps/app/app/actions/settings/invite-member.ts) | 3 |
| [apps/app/app/actions/settings/remove-member.test.ts](../../apps/app/app/actions/settings/remove-member.test.ts) | 5 |
| [apps/app/app/actions/settings/remove-member.ts](../../apps/app/app/actions/settings/remove-member.ts) | 4 |
| [apps/app/app/actions/settings/update-member-role.test.ts](../../apps/app/app/actions/settings/update-member-role.test.ts) | 6 |
| [apps/app/app/actions/settings/update-member-role.ts](../../apps/app/app/actions/settings/update-member-role.ts) | 4 |
| [apps/app/app/actions/settings/update-org.test.ts](../../apps/app/app/actions/settings/update-org.test.ts) | 7 |
| [apps/app/app/actions/settings/update-org.ts](../../apps/app/app/actions/settings/update-org.ts) | 3 |
| [apps/app/lib/navigation/org-url.test.ts](../../apps/app/lib/navigation/org-url.test.ts) | 1 |
| [apps/app/lib/server/ensure-default-organisation.ts](../../apps/app/lib/server/ensure-default-organisation.ts) | 3 |
| [apps/app/lib/server/get-active-org-context.ts](../../apps/app/lib/server/get-active-org-context.ts) | 1 |
| [apps/app/lib/server/require-active-org-page-context-scope.test.ts](../../apps/app/lib/server/require-active-org-page-context-scope.test.ts) | 2 |
| [apps/app/lib/server/require-active-org-page-context.test.ts](../../apps/app/lib/server/require-active-org-page-context.test.ts) | 2 |
| [apps/app/lib/server/require-active-org-page-context.ts](../../apps/app/lib/server/require-active-org-page-context.ts) | 3 |
| [apps/app/proxy.test.ts](../../apps/app/proxy.test.ts) | 13 |
| [apps/app/proxy.ts](../../apps/app/proxy.ts) | 20 |
| [apps/web/app/security/page.tsx](../../apps/web/app/security/page.tsx) | 3 |
| [packages/auth/client.ts](../../packages/auth/client.ts) | 1 |
| [packages/auth/components/choose-organization-task.tsx](../../packages/auth/components/choose-organization-task.tsx) | 2 |
| [packages/auth/components/embedded-auth-appearance.ts](../../packages/auth/components/embedded-auth-appearance.ts) | 1 |
| [packages/auth/components/sign-in.tsx](../../packages/auth/components/sign-in.tsx) | 2 |
| [packages/auth/components/sign-up.tsx](../../packages/auth/components/sign-up.tsx) | 2 |
| [packages/auth/helpers.ts](../../packages/auth/helpers.ts) | 4 |
| [packages/auth/keys.ts](../../packages/auth/keys.ts) | 17 |
| [packages/auth/package.json](../../packages/auth/package.json) | 2 |
| [packages/auth/provider.tsx](../../packages/auth/provider.tsx) | 6 |
| [packages/auth/proxy.ts](../../packages/auth/proxy.ts) | 2 |
| [packages/auth/server.ts](../../packages/auth/server.ts) | 2 |
| [packages/availability/index.integration.test.ts](../../packages/availability/index.integration.test.ts) | 2 |
| [packages/availability/src/analytics/request-cache.ts](../../packages/availability/src/analytics/request-cache.ts) | 1 |
| [packages/availability/src/people/account-access-service.integration.test.ts](../../packages/availability/src/people/account-access-service.integration.test.ts) | 17 |
| [packages/availability/src/people/account-access-service.ts](../../packages/availability/src/people/account-access-service.ts) | 35 |
| [packages/availability/src/people/current-user-service.test.ts](../../packages/availability/src/people/current-user-service.test.ts) | 1 |
| [packages/billing/src/stripe.ts](../../packages/billing/src/stripe.ts) | 2 |
| [packages/database/multi-company-migration.integration.test.ts](../../packages/database/multi-company-migration.integration.test.ts) | 1 |
| [packages/database/public-holiday-preferences-migration.integration.test.ts](../../packages/database/public-holiday-preferences-migration.integration.test.ts) | 8 |
| [packages/database/row-level-security.integration.test.ts](../../packages/database/row-level-security.integration.test.ts) | 8 |
| [packages/database/src/boundary.test.ts](../../packages/database/src/boundary.test.ts) | 1 |
| [packages/database/src/tenant-phased-modules.ts](../../packages/database/src/tenant-phased-modules.ts) | 36 |
| [packages/design-system/providers/public.test.ts](../../packages/design-system/providers/public.test.ts) | 1 |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.test.ts](../../packages/jobs/src/handlers/reconcile-xero-approval-state.test.ts) | 1 |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.ts](../../packages/jobs/src/handlers/reconcile-xero-approval-state.ts) | 3 |
| [packages/next-config/index.ts](../../packages/next-config/index.ts) | 1 |
| [packages/next-config/preflight.test.ts](../../packages/next-config/preflight.test.ts) | 3 |
| [packages/next-config/preflight.ts](../../packages/next-config/preflight.ts) | 3 |
| [packages/observability/scrubber.test.ts](../../packages/observability/scrubber.test.ts) | 1 |
| [packages/observability/scrubber.ts](../../packages/observability/scrubber.ts) | 1 |
| [packages/xero/src/oauth/service.test.ts](../../packages/xero/src/oauth/service.test.ts) | 2 |
| [packages/xero/src/oauth/service.ts](../../packages/xero/src/oauth/service.ts) | 4 |
| [tooling/release/e2e/admission.spec.ts](../../tooling/release/e2e/admission.spec.ts) | 3 |
| [tooling/release/e2e/fixture.ts](../../tooling/release/e2e/fixture.ts) | 6 |
| [tooling/release/e2e/global.setup.ts](../../tooling/release/e2e/global.setup.ts) | 4 |

Actual Clerk dependencies also remain in `bun.lock`, root/package dependency manifests, ignored Clerk configuration paths and `skills-lock.json`. Those are provider/package metadata, not renamed domain entities. No Better Auth dependency, auth table, transition flag or provider replacement was introduced.
