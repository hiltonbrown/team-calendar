# Clerk dependency inventory

Repository snapshot: `4fcb6f947223eef48e64ae56f254079c6e086df6`, audited 25 October 2026. Read `AGENTS.md`, `CLAUDE.md` and `PRODUCT.md`; `CLAUDE.md` imports the repository instructions. This document inventories the current working-tree source and retained history for an authentication migration. It does not select a replacement or implement a migration.

Scope: tracked repository files plus source-file import analysis, excluding `.git`, installed dependencies, generated Prisma output, build output and vendored code. Actual `.env` files, credentials, auth storage state and private invitation URLs were not read. Checked-in environment examples and lockfiles are included. Historical plans, migrations and dated task evidence are labelled separately from current source behaviour. The new inventory itself is excluded from scan counts; the task checklist is included in the tracked working-tree scan.

Evidence status: **PASS** for static inventory coverage, source-target/line checks and documentation diff checks. **NOT VERIFIED** for live Clerk configuration, signed sessions, webhook delivery, deployed database/RLS state, browser flows, DNS and deployment health. No application tests, build, database queries or remote mutations were run for this documentation-only task.

Account identity is a Clerk Organisation (`clerk_org_id`); payroll company identity is the local `organisation_id`. Users, membership and account roles live in Clerk. This distinction applies throughout the inventory.

## 1. Imports, re-exports and symbols

Source audit only. Scanned 1,360 repository source files with `rg --files --hidden`, excluding Git metadata, dependencies and generated/build output. Parsed multiline `import`/`export ... from`, runtime `import()` and type import queries. Counts below count declarations, not imported symbols. Test mocks are listed separately because they are dependency references, not import declarations. All links below are relative to `docs/auth-migration/01-inventory.md`.

| App/package | Production declarations | Test declarations |
| --- | --- | --- |
| apps/api | 11 | 1 |
| apps/app | 107 | 11 |
| packages/auth | 11 | 0 |
| packages/availability | 1 | 0 |
| packages/design-system | 1 | 0 |
| packages/feeds | 1 | 0 |
| packages/jobs | 1 | 0 |
| tooling/release | 0 | 2 |
| Total | 133 | 14 |

There are 136 static import declarations, 5 re-export declarations, 4 runtime dynamic imports and 2 test-only type import queries. Direct `@clerk/*` usage is confined to `packages/auth` in production and `tooling/release/e2e` in tests. No imports from `@clerk/*` or `@repo/auth` were found in `apps/web`, `apps/docs`, `apps/email` or other packages. Wildcard exports make the complete Clerk client/server API available to downstream consumers.

### Production declarations

#### `apps/api`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [apps/api/app/api/availability/[recordId]/route.ts:1](../../apps/api/app/api/availability/[recordId]/route.ts#L1) | import | `@repo/auth/helpers` | { auth, currentUser, requireOrg } |
| [apps/api/app/api/availability/route.ts:1](../../apps/api/app/api/availability/route.ts#L1) | import | `@repo/auth/helpers` | { auth, currentUser, requireOrg } |
| [apps/api/app/api/notifications/[notificationId]/mark-read/route.ts:1](../../apps/api/app/api/notifications/[notificationId]/mark-read/route.ts#L1) | import | `@repo/auth/helpers` | { currentUser, requireOrg } |
| [apps/api/app/api/notifications/stream/route.ts:1](../../apps/api/app/api/notifications/stream/route.ts#L1) | import | `@repo/auth/helpers` | { currentUser, requireOrg } |
| [apps/api/app/api/support/github-issue/route.ts:1](../../apps/api/app/api/support/github-issue/route.ts#L1) | import | `@repo/auth/helpers` | { currentUser, requireOrg } |
| [apps/api/app/api/sync/dispatch/route.ts:1](../../apps/api/app/api/sync/dispatch/route.ts#L1) | import | `@repo/auth/helpers` | { currentUser, requireOrg, requireRole } |
| [apps/api/app/api/xero/oauth/callback/route.ts:1](../../apps/api/app/api/xero/oauth/callback/route.ts#L1) | import | `@repo/auth/helpers` | { requireRole } |
| [apps/api/app/api/xero/oauth/callback/route.ts:2](../../apps/api/app/api/xero/oauth/callback/route.ts#L2) | import | `@repo/auth/server` | { auth } |
| [apps/api/app/api/xero/oauth/start/route.ts:1](../../apps/api/app/api/xero/oauth/start/route.ts#L1) | import | `@repo/auth/helpers` | { currentUser, requireOrg, requireRole } |
| [apps/api/env.ts:2](../../apps/api/env.ts#L2) | import | `@repo/auth/keys` | { keys as auth } |
| [apps/api/proxy.ts:1](../../apps/api/proxy.ts#L1) | import | `@repo/auth/proxy` | { authMiddleware, createRouteMatcher } |

#### `apps/app`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts:3](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:1](../../apps/app/app/(authenticated)/analytics/leave-reports/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:2](../../apps/app/app/(authenticated)/analytics/leave-reports/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:1](../../apps/app/app/(authenticated)/analytics/out-of-office/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:2](../../apps/app/app/(authenticated)/analytics/out-of-office/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/calendar/page.tsx:1](../../apps/app/app/(authenticated)/calendar/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/calendar/page.tsx:2](../../apps/app/app/(authenticated)/calendar/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/components/command-menu.tsx:3](../../apps/app/app/(authenticated)/components/command-menu.tsx#L3) | import | `@repo/auth/client` | { useAuth } |
| [apps/app/app/(authenticated)/components/custom-user-button.tsx:3](../../apps/app/app/(authenticated)/components/custom-user-button.tsx#L3) | import | `@repo/auth/client` | { UserButton, useClerk } |
| [apps/app/app/(authenticated)/components/header.tsx:1](../../apps/app/app/(authenticated)/components/header.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/components/header.tsx:2](../../apps/app/app/(authenticated)/components/header.tsx#L2) | import | `@repo/auth/server` | { currentUser } |
| [apps/app/app/(authenticated)/components/sidebar.tsx:3](../../apps/app/app/(authenticated)/components/sidebar.tsx#L3) | import | `@repo/auth/client` | { useAuth } |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx:1](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx:2](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx:1](../../apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx:2](../../apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx#L2) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.tsx:1](../../apps/app/app/(authenticated)/feeds/[feedId]/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.tsx:2](../../apps/app/app/(authenticated)/feeds/[feedId]/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/feeds/_actions.ts:4](../../apps/app/app/(authenticated)/feeds/_actions.ts#L4) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/feeds/new/page.tsx:1](../../apps/app/app/(authenticated)/feeds/new/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/feeds/new/page.tsx:2](../../apps/app/app/(authenticated)/feeds/new/page.tsx#L2) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/feeds/page.tsx:1](../../apps/app/app/(authenticated)/feeds/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/feeds/page.tsx:2](../../apps/app/app/(authenticated)/feeds/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/layout.tsx:1](../../apps/app/app/(authenticated)/layout.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/layout.tsx:2](../../apps/app/app/(authenticated)/layout.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/leave-approvals/_actions.ts:4](../../apps/app/app/(authenticated)/leave-approvals/_actions.ts#L4) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/leave-approvals/page.tsx:1](../../apps/app/app/(authenticated)/leave-approvals/page.tsx#L1) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/notifications/_actions.ts:3](../../apps/app/app/(authenticated)/notifications/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/notifications/page.tsx:1](../../apps/app/app/(authenticated)/notifications/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/notifications/page.tsx:2](../../apps/app/app/(authenticated)/notifications/page.tsx#L2) | import | `@repo/auth/server` | { currentUser } |
| [apps/app/app/(authenticated)/page.tsx:1](../../apps/app/app/(authenticated)/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/page.tsx:2](../../apps/app/app/(authenticated)/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:1](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L1) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:1](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L1) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/people/_actions.ts:2](../../apps/app/app/(authenticated)/people/_actions.ts#L2) | import | `@repo/auth/server` | { auth, clerkClient, currentUser } |
| [apps/app/app/(authenticated)/people/new/_actions.ts:3](../../apps/app/app/(authenticated)/people/new/_actions.ts#L3) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/people/new/page.tsx:1](../../apps/app/app/(authenticated)/people/new/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/people/page.tsx:1](../../apps/app/app/(authenticated)/people/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/people/page.tsx:2](../../apps/app/app/(authenticated)/people/page.tsx#L2) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/plans/_actions.ts:4](../../apps/app/app/(authenticated)/plans/_actions.ts#L4) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/plans/page.tsx:1](../../apps/app/app/(authenticated)/plans/page.tsx#L1) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/plans/record-form-data.ts:3](../../apps/app/app/(authenticated)/plans/record-form-data.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/public-holidays/_actions.ts:3](../../apps/app/app/(authenticated)/public-holidays/_actions.ts#L3) | import | `@repo/auth/helpers` | { requireOrg, requireRole } |
| [apps/app/app/(authenticated)/public-holidays/_actions.ts:4](../../apps/app/app/(authenticated)/public-holidays/_actions.ts#L4) | import | `@repo/auth/server` | { currentUser } |
| [apps/app/app/(authenticated)/public-holidays/holidays/new/form-data.ts:1](../../apps/app/app/(authenticated)/public-holidays/holidays/new/form-data.ts#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/public-holidays/page.tsx:1](../../apps/app/app/(authenticated)/public-holidays/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/public-holidays/page.tsx:2](../../apps/app/app/(authenticated)/public-holidays/page.tsx#L2) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/settings/audit-log/_actions.ts:3](../../apps/app/app/(authenticated)/settings/audit-log/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/audit-log/page.tsx:1](../../apps/app/app/(authenticated)/settings/audit-log/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/settings/audit-log/page.tsx:2](../../apps/app/app/(authenticated)/settings/audit-log/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/billing/page.tsx:1](../../apps/app/app/(authenticated)/settings/billing/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg, requireRole } |
| [apps/app/app/(authenticated)/settings/billing/page.tsx:2](../../apps/app/app/(authenticated)/settings/billing/page.tsx#L2) | import | `@repo/auth/server` | { currentUser } |
| [apps/app/app/(authenticated)/settings/coverage/_actions.ts:3](../../apps/app/app/(authenticated)/settings/coverage/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/coverage/page.tsx:1](../../apps/app/app/(authenticated)/settings/coverage/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/settings/coverage/page.tsx:2](../../apps/app/app/(authenticated)/settings/coverage/page.tsx#L2) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/settings/feeds/_actions.ts:3](../../apps/app/app/(authenticated)/settings/feeds/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/feeds/page.tsx:1](../../apps/app/app/(authenticated)/settings/feeds/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/settings/feeds/page.tsx:2](../../apps/app/app/(authenticated)/settings/feeds/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/general/_actions.ts:3](../../apps/app/app/(authenticated)/settings/general/_actions.ts#L3) | import | `@repo/auth/server` | { auth, clerkClient, currentUser } |
| [apps/app/app/(authenticated)/settings/general/page.tsx:1](../../apps/app/app/(authenticated)/settings/general/page.tsx#L1) | import | `@repo/auth/server` | { auth, clerkClient } |
| [apps/app/app/(authenticated)/settings/getting-started/page.tsx:1](../../apps/app/app/(authenticated)/settings/getting-started/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/settings/holidays/page.tsx:1](../../apps/app/app/(authenticated)/settings/holidays/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/settings/integrations/page.tsx:1](../../apps/app/app/(authenticated)/settings/integrations/page.tsx#L1) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:2](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L2) | import | `@repo/auth/helpers` | { requireRole } |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:3](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:2](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts#L2) | import | `@repo/auth/helpers` | { requireRole } |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:3](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx:1](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx#L1) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:3](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L3) | import | `@repo/auth/helpers` | { requireRole } |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:4](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L4) | import | `@repo/auth/server` | { auth, clerkClient, currentUser } |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx:1](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/settings/integrations/xero/page.tsx:1](../../apps/app/app/(authenticated)/settings/integrations/xero/page.tsx#L1) | import | `@repo/auth/server` | { auth, withinLimit } |
| [apps/app/app/(authenticated)/settings/layout.tsx:1](../../apps/app/app/(authenticated)/settings/layout.tsx#L1) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/settings/leave-approval/_actions.ts:3](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/settings/members/page.tsx:1](../../apps/app/app/(authenticated)/settings/members/page.tsx#L1) | import | `@repo/auth/server` | { auth, clerkClient } |
| [apps/app/app/(authenticated)/setup/_actions.ts:3](../../apps/app/app/(authenticated)/setup/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/sync/[runId]/page.tsx:1](../../apps/app/app/(authenticated)/sync/[runId]/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/sync/[runId]/page.tsx:2](../../apps/app/app/(authenticated)/sync/[runId]/page.tsx#L2) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(authenticated)/sync/_actions.ts:3](../../apps/app/app/(authenticated)/sync/_actions.ts#L3) | import | `@repo/auth/helpers` | { requireRole } |
| [apps/app/app/(authenticated)/sync/_actions.ts:4](../../apps/app/app/(authenticated)/sync/_actions.ts#L4) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(authenticated)/sync/page.tsx:1](../../apps/app/app/(authenticated)/sync/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(authenticated)/sync/page.tsx:2](../../apps/app/app/(authenticated)/sync/page.tsx#L2) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/(setup)/layout.tsx:1](../../apps/app/app/(setup)/layout.tsx#L1) | import | `@repo/auth/client` | { SignOutButton } |
| [apps/app/app/(setup)/layout.tsx:2](../../apps/app/app/(setup)/layout.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(setup)/onboarding/_actions.ts:3](../../apps/app/app/(setup)/onboarding/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(setup)/onboarding/page.tsx:1](../../apps/app/app/(setup)/onboarding/page.tsx#L1) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(setup)/welcome/_actions.ts:3](../../apps/app/app/(setup)/welcome/_actions.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(setup)/welcome/page.tsx:1](../../apps/app/app/(setup)/welcome/page.tsx#L1) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/app/(setup)/welcome/page.tsx:2](../../apps/app/app/(setup)/welcome/page.tsx#L2) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/(unauthenticated)/(auth)/session-tasks/choose-organization/page.tsx:1](../../apps/app/app/(unauthenticated)/(auth)/session-tasks/choose-organization/page.tsx#L1) | import | `@repo/auth/components/choose-organization-task` | { ChooseOrganizationTask } |
| [apps/app/app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page.tsx:1](../../apps/app/app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page.tsx#L1) | import | `@repo/auth/components/sign-in` | { signInCopy } |
| [apps/app/app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page.tsx:7](../../apps/app/app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page.tsx#L7) | dynamic import | `@repo/auth/components/sign-in` | SignIn via \`.then((mod) => mod.SignIn)\` |
| [apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx:1](../../apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx#L1) | import | `@repo/auth/components/sign-up` | { signUpCopy } |
| [apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx:7](../../apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx#L7) | dynamic import | `@repo/auth/components/sign-up` | SignUp via \`.then((mod) => mod.SignUp)\` |
| [apps/app/app/actions/availability/manual.ts:3](../../apps/app/app/actions/availability/manual.ts#L3) | import | `@repo/auth/server` | { auth, currentUser } |
| [apps/app/app/actions/settings/invite-member.ts:3](../../apps/app/app/actions/settings/invite-member.ts#L3) | import | `@repo/auth/server` | { auth, clerkClient } |
| [apps/app/app/actions/settings/remove-member.ts:3](../../apps/app/app/actions/settings/remove-member.ts#L3) | import | `@repo/auth/server` | { auth, clerkClient } |
| [apps/app/app/actions/settings/revoke-tokens.ts:3](../../apps/app/app/actions/settings/revoke-tokens.ts#L3) | import | `@repo/auth/server` | { auth } |
| [apps/app/app/actions/settings/update-member-role.ts:3](../../apps/app/app/actions/settings/update-member-role.ts#L3) | import | `@repo/auth/server` | { auth, clerkClient } |
| [apps/app/app/actions/settings/update-org.ts:3](../../apps/app/app/actions/settings/update-org.ts#L3) | import | `@repo/auth/server` | { auth, clerkClient } |
| [apps/app/env.ts:2](../../apps/app/env.ts#L2) | import | `@repo/auth/keys` | { keys as auth } |
| [apps/app/lib/auth/require-page-role.ts:3](../../apps/app/lib/auth/require-page-role.ts#L3) | import | `@repo/auth/server` | { auth } |
| [apps/app/lib/server/create-manual-person.ts:4](../../apps/app/lib/server/create-manual-person.ts#L4) | import | `@repo/auth/server` | { withinLimit } |
| [apps/app/lib/server/ensure-default-organisation.ts:5](../../apps/app/lib/server/ensure-default-organisation.ts#L5) | import | `@repo/auth/server` | { clerkClient } |
| [apps/app/lib/server/get-active-org-context.ts:5](../../apps/app/lib/server/get-active-org-context.ts#L5) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/lib/server/require-active-org-page-context.ts:5](../../apps/app/lib/server/require-active-org-page-context.ts#L5) | import | `@repo/auth/helpers` | { requireOrg } |
| [apps/app/proxy.ts:1](../../apps/app/proxy.ts#L1) | import | `@repo/auth/proxy` | { authMiddleware, createRouteMatcher } |

#### `packages/auth`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [packages/auth/client.ts:1](../../packages/auth/client.ts#L1) | export | `@clerk/nextjs` | * |
| [packages/auth/components/choose-organization-task.tsx:1](../../packages/auth/components/choose-organization-task.tsx#L1) | import | `@clerk/nextjs` | { TaskChooseOrganization as ClerkTaskChooseOrganization } |
| [packages/auth/components/sign-in.tsx:1](../../packages/auth/components/sign-in.tsx#L1) | import | `@clerk/nextjs` | { SignIn as ClerkSignIn } |
| [packages/auth/components/sign-up.tsx:1](../../packages/auth/components/sign-up.tsx#L1) | import | `@clerk/nextjs` | { SignUp as ClerkSignUp } |
| [packages/auth/helpers.ts:3](../../packages/auth/helpers.ts#L3) | import | `@clerk/nextjs/server` | { auth } |
| [packages/auth/helpers.ts:74](../../packages/auth/helpers.ts#L74) | export | `@clerk/nextjs/server` | type { User } |
| [packages/auth/helpers.ts:76](../../packages/auth/helpers.ts#L76) | export | `@clerk/nextjs/server` | { auth, currentUser } |
| [packages/auth/provider.tsx:3](../../packages/auth/provider.tsx#L3) | import | `@clerk/nextjs` | { ClerkProvider } |
| [packages/auth/provider.tsx:4](../../packages/auth/provider.tsx#L4) | import | `@clerk/themes` | { dark } |
| [packages/auth/proxy.ts:1](../../packages/auth/proxy.ts#L1) | export | `@clerk/nextjs/server` | { clerkMiddleware as authMiddleware, createRouteMatcher, } |
| [packages/auth/server.ts:3](../../packages/auth/server.ts#L3) | export | `@clerk/nextjs/server` | * |

#### `packages/availability`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [packages/availability/src/people/current-user-service.ts:3](../../packages/availability/src/people/current-user-service.ts#L3) | import | `@repo/auth/server` | { withinLimit } |

#### `packages/design-system`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [packages/design-system/index.tsx:1](../../packages/design-system/index.tsx#L1) | import | `@repo/auth/provider` | { AuthProvider } |

#### `packages/feeds`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [packages/feeds/src/feed-service.ts:3](../../packages/feeds/src/feed-service.ts#L3) | import | `@repo/auth/server` | { withinLimit } |

#### `packages/jobs`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.ts:5](../../packages/jobs/src/handlers/reconcile-xero-approval-state.ts#L5) | import | `@repo/auth/server` | { clerkClient } |

### Test declarations and type queries

#### `apps/api`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [apps/api/__tests__/availability-routes.test.ts:30](../../apps/api/__tests__/availability-routes.test.ts#L30) | dynamic import | `@repo/auth/helpers` | auth, requireOrg, currentUser |

#### `apps/app`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [apps/app/__tests__/auth-components.test.tsx:1](../../apps/app/__tests__/auth-components.test.tsx#L1) | import | `@repo/auth/components/auth-form-frame` | { AuthFormFrame } |
| [apps/app/__tests__/auth-components.test.tsx:2](../../apps/app/__tests__/auth-components.test.tsx#L2) | import | `@repo/auth/components/choose-organization-task` | { chooseOrganizationTaskRedirectUrl } |
| [apps/app/__tests__/auth-components.test.tsx:3](../../apps/app/__tests__/auth-components.test.tsx#L3) | import | `@repo/auth/components/embedded-auth-appearance` | { embeddedAuthAppearance } |
| [apps/app/__tests__/auth-components.test.tsx:4](../../apps/app/__tests__/auth-components.test.tsx#L4) | import | `@repo/auth/components/sign-in` | { signInCopy } |
| [apps/app/__tests__/auth-components.test.tsx:5](../../apps/app/__tests__/auth-components.test.tsx#L5) | import | `@repo/auth/components/sign-up` | { signUpCopy } |
| [apps/app/__tests__/auth-components.test.tsx:6](../../apps/app/__tests__/auth-components.test.tsx#L6) | import | `@repo/auth/provider` | { chooseOrganizationTaskUrl } |
| [apps/app/__tests__/sign-in.test.tsx:1](../../apps/app/__tests__/sign-in.test.tsx#L1) | import | `@repo/auth/components/sign-in` | { signInCopy } |
| [apps/app/__tests__/sign-up.test.tsx:1](../../apps/app/__tests__/sign-up.test.tsx#L1) | import | `@repo/auth/components/sign-up` | { signUpCopy } |
| [apps/app/app/(authenticated)/people/new/_actions.integration.test.ts:14](../../apps/app/app/(authenticated)/people/new/_actions.integration.test.ts#L14) | type import query | `@repo/auth/server` | module type passed to \`importOriginal<typeof import(...)>\` |
| [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:20](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L20) | type import query | `@repo/auth/server` | module type passed to \`importOriginal<typeof import(...)>\` |
| [apps/app/lib/auth/require-page-role.test.ts:12](../../apps/app/lib/auth/require-page-role.test.ts#L12) | dynamic import | `@repo/auth/server` | auth |

#### `tooling/release`

| Source | Form | Module | Symbols |
| --- | --- | --- | --- |
| [tooling/release/e2e/admission.spec.ts:2](../../tooling/release/e2e/admission.spec.ts#L2) | import | `@clerk/testing/playwright` | { setupClerkTestingToken } |
| [tooling/release/e2e/global.setup.ts:3](../../tooling/release/e2e/global.setup.ts#L3) | import | `@clerk/testing/playwright` | { clerk, clerkSetup } |

### Specifically requested symbols

| Symbol | How it is used |
|---|---|
| `auth`, `currentUser`, `clerkClient` | Re-exported through server/helpers wrappers; each consumer is listed above. |
| `has` | Session method used by role wrappers and page guards; no direct named Clerk import. See section 3. |
| `getToken` | Session method on `auth()` result in manual sync dispatch; no direct named import. See section 7. |
| `Protect` | No explicit named import or JSX use found; the client wildcard export can expose the SDK symbol. Middleware instead calls `auth.protect()`. |
| `UserButton`, `useClerk`, `useAuth` | Client imports, including custom account menu and role-aware navigation. `useClerk` opens organisation profile/sign-out surfaces. |
| `clerkMiddleware` | Re-exported as `authMiddleware` in [packages/auth/proxy.ts:1](../../packages/auth/proxy.ts#L1), consumed by app/API proxies. |
| `ClerkProvider` | Wrapped by `AuthProvider` in [packages/auth/provider.tsx:18](../../packages/auth/provider.tsx#L18), included through the shared design-system provider. |

Wildcard client/server re-exports also expose provider APIs not named by current import sites. `AuthProvider` forwards provider props, maps the choose-organisation session task and applies Clerk-specific appearance settings; sign-in, sign-up, invitation acceptance and organisation-profile components remain provider-owned UI. The tables include other used symbols such as `SignIn`, `SignUp`, `OrganizationList`, `useOrganization`, `useOrganizationList`, provider types, theme and key helpers.

## 2. Clerk backend client calls


12 production `clerkClient()` constructions occur in 11 files. All use the `clerk` local variable. No aliased factory import or additional client construction was found. Two constructions pass `clerk.organizations` into a typed service port. The table includes their downstream methods. No runtime Clerk calls were executed.

| Client construction | Actual method call sites | Business purpose |
| --- | --- | --- |
| [apps/app/app/actions/settings/invite-member.ts:37](../../apps/app/app/actions/settings/invite-member.ts#L37) | `organizations.createOrganizationInvitation` at [apps/app/app/actions/settings/invite-member.ts:38](../../apps/app/app/actions/settings/invite-member.ts#L38) | Invite a user to the current account with the selected role. |
| [apps/app/app/actions/settings/remove-member.ts:33](../../apps/app/app/actions/settings/remove-member.ts#L33) | `organizations.getOrganizationMembershipList` at [apps/app/app/actions/settings/remove-member.ts:34](../../apps/app/app/actions/settings/remove-member.ts#L34)<br>`organizations.deleteOrganizationMembership` at [apps/app/app/actions/settings/remove-member.ts:52](../../apps/app/app/actions/settings/remove-member.ts#L52) | Resolve the target membership, protect owner membership, then remove the user. |
| [apps/app/app/actions/settings/update-member-role.ts:45](../../apps/app/app/actions/settings/update-member-role.ts#L45) | `organizations.getOrganizationMembershipList` at [apps/app/app/actions/settings/update-member-role.ts:46](../../apps/app/app/actions/settings/update-member-role.ts#L46)<br>`organizations.updateOrganizationMembership` at [apps/app/app/actions/settings/update-member-role.ts:64](../../apps/app/app/actions/settings/update-member-role.ts#L64) | Resolve the target membership, protect owner membership, then change its role. |
| [apps/app/app/actions/settings/update-org.ts:88](../../apps/app/app/actions/settings/update-org.ts#L88) | `organizations.updateOrganization` at [apps/app/app/actions/settings/update-org.ts:89](../../apps/app/app/actions/settings/update-org.ts#L89) | Update the Clerk account name and public metadata for organisation settings. |
| [apps/app/lib/server/ensure-default-organisation.ts:36](../../apps/app/lib/server/ensure-default-organisation.ts#L36) | `organizations.getOrganization` at [apps/app/lib/server/ensure-default-organisation.ts:37](../../apps/app/lib/server/ensure-default-organisation.ts#L37) | Read the Clerk account name when creating the default payroll Organisation, falling back to Organisation on failure. |
| [apps/app/app/(authenticated)/settings/general/_actions.ts:60](../../apps/app/app/(authenticated)/settings/general/_actions.ts#L60) | `organizations.getOrganization` at [apps/app/app/(authenticated)/settings/general/_actions.ts:61](../../apps/app/app/(authenticated)/settings/general/_actions.ts#L61)<br>`organizations.updateOrganization` at [apps/app/app/(authenticated)/settings/general/_actions.ts:65](../../apps/app/app/(authenticated)/settings/general/_actions.ts#L65) | Read the previous account name, update it and record an account.name_changed audit event. |
| [apps/app/app/(authenticated)/settings/general/page.tsx:28](../../apps/app/app/(authenticated)/settings/general/page.tsx#L28) | `organizations.getOrganization` at [apps/app/app/(authenticated)/settings/general/page.tsx:29](../../apps/app/app/(authenticated)/settings/general/page.tsx#L29) | Load account name and slug for general settings. |
| [apps/app/app/(authenticated)/settings/members/page.tsx:18](../../apps/app/app/(authenticated)/settings/members/page.tsx#L18) | `organizations.getOrganizationMembershipList` at [apps/app/app/(authenticated)/settings/members/page.tsx:21](../../apps/app/app/(authenticated)/settings/members/page.tsx#L21)<br>`organizations.getOrganizationInvitationList` at [apps/app/app/(authenticated)/settings/members/page.tsx:25](../../apps/app/app/(authenticated)/settings/members/page.tsx#L25) | List current memberships (limit 100) and pending invitations for member management. |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:280](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L280) | `organizations.getOrganizationMembershipList` at [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:281](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L281) | Verify the user belongs to the account before linking a payroll person. |
| [apps/app/app/(authenticated)/people/_actions.ts:592](../../apps/app/app/(authenticated)/people/_actions.ts#L592) | `organizations.getOrganizationMembershipList` via [packages/availability/src/people/clerk-access-service.ts:155](../../packages/availability/src/people/clerk-access-service.ts#L155)<br>`organizations.getOrganizationInvitationList` via [packages/availability/src/people/clerk-access-service.ts:181](../../packages/availability/src/people/clerk-access-service.ts#L181) | loadClerkAccessCandidates / loadClerkAccessCandidatesAction passes clerk.organizations to loadClerkAccessReview; reads all memberships and pending invitations to classify access candidates and record the review. |
| [apps/app/app/(authenticated)/people/_actions.ts:640](../../apps/app/app/(authenticated)/people/_actions.ts#L640) | `organizations.getOrganizationMembershipList` via [packages/availability/src/people/clerk-access-service.ts:155](../../packages/availability/src/people/clerk-access-service.ts#L155)<br>`organizations.getOrganizationInvitationList` via [packages/availability/src/people/clerk-access-service.ts:181](../../packages/availability/src/people/clerk-access-service.ts#L181)<br>`organizations.createOrganizationInvitationBulk` via [packages/availability/src/people/clerk-access-service.ts:663](../../packages/availability/src/people/clerk-access-service.ts#L663) | inviteClerkAccessCandidates / inviteClerkAccessCandidatesAction passes clerk.organizations to the service; reconciles links, rechecks membership/invitation state and sends bulk invitations as org:viewer. |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.ts:652](../../packages/jobs/src/handlers/reconcile-xero-approval-state.ts#L652) | `organizations.getOrganizationMembershipList` at [packages/jobs/src/handlers/reconcile-xero-approval-state.ts:653](../../packages/jobs/src/handlers/reconcile-xero-approval-state.ts#L653) | Resolve up to 100 owner/admin recipients for approval-reconciliation notifications when no triggering user is present. |

The shared port is `ClerkOrganizationsApi` at [packages/availability/src/people/clerk-access-service.ts:82](../../packages/availability/src/people/clerk-access-service.ts#L82). `fetchAllClerkMemberships` (145) and `fetchAllClerkPendingInvitations` (171) paginate with limit 100 and offsets. `dispatchBatchWithRetry` (651) calls `createOrganizationInvitationBulk` (663), batches at most 10 candidates with a maximum of 50 batches and retries transient failures at most twice. These are provider calls behind the injected `clerk.organizations` port, not additional `clerkClient()` constructions.

## 3. Roles and auth helpers


| Source | Export/helper | Behaviour |
| --- | --- | --- |
| [packages/auth/helpers.ts:12](../../packages/auth/helpers.ts#L12) | `requireOrg` | Calls auth(); requires isAuthenticated and orgId, returns orgId or throws. |
| [packages/auth/helpers.ts:25](../../packages/auth/helpers.ts#L25) | `requireOrgResult` | Calls auth(); checks the same identity/account conditions, returns Result. |
| [packages/auth/helpers.ts:43](../../packages/auth/helpers.ts#L43) | `getOrgId` | Calls auth(); returns orgId or null. |
| [packages/auth/helpers.ts:52](../../packages/auth/helpers.ts#L52) | `requireRole` | Calls auth(); returns false for unauthenticated sessions, then authObject.has({ role }). Exact-role check, no hierarchy. |
| [packages/auth/helpers.ts:65](../../packages/auth/helpers.ts#L65) | `hasRoleResult` | Calls auth(); returns unauthorised Result for unauthenticated sessions, then wraps authObject.has({ role }). Exact-role check. |
| [apps/app/lib/auth/require-page-role.ts:23](../../apps/app/lib/auth/require-page-role.ts#L23) | `requirePageRole` | Calls auth(); checks every role at or above the requested role with has(); throws PermissionDeniedError when none match. |
| [apps/app/lib/auth/require-page-role.ts:41](../../apps/app/lib/auth/require-page-role.ts#L41) | `hasPageRole` | Calls auth(); applies the same hierarchy and returns a boolean. |
| [apps/app/lib/auth/require-page-role.ts:53](../../apps/app/lib/auth/require-page-role.ts#L53) | `rolesAtOrAbove` | viewer < manager < admin < owner. Unknown requested roles are passed through as an exact role, not automatically accepted. |
| [apps/app/lib/navigation/nav-items.ts:143](../../apps/app/lib/navigation/nav-items.ts#L143) | `isNavItemVisible` | Uses roles.includes(orgRole) for navigation visibility. Role groups are defined on lines 29 and 30. |
| [apps/app/lib/server/onboarding-gate.ts:16](../../apps/app/lib/server/onboarding-gate.ts#L16) | `resolveOnboardingRedirect` | Uses ADMIN_ROLES.has(input.orgRole): owner/admin accepted with either org: prefix or plain value. |
| [packages/availability/src/onboarding/wizard-service.ts:32](../../packages/availability/src/onboarding/wizard-service.ts#L32) | `isOnboardingAdmin` | Uses ADMIN_ROLES.has(role), same prefixed/plain owner/admin allowlist. |
| [packages/auth/entitlements.ts:48](../../packages/auth/entitlements.ts#L48) | `withinLimit` | Database-backed billing allowance check with assertTenantDb. Exported through @repo/auth/server, but does not call Clerk. |
| [packages/auth/entitlements.ts:67](../../packages/auth/entitlements.ts#L67) | `hasFeature` | Database-backed plan feature check with assertTenantDb. Exported through @repo/auth/server, but does not call Clerk. |

### Requested role literal counts

A literal occurrence is one complete quoted source string, so two literals on the same line count twice. A direct production check is one role literal used as an equality/inequality operand or direct `requireRole`, `requirePageRole`, `hasPageRole` or `has({ role })` argument. It excludes type unions, role options/defaults, role hierarchy/allowlist definitions and Zod enumeration definitions. It is a static source count, not a count of runtime checks or independently protected operations. Tests and docs are separate. Documentation counts are exact token mentions in tracked/search-visible Markdown/MDX, not application checks.

| Role | Production literals | Test literals | Fixture/tooling literals | Docs mentions | Direct production check operands/arguments |
| --- | --- | --- | --- | --- | --- |
| `org:owner` | 97 | 49 | 0 | 6 | 83 |
| `org:admin` | 100 | 183 | 0 | 35 | 83 |
| `org:manager` | 34 | 45 | 0 | 7 | 22 |
| `org:viewer` | 31 | 122 | 0 | 19 | 15 |
| `org:member` | 1 | 6 | 0 | 0 | 0 |
| `org:superuser` | 0 | 1 | 0 | 0 | 0 |

`org:member` has one production occurrence in the `ClerkOrganizationsApi` invitation type at [packages/availability/src/people/clerk-access-service.ts:88](../../packages/availability/src/people/clerk-access-service.ts#L88), with no direct production check. `org:superuser` appears only in [apps/app/lib/auth/require-page-role.test.ts:77](../../apps/app/lib/auth/require-page-role.test.ts#L77), exercising rejection of an unknown role. No additional `org:*` role strings were found. The plain sync-monitor role `contractor` is defined in [packages/availability/src/sync/sync-monitor-service.ts:75](../../packages/availability/src/sync/sync-monitor-service.ts#L75) and its validation schema on line 172. The plain dashboard role `employee` is a local presentation/domain role, not `org:employee`; Xero employment-type strings and access-candidate state `member` are separate concepts.

### Production literal counts and direct checks by app/package

| App/package | org:* literals | Direct org:* check operands/arguments | Direct plain-role comparison operands |
| --- | --- | --- | --- |
| apps/api | 9 | 9 | 0 |
| apps/app | 225 | 173 | 46 |
| packages/availability | 18 | 10 | 68 |
| packages/feeds | 9 | 9 | 8 |
| packages/jobs | 2 | 2 | 0 |
| packages/xero | 0 | 0 | 1 |
| Total | 263 | 203 | 123 |

The 203 direct `org:*` checks comprise 150 equality/inequality operands and 53 direct guard/API arguments. A further 47 production `org:*` literals are definitions/defaults/choices and 13 occur in Zod enumeration definitions. Plain role comparisons add 123 operands, listed below so downstream normalisation does not hide authorisation dependencies.

### Direct requested-role checks by app/package

Counts use the direct operand/guard-argument definition above. Shared dynamic guards have no hard-coded requested role in `packages/auth`, but their `has({ role })` implementation remains an auth dependency. Allowlist and hierarchy checks are catalogued separately below.

| App/package | org:owner | org:admin | org:manager | org:viewer | org:member | org:superuser |
|---|---:|---:|---:|---:|---:|---:|
| apps/api | 5 | 4 | 0 | 0 | 0 | 0 |
| apps/app | 70 | 71 | 18 | 14 | 0 | 0 |
| packages/auth | 0 | 0 | 0 | 0 | 0 | 0 |
| packages/availability | 4 | 4 | 2 | 0 | 0 | 0 |
| packages/feeds | 3 | 3 | 2 | 1 | 0 | 0 |
| packages/jobs | 1 | 1 | 0 | 0 | 0 | 0 |

### Every production org:* literal, including non-check uses

| Source | Literal(s), one item per occurrence | Category | Source excerpt |
| --- | --- | --- | --- |
| [apps/api/app/api/sync/dispatch/route.ts:44](../../apps/api/app/api/sync/dispatch/route.ts#L44) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/api/app/api/sync/dispatch/route.ts:45](../../apps/api/app/api/sync/dispatch/route.ts#L45) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/api/app/api/xero/oauth/callback/route.ts:85](../../apps/api/app/api/xero/oauth/callback/route.ts#L85) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/api/app/api/xero/oauth/callback/route.ts:86](../../apps/api/app/api/xero/oauth/callback/route.ts#L86) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/api/app/api/xero/oauth/callback/route.ts:167](../../apps/api/app/api/xero/oauth/callback/route.ts#L167) | `org:admin`, `org:owner` | comparison | `return (admin \|\| owner) && (role === "org:admin" \|\| role === "org:owner");` |
| [apps/api/app/api/xero/oauth/start/route.ts:24](../../apps/api/app/api/xero/oauth/start/route.ts#L24) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/api/app/api/xero/oauth/start/route.ts:25](../../apps/api/app/api/xero/oauth/start/route.ts#L25) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/api/app/webhooks/auth/route.ts:243](../../apps/api/app/webhooks/auth/route.ts#L243) | `org:owner` | comparison | `if (data.role === "org:owner") {` |
| [apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts:54](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts#L54) | `org:owner` | comparison | `if (orgRole === "org:owner") {` |
| [apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts:56](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts#L56) | `org:admin` | comparison | `} else if (orgRole === "org:admin") {` |
| [apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts:58](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts#L58) | `org:manager` | comparison | `} else if (orgRole === "org:manager") {` |
| [apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:45](../../apps/app/app/(authenticated)/analytics/leave-reports/page.tsx#L45) | `org:manager` | guard call | `await requirePageRole("org:manager");` |
| [apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:279](../../apps/app/app/(authenticated)/analytics/leave-reports/page.tsx#L279) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:282](../../apps/app/app/(authenticated)/analytics/leave-reports/page.tsx#L282) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:285](../../apps/app/app/(authenticated)/analytics/leave-reports/page.tsx#L285) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:46](../../apps/app/app/(authenticated)/analytics/out-of-office/page.tsx#L46) | `org:manager` | guard call | `await requirePageRole("org:manager");` |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:329](../../apps/app/app/(authenticated)/analytics/out-of-office/page.tsx#L329) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:332](../../apps/app/app/(authenticated)/analytics/out-of-office/page.tsx#L332) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:335](../../apps/app/app/(authenticated)/analytics/out-of-office/page.tsx#L335) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/calendar/page.tsx:177](../../apps/app/app/(authenticated)/calendar/page.tsx#L177) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/calendar/page.tsx:462](../../apps/app/app/(authenticated)/calendar/page.tsx#L462) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/calendar/page.tsx:465](../../apps/app/app/(authenticated)/calendar/page.tsx#L465) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/calendar/page.tsx:468](../../apps/app/app/(authenticated)/calendar/page.tsx#L468) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx:29](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx#L29) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx:30](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx#L30) | `org:owner` | comparison | `role === "org:owner" \|\|` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx:24](../../apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx#L24) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx:25](../../apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx#L25) | `org:owner` | comparison | `role === "org:owner";` |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.tsx:29](../../apps/app/app/(authenticated)/feeds/[feedId]/page.tsx#L29) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.tsx:30](../../apps/app/app/(authenticated)/feeds/[feedId]/page.tsx#L30) | `org:owner` | comparison | `role === "org:owner" \|\|` |
| [apps/app/app/(authenticated)/feeds/_actions.ts:411](../../apps/app/app/(authenticated)/feeds/_actions.ts#L411) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/_actions.ts:412](../../apps/app/app/(authenticated)/feeds/_actions.ts#L412) | `org:owner` | comparison | `role === "org:owner";` |
| [apps/app/app/(authenticated)/feeds/new/page.tsx:24](../../apps/app/app/(authenticated)/feeds/new/page.tsx#L24) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/new/page.tsx:25](../../apps/app/app/(authenticated)/feeds/new/page.tsx#L25) | `org:owner` | comparison | `role === "org:owner";` |
| [apps/app/app/(authenticated)/feeds/page.tsx:33](../../apps/app/app/(authenticated)/feeds/page.tsx#L33) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/feeds/page.tsx:46](../../apps/app/app/(authenticated)/feeds/page.tsx#L46) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/page.tsx:47](../../apps/app/app/(authenticated)/feeds/page.tsx#L47) | `org:owner` | comparison | `role === "org:owner";` |
| [apps/app/app/(authenticated)/leave-approvals/_actions.ts:442](../../apps/app/app/(authenticated)/leave-approvals/_actions.ts#L442) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/leave-approvals/_actions.ts:445](../../apps/app/app/(authenticated)/leave-approvals/_actions.ts#L445) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/leave-approvals/_actions.ts:448](../../apps/app/app/(authenticated)/leave-approvals/_actions.ts#L448) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/leave-approvals/page.tsx:73](../../apps/app/app/(authenticated)/leave-approvals/page.tsx#L73) | `org:manager` | guard call | `await requirePageRole("org:manager");` |
| [apps/app/app/(authenticated)/leave-approvals/page.tsx:172](../../apps/app/app/(authenticated)/leave-approvals/page.tsx#L172) | `org:owner`, `org:admin` | comparison | `if (role === "org:owner" \|\| role === "org:admin") {` |
| [apps/app/app/(authenticated)/leave-approvals/page.tsx:175](../../apps/app/app/(authenticated)/leave-approvals/page.tsx#L175) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/notifications/_actions.ts:129](../../apps/app/app/(authenticated)/notifications/_actions.ts#L129) | `org:viewer` | guard call | `if (!(await hasPageRole("org:viewer"))) {` |
| [apps/app/app/(authenticated)/notifications/page.tsx:49](../../apps/app/app/(authenticated)/notifications/page.tsx#L49) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/page.tsx:25](../../apps/app/app/(authenticated)/page.tsx#L25) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:33](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L33) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:165](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L165) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:168](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L168) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:171](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L171) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:174](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L174) | `org:viewer` | comparison | `if (role === "org:viewer") {` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:39](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L39) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:174](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L174) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:177](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L177) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:180](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L180) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:183](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L183) | `org:viewer` | comparison | `if (role === "org:viewer") {` |
| [apps/app/app/(authenticated)/people/_actions.ts:562](../../apps/app/app/(authenticated)/people/_actions.ts#L562) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/people/_actions.ts:565](../../apps/app/app/(authenticated)/people/_actions.ts#L565) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/people/_actions.ts:568](../../apps/app/app/(authenticated)/people/_actions.ts#L568) | `org:manager` | comparison | `if (role === "org:manager") {` |
| [apps/app/app/(authenticated)/people/_actions.ts:571](../../apps/app/app/(authenticated)/people/_actions.ts#L571) | `org:viewer` | comparison | `if (role === "org:viewer") {` |
| [apps/app/app/(authenticated)/people/_actions.ts:691](../../apps/app/app/(authenticated)/people/_actions.ts#L691) | `org:owner` | comparison | `orgRole === "org:owner" \|\|` |
| [apps/app/app/(authenticated)/people/_actions.ts:692](../../apps/app/app/(authenticated)/people/_actions.ts#L692) | `org:admin` | comparison | `orgRole === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/people/_actions.ts:693](../../apps/app/app/(authenticated)/people/_actions.ts#L693) | `org:owner` | guard call | `Boolean(has?.({ role: "org:owner" })) \|\|` |
| [apps/app/app/(authenticated)/people/_actions.ts:694](../../apps/app/app/(authenticated)/people/_actions.ts#L694) | `org:admin` | guard call | `Boolean(has?.({ role: "org:admin" }));` |
| [apps/app/app/(authenticated)/people/_actions.ts:747](../../apps/app/app/(authenticated)/people/_actions.ts#L747) | `org:owner`, `org:admin` | comparison | `(orgRole !== "org:owner" && orgRole !== "org:admin")` |
| [apps/app/app/(authenticated)/people/_actions.ts:762](../../apps/app/app/(authenticated)/people/_actions.ts#L762) | `org:owner` | comparison | `actingRole: orgRole === "org:owner" ? "owner" : "admin",` |
| [apps/app/app/(authenticated)/people/new/_actions.ts:44](../../apps/app/app/(authenticated)/people/new/_actions.ts#L44) | `org:admin`, `org:owner` | comparison | `if (!orgId \|\| (orgRole !== "org:admin" && orgRole !== "org:owner")) {` |
| [apps/app/app/(authenticated)/people/new/page.tsx:25](../../apps/app/app/(authenticated)/people/new/page.tsx#L25) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/people/page.tsx:30](../../apps/app/app/(authenticated)/people/page.tsx#L30) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/people/page.tsx:37](../../apps/app/app/(authenticated)/people/page.tsx#L37) | `org:admin`, `org:owner` | comparison | `const canIncludeArchived = orgRole === "org:admin" \|\| orgRole === "org:owner";` |
| [apps/app/app/(authenticated)/people/page.tsx:50](../../apps/app/app/(authenticated)/people/page.tsx#L50) | `org:admin` | comparison | `if (orgRole === "org:admin") {` |
| [apps/app/app/(authenticated)/people/page.tsx:52](../../apps/app/app/(authenticated)/people/page.tsx#L52) | `org:manager` | comparison | `} else if (orgRole === "org:manager") {` |
| [apps/app/app/(authenticated)/people/page.tsx:54](../../apps/app/app/(authenticated)/people/page.tsx#L54) | `org:owner` | comparison | `} else if (orgRole === "org:owner") {` |
| [apps/app/app/(authenticated)/plans/_actions.ts:712](../../apps/app/app/(authenticated)/plans/_actions.ts#L712) | `org:viewer` | comparison | `role === "org:viewer" \|\|` |
| [apps/app/app/(authenticated)/plans/_actions.ts:713](../../apps/app/app/(authenticated)/plans/_actions.ts#L713) | `org:manager` | comparison | `role === "org:manager" \|\|` |
| [apps/app/app/(authenticated)/plans/_actions.ts:714](../../apps/app/app/(authenticated)/plans/_actions.ts#L714) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/plans/_actions.ts:715](../../apps/app/app/(authenticated)/plans/_actions.ts#L715) | `org:owner` | comparison | `role === "org:owner"` |
| [apps/app/app/(authenticated)/plans/_actions.ts:723](../../apps/app/app/(authenticated)/plans/_actions.ts#L723) | `org:admin`, `org:owner` | definition/default/choice | `actingOrgRole: "org:admin" \| "org:owner";` |
| [apps/app/app/(authenticated)/plans/_actions.ts:734](../../apps/app/app/(authenticated)/plans/_actions.ts#L734) | `org:admin` | comparison | `context.value.orgRole !== "org:admin" &&` |
| [apps/app/app/(authenticated)/plans/_actions.ts:735](../../apps/app/app/(authenticated)/plans/_actions.ts#L735) | `org:owner` | comparison | `context.value.orgRole !== "org:owner"` |
| [apps/app/app/(authenticated)/plans/page.tsx:58](../../apps/app/app/(authenticated)/plans/page.tsx#L58) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/plans/page.tsx:365](../../apps/app/app/(authenticated)/plans/page.tsx#L365) | `org:manager`, `org:admin`, `org:owner` | comparison | `return role === "org:manager" \|\| role === "org:admin" \|\| role === "org:owner";` |
| [apps/app/app/(authenticated)/plans/page.tsx:368](../../apps/app/app/(authenticated)/plans/page.tsx#L368) | `org:admin`, `org:owner` | comparison | `return role === "org:admin" \|\| role === "org:owner";` |
| [apps/app/app/(authenticated)/plans/record-form-data.ts:69](../../apps/app/app/(authenticated)/plans/record-form-data.ts#L69) | `org:admin` | comparison | `orgRole === "org:admin" \|\|` |
| [apps/app/app/(authenticated)/plans/record-form-data.ts:70](../../apps/app/app/(authenticated)/plans/record-form-data.ts#L70) | `org:owner` | comparison | `orgRole === "org:owner" \|\|` |
| [apps/app/app/(authenticated)/plans/record-form-data.ts:71](../../apps/app/app/(authenticated)/plans/record-form-data.ts#L71) | `org:manager` | comparison | `orgRole === "org:manager";` |
| [apps/app/app/(authenticated)/plans/record-form-data.ts:306](../../apps/app/app/(authenticated)/plans/record-form-data.ts#L306) | `org:manager` | comparison | `if (orgRole === "org:manager") {` |
| [apps/app/app/(authenticated)/public-holidays/_actions.ts:33](../../apps/app/app/(authenticated)/public-holidays/_actions.ts#L33) | `org:owner` | guard call | `if (await requireRole("org:owner")) {` |
| [apps/app/app/(authenticated)/public-holidays/_actions.ts:35](../../apps/app/app/(authenticated)/public-holidays/_actions.ts#L35) | `org:admin` | guard call | `} else if (await requireRole("org:admin")) {` |
| [apps/app/app/(authenticated)/public-holidays/holidays/new/form-data.ts:31](../../apps/app/app/(authenticated)/public-holidays/holidays/new/form-data.ts#L31) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/public-holidays/page.tsx:32](../../apps/app/app/(authenticated)/public-holidays/page.tsx#L32) | `org:viewer` | guard call | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/public-holidays/page.tsx:37](../../apps/app/app/(authenticated)/public-holidays/page.tsx#L37) | `org:admin`, `org:owner` | comparison | `const canManage = orgRole === "org:admin" \|\| orgRole === "org:owner";` |
| [apps/app/app/(authenticated)/settings/audit-log/_actions.ts:53](../../apps/app/app/(authenticated)/settings/audit-log/_actions.ts#L53) | `org:owner` | comparison | `if (orgRole === "org:owner") {` |
| [apps/app/app/(authenticated)/settings/audit-log/_actions.ts:55](../../apps/app/app/(authenticated)/settings/audit-log/_actions.ts#L55) | `org:admin` | comparison | `} else if (orgRole === "org:admin") {` |
| [apps/app/app/(authenticated)/settings/audit-log/page.tsx:25](../../apps/app/app/(authenticated)/settings/audit-log/page.tsx#L25) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/audit-log/page.tsx:34](../../apps/app/app/(authenticated)/settings/audit-log/page.tsx#L34) | `org:owner` | comparison | `const role = orgRole === "org:owner" ? "owner" : "admin";` |
| [apps/app/app/(authenticated)/settings/billing/actions.ts:14](../../apps/app/app/(authenticated)/settings/billing/actions.ts#L14) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/billing/actions.ts:32](../../apps/app/app/(authenticated)/settings/billing/actions.ts#L32) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/billing/page.tsx:35](../../apps/app/app/(authenticated)/settings/billing/page.tsx#L35) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/billing/page.tsx:43](../../apps/app/app/(authenticated)/settings/billing/page.tsx#L43) | `org:owner` | guard call | `const isOwner = await requireRole("org:owner");` |
| [apps/app/app/(authenticated)/settings/components/role-badge.tsx:4](../../apps/app/app/(authenticated)/settings/components/role-badge.tsx#L4) | `org:owner`, `org:admin`, `org:manager`, `org:viewer` | definition/default/choice | `type OrgRole = "org:owner" \| "org:admin" \| "org:manager" \| "org:viewer";` |
| [apps/app/app/(authenticated)/settings/components/role-badge.tsx:7](../../apps/app/app/(authenticated)/settings/components/role-badge.tsx#L7) | `org:admin` | definition/default/choice | `"org:admin": {` |
| [apps/app/app/(authenticated)/settings/components/role-badge.tsx:12](../../apps/app/app/(authenticated)/settings/components/role-badge.tsx#L12) | `org:manager` | definition/default/choice | `"org:manager": {` |
| [apps/app/app/(authenticated)/settings/components/role-badge.tsx:16](../../apps/app/app/(authenticated)/settings/components/role-badge.tsx#L16) | `org:owner` | definition/default/choice | `"org:owner": {` |
| [apps/app/app/(authenticated)/settings/components/role-badge.tsx:21](../../apps/app/app/(authenticated)/settings/components/role-badge.tsx#L21) | `org:viewer` | definition/default/choice | `"org:viewer": {` |
| [apps/app/app/(authenticated)/settings/coverage/_actions.ts:133](../../apps/app/app/(authenticated)/settings/coverage/_actions.ts#L133) | `org:owner` | comparison | `if (orgRole === "org:owner") {` |
| [apps/app/app/(authenticated)/settings/coverage/_actions.ts:135](../../apps/app/app/(authenticated)/settings/coverage/_actions.ts#L135) | `org:admin` | comparison | `} else if (orgRole === "org:admin") {` |
| [apps/app/app/(authenticated)/settings/coverage/page.tsx:21](../../apps/app/app/(authenticated)/settings/coverage/page.tsx#L21) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/coverage/page.tsx:32](../../apps/app/app/(authenticated)/settings/coverage/page.tsx#L32) | `org:owner` | comparison | `actingRole: orgRole === "org:owner" ? "owner" : "admin",` |
| [apps/app/app/(authenticated)/settings/feeds/_actions.ts:44](../../apps/app/app/(authenticated)/settings/feeds/_actions.ts#L44) | `org:owner` | comparison | `if (orgRole === "org:owner") {` |
| [apps/app/app/(authenticated)/settings/feeds/_actions.ts:46](../../apps/app/app/(authenticated)/settings/feeds/_actions.ts#L46) | `org:admin` | comparison | `} else if (orgRole === "org:admin") {` |
| [apps/app/app/(authenticated)/settings/feeds/page.tsx:38](../../apps/app/app/(authenticated)/settings/feeds/page.tsx#L38) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/general/_actions.ts:265](../../apps/app/app/(authenticated)/settings/general/_actions.ts#L265) | `org:admin`, `org:owner` | comparison | `!(user && (orgRole === "org:admin" \|\| orgRole === "org:owner") && orgId)` |
| [apps/app/app/(authenticated)/settings/general/page.tsx:21](../../apps/app/app/(authenticated)/settings/general/page.tsx#L21) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/getting-started/page.tsx:23](../../apps/app/app/(authenticated)/settings/getting-started/page.tsx#L23) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/holidays/page.tsx:32](../../apps/app/app/(authenticated)/settings/holidays/page.tsx#L32) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/page.tsx:13](../../apps/app/app/(authenticated)/settings/integrations/page.tsx#L13) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:268](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L268) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:269](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L269) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:283](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L283) | `org:admin`, `org:owner` | comparison | `(orgRole !== "org:admin" && orgRole !== "org:owner")` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:298](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L298) | `org:owner` | guard call | `if (!(await requireRole("org:owner"))) {` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:360](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L360) | `org:owner`, `org:admin` | comparison | `(orgRole === "org:owner" \|\| (!ownerOnly && orgRole === "org:admin")) &&` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:54](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts#L54) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:55](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts#L55) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:74](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts#L74) | `org:admin`, `org:owner` | comparison | `(orgRole !== "org:admin" && orgRole !== "org:owner")` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx:21](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx#L21) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:46](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L46) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:47](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L47) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:106](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L106) | `org:owner`, `org:admin` | comparison | `(orgRole !== "org:owner" && orgRole !== "org:admin")` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx:24](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx#L24) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/xero/page.tsx:13](../../apps/app/app/(authenticated)/settings/integrations/xero/page.tsx#L13) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/xero/page.tsx:69](../../apps/app/app/(authenticated)/settings/integrations/xero/page.tsx#L69) | `org:owner` | comparison | `actingRole={orgRole === "org:owner" ? "owner" : "admin"}` |
| [apps/app/app/(authenticated)/settings/layout.tsx:21](../../apps/app/app/(authenticated)/settings/layout.tsx#L21) | `org:owner`, `org:admin` | comparison | `const isAdminOrOwner = orgRole === "org:owner" \|\| orgRole === "org:admin";` |
| [apps/app/app/(authenticated)/settings/leave-approval/_actions.ts:122](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.ts#L122) | `org:owner` | comparison | `if (orgRole === "org:owner") {` |
| [apps/app/app/(authenticated)/settings/leave-approval/_actions.ts:124](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.ts#L124) | `org:admin` | comparison | `} else if (orgRole === "org:admin") {` |
| [apps/app/app/(authenticated)/settings/leave-approval/_actions.ts:185](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.ts#L185) | `org:owner`, `org:admin` | comparison | `(orgRole !== "org:owner" && orgRole !== "org:admin")` |
| [apps/app/app/(authenticated)/settings/leave-approval/_actions.ts:193](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.ts#L193) | `org:owner` | comparison | `actingRole: orgRole === "org:owner" ? "owner" : "admin",` |
| [apps/app/app/(authenticated)/settings/leave-approval/page.tsx:18](../../apps/app/app/(authenticated)/settings/leave-approval/page.tsx#L18) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:43](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L43) | `org:owner`, `org:admin`, `org:manager`, `org:viewer` | definition/default/choice | `type OrgRole = "org:owner" \| "org:admin" \| "org:manager" \| "org:viewer";` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:70](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L70) | `org:admin` | definition/default/choice | `{ label: "Admin", value: "org:admin" },` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:71](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L71) | `org:manager` | definition/default/choice | `{ label: "Manager", value: "org:manager" },` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:72](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L72) | `org:viewer` | definition/default/choice | `{ label: "Viewer", value: "org:viewer" },` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:96](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L96) | `org:viewer` | definition/default/choice | `const [inviteRole, setInviteRole] = useState<OrgRole>("org:viewer");` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:102](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L102) | `org:owner` | comparison | `const isOwner = currentUserRole === "org:owner";` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:201](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L201) | `org:owner` | definition/default/choice | `{isOwner && <SelectItem value="org:owner">Owner</SelectItem>}` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:277](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L277) | `org:owner` | comparison | `{isSelf \|\| (!isOwner && member.role === "org:owner") ? (` |
| [apps/app/app/(authenticated)/settings/members/members-client.tsx:303](../../apps/app/app/(authenticated)/settings/members/members-client.tsx#L303) | `org:owner` | definition/default/choice | `value="org:owner"` |
| [apps/app/app/(authenticated)/settings/members/page.tsx:51](../../apps/app/app/(authenticated)/settings/members/page.tsx#L51) | `org:viewer` | definition/default/choice | `currentUserRole={orgRole ?? "org:viewer"}` |
| [apps/app/app/(authenticated)/setup/_actions.ts:48](../../apps/app/app/(authenticated)/setup/_actions.ts#L48) | `org:admin`, `org:owner` | comparison | `(orgRole !== "org:admin" && orgRole !== "org:owner")` |
| [apps/app/app/(authenticated)/sync/[runId]/page.tsx:38](../../apps/app/app/(authenticated)/sync/[runId]/page.tsx#L38) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/sync/[runId]/page.tsx:131](../../apps/app/app/(authenticated)/sync/[runId]/page.tsx#L131) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/sync/[runId]/page.tsx:134](../../apps/app/app/(authenticated)/sync/[runId]/page.tsx#L134) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/sync/_actions.ts:99](../../apps/app/app/(authenticated)/sync/_actions.ts#L99) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/sync/_actions.ts:100](../../apps/app/app/(authenticated)/sync/_actions.ts#L100) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/sync/_actions.ts:179](../../apps/app/app/(authenticated)/sync/_actions.ts#L179) | `org:admin` | guard call | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/sync/_actions.ts:180](../../apps/app/app/(authenticated)/sync/_actions.ts#L180) | `org:owner` | guard call | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/sync/_actions.ts:376](../../apps/app/app/(authenticated)/sync/_actions.ts#L376) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/sync/_actions.ts:379](../../apps/app/app/(authenticated)/sync/_actions.ts#L379) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(authenticated)/sync/page.tsx:36](../../apps/app/app/(authenticated)/sync/page.tsx#L36) | `org:admin` | guard call | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/sync/page.tsx:154](../../apps/app/app/(authenticated)/sync/page.tsx#L154) | `org:owner` | comparison | `if (role === "org:owner") {` |
| [apps/app/app/(authenticated)/sync/page.tsx:157](../../apps/app/app/(authenticated)/sync/page.tsx#L157) | `org:admin` | comparison | `if (role === "org:admin") {` |
| [apps/app/app/(setup)/onboarding/_actions.ts:317](../../apps/app/app/(setup)/onboarding/_actions.ts#L317) | `org:admin`, `org:manager`, `org:viewer` | validation schema | `role: z.enum(["org:admin", "org:manager", "org:viewer"]),` |
| [apps/app/app/(setup)/onboarding/steps/invite-step.tsx:25](../../apps/app/app/(setup)/onboarding/steps/invite-step.tsx#L25) | `org:admin`, `org:manager`, `org:viewer` | definition/default/choice | `type InviteRole = "org:admin" \| "org:manager" \| "org:viewer";` |
| [apps/app/app/(setup)/onboarding/steps/invite-step.tsx:28](../../apps/app/app/(setup)/onboarding/steps/invite-step.tsx#L28) | `org:admin` | definition/default/choice | `{ label: "Admin", value: "org:admin" },` |
| [apps/app/app/(setup)/onboarding/steps/invite-step.tsx:29](../../apps/app/app/(setup)/onboarding/steps/invite-step.tsx#L29) | `org:manager` | definition/default/choice | `{ label: "Manager", value: "org:manager" },` |
| [apps/app/app/(setup)/onboarding/steps/invite-step.tsx:30](../../apps/app/app/(setup)/onboarding/steps/invite-step.tsx#L30) | `org:viewer` | definition/default/choice | `{ label: "Viewer", value: "org:viewer" },` |
| [apps/app/app/(setup)/onboarding/steps/invite-step.tsx:46](../../apps/app/app/(setup)/onboarding/steps/invite-step.tsx#L46) | `org:manager`, `org:viewer` | definition/default/choice | `role: person.hasDirectReports ? "org:manager" : "org:viewer",` |
| [apps/app/app/(setup)/onboarding/steps/invite-step.tsx:58](../../apps/app/app/(setup)/onboarding/steps/invite-step.tsx#L58) | `org:viewer` | definition/default/choice | `role: "org:viewer",` |
| [apps/app/app/(setup)/welcome/page.tsx:36](../../apps/app/app/(setup)/welcome/page.tsx#L36) | `org:manager` | comparison | `return orgRole === "org:manager" ? "manager" : "viewer";` |
| [apps/app/app/actions/settings/invite-member.ts:9](../../apps/app/app/actions/settings/invite-member.ts#L9) | `org:owner`, `org:admin`, `org:manager`, `org:viewer` | validation schema | `role: z.enum(["org:owner", "org:admin", "org:manager", "org:viewer"]),` |
| [apps/app/app/actions/settings/invite-member.ts:21](../../apps/app/app/actions/settings/invite-member.ts#L21) | `org:owner`, `org:admin` | comparison | `if (orgRole !== "org:owner" && orgRole !== "org:admin") {` |
| [apps/app/app/actions/settings/invite-member.ts:32](../../apps/app/app/actions/settings/invite-member.ts#L32) | `org:owner`, `org:owner` | comparison | `if (parsed.data.role === "org:owner" && orgRole !== "org:owner") {` |
| [apps/app/app/actions/settings/remove-member.ts:20](../../apps/app/app/actions/settings/remove-member.ts#L20) | `org:owner`, `org:admin` | comparison | `if (orgRole !== "org:owner" && orgRole !== "org:admin") {` |
| [apps/app/app/actions/settings/remove-member.ts:45](../../apps/app/app/actions/settings/remove-member.ts#L45) | `org:owner`, `org:owner` | comparison | `if (memberships.data[0]?.role === "org:owner" && orgRole !== "org:owner") {` |
| [apps/app/app/actions/settings/revoke-tokens.ts:30](../../apps/app/app/actions/settings/revoke-tokens.ts#L30) | `org:owner`, `org:admin` | comparison | `if (orgRole !== "org:owner" && orgRole !== "org:admin") {` |
| [apps/app/app/actions/settings/update-member-role.ts:9](../../apps/app/app/actions/settings/update-member-role.ts#L9) | `org:owner`, `org:admin`, `org:manager`, `org:viewer` | validation schema | `role: z.enum(["org:owner", "org:admin", "org:manager", "org:viewer"]),` |
| [apps/app/app/actions/settings/update-member-role.ts:23](../../apps/app/app/actions/settings/update-member-role.ts#L23) | `org:owner`, `org:admin` | comparison | `if (orgRole !== "org:owner" && orgRole !== "org:admin") {` |
| [apps/app/app/actions/settings/update-member-role.ts:37](../../apps/app/app/actions/settings/update-member-role.ts#L37) | `org:owner`, `org:owner` | comparison | `if (parsed.data.role === "org:owner" && orgRole !== "org:owner") {` |
| [apps/app/app/actions/settings/update-member-role.ts:57](../../apps/app/app/actions/settings/update-member-role.ts#L57) | `org:owner`, `org:owner` | comparison | `if (memberships.data[0]?.role === "org:owner" && orgRole !== "org:owner") {` |
| [apps/app/app/actions/settings/update-org.ts:32](../../apps/app/app/actions/settings/update-org.ts#L32) | `org:owner`, `org:admin` | comparison | `if (orgRole !== "org:owner" && orgRole !== "org:admin") {` |
| [apps/app/lib/auth/require-page-role.ts:6](../../apps/app/lib/auth/require-page-role.ts#L6) | `org:viewer` | definition/default/choice | `"org:viewer",` |
| [apps/app/lib/auth/require-page-role.ts:7](../../apps/app/lib/auth/require-page-role.ts#L7) | `org:manager` | definition/default/choice | `"org:manager",` |
| [apps/app/lib/auth/require-page-role.ts:8](../../apps/app/lib/auth/require-page-role.ts#L8) | `org:admin` | definition/default/choice | `"org:admin",` |
| [apps/app/lib/auth/require-page-role.ts:9](../../apps/app/lib/auth/require-page-role.ts#L9) | `org:owner` | definition/default/choice | `"org:owner",` |
| [apps/app/lib/navigation/nav-items.ts:29](../../apps/app/lib/navigation/nav-items.ts#L29) | `org:manager`, `org:admin`, `org:owner` | definition/default/choice | `const ANALYTICS_NAV_ROLES = ["org:manager", "org:admin", "org:owner"] as const;` |
| [apps/app/lib/navigation/nav-items.ts:30](../../apps/app/lib/navigation/nav-items.ts#L30) | `org:admin`, `org:owner` | definition/default/choice | `const ADMIN_ROLES = ["org:admin", "org:owner"] as const;` |
| [apps/app/lib/server/onboarding-gate.ts:1](../../apps/app/lib/server/onboarding-gate.ts#L1) | `org:admin`, `org:owner` | definition/default/choice | `const ADMIN_ROLES = new Set(["admin", "org:admin", "org:owner", "owner"]);` |
| [packages/availability/src/dashboard/dashboard-service.ts:223](../../packages/availability/src/dashboard/dashboard-service.ts#L223) | `org:owner` | comparison | `if (parsed.data.orgRole === "org:owner") {` |
| [packages/availability/src/dashboard/dashboard-service.ts:226](../../packages/availability/src/dashboard/dashboard-service.ts#L226) | `org:admin` | comparison | `if (parsed.data.orgRole === "org:admin") {` |
| [packages/availability/src/onboarding/wizard-service.ts:30](../../packages/availability/src/onboarding/wizard-service.ts#L30) | `org:admin`, `org:owner` | definition/default/choice | `const ADMIN_ROLES = new Set(["admin", "org:admin", "org:owner", "owner"]);` |
| [packages/availability/src/people/clerk-access-service.ts:88](../../packages/availability/src/people/clerk-access-service.ts#L88) | `org:admin`, `org:member`, `org:viewer` | definition/default/choice | `role: "org:admin" \| "org:member" \| "org:viewer" \| string;` |
| [packages/availability/src/people/clerk-access-service.ts:668](../../packages/availability/src/people/clerk-access-service.ts#L668) | `org:viewer` | definition/default/choice | `role: "org:viewer",` |
| [packages/availability/src/plans/plan-service.ts:1863](../../packages/availability/src/plans/plan-service.ts#L1863) | `org:manager` | comparison | `if (actingOrgRole !== "org:manager" \|\| !actingPersonId) {` |
| [packages/availability/src/plans/plan-service.ts:1871](../../packages/availability/src/plans/plan-service.ts#L1871) | `org:admin`, `org:owner` | comparison | `return role === "org:admin" \|\| role === "org:owner";` |
| [packages/availability/src/plans/submit-recovery-service.ts:35](../../packages/availability/src/plans/submit-recovery-service.ts#L35) | `org:owner`, `org:admin` | validation schema | `actingOrgRole: z.enum(["org:owner", "org:admin"]),` |
| [packages/availability/src/plans/submit-service.ts:699](../../packages/availability/src/plans/submit-service.ts#L699) | `org:manager` | comparison | `input.actingOrgRole !== "org:manager" \|\|` |
| [packages/availability/src/plans/submit-service.ts:1518](../../packages/availability/src/plans/submit-service.ts#L1518) | `org:admin`, `org:owner` | comparison | `return role === "org:admin" \|\| role === "org:owner";` |
| [packages/availability/src/records/manual-records-service.ts:658](../../packages/availability/src/records/manual-records-service.ts#L658) | `org:admin`, `org:owner` | comparison | `return role === "org:admin" \|\| role === "org:owner";` |
| [packages/feeds/src/scope/feed-scope.ts:345](../../packages/feeds/src/scope/feed-scope.ts#L345) | `org:manager` | comparison | `if (input.role === "manager" \|\| input.role === "org:manager") {` |
| [packages/feeds/src/scope/feed-scope.ts:404](../../packages/feeds/src/scope/feed-scope.ts#L404) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [packages/feeds/src/scope/feed-scope.ts:405](../../packages/feeds/src/scope/feed-scope.ts#L405) | `org:owner` | comparison | `role === "org:owner"` |
| [packages/feeds/src/scope/feed-scope.ts:411](../../packages/feeds/src/scope/feed-scope.ts#L411) | `org:owner` | comparison | `role === "org:owner" \|\|` |
| [packages/feeds/src/scope/feed-scope.ts:412](../../packages/feeds/src/scope/feed-scope.ts#L412) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [packages/feeds/src/scope/feed-scope.ts:413](../../packages/feeds/src/scope/feed-scope.ts#L413) | `org:manager` | comparison | `role === "org:manager" \|\|` |
| [packages/feeds/src/scope/feed-scope.ts:414](../../packages/feeds/src/scope/feed-scope.ts#L414) | `org:viewer` | comparison | `role === "org:viewer"` |
| [packages/feeds/src/tokens/token-service.ts:646](../../packages/feeds/src/tokens/token-service.ts#L646) | `org:admin` | comparison | `role === "org:admin" \|\|` |
| [packages/feeds/src/tokens/token-service.ts:647](../../packages/feeds/src/tokens/token-service.ts#L647) | `org:owner` | comparison | `role === "org:owner"` |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.ts:662](../../packages/jobs/src/handlers/reconcile-xero-approval-state.ts#L662) | `org:admin`, `org:owner` | comparison | `membership.role === "org:admin" \|\| membership.role === "org:owner"` |

### Normalised plain-role production comparisons

| Source | Compared role(s) | Source excerpt |
| --- | --- | --- |
| [apps/app/app/(authenticated)/calendar/page.tsx:321](../../apps/app/app/(authenticated)/calendar/page.tsx#L321) | `admin`, `owner` | `canConnect={role === "admin" \|\| role === "owner"}` |
| [apps/app/app/(authenticated)/dashboard-body.tsx:155](../../apps/app/app/(authenticated)/dashboard-body.tsx#L155) | `viewer` | `if (!actingPerson \|\| role === "viewer") {` |
| [apps/app/app/(authenticated)/dashboard-body.tsx:197](../../apps/app/app/(authenticated)/dashboard-body.tsx#L197) | `owner`, `admin` | `role: role === "owner" \|\| role === "admin" ? role : "viewer",` |
| [apps/app/app/(authenticated)/dashboard-body.tsx:216](../../apps/app/app/(authenticated)/dashboard-body.tsx#L216) | `owner`, `admin` | `role === "owner" \|\| role === "admin"` |
| [apps/app/app/(authenticated)/dashboard-body.tsx:232](../../apps/app/app/(authenticated)/dashboard-body.tsx#L232) | `owner`, `admin` | `role === "owner" \|\| role === "admin"` |
| [apps/app/app/(authenticated)/dashboard-body.tsx:245](../../apps/app/app/(authenticated)/dashboard-body.tsx#L245) | `admin`, `owner` | `if (role === "admin" \|\| role === "owner") {` |
| [apps/app/app/(authenticated)/dashboard-body.tsx:251](../../apps/app/app/(authenticated)/dashboard-body.tsx#L251) | `manager` | `if (role === "manager") {` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx:31](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx#L31) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx:32](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.tsx#L32) | `owner` | `role === "owner";` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx:22](../../apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx#L22) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx:23](../../apps/app/app/(authenticated)/feeds/@modal/(.)new/page.tsx#L23) | `owner` | `role === "owner" \|\|` |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.tsx:31](../../apps/app/app/(authenticated)/feeds/[feedId]/page.tsx#L31) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.tsx:32](../../apps/app/app/(authenticated)/feeds/[feedId]/page.tsx#L32) | `owner` | `role === "owner";` |
| [apps/app/app/(authenticated)/feeds/_actions.ts:409](../../apps/app/app/(authenticated)/feeds/_actions.ts#L409) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/_actions.ts:410](../../apps/app/app/(authenticated)/feeds/_actions.ts#L410) | `owner` | `role === "owner" \|\|` |
| [apps/app/app/(authenticated)/feeds/new/page.tsx:22](../../apps/app/app/(authenticated)/feeds/new/page.tsx#L22) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/new/page.tsx:23](../../apps/app/app/(authenticated)/feeds/new/page.tsx#L23) | `owner` | `role === "owner" \|\|` |
| [apps/app/app/(authenticated)/feeds/page.tsx:44](../../apps/app/app/(authenticated)/feeds/page.tsx#L44) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/feeds/page.tsx:45](../../apps/app/app/(authenticated)/feeds/page.tsx#L45) | `owner` | `role === "owner" \|\|` |
| [apps/app/app/(authenticated)/leave-approvals/_actions.ts:355](../../apps/app/app/(authenticated)/leave-approvals/_actions.ts#L355) | `manager` | `if (!(orgId && user && role) \|\| (adminOnly && role === "manager")) {` |
| [apps/app/app/(authenticated)/leave-approvals/_actions.ts:390](../../apps/app/app/(authenticated)/leave-approvals/_actions.ts#L390) | `manager` | `if (actor.role === "manager") {` |
| [apps/app/app/(authenticated)/leave-approvals/page.tsx:115](../../apps/app/app/(authenticated)/leave-approvals/page.tsx#L115) | `manager` | `if (role === "manager" && !actingPerson) {` |
| [apps/app/app/(authenticated)/leave-approvals/page.tsx:153](../../apps/app/app/(authenticated)/leave-approvals/page.tsx#L153) | `admin` | `canDispatchReconciliation={role === "admin"}` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:123](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L123) | `owner`, `admin` | `const canAssignManager = role === "owner" \|\| role === "admin";` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:136](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L136) | `admin`, `owner` | `canRefreshBalances: role === "admin" \|\| role === "owner",` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:157](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L157) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:158](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L158) | `owner` | `role === "owner" \|\|` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:132](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L132) | `owner`, `admin` | `const canAssignManager = role === "owner" \|\| role === "admin";` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:145](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L145) | `admin`, `owner` | `canRefreshBalances: role === "admin" \|\| role === "owner",` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:166](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L166) | `admin` | `role === "admin" \|\|` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:167](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L167) | `owner` | `role === "owner" \|\|` |
| [apps/app/app/(authenticated)/settings/integrations/xero/xero-client.tsx:150](../../apps/app/app/(authenticated)/settings/integrations/xero/xero-client.tsx#L150) | `owner`, `admin` | `if (actingRole !== "owner" && actingRole !== "admin") {` |
| [apps/app/app/(authenticated)/settings/integrations/xero/xero-client.tsx:366](../../apps/app/app/(authenticated)/settings/integrations/xero/xero-client.tsx#L366) | `owner` | `{actingRole === "owner" ? (` |
| [apps/app/components/dashboard/timeline-adapter.ts:109](../../apps/app/components/dashboard/timeline-adapter.ts#L109) | `admin` | `if (role === "admin") {` |
| [apps/app/components/dashboard/timeline-adapter.ts:117](../../apps/app/components/dashboard/timeline-adapter.ts#L117) | `manager` | `if (role === "manager" && shown < total) {` |
| [apps/app/components/dashboard/timeline-adapter.ts:144](../../apps/app/components/dashboard/timeline-adapter.ts#L144) | `admin` | `if (role !== "admin") {` |
| [packages/availability/src/analytics/leave-reports-service.ts:323](../../packages/availability/src/analytics/leave-reports-service.ts#L323) | `admin`, `owner` | `role === "admin" \|\| role === "owner"` |
| [packages/availability/src/analytics/leave-reports-service.ts:447](../../packages/availability/src/analytics/leave-reports-service.ts#L447) | `viewer` | `if (input.role === "viewer") {` |
| [packages/availability/src/analytics/leave-reports-service.ts:449](../../packages/availability/src/analytics/leave-reports-service.ts#L449) | `manager` | `} else if (input.role === "manager") {` |
| [packages/availability/src/analytics/out-of-office-service.ts:301](../../packages/availability/src/analytics/out-of-office-service.ts#L301) | `admin`, `owner` | `role === "admin" \|\| role === "owner"` |
| [packages/availability/src/analytics/out-of-office-service.ts:413](../../packages/availability/src/analytics/out-of-office-service.ts#L413) | `viewer` | `if (input.role === "viewer") {` |
| [packages/availability/src/analytics/out-of-office-service.ts:415](../../packages/availability/src/analytics/out-of-office-service.ts#L415) | `manager` | `} else if (input.role === "manager") {` |
| [packages/availability/src/approvals/approval-service.ts:315](../../packages/availability/src/approvals/approval-service.ts#L315) | `manager` | `if (parsed.data.role === "manager" && !parsed.data.actingPersonId) {` |
| [packages/availability/src/approvals/approval-service.ts:372](../../packages/availability/src/approvals/approval-service.ts#L372) | `manager` | `...(data.role === "manager"` |
| [packages/availability/src/approvals/approval-service.ts:462](../../packages/availability/src/approvals/approval-service.ts#L462) | `manager` | `if (!(data.role === "manager" && data.actingPersonId)) {` |
| [packages/availability/src/approvals/approval-service.ts:573](../../packages/availability/src/approvals/approval-service.ts#L573) | `manager` | `if (parsed.data.role === "manager" && !parsed.data.actingPersonId) {` |
| [packages/availability/src/approvals/approval-service.ts:586](../../packages/availability/src/approvals/approval-service.ts#L586) | `manager` | `...(parsed.data.role === "manager"` |
| [packages/availability/src/approvals/approval-service.ts:919](../../packages/availability/src/approvals/approval-service.ts#L919) | `admin`, `owner` | `if (!(parsed.data.role === "admin" \|\| parsed.data.role === "owner")) {` |
| [packages/availability/src/approvals/approval-service.ts:943](../../packages/availability/src/approvals/approval-service.ts#L943) | `admin`, `owner` | `if (!(parsed.data.role === "admin" \|\| parsed.data.role === "owner")) {` |
| [packages/availability/src/approvals/approval-service.ts:971](../../packages/availability/src/approvals/approval-service.ts#L971) | `admin`, `owner` | `if (!(parsed.data.role === "admin" \|\| parsed.data.role === "owner")) {` |
| [packages/availability/src/approvals/approval-service.ts:2242](../../packages/availability/src/approvals/approval-service.ts#L2242) | `admin`, `owner` | `if (input.role === "admin" \|\| input.role === "owner") {` |
| [packages/availability/src/approvals/approval-service.ts:2245](../../packages/availability/src/approvals/approval-service.ts#L2245) | `manager` | `if (!(input.role === "manager" && input.actingPersonId)) {` |
| [packages/availability/src/approvals/approval-service.ts:2260](../../packages/availability/src/approvals/approval-service.ts#L2260) | `admin`, `owner`, `manager` | `return role === "admin" \|\| role === "owner" \|\| role === "manager";` |
| [packages/availability/src/calendar/calendar-service.ts:385](../../packages/availability/src/calendar/calendar-service.ts#L385) | `manager` | `input.role === "manager")` |
| [packages/availability/src/calendar/calendar-service.ts:715](../../packages/availability/src/calendar/calendar-service.ts#L715) | `manager` | `(input.role === "manager" &&` |
| [packages/availability/src/calendar/calendar-service.ts:739](../../packages/availability/src/calendar/calendar-service.ts#L739) | `manager` | `if (input.role !== "manager" \|\| !actingPersonId) {` |
| [packages/availability/src/calendar/calendar-service.ts:1055](../../packages/availability/src/calendar/calendar-service.ts#L1055) | `manager` | `if (actor.role === "manager" && actor.managerReportIds.has(targetPerson.id)) {` |
| [packages/availability/src/calendar/calendar-service.ts:1121](../../packages/availability/src/calendar/calendar-service.ts#L1121) | `manager` | `if (actor.role !== "manager" \|\| !actor.actingPersonId) {` |
| [packages/availability/src/calendar/calendar-service.ts:1150](../../packages/availability/src/calendar/calendar-service.ts#L1150) | `admin`, `owner` | `return role === "admin" \|\| role === "owner";` |
| [packages/availability/src/dashboard/dashboard-service.ts:399](../../packages/availability/src/dashboard/dashboard-service.ts#L399) | `owner` | `const adminRole = data.actingRole === "owner" ? "owner" : "admin";` |
| [packages/availability/src/dashboard/dashboard-service.ts:466](../../packages/availability/src/dashboard/dashboard-service.ts#L466) | `owner` | `roleLabel: adminRole === "owner" ? "Owner" : "Admin",` |
| [packages/availability/src/dashboard/dashboard-service.ts:908](../../packages/availability/src/dashboard/dashboard-service.ts#L908) | `owner` | `if (role === "owner") {` |
| [packages/availability/src/dashboard/dashboard-service.ts:911](../../packages/availability/src/dashboard/dashboard-service.ts#L911) | `admin` | `if (role === "admin") {` |
| [packages/availability/src/dashboard/dashboard-service.ts:919](../../packages/availability/src/dashboard/dashboard-service.ts#L919) | `owner` | `if (role === "owner") {` |
| [packages/availability/src/dashboard/dashboard-service.ts:922](../../packages/availability/src/dashboard/dashboard-service.ts#L922) | `admin` | `if (role === "admin") {` |
| [packages/availability/src/dashboard/dashboard-service.ts:925](../../packages/availability/src/dashboard/dashboard-service.ts#L925) | `manager` | `if (role === "manager") {` |
| [packages/availability/src/holidays/holiday-preferences.ts:171](../../packages/availability/src/holidays/holiday-preferences.ts#L171) | `owner`, `admin` | `if (!(input.actingRole === "owner" \|\| input.actingRole === "admin")) {` |
| [packages/availability/src/people/alternative-contact-service.ts:469](../../packages/availability/src/people/alternative-contact-service.ts#L469) | `admin` | `actingRole === "admin" \|\|` |
| [packages/availability/src/people/alternative-contact-service.ts:470](../../packages/availability/src/people/alternative-contact-service.ts#L470) | `owner` | `actingRole === "owner" \|\|` |
| [packages/availability/src/people/balance-refresh.ts:112](../../packages/availability/src/people/balance-refresh.ts#L112) | `admin`, `owner` | `!(parsed.data.actingRole === "admin" \|\| parsed.data.actingRole === "owner")` |
| [packages/availability/src/people/manager-assignment-service.ts:38](../../packages/availability/src/people/manager-assignment-service.ts#L38) | `owner` | `parsed.data.actingRole !== "owner" &&` |
| [packages/availability/src/people/manager-assignment-service.ts:39](../../packages/availability/src/people/manager-assignment-service.ts#L39) | `admin` | `parsed.data.actingRole !== "admin"` |
| [packages/availability/src/people/manual-balance-service.ts:102](../../packages/availability/src/people/manual-balance-service.ts#L102) | `admin`, `owner` | `parsed.data.actingRole === "admin" \|\| parsed.data.actingRole === "owner"` |
| [packages/availability/src/people/people-service.ts:253](../../packages/availability/src/people/people-service.ts#L253) | `owner`, `admin` | `if (input.role === "owner" \|\| input.role === "admin") {` |
| [packages/availability/src/people/people-service.ts:259](../../packages/availability/src/people/people-service.ts#L259) | `viewer` | `if (input.role === "viewer") {` |
| [packages/availability/src/people/people-service.ts:1272](../../packages/availability/src/people/people-service.ts#L1272) | `viewer` | `if (input.role === "viewer") {` |
| [packages/availability/src/people/people-service.ts:1278](../../packages/availability/src/people/people-service.ts#L1278) | `manager` | `if (input.role !== "manager") {` |
| [packages/availability/src/settings/account-approval-settings-service.ts:74](../../packages/availability/src/settings/account-approval-settings-service.ts#L74) | `admin` | `parsed.data.actingRole !== "admin" &&` |
| [packages/availability/src/settings/account-approval-settings-service.ts:75](../../packages/availability/src/settings/account-approval-settings-service.ts#L75) | `owner` | `parsed.data.actingRole !== "owner"` |
| [packages/availability/src/settings/audit-log-service.ts:320](../../packages/availability/src/settings/audit-log-service.ts#L320) | `admin`, `owner` | `return role === "admin" \|\| role === "owner";` |
| [packages/availability/src/settings/billing-service.ts:67](../../packages/availability/src/settings/billing-service.ts#L67) | `owner` | `parsed.data.actingRole !== "owner" &&` |
| [packages/availability/src/settings/billing-service.ts:68](../../packages/availability/src/settings/billing-service.ts#L68) | `admin` | `parsed.data.actingRole !== "admin"` |
| [packages/availability/src/settings/organisation-settings-service.ts:70](../../packages/availability/src/settings/organisation-settings-service.ts#L70) | `admin`, `owner` | `!(parsed.data.actingRole === "admin" \|\| parsed.data.actingRole === "owner")` |
| [packages/availability/src/sync/sync-monitor-service.ts:766](../../packages/availability/src/sync/sync-monitor-service.ts#L766) | `admin`, `owner` | `!(parsed.data.actingRole === "admin" \|\| parsed.data.actingRole === "owner")` |
| [packages/availability/src/sync/sync-monitor-service.ts:1198](../../packages/availability/src/sync/sync-monitor-service.ts#L1198) | `admin`, `owner` | `return role === "admin" \|\| role === "owner";` |
| [packages/availability/src/team-coverage/team-coverage-minimums.ts:47](../../packages/availability/src/team-coverage/team-coverage-minimums.ts#L47) | `owner`, `admin` | `const canManage = (role: string) => role === "owner" \|\| role === "admin";` |
| [packages/feeds/src/scope/feed-scope.ts:345](../../packages/feeds/src/scope/feed-scope.ts#L345) | `manager` | `if (input.role === "manager" \|\| input.role === "org:manager") {` |
| [packages/feeds/src/scope/feed-scope.ts:402](../../packages/feeds/src/scope/feed-scope.ts#L402) | `admin` | `role === "admin" \|\|` |
| [packages/feeds/src/scope/feed-scope.ts:403](../../packages/feeds/src/scope/feed-scope.ts#L403) | `owner` | `role === "owner" \|\|` |
| [packages/feeds/src/scope/feed-scope.ts:418](../../packages/feeds/src/scope/feed-scope.ts#L418) | `owner`, `admin`, `manager` | `if (role === "owner" \|\| role === "admin" \|\| role === "manager") {` |
| [packages/feeds/src/tokens/token-service.ts:644](../../packages/feeds/src/tokens/token-service.ts#L644) | `admin` | `role === "admin" \|\|` |
| [packages/feeds/src/tokens/token-service.ts:645](../../packages/feeds/src/tokens/token-service.ts#L645) | `owner` | `role === "owner" \|\|` |
| [packages/xero/src/oauth/disconnect.ts:47](../../packages/xero/src/oauth/disconnect.ts#L47) | `owner` | `if (input.removeCompany && input.role !== "owner") {` |

### Generic role guards and shared predicate call sites

These role checks receive variables, so their bodies/call sites are additional evidence and are not added to literal-occurrence totals. One entry is one source call expression; definitions are excluded.

#### `apps/api`

`requireRole`: 6.

| Source | Helper | Source excerpt |
| --- | --- | --- |
| [apps/api/app/api/sync/dispatch/route.ts:44](../../apps/api/app/api/sync/dispatch/route.ts#L44) | `requireRole` | `requireRole("org:admin"),` |
| [apps/api/app/api/sync/dispatch/route.ts:45](../../apps/api/app/api/sync/dispatch/route.ts#L45) | `requireRole` | `requireRole("org:owner"),` |
| [apps/api/app/api/xero/oauth/callback/route.ts:85](../../apps/api/app/api/xero/oauth/callback/route.ts#L85) | `requireRole` | `requireRole("org:admin"),` |
| [apps/api/app/api/xero/oauth/callback/route.ts:86](../../apps/api/app/api/xero/oauth/callback/route.ts#L86) | `requireRole` | `requireRole("org:owner"),` |
| [apps/api/app/api/xero/oauth/start/route.ts:24](../../apps/api/app/api/xero/oauth/start/route.ts#L24) | `requireRole` | `requireRole("org:admin"),` |
| [apps/api/app/api/xero/oauth/start/route.ts:25](../../apps/api/app/api/xero/oauth/start/route.ts#L25) | `requireRole` | `requireRole("org:owner"),` |

#### `apps/app`

`ADMIN_ROLES.has`: 1, `authObject.has`: 2, `hasPageRole`: 1, `isAdminOrOwner`: 2, `isOnboardingAdmin`: 3, `requirePageRole`: 30, `requireRole`: 14, `roles.includes`: 1.

| Source | Helper | Source excerpt |
| --- | --- | --- |
| [apps/app/app/(authenticated)/analytics/leave-reports/page.tsx:45](../../apps/app/app/(authenticated)/analytics/leave-reports/page.tsx#L45) | `requirePageRole` | `await requirePageRole("org:manager");` |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.tsx:46](../../apps/app/app/(authenticated)/analytics/out-of-office/page.tsx#L46) | `requirePageRole` | `await requirePageRole("org:manager");` |
| [apps/app/app/(authenticated)/calendar/page.tsx:177](../../apps/app/app/(authenticated)/calendar/page.tsx#L177) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/feeds/page.tsx:33](../../apps/app/app/(authenticated)/feeds/page.tsx#L33) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/layout.tsx:120](../../apps/app/app/(authenticated)/layout.tsx#L120) | `isOnboardingAdmin` | `const isAdmin = isOnboardingAdmin(input.orgRole);` |
| [apps/app/app/(authenticated)/leave-approvals/page.tsx:73](../../apps/app/app/(authenticated)/leave-approvals/page.tsx#L73) | `requirePageRole` | `await requirePageRole("org:manager");` |
| [apps/app/app/(authenticated)/notifications/_actions.ts:129](../../apps/app/app/(authenticated)/notifications/_actions.ts#L129) | `hasPageRole` | `if (!(await hasPageRole("org:viewer"))) {` |
| [apps/app/app/(authenticated)/notifications/page.tsx:49](../../apps/app/app/(authenticated)/notifications/page.tsx#L49) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/page.tsx:25](../../apps/app/app/(authenticated)/page.tsx#L25) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx:33](../../apps/app/app/(authenticated)/people/@modal/(.)[personId]/page.tsx#L33) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/people/[personId]/page.tsx:39](../../apps/app/app/(authenticated)/people/[personId]/page.tsx#L39) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/people/new/page.tsx:25](../../apps/app/app/(authenticated)/people/new/page.tsx#L25) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/people/page.tsx:30](../../apps/app/app/(authenticated)/people/page.tsx#L30) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/plans/page.tsx:58](../../apps/app/app/(authenticated)/plans/page.tsx#L58) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/plans/page.tsx:263](../../apps/app/app/(authenticated)/plans/page.tsx#L263) | `isAdminOrOwner` | `{isAdminOrOwner(orgRole) && (` |
| [apps/app/app/(authenticated)/plans/page.tsx:281](../../apps/app/app/(authenticated)/plans/page.tsx#L281) | `isAdminOrOwner` | `canRecoverSubmit={isAdminOrOwner(orgRole)}` |
| [apps/app/app/(authenticated)/public-holidays/_actions.ts:33](../../apps/app/app/(authenticated)/public-holidays/_actions.ts#L33) | `requireRole` | `if (await requireRole("org:owner")) {` |
| [apps/app/app/(authenticated)/public-holidays/_actions.ts:35](../../apps/app/app/(authenticated)/public-holidays/_actions.ts#L35) | `requireRole` | `} else if (await requireRole("org:admin")) {` |
| [apps/app/app/(authenticated)/public-holidays/holidays/new/form-data.ts:31](../../apps/app/app/(authenticated)/public-holidays/holidays/new/form-data.ts#L31) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/public-holidays/page.tsx:32](../../apps/app/app/(authenticated)/public-holidays/page.tsx#L32) | `requirePageRole` | `await requirePageRole("org:viewer");` |
| [apps/app/app/(authenticated)/settings/audit-log/page.tsx:25](../../apps/app/app/(authenticated)/settings/audit-log/page.tsx#L25) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/billing/actions.ts:14](../../apps/app/app/(authenticated)/settings/billing/actions.ts#L14) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/billing/actions.ts:32](../../apps/app/app/(authenticated)/settings/billing/actions.ts#L32) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/billing/page.tsx:35](../../apps/app/app/(authenticated)/settings/billing/page.tsx#L35) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/billing/page.tsx:43](../../apps/app/app/(authenticated)/settings/billing/page.tsx#L43) | `requireRole` | `const isOwner = await requireRole("org:owner");` |
| [apps/app/app/(authenticated)/settings/coverage/page.tsx:21](../../apps/app/app/(authenticated)/settings/coverage/page.tsx#L21) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/feeds/page.tsx:38](../../apps/app/app/(authenticated)/settings/feeds/page.tsx#L38) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/general/page.tsx:21](../../apps/app/app/(authenticated)/settings/general/page.tsx#L21) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/getting-started/page.tsx:23](../../apps/app/app/(authenticated)/settings/getting-started/page.tsx#L23) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/holidays/page.tsx:32](../../apps/app/app/(authenticated)/settings/holidays/page.tsx#L32) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/page.tsx:13](../../apps/app/app/(authenticated)/settings/integrations/page.tsx#L13) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:268](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L268) | `requireRole` | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:269](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L269) | `requireRole` | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:298](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L298) | `requireRole` | `if (!(await requireRole("org:owner"))) {` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:54](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts#L54) | `requireRole` | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts:55](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts#L55) | `requireRole` | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx:21](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/page.tsx#L21) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:46](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L46) | `requireRole` | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:47](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L47) | `requireRole` | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx:24](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/page.tsx#L24) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/integrations/xero/page.tsx:13](../../apps/app/app/(authenticated)/settings/integrations/xero/page.tsx#L13) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/settings/leave-approval/page.tsx:18](../../apps/app/app/(authenticated)/settings/leave-approval/page.tsx#L18) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/sync/[runId]/page.tsx:38](../../apps/app/app/(authenticated)/sync/[runId]/page.tsx#L38) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(authenticated)/sync/_actions.ts:99](../../apps/app/app/(authenticated)/sync/_actions.ts#L99) | `requireRole` | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/sync/_actions.ts:100](../../apps/app/app/(authenticated)/sync/_actions.ts#L100) | `requireRole` | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/sync/_actions.ts:179](../../apps/app/app/(authenticated)/sync/_actions.ts#L179) | `requireRole` | `requireRole("org:admin"),` |
| [apps/app/app/(authenticated)/sync/_actions.ts:180](../../apps/app/app/(authenticated)/sync/_actions.ts#L180) | `requireRole` | `requireRole("org:owner"),` |
| [apps/app/app/(authenticated)/sync/page.tsx:36](../../apps/app/app/(authenticated)/sync/page.tsx#L36) | `requirePageRole` | `await requirePageRole("org:admin");` |
| [apps/app/app/(setup)/onboarding/_actions.ts:426](../../apps/app/app/(setup)/onboarding/_actions.ts#L426) | `isOnboardingAdmin` | `if (!(orgId && user && isOnboardingAdmin(orgRole))) {` |
| [apps/app/app/(setup)/onboarding/page.tsx:54](../../apps/app/app/(setup)/onboarding/page.tsx#L54) | `isOnboardingAdmin` | `if (!(orgId && user && isOnboardingAdmin(orgRole))) {` |
| [apps/app/lib/auth/require-page-role.ts:30](../../apps/app/lib/auth/require-page-role.ts#L30) | `authObject.has` | `allowedRoles.map((allowedRole) => authObject.has({ role: allowedRole }))` |
| [apps/app/lib/auth/require-page-role.ts:48](../../apps/app/lib/auth/require-page-role.ts#L48) | `authObject.has` | `allowedRoles.map((r) => authObject.has({ role: r }))` |
| [apps/app/lib/navigation/nav-items.ts:147](../../apps/app/lib/navigation/nav-items.ts#L147) | `roles.includes` | `return roles ? roles.includes(orgRole ?? "") : true;` |
| [apps/app/lib/server/onboarding-gate.ts:25](../../apps/app/lib/server/onboarding-gate.ts#L25) | `ADMIN_ROLES.has` | `if (ADMIN_ROLES.has(input.orgRole)) {` |

#### `packages/auth`

`authObject.has`: 2.

| Source | Helper | Source excerpt |
| --- | --- | --- |
| [packages/auth/helpers.ts:59](../../packages/auth/helpers.ts#L59) | `authObject.has` | `return await authObject.has({ role });` |
| [packages/auth/helpers.ts:70](../../packages/auth/helpers.ts#L70) | `authObject.has` | `const has = await authObject.has({ role });` |

#### `packages/availability`

`ADMIN_ROLES.has`: 1, `canManage`: 2, `canViewAuditLog`: 3, `isAdminOrOwner`: 10, `isOnboardingAdmin`: 2.

| Source | Helper | Source excerpt |
| --- | --- | --- |
| [packages/availability/src/calendar/calendar-service.ts:714](../../packages/availability/src/calendar/calendar-service.ts#L714) | `isAdminOrOwner` | `isAdminOrOwner(input.role) \|\|` |
| [packages/availability/src/calendar/calendar-service.ts:736](../../packages/availability/src/calendar/calendar-service.ts#L736) | `isAdminOrOwner` | `if (isAdminOrOwner(input.role)) {` |
| [packages/availability/src/calendar/calendar-service.ts:781](../../packages/availability/src/calendar/calendar-service.ts#L781) | `isAdminOrOwner` | `if (isAdminOrOwner(input.role)) {` |
| [packages/availability/src/calendar/calendar-service.ts:1058](../../packages/availability/src/calendar/calendar-service.ts#L1058) | `isAdminOrOwner` | `if (isAdminOrOwner(actor.role)) {` |
| [packages/availability/src/onboarding/welcome-service.ts:28](../../packages/availability/src/onboarding/welcome-service.ts#L28) | `isOnboardingAdmin` | `if (isOnboardingAdmin(actor.actingRole)) {` |
| [packages/availability/src/onboarding/wizard-service.ts:33](../../packages/availability/src/onboarding/wizard-service.ts#L33) | `ADMIN_ROLES.has` | `return Boolean(role && ADMIN_ROLES.has(role));` |
| [packages/availability/src/onboarding/wizard-service.ts:52](../../packages/availability/src/onboarding/wizard-service.ts#L52) | `isOnboardingAdmin` | `if (!isOnboardingAdmin(actor.actingRole)) {` |
| [packages/availability/src/plans/plan-service.ts:316](../../packages/availability/src/plans/plan-service.ts#L316) | `isAdminOrOwner` | `if (isAdminOrOwner(input.actingOrgRole)) {` |
| [packages/availability/src/plans/plan-service.ts:413](../../packages/availability/src/plans/plan-service.ts#L413) | `isAdminOrOwner` | `if (!isAdminOrOwner(input.actingOrgRole)) {` |
| [packages/availability/src/plans/plan-service.ts:1857](../../packages/availability/src/plans/plan-service.ts#L1857) | `isAdminOrOwner` | `isAdminOrOwner(actingOrgRole) \|\|` |
| [packages/availability/src/plans/submit-service.ts:697](../../packages/availability/src/plans/submit-service.ts#L697) | `isAdminOrOwner` | `if (!isAdminOrOwner(input.actingOrgRole)) {` |
| [packages/availability/src/plans/submit-service.ts:1344](../../packages/availability/src/plans/submit-service.ts#L1344) | `isAdminOrOwner` | `isAdminOrOwner(input.actingOrgRole) \|\|` |
| [packages/availability/src/records/manual-records-service.ts:623](../../packages/availability/src/records/manual-records-service.ts#L623) | `isAdminOrOwner` | `if (isAdminOrOwner(actor.orgRole)) {` |
| [packages/availability/src/settings/audit-log-service.ts:88](../../packages/availability/src/settings/audit-log-service.ts#L88) | `canViewAuditLog` | `if (!canViewAuditLog(parsed.data.actingRole)) {` |
| [packages/availability/src/settings/audit-log-service.ts:132](../../packages/availability/src/settings/audit-log-service.ts#L132) | `canViewAuditLog` | `if (!canViewAuditLog(parsed.data.actingRole)) {` |
| [packages/availability/src/settings/audit-log-service.ts:175](../../packages/availability/src/settings/audit-log-service.ts#L175) | `canViewAuditLog` | `if (!canViewAuditLog(parsed.data.actingRole)) {` |
| [packages/availability/src/team-coverage/team-coverage-minimums.ts:62](../../packages/availability/src/team-coverage/team-coverage-minimums.ts#L62) | `canManage` | `if (!canManage(input.actingRole)) {` |
| [packages/availability/src/team-coverage/team-coverage-minimums.ts:89](../../packages/availability/src/team-coverage/team-coverage-minimums.ts#L89) | `canManage` | `if (!canManage(input.actingRole)) {` |

#### `packages/feeds`

`isAdminOrOwner`: 10.

| Source | Helper | Source excerpt |
| --- | --- | --- |
| [packages/feeds/src/feed-service.ts:267](../../packages/feeds/src/feed-service.ts#L267) | `isAdminOrOwner` | `if (!isAdminOrOwner(parsed.data.actingRole)) {` |
| [packages/feeds/src/feed-service.ts:640](../../packages/feeds/src/feed-service.ts#L640) | `isAdminOrOwner` | `if (!isAdminOrOwner(parsed.data.actingRole)) {` |
| [packages/feeds/src/feed-service.ts:694](../../packages/feeds/src/feed-service.ts#L694) | `isAdminOrOwner` | `const statuses = isAdminOrOwner(role)` |
| [packages/feeds/src/feed-service.ts:1020](../../packages/feeds/src/feed-service.ts#L1020) | `isAdminOrOwner` | `if (!isAdminOrOwner(parsed.data.actingRole)) {` |
| [packages/feeds/src/feed-service.ts:1196](../../packages/feeds/src/feed-service.ts#L1196) | `isAdminOrOwner` | `if (isAdminOrOwner(normaliseRole(input.actingRole))) {` |
| [packages/feeds/src/preview/preview-service.ts:100](../../packages/feeds/src/preview/preview-service.ts#L100) | `isAdminOrOwner` | `!(isAdminOrOwner(role) \|\| ownsFeed) &&` |
| [packages/feeds/src/scope/feed-scope.ts:334](../../packages/feeds/src/scope/feed-scope.ts#L334) | `isAdminOrOwner` | `if (isAdminOrOwner(input.role)) {` |
| [packages/feeds/src/tokens/token-service.ts:222](../../packages/feeds/src/tokens/token-service.ts#L222) | `isAdminOrOwner` | `if (!isAdminOrOwner(parsed.data.actingRole)) {` |
| [packages/feeds/src/tokens/token-service.ts:283](../../packages/feeds/src/tokens/token-service.ts#L283) | `isAdminOrOwner` | `const isAdmin = isAdminOrOwner(parsed.data.actingRole);` |
| [packages/feeds/src/tokens/token-service.ts:503](../../packages/feeds/src/tokens/token-service.ts#L503) | `isAdminOrOwner` | `if (!isAdminOrOwner(parsed.data.actingRole)) {` |

### Test role occurrences, separate from production

406 complete quoted `org:*` strings occur in test code. Every occurrence is represented below; repeated line references mean multiple same-role strings on that line.

| Test file | Role | Count | Occurrence links |
| --- | --- | --- | --- |
| apps/api/__tests__/availability-routes.test.ts | `org:viewer` | 6 | [apps/api/__tests__/availability-routes.test.ts:65](../../apps/api/__tests__/availability-routes.test.ts#L65), [apps/api/__tests__/availability-routes.test.ts:282](../../apps/api/__tests__/availability-routes.test.ts#L282), [apps/api/__tests__/availability-routes.test.ts:342](../../apps/api/__tests__/availability-routes.test.ts#L342), [apps/api/__tests__/availability-routes.test.ts:588](../../apps/api/__tests__/availability-routes.test.ts#L588), [apps/api/__tests__/availability-routes.test.ts:675](../../apps/api/__tests__/availability-routes.test.ts#L675), [apps/api/__tests__/availability-routes.test.ts:905](../../apps/api/__tests__/availability-routes.test.ts#L905) |
| apps/api/app/api/sync/dispatch/route.test.ts | `org:admin` | 2 | [apps/api/app/api/sync/dispatch/route.test.ts:115](../../apps/api/app/api/sync/dispatch/route.test.ts#L115), [apps/api/app/api/sync/dispatch/route.test.ts:131](../../apps/api/app/api/sync/dispatch/route.test.ts#L131) |
| apps/api/app/api/sync/dispatch/route.test.ts | `org:manager` | 1 | [apps/api/app/api/sync/dispatch/route.test.ts:147](../../apps/api/app/api/sync/dispatch/route.test.ts#L147) |
| apps/api/app/api/sync/dispatch/route.test.ts | `org:owner` | 2 | [apps/api/app/api/sync/dispatch/route.test.ts:131](../../apps/api/app/api/sync/dispatch/route.test.ts#L131), [apps/api/app/api/sync/dispatch/route.test.ts:140](../../apps/api/app/api/sync/dispatch/route.test.ts#L140) |
| apps/api/app/api/sync/dispatch/route.test.ts | `org:viewer` | 1 | [apps/api/app/api/sync/dispatch/route.test.ts:147](../../apps/api/app/api/sync/dispatch/route.test.ts#L147) |
| apps/api/app/api/xero/oauth/callback/route.test.ts | `org:admin` | 3 | [apps/api/app/api/xero/oauth/callback/route.test.ts:13](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L13), [apps/api/app/api/xero/oauth/callback/route.test.ts:53](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L53), [apps/api/app/api/xero/oauth/callback/route.test.ts:294](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L294) |
| apps/api/app/api/xero/oauth/callback/route.test.ts | `org:manager` | 1 | [apps/api/app/api/xero/oauth/callback/route.test.ts:270](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L270) |
| apps/api/app/api/xero/oauth/callback/route.test.ts | `org:owner` | 1 | [apps/api/app/api/xero/oauth/callback/route.test.ts:303](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L303) |
| apps/api/app/api/xero/oauth/callback/route.test.ts | `org:viewer` | 2 | [apps/api/app/api/xero/oauth/callback/route.test.ts:261](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L261), [apps/api/app/api/xero/oauth/callback/route.test.ts:270](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L270) |
| apps/api/app/api/xero/oauth/start/route.test.ts | `org:admin` | 2 | [apps/api/app/api/xero/oauth/start/route.test.ts:78](../../apps/api/app/api/xero/oauth/start/route.test.ts#L78), [apps/api/app/api/xero/oauth/start/route.test.ts:85](../../apps/api/app/api/xero/oauth/start/route.test.ts#L85) |
| apps/api/app/api/xero/oauth/start/route.test.ts | `org:owner` | 1 | [apps/api/app/api/xero/oauth/start/route.test.ts:79](../../apps/api/app/api/xero/oauth/start/route.test.ts#L79) |
| apps/api/app/webhooks/auth/route.test.ts | `org:owner` | 1 | [apps/api/app/webhooks/auth/route.test.ts:88](../../apps/api/app/webhooks/auth/route.test.ts#L88) |
| apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts:57](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts#L57) |
| apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts | `org:viewer` | 1 | [apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts:100](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts#L100) |
| apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx:74](../../apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx#L74) |
| apps/app/app/(authenticated)/calendar/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/calendar/page.test.tsx:171](../../apps/app/app/(authenticated)/calendar/page.test.tsx#L171) |
| apps/app/app/(authenticated)/calendar/page.test.tsx | `org:viewer` | 1 | [apps/app/app/(authenticated)/calendar/page.test.tsx:114](../../apps/app/app/(authenticated)/calendar/page.test.tsx#L114) |
| apps/app/app/(authenticated)/dashboard-body.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/dashboard-body.test.tsx:99](../../apps/app/app/(authenticated)/dashboard-body.test.tsx#L99) |
| apps/app/app/(authenticated)/dashboard-body.test.tsx | `org:viewer` | 1 | [apps/app/app/(authenticated)/dashboard-body.test.tsx:118](../../apps/app/app/(authenticated)/dashboard-body.test.tsx#L118) |
| apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx:165](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx#L165) |
| apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx | `org:manager` | 1 | [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx:121](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx#L121) |
| apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx | `org:viewer` | 2 | [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx:113](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx#L113), [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx:121](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx#L121) |
| apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx:162](../../apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx#L162) |
| apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx | `org:manager` | 1 | [apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx:118](../../apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx#L118) |
| apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx | `org:viewer` | 2 | [apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx:110](../../apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx#L110), [apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx:118](../../apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx#L118) |
| apps/app/app/(authenticated)/feeds/_actions.test.ts | `org:admin` | 2 | [apps/app/app/(authenticated)/feeds/_actions.test.ts:119](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L119), [apps/app/app/(authenticated)/feeds/_actions.test.ts:147](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L147) |
| apps/app/app/(authenticated)/feeds/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/feeds/_actions.test.ts:178](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L178) |
| apps/app/app/(authenticated)/feeds/_actions.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/feeds/_actions.test.ts:147](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L147) |
| apps/app/app/(authenticated)/feeds/_actions.test.ts | `org:viewer` | 2 | [apps/app/app/(authenticated)/feeds/_actions.test.ts:178](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L178), [apps/app/app/(authenticated)/feeds/_actions.test.ts:343](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L343) |
| apps/app/app/(authenticated)/feeds/new/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/feeds/new/page.test.tsx:89](../../apps/app/app/(authenticated)/feeds/new/page.test.tsx#L89) |
| apps/app/app/(authenticated)/feeds/new/page.test.tsx | `org:viewer` | 1 | [apps/app/app/(authenticated)/feeds/new/page.test.tsx:71](../../apps/app/app/(authenticated)/feeds/new/page.test.tsx#L71) |
| apps/app/app/(authenticated)/feeds/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/feeds/page.test.tsx:182](../../apps/app/app/(authenticated)/feeds/page.test.tsx#L182) |
| apps/app/app/(authenticated)/feeds/page.test.tsx | `org:viewer` | 1 | [apps/app/app/(authenticated)/feeds/page.test.tsx:148](../../apps/app/app/(authenticated)/feeds/page.test.tsx#L148) |
| apps/app/app/(authenticated)/layout.test.tsx | `org:admin` | 4 | [apps/app/app/(authenticated)/layout.test.tsx:24](../../apps/app/app/(authenticated)/layout.test.tsx#L24), [apps/app/app/(authenticated)/layout.test.tsx:69](../../apps/app/app/(authenticated)/layout.test.tsx#L69), [apps/app/app/(authenticated)/layout.test.tsx:92](../../apps/app/app/(authenticated)/layout.test.tsx#L92), [apps/app/app/(authenticated)/layout.test.tsx:102](../../apps/app/app/(authenticated)/layout.test.tsx#L102) |
| apps/app/app/(authenticated)/layout.test.tsx | `org:manager` | 1 | [apps/app/app/(authenticated)/layout.test.tsx:123](../../apps/app/app/(authenticated)/layout.test.tsx#L123) |
| apps/app/app/(authenticated)/layout.test.tsx | `org:owner` | 2 | [apps/app/app/(authenticated)/layout.test.tsx:24](../../apps/app/app/(authenticated)/layout.test.tsx#L24), [apps/app/app/(authenticated)/layout.test.tsx:81](../../apps/app/app/(authenticated)/layout.test.tsx#L81) |
| apps/app/app/(authenticated)/layout.test.tsx | `org:viewer` | 1 | [apps/app/app/(authenticated)/layout.test.tsx:111](../../apps/app/app/(authenticated)/layout.test.tsx#L111) |
| apps/app/app/(authenticated)/leave-approvals/_actions.test.ts | `org:admin` | 2 | [apps/app/app/(authenticated)/leave-approvals/_actions.test.ts:366](../../apps/app/app/(authenticated)/leave-approvals/_actions.test.ts#L366), [apps/app/app/(authenticated)/leave-approvals/_actions.test.ts:384](../../apps/app/app/(authenticated)/leave-approvals/_actions.test.ts#L384) |
| apps/app/app/(authenticated)/leave-approvals/_actions.test.ts | `org:manager` | 2 | [apps/app/app/(authenticated)/leave-approvals/_actions.test.ts:140](../../apps/app/app/(authenticated)/leave-approvals/_actions.test.ts#L140), [apps/app/app/(authenticated)/leave-approvals/_actions.test.ts:250](../../apps/app/app/(authenticated)/leave-approvals/_actions.test.ts#L250) |
| apps/app/app/(authenticated)/leave-approvals/_actions.test.ts | `org:viewer` | 1 | [apps/app/app/(authenticated)/leave-approvals/_actions.test.ts:237](../../apps/app/app/(authenticated)/leave-approvals/_actions.test.ts#L237) |
| apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts | `org:admin` | 2 | [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts:10](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts#L10), [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts:79](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts#L79) |
| apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts | `org:manager` | 3 | [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts:138](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts#L138), [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts:188](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts#L188), [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts:221](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts#L221) |
| apps/app/app/(authenticated)/people/_actions.test.ts | `org:admin` | 2 | [apps/app/app/(authenticated)/people/_actions.test.ts:116](../../apps/app/app/(authenticated)/people/_actions.test.ts#L116), [apps/app/app/(authenticated)/people/_actions.test.ts:327](../../apps/app/app/(authenticated)/people/_actions.test.ts#L327) |
| apps/app/app/(authenticated)/people/_actions.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/people/_actions.test.ts:377](../../apps/app/app/(authenticated)/people/_actions.test.ts#L377) |
| apps/app/app/(authenticated)/people/_actions.test.ts | `org:viewer` | 1 | [apps/app/app/(authenticated)/people/_actions.test.ts:307](../../apps/app/app/(authenticated)/people/_actions.test.ts#L307) |
| apps/app/app/(authenticated)/people/manager-assignment-action.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/people/manager-assignment-action.test.ts:75](../../apps/app/app/(authenticated)/people/manager-assignment-action.test.ts#L75) |
| apps/app/app/(authenticated)/people/manager-assignment-action.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/people/manager-assignment-action.test.ts:38](../../apps/app/app/(authenticated)/people/manager-assignment-action.test.ts#L38) |
| apps/app/app/(authenticated)/people/manager-assignment-action.test.ts | `org:viewer` | 1 | [apps/app/app/(authenticated)/people/manager-assignment-action.test.ts:75](../../apps/app/app/(authenticated)/people/manager-assignment-action.test.ts#L75) |
| apps/app/app/(authenticated)/people/new/_actions.integration.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/people/new/_actions.integration.test.ts:34](../../apps/app/app/(authenticated)/people/new/_actions.integration.test.ts#L34) |
| apps/app/app/(authenticated)/people/new/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/people/new/_actions.test.ts:61](../../apps/app/app/(authenticated)/people/new/_actions.test.ts#L61) |
| apps/app/app/(authenticated)/people/new/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/people/new/_actions.test.ts:86](../../apps/app/app/(authenticated)/people/new/_actions.test.ts#L86) |
| apps/app/app/(authenticated)/people/page.test.tsx | `org:owner` | 1 | [apps/app/app/(authenticated)/people/page.test.tsx:80](../../apps/app/app/(authenticated)/people/page.test.tsx#L80) |
| apps/app/app/(authenticated)/plans/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/plans/_actions.test.ts:159](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L159) |
| apps/app/app/(authenticated)/plans/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/plans/_actions.test.ts:143](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L143) |
| apps/app/app/(authenticated)/plans/_actions.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/plans/_actions.test.ts:159](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L159) |
| apps/app/app/(authenticated)/plans/_actions.test.ts | `org:viewer` | 3 | [apps/app/app/(authenticated)/plans/_actions.test.ts:125](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L125), [apps/app/app/(authenticated)/plans/_actions.test.ts:143](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L143), [apps/app/app/(authenticated)/plans/_actions.test.ts:520](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L520) |
| apps/app/app/(authenticated)/plans/company-routing.test.ts | `org:viewer` | 1 | [apps/app/app/(authenticated)/plans/company-routing.test.ts:88](../../apps/app/app/(authenticated)/plans/company-routing.test.ts#L88) |
| apps/app/app/(authenticated)/plans/page-server.test.tsx | `org:admin` | 4 | [apps/app/app/(authenticated)/plans/page-server.test.tsx:185](../../apps/app/app/(authenticated)/plans/page-server.test.tsx#L185), [apps/app/app/(authenticated)/plans/page-server.test.tsx:195](../../apps/app/app/(authenticated)/plans/page-server.test.tsx#L195), [apps/app/app/(authenticated)/plans/page-server.test.tsx:256](../../apps/app/app/(authenticated)/plans/page-server.test.tsx#L256), [apps/app/app/(authenticated)/plans/page-server.test.tsx:268](../../apps/app/app/(authenticated)/plans/page-server.test.tsx#L268) |
| apps/app/app/(authenticated)/plans/page-server.test.tsx | `org:viewer` | 1 | [apps/app/app/(authenticated)/plans/page-server.test.tsx:159](../../apps/app/app/(authenticated)/plans/page-server.test.tsx#L159) |
| apps/app/app/(authenticated)/plans/record-form-data.test.tsx | `org:viewer` | 1 | [apps/app/app/(authenticated)/plans/record-form-data.test.tsx:25](../../apps/app/app/(authenticated)/plans/record-form-data.test.tsx#L25) |
| apps/app/app/(authenticated)/public-holidays/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/public-holidays/_actions.test.ts:119](../../apps/app/app/(authenticated)/public-holidays/_actions.test.ts#L119) |
| apps/app/app/(authenticated)/public-holidays/_actions.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/public-holidays/_actions.test.ts:167](../../apps/app/app/(authenticated)/public-holidays/_actions.test.ts#L167) |
| apps/app/app/(authenticated)/public-holidays/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/public-holidays/page.test.tsx:108](../../apps/app/app/(authenticated)/public-holidays/page.test.tsx#L108) |
| apps/app/app/(authenticated)/public-holidays/page.test.tsx | `org:viewer` | 2 | [apps/app/app/(authenticated)/public-holidays/page.test.tsx:130](../../apps/app/app/(authenticated)/public-holidays/page.test.tsx#L130), [apps/app/app/(authenticated)/public-holidays/page.test.tsx:172](../../apps/app/app/(authenticated)/public-holidays/page.test.tsx#L172) |
| apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts:87](../../apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts#L87) |
| apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts:124](../../apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts#L124) |
| apps/app/app/(authenticated)/settings/billing/actions.test.ts | `org:admin` | 2 | [apps/app/app/(authenticated)/settings/billing/actions.test.ts:89](../../apps/app/app/(authenticated)/settings/billing/actions.test.ts#L89), [apps/app/app/(authenticated)/settings/billing/actions.test.ts:132](../../apps/app/app/(authenticated)/settings/billing/actions.test.ts#L132) |
| apps/app/app/(authenticated)/settings/billing/page.test.tsx | `org:admin` | 1 | [apps/app/app/(authenticated)/settings/billing/page.test.tsx:140](../../apps/app/app/(authenticated)/settings/billing/page.test.tsx#L140) |
| apps/app/app/(authenticated)/settings/coverage/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/settings/coverage/_actions.test.ts:99](../../apps/app/app/(authenticated)/settings/coverage/_actions.test.ts#L99) |
| apps/app/app/(authenticated)/settings/coverage/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/settings/coverage/_actions.test.ts:124](../../apps/app/app/(authenticated)/settings/coverage/_actions.test.ts#L124) |
| apps/app/app/(authenticated)/settings/coverage/_actions.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/settings/coverage/_actions.test.ts:176](../../apps/app/app/(authenticated)/settings/coverage/_actions.test.ts#L176) |
| apps/app/app/(authenticated)/settings/coverage/_actions.test.ts | `org:viewer` | 1 | [apps/app/app/(authenticated)/settings/coverage/_actions.test.ts:124](../../apps/app/app/(authenticated)/settings/coverage/_actions.test.ts#L124) |
| apps/app/app/(authenticated)/settings/feeds/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/settings/feeds/_actions.test.ts:91](../../apps/app/app/(authenticated)/settings/feeds/_actions.test.ts#L91) |
| apps/app/app/(authenticated)/settings/feeds/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/settings/feeds/_actions.test.ts:125](../../apps/app/app/(authenticated)/settings/feeds/_actions.test.ts#L125) |
| apps/app/app/(authenticated)/settings/feeds/page.test.tsx | `org:admin` | 2 | [apps/app/app/(authenticated)/settings/feeds/page.test.tsx:129](../../apps/app/app/(authenticated)/settings/feeds/page.test.tsx#L129), [apps/app/app/(authenticated)/settings/feeds/page.test.tsx:160](../../apps/app/app/(authenticated)/settings/feeds/page.test.tsx#L160) |
| apps/app/app/(authenticated)/settings/general/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/settings/general/_actions.test.ts:57](../../apps/app/app/(authenticated)/settings/general/_actions.test.ts#L57) |
| apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts | `org:admin` | 6 | [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:85](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L85), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:116](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L116), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:142](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L142), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:155](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L155), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:348](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L348), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:549](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L549) |
| apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts | `org:manager` | 2 | [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:206](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L206), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:526](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L526) |
| apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts | `org:member` | 1 | [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:206](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L206) |
| apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts | `org:owner` | 4 | [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:116](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L116), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:141](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L141), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:166](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L166), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:348](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L348) |
| apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts | `org:viewer` | 2 | [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:206](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L206), [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:526](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L526) |
| apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts | `org:admin` | 2 | [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:97](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L97), [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:133](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L133) |
| apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:159](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L159) |
| apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts | `org:member` | 1 | [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:253](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L253) |
| apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:133](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L133) |
| apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts | `org:viewer` | 1 | [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:159](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L159) |
| apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts:98](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts#L98) |
| apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts | `org:admin` | 4 | [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:80](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L80), [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:90](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L90), [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:337](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L337), [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:699](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L699) |
| apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts | `org:member` | 3 | [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:337](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L337), [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:423](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L423), [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:433](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L433) |
| apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts | `org:owner` | 1 | [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:699](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L699) |
| apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts | `org:admin` | 2 | [apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts:99](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts#L99), [apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts:262](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts#L262) |
| apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts | `org:manager` | 2 | [apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts:137](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts#L137), [apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts:287](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts#L287) |
| apps/app/app/(authenticated)/setup/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/setup/_actions.test.ts:85](../../apps/app/app/(authenticated)/setup/_actions.test.ts#L85) |
| apps/app/app/(authenticated)/sync/_actions.test.ts | `org:admin` | 1 | [apps/app/app/(authenticated)/sync/_actions.test.ts:115](../../apps/app/app/(authenticated)/sync/_actions.test.ts#L115) |
| apps/app/app/(authenticated)/sync/_actions.test.ts | `org:manager` | 1 | [apps/app/app/(authenticated)/sync/_actions.test.ts:175](../../apps/app/app/(authenticated)/sync/_actions.test.ts#L175) |
| apps/app/app/(setup)/onboarding/_actions.test.ts | `org:admin` | 5 | [apps/app/app/(setup)/onboarding/_actions.test.ts:35](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L35), [apps/app/app/(setup)/onboarding/_actions.test.ts:96](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L96), [apps/app/app/(setup)/onboarding/_actions.test.ts:105](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L105), [apps/app/app/(setup)/onboarding/_actions.test.ts:373](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L373), [apps/app/app/(setup)/onboarding/_actions.test.ts:404](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L404) |
| apps/app/app/(setup)/onboarding/_actions.test.ts | `org:manager` | 3 | [apps/app/app/(setup)/onboarding/_actions.test.ts:134](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L134), [apps/app/app/(setup)/onboarding/_actions.test.ts:371](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L371), [apps/app/app/(setup)/onboarding/_actions.test.ts:396](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L396) |
| apps/app/app/(setup)/onboarding/_actions.test.ts | `org:owner` | 2 | [apps/app/app/(setup)/onboarding/_actions.test.ts:35](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L35), [apps/app/app/(setup)/onboarding/_actions.test.ts:404](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L404) |
| apps/app/app/(setup)/onboarding/_actions.test.ts | `org:viewer` | 2 | [apps/app/app/(setup)/onboarding/_actions.test.ts:134](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L134), [apps/app/app/(setup)/onboarding/_actions.test.ts:372](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L372) |
| apps/app/app/(setup)/onboarding/page.test.tsx | `org:admin` | 1 | [apps/app/app/(setup)/onboarding/page.test.tsx:82](../../apps/app/app/(setup)/onboarding/page.test.tsx#L82) |
| apps/app/app/(setup)/onboarding/page.test.tsx | `org:owner` | 2 | [apps/app/app/(setup)/onboarding/page.test.tsx:82](../../apps/app/app/(setup)/onboarding/page.test.tsx#L82), [apps/app/app/(setup)/onboarding/page.test.tsx:158](../../apps/app/app/(setup)/onboarding/page.test.tsx#L158) |
| apps/app/app/(setup)/onboarding/page.test.tsx | `org:viewer` | 1 | [apps/app/app/(setup)/onboarding/page.test.tsx:207](../../apps/app/app/(setup)/onboarding/page.test.tsx#L207) |
| apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx | `org:manager` | 1 | [apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx:285](../../apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx#L285) |
| apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx | `org:viewer` | 1 | [apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx:286](../../apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx#L286) |
| apps/app/app/(setup)/welcome/_actions.test.ts | `org:viewer` | 2 | [apps/app/app/(setup)/welcome/_actions.test.ts:90](../../apps/app/app/(setup)/welcome/_actions.test.ts#L90), [apps/app/app/(setup)/welcome/_actions.test.ts:108](../../apps/app/app/(setup)/welcome/_actions.test.ts#L108) |
| apps/app/app/(setup)/welcome/page.test.tsx | `org:viewer` | 1 | [apps/app/app/(setup)/welcome/page.test.tsx:147](../../apps/app/app/(setup)/welcome/page.test.tsx#L147) |
| apps/app/app/actions/availability/manual.test.ts | `org:manager` | 2 | [apps/app/app/actions/availability/manual.test.ts:36](../../apps/app/app/actions/availability/manual.test.ts#L36), [apps/app/app/actions/availability/manual.test.ts:83](../../apps/app/app/actions/availability/manual.test.ts#L83) |
| apps/app/app/actions/settings/invite-member.test.ts | `org:admin` | 2 | [apps/app/app/actions/settings/invite-member.test.ts:48](../../apps/app/app/actions/settings/invite-member.test.ts#L48), [apps/app/app/actions/settings/invite-member.test.ts:66](../../apps/app/app/actions/settings/invite-member.test.ts#L66) |
| apps/app/app/actions/settings/invite-member.test.ts | `org:owner` | 3 | [apps/app/app/actions/settings/invite-member.test.ts:72](../../apps/app/app/actions/settings/invite-member.test.ts#L72), [apps/app/app/actions/settings/invite-member.test.ts:83](../../apps/app/app/actions/settings/invite-member.test.ts#L83), [apps/app/app/actions/settings/invite-member.test.ts:88](../../apps/app/app/actions/settings/invite-member.test.ts#L88) |
| apps/app/app/actions/settings/invite-member.test.ts | `org:viewer` | 3 | [apps/app/app/actions/settings/invite-member.test.ts:18](../../apps/app/app/actions/settings/invite-member.test.ts#L18), [apps/app/app/actions/settings/invite-member.test.ts:26](../../apps/app/app/actions/settings/invite-member.test.ts#L26), [apps/app/app/actions/settings/invite-member.test.ts:59](../../apps/app/app/actions/settings/invite-member.test.ts#L59) |
| apps/app/app/actions/settings/remove-member.test.ts | `org:admin` | 2 | [apps/app/app/actions/settings/remove-member.test.ts:51](../../apps/app/app/actions/settings/remove-member.test.ts#L51), [apps/app/app/actions/settings/remove-member.test.ts:70](../../apps/app/app/actions/settings/remove-member.test.ts#L70) |
| apps/app/app/actions/settings/remove-member.test.ts | `org:owner` | 4 | [apps/app/app/actions/settings/remove-member.test.ts:73](../../apps/app/app/actions/settings/remove-member.test.ts#L73), [apps/app/app/actions/settings/remove-member.test.ts:88](../../apps/app/app/actions/settings/remove-member.test.ts#L88), [apps/app/app/actions/settings/remove-member.test.ts:91](../../apps/app/app/actions/settings/remove-member.test.ts#L91), [apps/app/app/actions/settings/remove-member.test.ts:117](../../apps/app/app/actions/settings/remove-member.test.ts#L117) |
| apps/app/app/actions/settings/remove-member.test.ts | `org:viewer` | 4 | [apps/app/app/actions/settings/remove-member.test.ts:26](../../apps/app/app/actions/settings/remove-member.test.ts#L26), [apps/app/app/actions/settings/remove-member.test.ts:36](../../apps/app/app/actions/settings/remove-member.test.ts#L36), [apps/app/app/actions/settings/remove-member.test.ts:108](../../apps/app/app/actions/settings/remove-member.test.ts#L108), [apps/app/app/actions/settings/remove-member.test.ts:109](../../apps/app/app/actions/settings/remove-member.test.ts#L109) |
| apps/app/app/actions/settings/revoke-tokens.test.ts | `org:admin` | 1 | [apps/app/app/actions/settings/revoke-tokens.test.ts:58](../../apps/app/app/actions/settings/revoke-tokens.test.ts#L58) |
| apps/app/app/actions/settings/revoke-tokens.test.ts | `org:viewer` | 1 | [apps/app/app/actions/settings/revoke-tokens.test.ts:32](../../apps/app/app/actions/settings/revoke-tokens.test.ts#L32) |
| apps/app/app/actions/settings/update-member-role.test.ts | `org:admin` | 6 | [apps/app/app/actions/settings/update-member-role.test.ts:19](../../apps/app/app/actions/settings/update-member-role.test.ts#L19), [apps/app/app/actions/settings/update-member-role.test.ts:52](../../apps/app/app/actions/settings/update-member-role.test.ts#L52), [apps/app/app/actions/settings/update-member-role.test.ts:64](../../apps/app/app/actions/settings/update-member-role.test.ts#L64), [apps/app/app/actions/settings/update-member-role.test.ts:72](../../apps/app/app/actions/settings/update-member-role.test.ts#L72), [apps/app/app/actions/settings/update-member-role.test.ts:107](../../apps/app/app/actions/settings/update-member-role.test.ts#L107), [apps/app/app/actions/settings/update-member-role.test.ts:136](../../apps/app/app/actions/settings/update-member-role.test.ts#L136) |
| apps/app/app/actions/settings/update-member-role.test.ts | `org:owner` | 8 | [apps/app/app/actions/settings/update-member-role.test.ts:77](../../apps/app/app/actions/settings/update-member-role.test.ts#L77), [apps/app/app/actions/settings/update-member-role.test.ts:88](../../apps/app/app/actions/settings/update-member-role.test.ts#L88), [apps/app/app/actions/settings/update-member-role.test.ts:93](../../apps/app/app/actions/settings/update-member-role.test.ts#L93), [apps/app/app/actions/settings/update-member-role.test.ts:99](../../apps/app/app/actions/settings/update-member-role.test.ts#L99), [apps/app/app/actions/settings/update-member-role.test.ts:110](../../apps/app/app/actions/settings/update-member-role.test.ts#L110), [apps/app/app/actions/settings/update-member-role.test.ts:125](../../apps/app/app/actions/settings/update-member-role.test.ts#L125), [apps/app/app/actions/settings/update-member-role.test.ts:128](../../apps/app/app/actions/settings/update-member-role.test.ts#L128), [apps/app/app/actions/settings/update-member-role.test.ts:153](../../apps/app/app/actions/settings/update-member-role.test.ts#L153) |
| apps/app/app/actions/settings/update-member-role.test.ts | `org:viewer` | 4 | [apps/app/app/actions/settings/update-member-role.test.ts:27](../../apps/app/app/actions/settings/update-member-role.test.ts#L27), [apps/app/app/actions/settings/update-member-role.test.ts:36](../../apps/app/app/actions/settings/update-member-role.test.ts#L36), [apps/app/app/actions/settings/update-member-role.test.ts:146](../../apps/app/app/actions/settings/update-member-role.test.ts#L146), [apps/app/app/actions/settings/update-member-role.test.ts:147](../../apps/app/app/actions/settings/update-member-role.test.ts#L147) |
| apps/app/app/actions/settings/update-org.test.ts | `org:admin` | 2 | [apps/app/app/actions/settings/update-org.test.ts:94](../../apps/app/app/actions/settings/update-org.test.ts#L94), [apps/app/app/actions/settings/update-org.test.ts:117](../../apps/app/app/actions/settings/update-org.test.ts#L117) |
| apps/app/app/actions/settings/update-org.test.ts | `org:viewer` | 1 | [apps/app/app/actions/settings/update-org.test.ts:67](../../apps/app/app/actions/settings/update-org.test.ts#L67) |
| apps/app/lib/auth/require-page-role.test.ts | `org:admin` | 5 | [apps/app/lib/auth/require-page-role.test.ts:43](../../apps/app/lib/auth/require-page-role.test.ts#L43), [apps/app/lib/auth/require-page-role.test.ts:44](../../apps/app/lib/auth/require-page-role.test.ts#L44), [apps/app/lib/auth/require-page-role.test.ts:53](../../apps/app/lib/auth/require-page-role.test.ts#L53), [apps/app/lib/auth/require-page-role.test.ts:68](../../apps/app/lib/auth/require-page-role.test.ts#L68), [apps/app/lib/auth/require-page-role.test.ts:72](../../apps/app/lib/auth/require-page-role.test.ts#L72) |
| apps/app/lib/auth/require-page-role.test.ts | `org:manager` | 2 | [apps/app/lib/auth/require-page-role.test.ts:49](../../apps/app/lib/auth/require-page-role.test.ts#L49), [apps/app/lib/auth/require-page-role.test.ts:61](../../apps/app/lib/auth/require-page-role.test.ts#L61) |
| apps/app/lib/auth/require-page-role.test.ts | `org:owner` | 5 | [apps/app/lib/auth/require-page-role.test.ts:48](../../apps/app/lib/auth/require-page-role.test.ts#L48), [apps/app/lib/auth/require-page-role.test.ts:54](../../apps/app/lib/auth/require-page-role.test.ts#L54), [apps/app/lib/auth/require-page-role.test.ts:67](../../apps/app/lib/auth/require-page-role.test.ts#L67), [apps/app/lib/auth/require-page-role.test.ts:72](../../apps/app/lib/auth/require-page-role.test.ts#L72), [apps/app/lib/auth/require-page-role.test.ts:76](../../apps/app/lib/auth/require-page-role.test.ts#L76) |
| apps/app/lib/auth/require-page-role.test.ts | `org:superuser` | 1 | [apps/app/lib/auth/require-page-role.test.ts:77](../../apps/app/lib/auth/require-page-role.test.ts#L77) |
| apps/app/lib/auth/require-page-role.test.ts | `org:viewer` | 1 | [apps/app/lib/auth/require-page-role.test.ts:60](../../apps/app/lib/auth/require-page-role.test.ts#L60) |
| apps/app/lib/navigation/nav-items.test.ts | `org:admin` | 3 | [apps/app/lib/navigation/nav-items.test.ts:17](../../apps/app/lib/navigation/nav-items.test.ts#L17), [apps/app/lib/navigation/nav-items.test.ts:18](../../apps/app/lib/navigation/nav-items.test.ts#L18), [apps/app/lib/navigation/nav-items.test.ts:54](../../apps/app/lib/navigation/nav-items.test.ts#L54) |
| apps/app/lib/navigation/nav-items.test.ts | `org:manager` | 3 | [apps/app/lib/navigation/nav-items.test.ts:20](../../apps/app/lib/navigation/nav-items.test.ts#L20), [apps/app/lib/navigation/nav-items.test.ts:34](../../apps/app/lib/navigation/nav-items.test.ts#L34), [apps/app/lib/navigation/nav-items.test.ts:53](../../apps/app/lib/navigation/nav-items.test.ts#L53) |
| apps/app/lib/navigation/nav-items.test.ts | `org:owner` | 2 | [apps/app/lib/navigation/nav-items.test.ts:17](../../apps/app/lib/navigation/nav-items.test.ts#L17), [apps/app/lib/navigation/nav-items.test.ts:19](../../apps/app/lib/navigation/nav-items.test.ts#L19) |
| apps/app/lib/navigation/nav-items.test.ts | `org:viewer` | 4 | [apps/app/lib/navigation/nav-items.test.ts:11](../../apps/app/lib/navigation/nav-items.test.ts#L11), [apps/app/lib/navigation/nav-items.test.ts:21](../../apps/app/lib/navigation/nav-items.test.ts#L21), [apps/app/lib/navigation/nav-items.test.ts:33](../../apps/app/lib/navigation/nav-items.test.ts#L33), [apps/app/lib/navigation/nav-items.test.ts:61](../../apps/app/lib/navigation/nav-items.test.ts#L61) |
| apps/app/lib/server/onboarding-gate.test.ts | `org:admin` | 1 | [apps/app/lib/server/onboarding-gate.test.ts:5](../../apps/app/lib/server/onboarding-gate.test.ts#L5) |
| apps/app/lib/server/onboarding-gate.test.ts | `org:manager` | 1 | [apps/app/lib/server/onboarding-gate.test.ts:63](../../apps/app/lib/server/onboarding-gate.test.ts#L63) |
| apps/app/lib/server/onboarding-gate.test.ts | `org:owner` | 1 | [apps/app/lib/server/onboarding-gate.test.ts:21](../../apps/app/lib/server/onboarding-gate.test.ts#L21) |
| apps/app/lib/server/onboarding-gate.test.ts | `org:viewer` | 2 | [apps/app/lib/server/onboarding-gate.test.ts:63](../../apps/app/lib/server/onboarding-gate.test.ts#L63), [apps/app/lib/server/onboarding-gate.test.ts:76](../../apps/app/lib/server/onboarding-gate.test.ts#L76) |
| packages/availability/index.integration.test.ts | `org:admin` | 19 | [packages/availability/index.integration.test.ts:233](../../packages/availability/index.integration.test.ts#L233), [packages/availability/index.integration.test.ts:273](../../packages/availability/index.integration.test.ts#L273), [packages/availability/index.integration.test.ts:286](../../packages/availability/index.integration.test.ts#L286), [packages/availability/index.integration.test.ts:296](../../packages/availability/index.integration.test.ts#L296), [packages/availability/index.integration.test.ts:377](../../packages/availability/index.integration.test.ts#L377), [packages/availability/index.integration.test.ts:391](../../packages/availability/index.integration.test.ts#L391), [packages/availability/index.integration.test.ts:411](../../packages/availability/index.integration.test.ts#L411), [packages/availability/index.integration.test.ts:429](../../packages/availability/index.integration.test.ts#L429), [packages/availability/index.integration.test.ts:445](../../packages/availability/index.integration.test.ts#L445), [packages/availability/index.integration.test.ts:1118](../../packages/availability/index.integration.test.ts#L1118), [packages/availability/index.integration.test.ts:1261](../../packages/availability/index.integration.test.ts#L1261), [packages/availability/index.integration.test.ts:1269](../../packages/availability/index.integration.test.ts#L1269), [packages/availability/index.integration.test.ts:1353](../../packages/availability/index.integration.test.ts#L1353), [packages/availability/index.integration.test.ts:1361](../../packages/availability/index.integration.test.ts#L1361), [packages/availability/index.integration.test.ts:1379](../../packages/availability/index.integration.test.ts#L1379), [packages/availability/index.integration.test.ts:1388](../../packages/availability/index.integration.test.ts#L1388), [packages/availability/index.integration.test.ts:1408](../../packages/availability/index.integration.test.ts#L1408), [packages/availability/index.integration.test.ts:1417](../../packages/availability/index.integration.test.ts#L1417), [packages/availability/index.integration.test.ts:1480](../../packages/availability/index.integration.test.ts#L1480) |
| packages/availability/index.integration.test.ts | `org:viewer` | 2 | [packages/availability/index.integration.test.ts:1198](../../packages/availability/index.integration.test.ts#L1198), [packages/availability/index.integration.test.ts:1206](../../packages/availability/index.integration.test.ts#L1206) |
| packages/availability/index.test.ts | `org:admin` | 1 | [packages/availability/index.test.ts:304](../../packages/availability/index.test.ts#L304) |
| packages/availability/index.test.ts | `org:viewer` | 1 | [packages/availability/index.test.ts:691](../../packages/availability/index.test.ts#L691) |
| packages/availability/src/approvals/approval-service.test.ts | `org:viewer` | 2 | [packages/availability/src/approvals/approval-service.test.ts:628](../../packages/availability/src/approvals/approval-service.test.ts#L628), [packages/availability/src/approvals/approval-service.test.ts:669](../../packages/availability/src/approvals/approval-service.test.ts#L669) |
| packages/availability/src/approvals/multi-company-routing.integration.test.ts | `org:viewer` | 4 | [packages/availability/src/approvals/multi-company-routing.integration.test.ts:197](../../packages/availability/src/approvals/multi-company-routing.integration.test.ts#L197), [packages/availability/src/approvals/multi-company-routing.integration.test.ts:212](../../packages/availability/src/approvals/multi-company-routing.integration.test.ts#L212), [packages/availability/src/approvals/multi-company-routing.integration.test.ts:234](../../packages/availability/src/approvals/multi-company-routing.integration.test.ts#L234), [packages/availability/src/approvals/multi-company-routing.integration.test.ts:248](../../packages/availability/src/approvals/multi-company-routing.integration.test.ts#L248) |
| packages/availability/src/dashboard/dashboard-service.test.ts | `org:admin` | 1 | [packages/availability/src/dashboard/dashboard-service.test.ts:374](../../packages/availability/src/dashboard/dashboard-service.test.ts#L374) |
| packages/availability/src/dashboard/dashboard-service.test.ts | `org:owner` | 1 | [packages/availability/src/dashboard/dashboard-service.test.ts:373](../../packages/availability/src/dashboard/dashboard-service.test.ts#L373) |
| packages/availability/src/dashboard/dashboard-service.test.ts | `org:viewer` | 3 | [packages/availability/src/dashboard/dashboard-service.test.ts:375](../../packages/availability/src/dashboard/dashboard-service.test.ts#L375), [packages/availability/src/dashboard/dashboard-service.test.ts:376](../../packages/availability/src/dashboard/dashboard-service.test.ts#L376), [packages/availability/src/dashboard/dashboard-service.test.ts:377](../../packages/availability/src/dashboard/dashboard-service.test.ts#L377) |
| packages/availability/src/onboarding/wizard-service.test.ts | `org:admin` | 1 | [packages/availability/src/onboarding/wizard-service.test.ts:46](../../packages/availability/src/onboarding/wizard-service.test.ts#L46) |
| packages/availability/src/onboarding/wizard-service.test.ts | `org:viewer` | 4 | [packages/availability/src/onboarding/wizard-service.test.ts:81](../../packages/availability/src/onboarding/wizard-service.test.ts#L81), [packages/availability/src/onboarding/wizard-service.test.ts:82](../../packages/availability/src/onboarding/wizard-service.test.ts#L82), [packages/availability/src/onboarding/wizard-service.test.ts:231](../../packages/availability/src/onboarding/wizard-service.test.ts#L231), [packages/availability/src/onboarding/wizard-service.test.ts:267](../../packages/availability/src/onboarding/wizard-service.test.ts#L267) |
| packages/availability/src/people/clerk-access-service.integration.test.ts | `org:member` | 1 | [packages/availability/src/people/clerk-access-service.integration.test.ts:127](../../packages/availability/src/people/clerk-access-service.integration.test.ts#L127) |
| packages/availability/src/people/clerk-access-service.integration.test.ts | `org:viewer` | 1 | [packages/availability/src/people/clerk-access-service.integration.test.ts:329](../../packages/availability/src/people/clerk-access-service.integration.test.ts#L329) |
| packages/availability/src/plans/plan-service.test.ts | `org:admin` | 17 | [packages/availability/src/plans/plan-service.test.ts:229](../../packages/availability/src/plans/plan-service.test.ts#L229), [packages/availability/src/plans/plan-service.test.ts:241](../../packages/availability/src/plans/plan-service.test.ts#L241), [packages/availability/src/plans/plan-service.test.ts:283](../../packages/availability/src/plans/plan-service.test.ts#L283), [packages/availability/src/plans/plan-service.test.ts:291](../../packages/availability/src/plans/plan-service.test.ts#L291), [packages/availability/src/plans/plan-service.test.ts:309](../../packages/availability/src/plans/plan-service.test.ts#L309), [packages/availability/src/plans/plan-service.test.ts:317](../../packages/availability/src/plans/plan-service.test.ts#L317), [packages/availability/src/plans/plan-service.test.ts:456](../../packages/availability/src/plans/plan-service.test.ts#L456), [packages/availability/src/plans/plan-service.test.ts:499](../../packages/availability/src/plans/plan-service.test.ts#L499), [packages/availability/src/plans/plan-service.test.ts:508](../../packages/availability/src/plans/plan-service.test.ts#L508), [packages/availability/src/plans/plan-service.test.ts:659](../../packages/availability/src/plans/plan-service.test.ts#L659), [packages/availability/src/plans/plan-service.test.ts:665](../../packages/availability/src/plans/plan-service.test.ts#L665), [packages/availability/src/plans/plan-service.test.ts:803](../../packages/availability/src/plans/plan-service.test.ts#L803), [packages/availability/src/plans/plan-service.test.ts:804](../../packages/availability/src/plans/plan-service.test.ts#L804), [packages/availability/src/plans/plan-service.test.ts:822](../../packages/availability/src/plans/plan-service.test.ts#L822), [packages/availability/src/plans/plan-service.test.ts:823](../../packages/availability/src/plans/plan-service.test.ts#L823), [packages/availability/src/plans/plan-service.test.ts:873](../../packages/availability/src/plans/plan-service.test.ts#L873), [packages/availability/src/plans/plan-service.test.ts:879](../../packages/availability/src/plans/plan-service.test.ts#L879) |
| packages/availability/src/plans/plan-service.test.ts | `org:manager` | 8 | [packages/availability/src/plans/plan-service.test.ts:333](../../packages/availability/src/plans/plan-service.test.ts#L333), [packages/availability/src/plans/plan-service.test.ts:341](../../packages/availability/src/plans/plan-service.test.ts#L341), [packages/availability/src/plans/plan-service.test.ts:356](../../packages/availability/src/plans/plan-service.test.ts#L356), [packages/availability/src/plans/plan-service.test.ts:367](../../packages/availability/src/plans/plan-service.test.ts#L367), [packages/availability/src/plans/plan-service.test.ts:384](../../packages/availability/src/plans/plan-service.test.ts#L384), [packages/availability/src/plans/plan-service.test.ts:398](../../packages/availability/src/plans/plan-service.test.ts#L398), [packages/availability/src/plans/plan-service.test.ts:433](../../packages/availability/src/plans/plan-service.test.ts#L433), [packages/availability/src/plans/plan-service.test.ts:441](../../packages/availability/src/plans/plan-service.test.ts#L441) |
| packages/availability/src/plans/plan-service.test.ts | `org:owner` | 1 | [packages/availability/src/plans/plan-service.test.ts:456](../../packages/availability/src/plans/plan-service.test.ts#L456) |
| packages/availability/src/plans/plan-service.test.ts | `org:viewer` | 15 | [packages/availability/src/plans/plan-service.test.ts:139](../../packages/availability/src/plans/plan-service.test.ts#L139), [packages/availability/src/plans/plan-service.test.ts:615](../../packages/availability/src/plans/plan-service.test.ts#L615), [packages/availability/src/plans/plan-service.test.ts:622](../../packages/availability/src/plans/plan-service.test.ts#L622), [packages/availability/src/plans/plan-service.test.ts:638](../../packages/availability/src/plans/plan-service.test.ts#L638), [packages/availability/src/plans/plan-service.test.ts:644](../../packages/availability/src/plans/plan-service.test.ts#L644), [packages/availability/src/plans/plan-service.test.ts:681](../../packages/availability/src/plans/plan-service.test.ts#L681), [packages/availability/src/plans/plan-service.test.ts:687](../../packages/availability/src/plans/plan-service.test.ts#L687), [packages/availability/src/plans/plan-service.test.ts:699](../../packages/availability/src/plans/plan-service.test.ts#L699), [packages/availability/src/plans/plan-service.test.ts:705](../../packages/availability/src/plans/plan-service.test.ts#L705), [packages/availability/src/plans/plan-service.test.ts:717](../../packages/availability/src/plans/plan-service.test.ts#L717), [packages/availability/src/plans/plan-service.test.ts:724](../../packages/availability/src/plans/plan-service.test.ts#L724), [packages/availability/src/plans/plan-service.test.ts:740](../../packages/availability/src/plans/plan-service.test.ts#L740), [packages/availability/src/plans/plan-service.test.ts:746](../../packages/availability/src/plans/plan-service.test.ts#L746), [packages/availability/src/plans/plan-service.test.ts:766](../../packages/availability/src/plans/plan-service.test.ts#L766), [packages/availability/src/plans/plan-service.test.ts:772](../../packages/availability/src/plans/plan-service.test.ts#L772) |
| packages/availability/src/plans/submit-recovery-service.test.ts | `org:admin` | 1 | [packages/availability/src/plans/submit-recovery-service.test.ts:93](../../packages/availability/src/plans/submit-recovery-service.test.ts#L93) |
| packages/availability/src/plans/submit-recovery-service.test.ts | `org:viewer` | 1 | [packages/availability/src/plans/submit-recovery-service.test.ts:195](../../packages/availability/src/plans/submit-recovery-service.test.ts#L195) |
| packages/availability/src/plans/submit-service.test.ts | `org:admin` | 2 | [packages/availability/src/plans/submit-service.test.ts:149](../../packages/availability/src/plans/submit-service.test.ts#L149), [packages/availability/src/plans/submit-service.test.ts:891](../../packages/availability/src/plans/submit-service.test.ts#L891) |
| packages/availability/src/records/manual-records-service.test.ts | `org:admin` | 2 | [packages/availability/src/records/manual-records-service.test.ts:179](../../packages/availability/src/records/manual-records-service.test.ts#L179), [packages/availability/src/records/manual-records-service.test.ts:211](../../packages/availability/src/records/manual-records-service.test.ts#L211) |
| packages/availability/src/records/manual-records-service.test.ts | `org:viewer` | 6 | [packages/availability/src/records/manual-records-service.test.ts:130](../../packages/availability/src/records/manual-records-service.test.ts#L130), [packages/availability/src/records/manual-records-service.test.ts:154](../../packages/availability/src/records/manual-records-service.test.ts#L154), [packages/availability/src/records/manual-records-service.test.ts:245](../../packages/availability/src/records/manual-records-service.test.ts#L245), [packages/availability/src/records/manual-records-service.test.ts:268](../../packages/availability/src/records/manual-records-service.test.ts#L268), [packages/availability/src/records/manual-records-service.test.ts:294](../../packages/availability/src/records/manual-records-service.test.ts#L294), [packages/availability/src/records/manual-records-service.test.ts:314](../../packages/availability/src/records/manual-records-service.test.ts#L314) |
| packages/feeds/index.integration.test.ts | `org:admin` | 43 | [packages/feeds/index.integration.test.ts:254](../../packages/feeds/index.integration.test.ts#L254), [packages/feeds/index.integration.test.ts:263](../../packages/feeds/index.integration.test.ts#L263), [packages/feeds/index.integration.test.ts:330](../../packages/feeds/index.integration.test.ts#L330), [packages/feeds/index.integration.test.ts:647](../../packages/feeds/index.integration.test.ts#L647), [packages/feeds/index.integration.test.ts:712](../../packages/feeds/index.integration.test.ts#L712), [packages/feeds/index.integration.test.ts:852](../../packages/feeds/index.integration.test.ts#L852), [packages/feeds/index.integration.test.ts:864](../../packages/feeds/index.integration.test.ts#L864), [packages/feeds/index.integration.test.ts:893](../../packages/feeds/index.integration.test.ts#L893), [packages/feeds/index.integration.test.ts:902](../../packages/feeds/index.integration.test.ts#L902), [packages/feeds/index.integration.test.ts:1108](../../packages/feeds/index.integration.test.ts#L1108), [packages/feeds/index.integration.test.ts:1120](../../packages/feeds/index.integration.test.ts#L1120), [packages/feeds/index.integration.test.ts:1147](../../packages/feeds/index.integration.test.ts#L1147), [packages/feeds/index.integration.test.ts:1159](../../packages/feeds/index.integration.test.ts#L1159), [packages/feeds/index.integration.test.ts:1173](../../packages/feeds/index.integration.test.ts#L1173), [packages/feeds/index.integration.test.ts:1185](../../packages/feeds/index.integration.test.ts#L1185), [packages/feeds/index.integration.test.ts:1387](../../packages/feeds/index.integration.test.ts#L1387), [packages/feeds/index.integration.test.ts:1396](../../packages/feeds/index.integration.test.ts#L1396), [packages/feeds/index.integration.test.ts:1413](../../packages/feeds/index.integration.test.ts#L1413), [packages/feeds/index.integration.test.ts:1422](../../packages/feeds/index.integration.test.ts#L1422), [packages/feeds/index.integration.test.ts:1540](../../packages/feeds/index.integration.test.ts#L1540), [packages/feeds/index.integration.test.ts:1549](../../packages/feeds/index.integration.test.ts#L1549), [packages/feeds/index.integration.test.ts:1565](../../packages/feeds/index.integration.test.ts#L1565), [packages/feeds/index.integration.test.ts:1574](../../packages/feeds/index.integration.test.ts#L1574), [packages/feeds/index.integration.test.ts:1924](../../packages/feeds/index.integration.test.ts#L1924), [packages/feeds/index.integration.test.ts:1935](../../packages/feeds/index.integration.test.ts#L1935), [packages/feeds/index.integration.test.ts:2018](../../packages/feeds/index.integration.test.ts#L2018), [packages/feeds/index.integration.test.ts:2028](../../packages/feeds/index.integration.test.ts#L2028), [packages/feeds/index.integration.test.ts:2073](../../packages/feeds/index.integration.test.ts#L2073), [packages/feeds/index.integration.test.ts:2074](../../packages/feeds/index.integration.test.ts#L2074), [packages/feeds/index.integration.test.ts:2080](../../packages/feeds/index.integration.test.ts#L2080), [packages/feeds/index.integration.test.ts:2087](../../packages/feeds/index.integration.test.ts#L2087), [packages/feeds/index.integration.test.ts:2095](../../packages/feeds/index.integration.test.ts#L2095), [packages/feeds/index.integration.test.ts:2096](../../packages/feeds/index.integration.test.ts#L2096), [packages/feeds/index.integration.test.ts:2110](../../packages/feeds/index.integration.test.ts#L2110), [packages/feeds/index.integration.test.ts:2118](../../packages/feeds/index.integration.test.ts#L2118), [packages/feeds/index.integration.test.ts:2149](../../packages/feeds/index.integration.test.ts#L2149), [packages/feeds/index.integration.test.ts:2157](../../packages/feeds/index.integration.test.ts#L2157), [packages/feeds/index.integration.test.ts:2184](../../packages/feeds/index.integration.test.ts#L2184), [packages/feeds/index.integration.test.ts:2193](../../packages/feeds/index.integration.test.ts#L2193), [packages/feeds/index.integration.test.ts:2230](../../packages/feeds/index.integration.test.ts#L2230), [packages/feeds/index.integration.test.ts:2238](../../packages/feeds/index.integration.test.ts#L2238), [packages/feeds/index.integration.test.ts:2351](../../packages/feeds/index.integration.test.ts#L2351), [packages/feeds/index.integration.test.ts:2363](../../packages/feeds/index.integration.test.ts#L2363) |
| packages/feeds/index.integration.test.ts | `org:viewer` | 8 | [packages/feeds/index.integration.test.ts:1992](../../packages/feeds/index.integration.test.ts#L1992), [packages/feeds/index.integration.test.ts:2003](../../packages/feeds/index.integration.test.ts#L2003), [packages/feeds/index.integration.test.ts:2101](../../packages/feeds/index.integration.test.ts#L2101), [packages/feeds/index.integration.test.ts:2103](../../packages/feeds/index.integration.test.ts#L2103), [packages/feeds/index.integration.test.ts:2208](../../packages/feeds/index.integration.test.ts#L2208), [packages/feeds/index.integration.test.ts:2216](../../packages/feeds/index.integration.test.ts#L2216), [packages/feeds/index.integration.test.ts:2259](../../packages/feeds/index.integration.test.ts#L2259), [packages/feeds/index.integration.test.ts:2269](../../packages/feeds/index.integration.test.ts#L2269) |
| packages/feeds/src/preview/preview-service.test.ts | `org:admin` | 3 | [packages/feeds/src/preview/preview-service.test.ts:84](../../packages/feeds/src/preview/preview-service.test.ts#L84), [packages/feeds/src/preview/preview-service.test.ts:273](../../packages/feeds/src/preview/preview-service.test.ts#L273), [packages/feeds/src/preview/preview-service.test.ts:280](../../packages/feeds/src/preview/preview-service.test.ts#L280) |
| packages/feeds/src/preview/preview-service.test.ts | `org:manager` | 2 | [packages/feeds/src/preview/preview-service.test.ts:121](../../packages/feeds/src/preview/preview-service.test.ts#L121), [packages/feeds/src/preview/preview-service.test.ts:170](../../packages/feeds/src/preview/preview-service.test.ts#L170) |
| packages/feeds/src/preview/preview-service.test.ts | `org:viewer` | 8 | [packages/feeds/src/preview/preview-service.test.ts:121](../../packages/feeds/src/preview/preview-service.test.ts#L121), [packages/feeds/src/preview/preview-service.test.ts:170](../../packages/feeds/src/preview/preview-service.test.ts#L170), [packages/feeds/src/preview/preview-service.test.ts:338](../../packages/feeds/src/preview/preview-service.test.ts#L338), [packages/feeds/src/preview/preview-service.test.ts:345](../../packages/feeds/src/preview/preview-service.test.ts#L345), [packages/feeds/src/preview/preview-service.test.ts:375](../../packages/feeds/src/preview/preview-service.test.ts#L375), [packages/feeds/src/preview/preview-service.test.ts:383](../../packages/feeds/src/preview/preview-service.test.ts#L383), [packages/feeds/src/preview/preview-service.test.ts:405](../../packages/feeds/src/preview/preview-service.test.ts#L405), [packages/feeds/src/preview/preview-service.test.ts:412](../../packages/feeds/src/preview/preview-service.test.ts#L412) |
| packages/feeds/src/tokens/token-service.test.ts | `org:admin` | 1 | [packages/feeds/src/tokens/token-service.test.ts:111](../../packages/feeds/src/tokens/token-service.test.ts#L111) |
| packages/feeds/src/tokens/token-service.test.ts | `org:viewer` | 4 | [packages/feeds/src/tokens/token-service.test.ts:355](../../packages/feeds/src/tokens/token-service.test.ts#L355), [packages/feeds/src/tokens/token-service.test.ts:362](../../packages/feeds/src/tokens/token-service.test.ts#L362), [packages/feeds/src/tokens/token-service.test.ts:374](../../packages/feeds/src/tokens/token-service.test.ts#L374), [packages/feeds/src/tokens/token-service.test.ts:381](../../packages/feeds/src/tokens/token-service.test.ts#L381) |
| packages/xero/src/oauth/disconnect.integration.test.ts | `org:admin` | 2 | [packages/xero/src/oauth/disconnect.integration.test.ts:574](../../packages/xero/src/oauth/disconnect.integration.test.ts#L574), [packages/xero/src/oauth/disconnect.integration.test.ts:630](../../packages/xero/src/oauth/disconnect.integration.test.ts#L630) |

### Documentation role mentions, separate from source

| Document | Role | Count | Occurrence links |
| --- | --- | --- | --- |
| AGENTS.md | `org:admin` | 1 | [AGENTS.md:260](../../AGENTS.md#L260) |
| PRODUCT.md | `org:admin` | 1 | [PRODUCT.md:184](../../PRODUCT.md#L184) |
| ScreenCatalogue.md | `org:admin` | 29 | [ScreenCatalogue.md:169](../../ScreenCatalogue.md#L169), [ScreenCatalogue.md:175](../../ScreenCatalogue.md#L175), [ScreenCatalogue.md:176](../../ScreenCatalogue.md#L176), [ScreenCatalogue.md:177](../../ScreenCatalogue.md#L177), [ScreenCatalogue.md:178](../../ScreenCatalogue.md#L178), [ScreenCatalogue.md:179](../../ScreenCatalogue.md#L179), [ScreenCatalogue.md:180](../../ScreenCatalogue.md#L180), [ScreenCatalogue.md:181](../../ScreenCatalogue.md#L181), [ScreenCatalogue.md:182](../../ScreenCatalogue.md#L182), [ScreenCatalogue.md:183](../../ScreenCatalogue.md#L183), [ScreenCatalogue.md:184](../../ScreenCatalogue.md#L184), [ScreenCatalogue.md:186](../../ScreenCatalogue.md#L186), [ScreenCatalogue.md:187](../../ScreenCatalogue.md#L187), [ScreenCatalogue.md:188](../../ScreenCatalogue.md#L188), [ScreenCatalogue.md:426](../../ScreenCatalogue.md#L426), [ScreenCatalogue.md:507](../../ScreenCatalogue.md#L507), [ScreenCatalogue.md:659](../../ScreenCatalogue.md#L659), [ScreenCatalogue.md:679](../../ScreenCatalogue.md#L679), [ScreenCatalogue.md:695](../../ScreenCatalogue.md#L695), [ScreenCatalogue.md:709](../../ScreenCatalogue.md#L709), [ScreenCatalogue.md:730](../../ScreenCatalogue.md#L730), [ScreenCatalogue.md:744](../../ScreenCatalogue.md#L744), [ScreenCatalogue.md:763](../../ScreenCatalogue.md#L763), [ScreenCatalogue.md:779](../../ScreenCatalogue.md#L779), [ScreenCatalogue.md:799](../../ScreenCatalogue.md#L799), [ScreenCatalogue.md:819](../../ScreenCatalogue.md#L819), [ScreenCatalogue.md:854](../../ScreenCatalogue.md#L854), [ScreenCatalogue.md:868](../../ScreenCatalogue.md#L868), [ScreenCatalogue.md:880](../../ScreenCatalogue.md#L880) |
| ScreenCatalogue.md | `org:manager` | 6 | [ScreenCatalogue.md:168](../../ScreenCatalogue.md#L168), [ScreenCatalogue.md:173](../../ScreenCatalogue.md#L173), [ScreenCatalogue.md:174](../../ScreenCatalogue.md#L174), [ScreenCatalogue.md:485](../../ScreenCatalogue.md#L485), [ScreenCatalogue.md:598](../../ScreenCatalogue.md#L598), [ScreenCatalogue.md:624](../../ScreenCatalogue.md#L624) |
| ScreenCatalogue.md | `org:owner` | 2 | [ScreenCatalogue.md:180](../../ScreenCatalogue.md#L180), [ScreenCatalogue.md:744](../../ScreenCatalogue.md#L744) |
| ScreenCatalogue.md | `org:viewer` | 17 | [ScreenCatalogue.md:159](../../ScreenCatalogue.md#L159), [ScreenCatalogue.md:162](../../ScreenCatalogue.md#L162), [ScreenCatalogue.md:165](../../ScreenCatalogue.md#L165), [ScreenCatalogue.md:166](../../ScreenCatalogue.md#L166), [ScreenCatalogue.md:167](../../ScreenCatalogue.md#L167), [ScreenCatalogue.md:169](../../ScreenCatalogue.md#L169), [ScreenCatalogue.md:170](../../ScreenCatalogue.md#L170), [ScreenCatalogue.md:171](../../ScreenCatalogue.md#L171), [ScreenCatalogue.md:300](../../ScreenCatalogue.md#L300), [ScreenCatalogue.md:327](../../ScreenCatalogue.md#L327), [ScreenCatalogue.md:353](../../ScreenCatalogue.md#L353), [ScreenCatalogue.md:399](../../ScreenCatalogue.md#L399), [ScreenCatalogue.md:426](../../ScreenCatalogue.md#L426), [ScreenCatalogue.md:452](../../ScreenCatalogue.md#L452), [ScreenCatalogue.md:507](../../ScreenCatalogue.md#L507), [ScreenCatalogue.md:530](../../ScreenCatalogue.md#L530), [ScreenCatalogue.md:555](../../ScreenCatalogue.md#L555) |
| docs/superpowers/plans/2026-10-09-onboarding.md | `org:admin` | 1 | [docs/superpowers/plans/2026-10-09-onboarding.md:156](../../docs/superpowers/plans/2026-10-09-onboarding.md#L156) |
| docs/superpowers/plans/2026-10-09-onboarding.md | `org:manager` | 1 | [docs/superpowers/plans/2026-10-09-onboarding.md:156](../../docs/superpowers/plans/2026-10-09-onboarding.md#L156) |
| docs/superpowers/plans/2026-10-09-onboarding.md | `org:viewer` | 1 | [docs/superpowers/plans/2026-10-09-onboarding.md:156](../../docs/superpowers/plans/2026-10-09-onboarding.md#L156) |
| docs/superpowers/plans/2026-10-10-xero-multi-company.md | `org:admin` | 2 | [docs/superpowers/plans/2026-10-10-xero-multi-company.md:44](../../docs/superpowers/plans/2026-10-10-xero-multi-company.md#L44), [docs/superpowers/plans/2026-10-10-xero-multi-company.md:254](../../docs/superpowers/plans/2026-10-10-xero-multi-company.md#L254) |
| docs/superpowers/plans/2026-10-10-xero-multi-company.md | `org:owner` | 3 | [docs/superpowers/plans/2026-10-10-xero-multi-company.md:226](../../docs/superpowers/plans/2026-10-10-xero-multi-company.md#L226), [docs/superpowers/plans/2026-10-10-xero-multi-company.md:254](../../docs/superpowers/plans/2026-10-10-xero-multi-company.md#L254), [docs/superpowers/plans/2026-10-10-xero-multi-company.md:254](../../docs/superpowers/plans/2026-10-10-xero-multi-company.md#L254) |
| docs/superpowers/specs/2026-10-09-calendar-feeds-design.md | `org:viewer` | 1 | [docs/superpowers/specs/2026-10-09-calendar-feeds-design.md:45](../../docs/superpowers/specs/2026-10-09-calendar-feeds-design.md#L45) |
| docs/superpowers/specs/2026-10-09-onboarding-design.md | `org:admin` | 1 | [docs/superpowers/specs/2026-10-09-onboarding-design.md:160](../../docs/superpowers/specs/2026-10-09-onboarding-design.md#L160) |
| docs/superpowers/specs/2026-10-09-onboarding-design.md | `org:owner` | 1 | [docs/superpowers/specs/2026-10-09-onboarding-design.md:160](../../docs/superpowers/specs/2026-10-09-onboarding-design.md#L160) |

## 4. Database dependencies

### Scope and architecture

The account boundary is the Clerk Organisation, stored as `clerk_org_id`; local `Organisation` means payroll company. Users and memberships are managed by Clerk, without local users/membership tables ([PRODUCT.md:139](../../PRODUCT.md#L139), [PRODUCT.md:149](../../PRODUCT.md#L149), [PRODUCT.md:150](../../PRODUCT.md#L150)). The restricted tenant client sets transaction-local `app.clerk_org_id`; RLS enforces that account and owned payroll companies ([packages/database/src/tenant-db.ts:90](../../packages/database/src/tenant-db.ts#L90), [packages/database/src/tenant-db.ts:111](../../packages/database/src/tenant-db.ts#L111)).

### Counts

| Area | Count | Definition |
| --- | --- | --- |
| Prisma models | 33 | All mapped current models |
| Models with explicit Clerk scalar columns | 30 | One clerk_org_id per model |
| Explicit Clerk scalar columns | 32 | 30 clerk_org_id, people.clerk_user_id, xero_person_matches.resolved_clerk_user_id |
| Clerk scalar nullability | 29 required / 3 nullable | stripe_events.clerk_org_id and both user-link columns are nullable |
| Clerk index/unique declarations | 40 | Includes 2 field-level @unique declarations; excludes unrelated keys on Clerk-scoped tables |
| Composite Prisma relations containing clerk_org_id | 5 | All reference local tables, never Clerk service tables |
| Current RLS policies | 29 | tenant_isolation on 29 tables; people policy subsequently altered |
| Current SQL functions directly using Clerk context | 1 | public.tc_manager_belongs_to_account(uuid,text) |
| Generic actor/recipient user columns | 17 | Separate identity migration candidates, excludes xero_user_id |
| Migration files with literal Clerk matches | 15 | 182 matching source lines, including comments and quoted table names |
| Documentation files with Clerk matches | 1 | Generated code and migrations excluded; lexical counts, not runtime executions |
| Fixtures files with Clerk matches | 4 | Generated code and migrations excluded; lexical counts, not runtime executions |
| Runtime/source files with Clerk matches | 27 | Generated code and migrations excluded; lexical counts, not runtime executions |
| Seed/scripts files with Clerk matches | 3 | Generated code and migrations excluded; lexical counts, not runtime executions |
| Tests files with Clerk matches | 40 | Generated code and migrations excluded; lexical counts, not runtime executions |


### Current Prisma columns

Every listed `String` is PostgreSQL text. Only nullable rows carry `?`. There is no foreign key to an external Clerk account or user table.

| Model / SQL table | Column declaration | Source |
| --- | --- | --- |
| Organisation / `organisations` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:292](../../packages/database/prisma/schema.prisma#L292) |
| AccountSettings / `account_settings` | `clerk_org_id String @unique` | [packages/database/prisma/schema.prisma:342](../../packages/database/prisma/schema.prisma#L342) |
| OrganisationSettings / `organisation_settings` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:353](../../packages/database/prisma/schema.prisma#L353) |
| Team / `teams` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:374](../../packages/database/prisma/schema.prisma#L374) |
| Location / `locations` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:392](../../packages/database/prisma/schema.prisma#L392) |
| Person / `people` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:412](../../packages/database/prisma/schema.prisma#L412) |
| Person / `people` | `clerk_user_id String?` | [packages/database/prisma/schema.prisma:427](../../packages/database/prisma/schema.prisma#L427) |
| AlternativeContact / `alternative_contacts` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:468](../../packages/database/prisma/schema.prisma#L468) |
| XeroConnection / `xero_connections` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:524](../../packages/database/prisma/schema.prisma#L524) |
| XeroOAuthSession / `xero_oauth_sessions` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:578](../../packages/database/prisma/schema.prisma#L578) |
| XeroSyncCursor / `xero_sync_cursors` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:606](../../packages/database/prisma/schema.prisma#L606) |
| AvailabilityRecord / `availability_records` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:625](../../packages/database/prisma/schema.prisma#L625) |
| OutboundOperation / `outbound_operations` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:694](../../packages/database/prisma/schema.prisma#L694) |
| AvailabilityPublication / `availability_publications` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:739](../../packages/database/prisma/schema.prisma#L739) |
| LeaveBalance / `leave_balances` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:765](../../packages/database/prisma/schema.prisma#L765) |
| XeroPersonMatch / `xero_person_matches` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:807](../../packages/database/prisma/schema.prisma#L807) |
| XeroPersonMatch / `xero_person_matches` | `resolved_clerk_user_id String?` | [packages/database/prisma/schema.prisma:815](../../packages/database/prisma/schema.prisma#L815) |
| PublicHoliday / `public_holidays` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:837](../../packages/database/prisma/schema.prisma#L837) |
| PublicHolidayPreference / `public_holiday_preferences` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:868](../../packages/database/prisma/schema.prisma#L868) |
| Feed / `feeds` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:891](../../packages/database/prisma/schema.prisma#L891) |
| FeedEventPublication / `feed_event_publications` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:921](../../packages/database/prisma/schema.prisma#L921) |
| FeedScope / `feed_scopes` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:943](../../packages/database/prisma/schema.prisma#L943) |
| FeedToken / `feed_tokens` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:961](../../packages/database/prisma/schema.prisma#L961) |
| Notification / `notifications` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:989](../../packages/database/prisma/schema.prisma#L989) |
| NotificationPreference / `notification_preferences` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:1021](../../packages/database/prisma/schema.prisma#L1021) |
| NotificationEmailQueue / `notification_email_queue` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:1040](../../packages/database/prisma/schema.prisma#L1040) |
| SyncRun / `sync_runs` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:1073](../../packages/database/prisma/schema.prisma#L1073) |
| FailedRecord / `failed_records` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:1107](../../packages/database/prisma/schema.prisma#L1107) |
| AuditEvent / `audit_events` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:1132](../../packages/database/prisma/schema.prisma#L1132) |
| ClerkOrgSubscription / `clerk_org_subscriptions` | `clerk_org_id String @unique` | [packages/database/prisma/schema.prisma:1194](../../packages/database/prisma/schema.prisma#L1194) |
| UsageCounter / `usage_counters` | `clerk_org_id String` | [packages/database/prisma/schema.prisma:1217](../../packages/database/prisma/schema.prisma#L1217) |
| StripeEvent / `stripe_events` | `clerk_org_id String?` | [packages/database/prisma/schema.prisma:1238](../../packages/database/prisma/schema.prisma#L1238) |


### Current Clerk indexes and unique keys

The following names come from migration SQL, including PostgreSQL-length-truncated names. Current schema declarations are cross-referenced below.

| SQL object name | Table / columns | Kind | Source |
| --- | --- | --- | --- |
| `organisations_clerk_org_id_idx` | `organisations` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:722](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L722) |
| `organisation_settings_clerk_org_id_idx` | `organisation_settings` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:728](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L728) |
| `teams_clerk_org_id_idx` | `teams` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:731](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L731) |
| `locations_clerk_org_id_idx` | `locations` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:737](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L737) |
| `people_clerk_org_id_idx` | `people` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:743](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L743) |
| `people_organisation_id_clerk_user_id_key` | `people` (`"organisation_id", "clerk_user_id"`) | UNIQUE | [packages/database/prisma/migrations/00000000000000_init/migration.sql:764](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L764) |
| `alternative_contacts_clerk_org_id_idx` | `alternative_contacts` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:770](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L770) |
| `xero_connections_clerk_org_id_idx` | `xero_connections` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:785](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L785) |
| `xero_oauth_sessions_clerk_org_id_idx` | `xero_oauth_sessions` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:800](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L800) |
| `xero_sync_cursors_clerk_org_id_idx` | `xero_sync_cursors` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:809](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L809) |
| `availability_records_clerk_org_id_idx` | `availability_records` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:821](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L821) |
| `availability_publications_clerk_org_id_idx` | `availability_publications` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:848](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L848) |
| `leave_balances_clerk_org_id_idx` | `leave_balances` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:857](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L857) |
| `xero_person_matches_clerk_org_id_idx` | `xero_person_matches` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:872](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L872) |
| `public_holidays_clerk_org_id_idx` | `public_holidays` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:899](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L899) |
| `feeds_clerk_org_id_idx` | `feeds` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:926](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L926) |
| `feeds_clerk_org_id_slug_key` | `feeds` (`"clerk_org_id", "slug"`) | UNIQUE | [packages/database/prisma/migrations/00000000000000_init/migration.sql:932](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L932) |
| `feed_scopes_clerk_org_id_idx` | `feed_scopes` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:935](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L935) |
| `feed_tokens_clerk_org_id_idx` | `feed_tokens` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:950](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L950) |
| `notifications_clerk_org_id_idx` | `notifications` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:962](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L962) |
| `notification_preferences_clerk_org_id_idx` | `notification_preferences` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:980](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L980) |
| `notification_email_queue_clerk_org_id_idx` | `notification_email_queue` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:992](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L992) |
| `sync_runs_clerk_org_id_idx` | `sync_runs` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1007](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1007) |
| `failed_records_clerk_org_id_idx` | `failed_records` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1019](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1019) |
| `audit_events_clerk_org_id_idx` | `audit_events` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1031](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1031) |
| `clerk_org_subscriptions_clerk_org_id_key` | `clerk_org_subscriptions` (`"clerk_org_id"`) | UNIQUE | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1058](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1058) |
| `clerk_org_subscriptions_clerk_org_id_idx` | `clerk_org_subscriptions` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1061](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1061) |
| `usage_counters_clerk_org_id_idx` | `usage_counters` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1064](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1064) |
| `usage_counters_clerk_org_id_metric_key_period_start_period__key` | `usage_counters` (`"clerk_org_id", "metric_key", "period_start", "period_end"`) | UNIQUE | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1067](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1067) |
| `usage_counters_clerk_org_id_counter_type_key` | `usage_counters` (`"clerk_org_id", "counter_type"`) | UNIQUE | [packages/database/prisma/migrations/20260627000000_stripe_billing/migration.sql:18](../../packages/database/prisma/migrations/20260627000000_stripe_billing/migration.sql#L18) |
| `outbound_operations_clerk_org_id_idx` | `outbound_operations` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/20260919090000_add_outbound_operations/migration.sql:31](../../packages/database/prisma/migrations/20260919090000_add_outbound_operations/migration.sql#L31) |
| `stripe_events_clerk_org_id_delivery_state_event_created_at_idx` | `stripe_events` (`"clerk_org_id", "delivery_state", "event_created_at"`) | INDEX | [packages/database/prisma/migrations/20260919100000_add_stripe_event_delivery_state/migration.sql:16](../../packages/database/prisma/migrations/20260919100000_add_stripe_event_delivery_state/migration.sql#L16) |
| `feed_event_publications_clerk_org_id_idx` | `feed_event_publications` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/20260927151200_feed_event_publications/migration.sql:24](../../packages/database/prisma/migrations/20260927151200_feed_event_publications/migration.sql#L24) |
| `organisations_id_clerk_org_id_key` | `organisations` (`"id", "clerk_org_id"`) | UNIQUE | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:310](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L310) |
| `sync_runs_clerk_org_id_organisation_id_xero_connection_id_r_idx` | `sync_runs` (`"clerk_org_id", "organisation_id", "xero_connection_id", "run_type", "status", "started_at"`) | INDEX | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:313](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L313) |
| `xero_connections_id_clerk_org_id_organisation_id_key` | `xero_connections` (`"id", "clerk_org_id", "organisation_id"`) | UNIQUE | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:322](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L322) |
| `xero_connections_organisation_id_clerk_org_id_key` | `xero_connections` (`"organisation_id", "clerk_org_id"`) | UNIQUE | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:325](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L325) |
| `public_holiday_preferences_clerk_org_id_idx` | `public_holiday_preferences` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/20261009025847_public_holiday_preferences/migration.sql:21](../../packages/database/prisma/migrations/20261009025847_public_holiday_preferences/migration.sql#L21) |
| `account_settings_clerk_org_id_key` | `account_settings` (`"clerk_org_id"`) | UNIQUE | [packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql:13](../../packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql#L13) |
| `account_settings_clerk_org_id_idx` | `account_settings` (`"clerk_org_id"`) | INDEX | [packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql:16](../../packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql#L16) |


| Prisma model | Declaration | Source |
| --- | --- | --- |
| Organisation | `@@unique([id, clerk_org_id])` | [packages/database/prisma/schema.prisma:335](../../packages/database/prisma/schema.prisma#L335) |
| Organisation | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:336](../../packages/database/prisma/schema.prisma#L336) |
| AccountSettings | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:347](../../packages/database/prisma/schema.prisma#L347) |
| OrganisationSettings | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:368](../../packages/database/prisma/schema.prisma#L368) |
| Team | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:385](../../packages/database/prisma/schema.prisma#L385) |
| Location | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:405](../../packages/database/prisma/schema.prisma#L405) |
| Person | `@@unique([organisation_id, clerk_user_id])` | [packages/database/prisma/schema.prisma:455](../../packages/database/prisma/schema.prisma#L455) |
| Person | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:457](../../packages/database/prisma/schema.prisma#L457) |
| AlternativeContact | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:483](../../packages/database/prisma/schema.prisma#L483) |
| XeroConnection | `@@unique([id, clerk_org_id, organisation_id])` | [packages/database/prisma/schema.prisma:570](../../packages/database/prisma/schema.prisma#L570) |
| XeroConnection | `@@unique([organisation_id, clerk_org_id])` | [packages/database/prisma/schema.prisma:571](../../packages/database/prisma/schema.prisma#L571) |
| XeroConnection | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:572](../../packages/database/prisma/schema.prisma#L572) |
| XeroOAuthSession | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:598](../../packages/database/prisma/schema.prisma#L598) |
| XeroSyncCursor | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:617](../../packages/database/prisma/schema.prisma#L617) |
| AvailabilityRecord | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:680](../../packages/database/prisma/schema.prisma#L680) |
| OutboundOperation | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:731](../../packages/database/prisma/schema.prisma#L731) |
| AvailabilityPublication | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:757](../../packages/database/prisma/schema.prisma#L757) |
| LeaveBalance | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:798](../../packages/database/prisma/schema.prisma#L798) |
| XeroPersonMatch | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:827](../../packages/database/prisma/schema.prisma#L827) |
| PublicHoliday | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:858](../../packages/database/prisma/schema.prisma#L858) |
| PublicHolidayPreference | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:884](../../packages/database/prisma/schema.prisma#L884) |
| Feed | `@@unique([clerk_org_id, slug])` | [packages/database/prisma/schema.prisma:913](../../packages/database/prisma/schema.prisma#L913) |
| Feed | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:914](../../packages/database/prisma/schema.prisma#L914) |
| FeedEventPublication | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:936](../../packages/database/prisma/schema.prisma#L936) |
| FeedScope | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:952](../../packages/database/prisma/schema.prisma#L952) |
| FeedToken | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:980](../../packages/database/prisma/schema.prisma#L980) |
| Notification | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1009](../../packages/database/prisma/schema.prisma#L1009) |
| NotificationPreference | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1032](../../packages/database/prisma/schema.prisma#L1032) |
| NotificationEmailQueue | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1063](../../packages/database/prisma/schema.prisma#L1063) |
| SyncRun | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1098](../../packages/database/prisma/schema.prisma#L1098) |
| SyncRun | `@@index([clerk_org_id, organisation_id, xero_connection_id, run_type, status, started_at])` | [packages/database/prisma/schema.prisma:1101](../../packages/database/prisma/schema.prisma#L1101) |
| FailedRecord | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1123](../../packages/database/prisma/schema.prisma#L1123) |
| AuditEvent | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1151](../../packages/database/prisma/schema.prisma#L1151) |
| ClerkOrgSubscription | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1211](../../packages/database/prisma/schema.prisma#L1211) |
| UsageCounter | `@@unique([clerk_org_id, metric_key, period_start, period_end])` | [packages/database/prisma/schema.prisma:1226](../../packages/database/prisma/schema.prisma#L1226) |
| UsageCounter | `@@unique([clerk_org_id, counter_type])` | [packages/database/prisma/schema.prisma:1227](../../packages/database/prisma/schema.prisma#L1227) |
| UsageCounter | `@@index([clerk_org_id])` | [packages/database/prisma/schema.prisma:1228](../../packages/database/prisma/schema.prisma#L1228) |
| StripeEvent | `@@index([clerk_org_id, delivery_state, event_created_at])` | [packages/database/prisma/schema.prisma:1247](../../packages/database/prisma/schema.prisma#L1247) |
| AccountSettings | `clerk_org_id String @unique` | [packages/database/prisma/schema.prisma:342](../../packages/database/prisma/schema.prisma#L342) |
| ClerkOrgSubscription | `clerk_org_id String @unique` | [packages/database/prisma/schema.prisma:1194](../../packages/database/prisma/schema.prisma#L1194) |


### Current composite relations and physical foreign keys

| Prisma model | Relation | Source |
| --- | --- | --- |
| XeroConnection | `organisation Organisation @relation(fields: [organisation_id, clerk_org_id], references: [id, clerk_org_id])` | [packages/database/prisma/schema.prisma:562](../../packages/database/prisma/schema.prisma#L562) |
| XeroOAuthSession | `organisation Organisation? @relation(fields: [organisation_id, clerk_org_id], references: [id, clerk_org_id])` | [packages/database/prisma/schema.prisma:595](../../packages/database/prisma/schema.prisma#L595) |
| XeroSyncCursor | `xero_connection XeroConnection @relation(fields: [xero_connection_id, clerk_org_id, organisation_id], references: [id, clerk_org_id, organisation_id])` | [packages/database/prisma/schema.prisma:614](../../packages/database/prisma/schema.prisma#L614) |
| LeaveBalance | `xero_connection XeroConnection? @relation(fields: [xero_connection_id, clerk_org_id, organisation_id], references: [id, clerk_org_id, organisation_id], onDelete: Restrict, onUpdate: Cascade)` | [packages/database/prisma/schema.prisma:794](../../packages/database/prisma/schema.prisma#L794) |
| SyncRun | `xero_connection XeroConnection? @relation(fields: [xero_connection_id, clerk_org_id, organisation_id], references: [id, clerk_org_id, organisation_id], onDelete: Restrict, onUpdate: Cascade)` | [packages/database/prisma/schema.prisma:1095](../../packages/database/prisma/schema.prisma#L1095) |


| Physical FK declaration | Source |
| --- | --- |
| `ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_organisation_id_clerk_org_id_fkey" FOREIGN KEY ("organisation_id", "clerk_org_id") REFERENCES "organisations"("id", "clerk_org_id") ON DELETE RESTRICT ON UPDATE CASCADE;` | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:337](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L337) |
| `ALTER TABLE "xero_oauth_sessions" ADD CONSTRAINT "xero_oauth_sessions_organisation_id_clerk_org_id_fkey" FOREIGN KEY ("organisation_id", "clerk_org_id") REFERENCES "organisations"("id", "clerk_org_id") ON DELETE RESTRICT ON UPDATE CASCADE;` | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:343](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L343) |
| `ALTER TABLE "xero_sync_cursors" ADD CONSTRAINT "xero_sync_cursors_xero_connection_id_clerk_org_id_organisa_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;` | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:349](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L349) |
| `ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_xero_connection_id_clerk_org_id_organisatio_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;` | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:352](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L352) |
| `ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_xero_connection_id_clerk_org_id_organisation_id_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;` | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:355](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L355) |


`Plan.clerk_org_subscriptions` is a reverse relation, not a scalar column. `ClerkOrgSubscription.plan` references `plans.key`; its physical name is `clerk_org_subscriptions_plan_key_fkey`. The subscription table primary key is `clerk_org_subscriptions_pkey`. Both contain Clerk in their object names although neither key includes a Clerk column. [packages/database/prisma/schema.prisma:1172](../../packages/database/prisma/schema.prisma#L1172); [packages/database/prisma/schema.prisma:1209](../../packages/database/prisma/schema.prisma#L1209); [packages/database/prisma/migrations/00000000000000_init/migration.sql:1214](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1214).

### Other persisted user identities

These fields are identity migration candidates. The schema does not encode their provider through a foreign key; runtime call sites establish provenance. `xero_authorisations.xero_user_id` is a Xero identity and is explicitly excluded.

| SQL table | Field | Source |
| --- | --- | --- |
| `xero_connections` | `disconnected_by_user_id String?` | [packages/database/prisma/schema.prisma:539](../../packages/database/prisma/schema.prisma#L539) |
| `xero_oauth_sessions` | `created_by_user_id String?` | [packages/database/prisma/schema.prisma:580](../../packages/database/prisma/schema.prisma#L580) |
| `availability_records` | `created_by_user_id String?` | [packages/database/prisma/schema.prisma:650](../../packages/database/prisma/schema.prisma#L650) |
| `availability_records` | `updated_by_user_id String?` | [packages/database/prisma/schema.prisma:651](../../packages/database/prisma/schema.prisma#L651) |
| `outbound_operations` | `actor_user_id String` | [packages/database/prisma/schema.prisma:714](../../packages/database/prisma/schema.prisma#L714) |
| `xero_person_matches` | `resolved_by_user_id String?` | [packages/database/prisma/schema.prisma:816](../../packages/database/prisma/schema.prisma#L816) |
| `public_holidays` | `created_by_user_id String?` | [packages/database/prisma/schema.prisma:849](../../packages/database/prisma/schema.prisma#L849) |
| `public_holidays` | `updated_by_user_id String?` | [packages/database/prisma/schema.prisma:850](../../packages/database/prisma/schema.prisma#L850) |
| `public_holiday_preferences` | `created_by_user_id String?` | [packages/database/prisma/schema.prisma:873](../../packages/database/prisma/schema.prisma#L873) |
| `public_holiday_preferences` | `updated_by_user_id String?` | [packages/database/prisma/schema.prisma:874](../../packages/database/prisma/schema.prisma#L874) |
| `feeds` | `created_by_user_id String?` | [packages/database/prisma/schema.prisma:903](../../packages/database/prisma/schema.prisma#L903) |
| `notifications` | `recipient_user_id String` | [packages/database/prisma/schema.prisma:991](../../packages/database/prisma/schema.prisma#L991) |
| `notifications` | `actor_user_id String?` | [packages/database/prisma/schema.prisma:999](../../packages/database/prisma/schema.prisma#L999) |
| `notification_preferences` | `user_id String` | [packages/database/prisma/schema.prisma:1020](../../packages/database/prisma/schema.prisma#L1020) |
| `notification_email_queue` | `recipient_user_id String` | [packages/database/prisma/schema.prisma:1043](../../packages/database/prisma/schema.prisma#L1043) |
| `sync_runs` | `triggered_by_user_id String?` | [packages/database/prisma/schema.prisma:1079](../../packages/database/prisma/schema.prisma#L1079) |
| `audit_events` | `actor_user_id String?` | [packages/database/prisma/schema.prisma:1134](../../packages/database/prisma/schema.prisma#L1134) |


Generic identity-bearing keys from migration SQL are listed below with their exact physical names. These are additional dependencies beyond account-column keys.

| Identity-bearing key | Source |
| --- | --- |
| `CREATE UNIQUE INDEX "people_organisation_id_clerk_user_id_key" ON "people"("organisation_id", "clerk_user_id");` | [packages/database/prisma/migrations/00000000000000_init/migration.sql:764](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L764) |
| `CREATE INDEX "notifications_recipient_user_id_read_at_idx" ON "notifications"("recipient_user_id", "read_at");` | [packages/database/prisma/migrations/00000000000000_init/migration.sql:971](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L971) |
| `CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at");` | [packages/database/prisma/migrations/00000000000000_init/migration.sql:974](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L974) |
| `CREATE INDEX "notifications_organisation_id_recipient_user_id_created_at_idx" ON "notifications"("organisation_id", "recipient_user_id", "created_at");` | [packages/database/prisma/migrations/00000000000000_init/migration.sql:977](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L977) |
| `CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");` | [packages/database/prisma/migrations/00000000000000_init/migration.sql:986](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L986) |
| `CREATE UNIQUE INDEX "notification_preferences_user_id_organisation_id_notificati_key" ON "notification_preferences"("user_id", "organisation_id", "notification_type");` | [packages/database/prisma/migrations/00000000000000_init/migration.sql:989](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L989) |
| `CREATE INDEX "notification_email_queue_recipient_user_id_status_idx" ON "notification_email_queue"("recipient_user_id", "status");` | [packages/database/prisma/migrations/00000000000000_init/migration.sql:1001](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L1001) |


### Current RLS policies and SQL function

All policies are named `tenant_isolation`, addressed as `table.tenant_isolation`, apply to `team_calendar_app`, and use `clerk_org_id = current_setting('app.clerk_org_id', true)` in both account checks. Missing context does not satisfy that equality. Tables enable RLS and grant SELECT/INSERT/UPDATE/DELETE. The migration does not use FORCE ROW LEVEL SECURITY. Owner/system operations are a separate privileged boundary.

| Policy object | WITH CHECK shape | Source |
| --- | --- | --- |
| `organisations.tenant_isolation` | Account only | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:24](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L24) |
| `organisation_settings.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:30](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L30) |
| `teams.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:36](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L36) |
| `locations.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:42](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L42) |
| `people.tenant_isolation` | Account + owned organisation + manager account check (later ALTER POLICY) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:48](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L48) |
| `alternative_contacts.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:54](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L54) |
| `xero_connections.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:60](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L60) |
| `xero_oauth_sessions.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:66](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L66) |
| `xero_sync_cursors.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:72](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L72) |
| `availability_records.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:78](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L78) |
| `outbound_operations.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:84](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L84) |
| `availability_publications.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:90](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L90) |
| `leave_balances.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:96](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L96) |
| `xero_person_matches.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:102](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L102) |
| `public_holidays.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:108](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L108) |
| `public_holiday_preferences.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:114](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L114) |
| `feeds.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:120](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L120) |
| `feed_event_publications.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:126](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L126) |
| `feed_scopes.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:132](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L132) |
| `feed_tokens.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:138](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L138) |
| `notifications.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:144](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L144) |
| `notification_preferences.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:150](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L150) |
| `notification_email_queue.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:156](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L156) |
| `sync_runs.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:162](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L162) |
| `failed_records.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:168](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L168) |
| `audit_events.tenant_isolation` | Account + owned organisation (or nullable organisation) | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:174](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L174) |
| `clerk_org_subscriptions.tenant_isolation` | Account only | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:180](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L180) |
| `usage_counters.tenant_isolation` | Account only | [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:186](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L186) |
| `account_settings.tenant_isolation` | Account only | [packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql:32](../../packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql#L32) |


`public.tc_manager_belongs_to_account(manager_id uuid, account_id text)` is SQL, STABLE, SECURITY DEFINER with `search_path = pg_catalog`. It first requires `account_id` to equal the transaction Clerk account, then checks `public.people` and `public.organisations` ownership. PUBLIC execution is revoked; `team_calendar_app` receives EXECUTE. The altered `people.tenant_isolation` checks this function for a non-null `manager_person_id`. Source: [packages/database/prisma/migrations/20261014010000_manager_account_isolation/migration.sql:4](../../packages/database/prisma/migrations/20261014010000_manager_account_isolation/migration.sql#L4), policy [packages/database/prisma/migrations/20261014010000_manager_account_isolation/migration.sql:19](../../packages/database/prisma/migrations/20261014010000_manager_account_isolation/migration.sql#L19).

`stripe_events` retains optional Clerk routing context but has no tenant RLS policy/app-role table grant in this migration. `xero_authorisations` has no Clerk account column and no app-role grant. `plans` and `plan_limits` are global read-only reference tables. [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql:18](../../packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql#L18).

### Historical migration-only objects

The following tables and their Clerk account columns/indexes were dropped. They must remain in historical migration inventory, but are absent from the current Prisma model.

| Removed table | Removed field | Removed Clerk index | Drop source |
| --- | --- | --- | --- |
| `xero_cleanup_attempts` | `xero_cleanup_attempts.clerk_org_id` | `xero_cleanup_attempts_clerk_org_id_idx` [packages/database/prisma/migrations/20260926060000_add_xero_cleanup_requests/migration.sql:60](../../packages/database/prisma/migrations/20260926060000_add_xero_cleanup_requests/migration.sql#L60) | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:225](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L225) |
| `xero_cleanup_requests` | `xero_cleanup_requests.clerk_org_id` | `xero_cleanup_requests_clerk_org_id_idx` [packages/database/prisma/migrations/20260926060000_add_xero_cleanup_requests/migration.sql:48](../../packages/database/prisma/migrations/20260926060000_add_xero_cleanup_requests/migration.sql#L48) | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:228](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L228) |
| `xero_inactivity_classifications` | `xero_inactivity_classifications.clerk_org_id` | `xero_inactivity_classifications_clerk_org_id_idx` [packages/database/prisma/migrations/20260926130000_add_xero_inactivity_classifications/migration.sql:25](../../packages/database/prisma/migrations/20260926130000_add_xero_inactivity_classifications/migration.sql#L25) | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:234](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L234) |
| `xero_tenants` | `xero_tenants.clerk_org_id` | `xero_tenants_clerk_org_id_idx` [packages/database/prisma/migrations/00000000000000_init/migration.sql:791](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L791) | [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:243](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L243) |
| `public_holiday_assignments` | `public_holiday_assignments.clerk_org_id` | `public_holiday_assignments_clerk_org_id_idx` [packages/database/prisma/migrations/00000000000000_init/migration.sql:911](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L911) | [packages/database/prisma/migrations/20261009030500_remove_holiday_jurisdictions_and_assignments/migration.sql:21](../../packages/database/prisma/migrations/20261009030500_remove_holiday_jurisdictions_and_assignments/migration.sql#L21) |
| `public_holiday_jurisdictions` | `public_holiday_jurisdictions.clerk_org_id` | `public_holiday_jurisdictions_clerk_org_id_idx` [packages/database/prisma/migrations/00000000000000_init/migration.sql:890](../../packages/database/prisma/migrations/00000000000000_init/migration.sql#L890) | [packages/database/prisma/migrations/20261009030500_remove_holiday_jurisdictions_and_assignments/migration.sql:24](../../packages/database/prisma/migrations/20261009030500_remove_holiday_jurisdictions_and_assignments/migration.sql#L24) |


Historical `sync_runs_clerk_org_id_organisation_id_xero_tenant_id_run_t_idx` is dropped by [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:143](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L143) and replaced by `sync_runs_clerk_org_id_organisation_id_xero_connection_id_r_idx`. No currently retained Clerk-named scalar column was found with a DROP COLUMN operation. Historical fields disappeared through the table drops above.

Historical `prevent_xero_tenant_rebinding()` and trigger `xero_tenants_xero_tenant_id_immutable` belong to the removed Clerk-scoped `xero_tenants` table. The function itself does not reference Clerk. Created in [packages/database/prisma/migrations/20260923190200_prevent_xero_tenant_rebinding/migration.sql:2](../../packages/database/prisma/migrations/20260923190200_prevent_xero_tenant_rebinding/migration.sql#L2) and [packages/database/prisma/migrations/20260923190200_prevent_xero_tenant_rebinding/migration.sql:17](../../packages/database/prisma/migrations/20260923190200_prevent_xero_tenant_rebinding/migration.sql#L17), table dropped in [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql:243](../../packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql#L243), function dropped in [packages/database/prisma/migrations/20261007225300_remove_obsolete_xero_binding_function/migration.sql:1](../../packages/database/prisma/migrations/20261007225300_remove_obsolete_xero_binding_function/migration.sql#L1).

### Runtime/raw SQL inventory

Raw SQL tagged templates are listed by call site, including SQL in the same files which is provider-neutral. Test mocks are separate.

| Call site / export | API | Source |
| --- | --- | --- |
| `getActivationDashboardSummary` | `$queryRaw` | [packages/database/src/queries/activation-dashboard.ts:42](../../packages/database/src/queries/activation-dashboard.ts#L42) |
| `getSubscriptionForOrg` | `$queryRaw` | [packages/database/src/queries/billing.ts:45](../../packages/database/src/queries/billing.ts#L45) |
| `getSubscriptionForStripeCustomer` | `$queryRaw` | [packages/database/src/queries/billing.ts:57](../../packages/database/src/queries/billing.ts#L57) |
| `getSubscriptionForStripeSubscription` | `$queryRaw` | [packages/database/src/queries/billing.ts:69](../../packages/database/src/queries/billing.ts#L69) |
| `getFirstActiveOrganisationIdForClerkOrg` | `$queryRaw` | [packages/database/src/queries/billing.ts:87](../../packages/database/src/queries/billing.ts#L87) |
| `getPlanLimits` | `$queryRaw` | [packages/database/src/queries/billing.ts:102](../../packages/database/src/queries/billing.ts#L102) |
| `getUsageCounter` | `$queryRaw` | [packages/database/src/queries/billing.ts:131](../../packages/database/src/queries/billing.ts#L131) |
| `lockPlanLimitMutations` | `$queryRaw` | [packages/database/src/queries/billing.ts:206](../../packages/database/src/queries/billing.ts#L206) |
| `upsertSubscriptionFromWebhook` | `$executeRaw` | [packages/database/src/queries/billing.ts:222](../../packages/database/src/queries/billing.ts#L222) |
| `isStripeEventProcessed` | `$queryRaw` | [packages/database/src/queries/billing.ts:251](../../packages/database/src/queries/billing.ts#L251) |
| `recordStripeEvent` | `$executeRaw` | [packages/database/src/queries/billing.ts:271](../../packages/database/src/queries/billing.ts#L271) |
| `recordStripeEventIgnored` | `$executeRaw` | [packages/database/src/queries/billing.ts:297](../../packages/database/src/queries/billing.ts#L297) |
| `recordStripeEventFailure` | `$queryRaw` | [packages/database/src/queries/billing.ts:318](../../packages/database/src/queries/billing.ts#L318) |
| `getUnresolvedStripeEventsForOrg` | `$queryRaw` | [packages/database/src/queries/billing.ts:368](../../packages/database/src/queries/billing.ts#L368) |
| `getFailedStripeEventsForOperators` | `$queryRaw` | [packages/database/src/queries/billing.ts:386](../../packages/database/src/queries/billing.ts#L386) |
| `hasUnresolvedStripeEventForOrg` | `$queryRaw` | [packages/database/src/queries/billing.ts:406](../../packages/database/src/queries/billing.ts#L406) |
| `checkPayrollEntityEntitlement` | `$queryRaw` | [packages/database/src/queries/payroll-entitlements.ts:22](../../packages/database/src/queries/payroll-entitlements.ts#L22) |
| `claimXeroTenant` | `$queryRaw` | [packages/database/src/queries/xero-ownership.ts:32](../../packages/database/src/queries/xero-ownership.ts#L32) |
| `ensureXeroInitialSyncRequested` | `$queryRaw` | [packages/database/src/queries/xero-sync-cursors.ts:72](../../packages/database/src/queries/xero-sync-cursors.ts#L72) |
| `assertRestrictedDatabaseRole` | `$queryRaw` | [packages/database/src/runtime-role.ts:8](../../packages/database/src/runtime-role.ts#L8) |
| `syncPlansFromCatalogue` | `$queryRaw` | [packages/database/src/seed/plan-sync.ts:23](../../packages/database/src/seed/plan-sync.ts#L23) |
| `syncPlansFromCatalogue` | `$executeRaw` | [packages/database/src/seed/plan-sync.ts:40](../../packages/database/src/seed/plan-sync.ts#L40) |
| `withTenantDb` | `$queryRaw` | [packages/database/src/tenant-db.ts:111](../../packages/database/src/tenant-db.ts#L111) |
| `lockXeroAuthorisation` | `$queryRaw` | [packages/database/src/xero-locks.ts:11](../../packages/database/src/xero-locks.ts#L11) |
| `withXeroGrantLock` | `$executeRaw` | [packages/database/src/xero-locks.ts:31](../../packages/database/src/xero-locks.ts#L31) |
| `withXeroGrantLock` | `$queryRaw` | [packages/database/src/xero-locks.ts:34](../../packages/database/src/xero-locks.ts#L34) |
| `withXeroGrantLock` | `$queryRaw` | [packages/database/src/xero-locks.ts:36](../../packages/database/src/xero-locks.ts#L36) |
| `lockActiveScopedXeroConnection` | `$queryRaw` | [packages/database/src/xero-locks.ts:51](../../packages/database/src/xero-locks.ts#L51) |
| `lockScopedXeroConnection` | `$queryRaw` | [packages/database/src/xero-locks.ts:75](../../packages/database/src/xero-locks.ts#L75) |


Key Clerk-coupled SQL semantics: `withTenantDb` sets transaction-local account context; Xero lock/cursor SELECT FOR UPDATE statements filter both `clerk_org_id` and `organisation_id`; `checkPayrollEntityEntitlement` and `lockPlanLimitMutations` incorporate the account ID into advisory-lock keys; activation dashboard CTEs filter each source by account and selected owned company; billing SQL selects/upserts `clerk_org_subscriptions`, uses `ON CONFLICT (clerk_org_id)`, filters usage counters and routes Stripe events back to account IDs. Stripe/global discovery intentionally uses `systemDatabase`; tenant methods assert `TenantDb` ownership.

Provider-neutral SQL in this list: runtime-role catalogue inspection, Xero authorisation/tenant advisory locks, lock timeout, plan catalogue SELECTs and plan seed synchronization. [packages/database/src/runtime-role.ts:8](../../packages/database/src/runtime-role.ts#L8); [packages/database/src/xero-locks.ts:11](../../packages/database/src/xero-locks.ts#L11); [packages/database/src/seed/plan-sync.ts:23](../../packages/database/src/seed/plan-sync.ts#L23).

[packages/database/scripts/provision-local-app-role.ts:22](../../packages/database/scripts/provision-local-app-role.ts#L22) runs role-provisioning SQL with `$executeRawUnsafe`, not Clerk row SQL. This is a disposable local/CI helper. It does not migrate Clerk data. [packages/database/scripts/provision-local-app-role.ts:22](../../packages/database/scripts/provision-local-app-role.ts#L22).

### Runtime, fixture and test source matrix

This exhaustive file matrix uses literal `clerk_`, `clerkOrg`, `ClerkOrg` and `app.clerk` matches in database sources. Counts are matching source lines; generated code, schema and migrations have their own sections. Tests and fixture builders are reference dependencies, not separate production integration points.

| Area | File | Matching lines / references |
| --- | --- | --- |
| Documentation | `packages/database/QUERIES.md` | 36; [packages/database/QUERIES.md:8](../../packages/database/QUERIES.md#L8); lines 8, 21, 24, 27, 38, 45, 51, 65, 78, 86, 92, 106, 112, 126, 132, 138, 153, 160, 165, 178, 181, 184, 187, 207, 211, 236, 254, 261, 276, 288, 292, 305, 309, 312, 323, 331 |
| Tests | `packages/database/authoritative-usage.integration.test.ts` | 20; [packages/database/authoritative-usage.integration.test.ts:15](../../packages/database/authoritative-usage.integration.test.ts#L15); lines 15, 24, 32, 79-80, 84-85, 89-90, 94-95, 99-100, 112, 130, 145, 157, 159-160, 162 |
| Tests | `packages/database/availability_records.integration.test.ts` | 26; [packages/database/availability_records.integration.test.ts:26](../../packages/database/availability_records.integration.test.ts#L26); lines 26, 33, 39, 42, 59, 62, 67, 75, 84-85, 115, 132, 192, 229, 260, 278, 286, 336, 343, 364, 408, 423, 451, 458, 465, 505 |
| Tests | `packages/database/billing.integration.test.ts` | 45; [packages/database/billing.integration.test.ts:23](../../packages/database/billing.integration.test.ts#L23); lines 23-25, 47-48, 90, 103, 117-118, 122, 133-134, 143, 156, 170-171, 175, 190, 203, 219, 232, 246-247, 250, 262, 275, 289-290, 302, 315, 329-330, 341, 354, 368-369, 413, 426, 442, 455, 470, 478, 488, 509, 520 |
| Tests | `packages/database/leave_balances.integration.test.ts` | 23; [packages/database/leave_balances.integration.test.ts:2](../../packages/database/leave_balances.integration.test.ts#L2); lines 2, 23, 30, 35, 38, 44, 53, 63-64, 89, 99, 157, 203, 208, 210, 213, 216, 249, 260, 265, 267, 270, 273 |
| Tests | `packages/database/live-rollback.integration.test.ts` | 22; [packages/database/live-rollback.integration.test.ts:3](../../packages/database/live-rollback.integration.test.ts#L3); lines 3, 16, 27-28, 39, 45, 55, 61, 71, 80, 93, 101, 111, 119, 128, 144, 150, 161, 170, 179, 197, 205 |
| Tests | `packages/database/multi-company-migration.integration.test.ts` | 7; [packages/database/multi-company-migration.integration.test.ts:30](../../packages/database/multi-company-migration.integration.test.ts#L30); lines 30, 34, 42, 50, 59, 67, 79 |
| Tests | `packages/database/onboarding.integration.test.ts` | 47; [packages/database/onboarding.integration.test.ts:1](../../packages/database/onboarding.integration.test.ts#L1); lines 1, 22, 26, 29, 32, 40, 43, 51-52, 77-78, 88, 90, 99, 101, 110, 112, 119-120, 123-124, 133-134, 137, 139, 142-143, 146, 148, 154, 156, 163-164, 167, 169, 176-177, 185, 187, 198, 200, 208, 210, 219, 221, 230, 233 |
| Tests | `packages/database/payroll-entitlements.integration.test.ts` | 7; [packages/database/payroll-entitlements.integration.test.ts:28](../../packages/database/payroll-entitlements.integration.test.ts#L28); lines 28-29, 35, 52, 66-67, 70 |
| Tests | `packages/database/public-holiday-preferences-migration.integration.test.ts` | 8; [packages/database/public-holiday-preferences-migration.integration.test.ts:47](../../packages/database/public-holiday-preferences-migration.integration.test.ts#L47); lines 47, 52, 58, 63, 127, 243, 249, 256 |
| Tests | `packages/database/row-level-security.integration.test.ts` | 32; [packages/database/row-level-security.integration.test.ts:25](../../packages/database/row-level-security.integration.test.ts#L25); lines 25, 27, 36, 39, 63, 79, 126, 133, 145, 181, 197, 226, 269, 274, 279, 283, 285, 290, 312-313, 319, 327-328, 330, 333, 343, 356, 359, 362, 371, 382, 411 |
| Seed/scripts | `packages/database/seed.ts` | 2; [packages/database/seed.ts:41](../../packages/database/seed.ts#L41); lines 41, 45 |
| Tests | `packages/database/src/boundary.test.ts` | 1; [packages/database/src/boundary.test.ts:108](../../packages/database/src/boundary.test.ts#L108) |
| Tests | `packages/database/src/live-test-fixture.test.ts` | 7; [packages/database/src/live-test-fixture.test.ts:23](../../packages/database/src/live-test-fixture.test.ts#L23); lines 23, 49, 94, 144, 173, 240, 289 |
| Fixtures | `packages/database/src/live-test-fixture.ts` | 8; [packages/database/src/live-test-fixture.ts:91](../../packages/database/src/live-test-fixture.ts#L91); lines 91, 133, 162, 231-232, 241, 257, 263 |
| Tests | `packages/database/src/organisation-settings/repository.test.ts` | 8; [packages/database/src/organisation-settings/repository.test.ts:1](../../packages/database/src/organisation-settings/repository.test.ts#L1); lines 1, 11-12, 40-41, 46, 89, 143 |
| Runtime/source | `packages/database/src/organisation-settings/repository.ts` | 12; [packages/database/src/organisation-settings/repository.ts:1](../../packages/database/src/organisation-settings/repository.ts#L1); lines 1, 6, 33, 50, 56, 61, 71, 78, 85, 92, 99, 104 |
| Tests | `packages/database/src/queries/account-companies.test.ts` | 1; [packages/database/src/queries/account-companies.test.ts:30](../../packages/database/src/queries/account-companies.test.ts#L30) |
| Runtime/source | `packages/database/src/queries/account-companies.ts` | 3; [packages/database/src/queries/account-companies.ts:4](../../packages/database/src/queries/account-companies.ts#L4); lines 4, 7, 14 |
| Tests | `packages/database/src/queries/account-settings.test.ts` | 4; [packages/database/src/queries/account-settings.test.ts:23](../../packages/database/src/queries/account-settings.test.ts#L23); lines 23, 52, 62, 78 |
| Runtime/source | `packages/database/src/queries/account-settings.ts` | 11; [packages/database/src/queries/account-settings.ts:5](../../packages/database/src/queries/account-settings.ts#L5); lines 5, 12-13, 16, 22, 27, 32, 36-37, 40, 44 |
| Tests | `packages/database/src/queries/activation-dashboard.test.ts` | 2; [packages/database/src/queries/activation-dashboard.test.ts:51](../../packages/database/src/queries/activation-dashboard.test.ts#L51); lines 51, 57 |
| Runtime/source | `packages/database/src/queries/activation-dashboard.ts` | 10; [packages/database/src/queries/activation-dashboard.ts:33](../../packages/database/src/queries/activation-dashboard.ts#L33); lines 33, 39, 44-50, 60 |
| Tests | `packages/database/src/queries/availability-records.test.ts` | 5; [packages/database/src/queries/availability-records.test.ts:1](../../packages/database/src/queries/availability-records.test.ts#L1); lines 1, 29, 44, 47, 62 |
| Runtime/source | `packages/database/src/queries/availability-records.ts` | 26; [packages/database/src/queries/availability-records.ts:3](../../packages/database/src/queries/availability-records.ts#L3); lines 3, 15, 57, 64, 69, 98, 135, 142, 150, 168, 196, 207, 212, 227, 265, 284, 304, 317, 322, 346, 376, 412, 418, 427, 449, 467 |
| Tests | `packages/database/src/queries/billing.test.ts` | 12; [packages/database/src/queries/billing.test.ts:44](../../packages/database/src/queries/billing.test.ts#L44); lines 44, 86, 99, 112, 124, 186, 200, 208, 223, 237, 262, 278 |
| Runtime/source | `packages/database/src/queries/billing.ts` | 53; [packages/database/src/queries/billing.ts:18](../../packages/database/src/queries/billing.ts#L18); lines 18, 29, 39, 42, 46, 48-49, 58, 60, 70, 72, 80-81, 84, 94, 124, 128, 137, 147, 151, 159, 167, 176, 183, 200, 203, 212, 220, 223-224, 228, 232, 242, 244-245, 266, 269, 273, 277, 283, 311, 324, 329, 334, 349, 355, 360, 366, 377, 388, 394, 403, 413 |
| Tests | `packages/database/src/queries/feeds.test.ts` | 9; [packages/database/src/queries/feeds.test.ts:1](../../packages/database/src/queries/feeds.test.ts#L1); lines 1, 29, 38, 42-43, 50, 61-62, 69 |
| Runtime/source | `packages/database/src/queries/feeds.ts` | 15; [packages/database/src/queries/feeds.ts:1](../../packages/database/src/queries/feeds.ts#L1); lines 1, 8, 48, 53, 60, 82, 92, 117, 123, 129, 158, 176, 214, 222, 240 |
| Runtime/source | `packages/database/src/queries/leave-balances.ts` | 10; [packages/database/src/queries/leave-balances.ts:1](../../packages/database/src/queries/leave-balances.ts#L1); lines 1, 7, 29, 35, 43, 54, 62, 85, 95, 120 |
| Runtime/source | `packages/database/src/queries/notifications.ts` | 27; [packages/database/src/queries/notifications.ts:1](../../packages/database/src/queries/notifications.ts#L1); lines 1, 9, 21, 38, 45, 54, 65, 79, 103, 109, 115, 135, 142, 149, 170, 176, 183, 203, 209, 216, 227, 236, 260, 271, 277, 285, 311 |
| Runtime/source | `packages/database/src/queries/onboarding.ts` | 24; [packages/database/src/queries/onboarding.ts:26](../../packages/database/src/queries/onboarding.ts#L26); lines 26, 28, 43, 48, 58, 83, 90, 97, 112, 118, 124, 137, 142, 152, 157, 178, 184, 192-193, 213, 220, 228-229, 239 |
| Runtime/source | `packages/database/src/queries/organisations.ts` | 17; [packages/database/src/queries/organisations.ts:1](../../packages/database/src/queries/organisations.ts#L1); lines 1, 5-6, 12, 26, 33, 45, 50, 78, 84, 97, 103, 117, 130, 158, 163, 169 |
| Tests | `packages/database/src/queries/outbound-operations.test.ts` | 4; [packages/database/src/queries/outbound-operations.test.ts:58](../../packages/database/src/queries/outbound-operations.test.ts#L58); lines 58, 128, 350, 367 |
| Runtime/source | `packages/database/src/queries/outbound-operations.ts` | 15; [packages/database/src/queries/outbound-operations.ts:12](../../packages/database/src/queries/outbound-operations.ts#L12); lines 12, 55, 71, 95, 211, 280, 329, 350, 372, 397, 418, 439, 465, 486, 507 |
| Tests | `packages/database/src/queries/payroll-entitlements.test.ts` | 1; [packages/database/src/queries/payroll-entitlements.test.ts:19](../../packages/database/src/queries/payroll-entitlements.test.ts#L19) |
| Runtime/source | `packages/database/src/queries/payroll-entitlements.ts` | 8; [packages/database/src/queries/payroll-entitlements.ts:8](../../packages/database/src/queries/payroll-entitlements.ts#L8); lines 8-9, 18, 22-24, 29, 53 |
| Tests | `packages/database/src/queries/people.test.ts` | 6; [packages/database/src/queries/people.test.ts:1](../../packages/database/src/queries/people.test.ts#L1); lines 1, 27, 35, 39, 41, 48 |
| Runtime/source | `packages/database/src/queries/people.ts` | 12; [packages/database/src/queries/people.ts:1](../../packages/database/src/queries/people.ts#L1); lines 1, 7, 30, 36, 43, 59, 85, 98, 104, 132, 166, 181 |
| Tests | `packages/database/src/queries/public-holiday-resolution.test.ts` | 8; [packages/database/src/queries/public-holiday-resolution.test.ts:1](../../packages/database/src/queries/public-holiday-resolution.test.ts#L1); lines 1, 15, 62, 64, 71, 80, 112, 114 |
| Runtime/source | `packages/database/src/queries/public-holiday-resolution.ts` | 5; [packages/database/src/queries/public-holiday-resolution.ts:2](../../packages/database/src/queries/public-holiday-resolution.ts#L2); lines 2, 18, 28, 31, 36 |
| Tests | `packages/database/src/queries/schedulable-xero-connections.test.ts` | 1; [packages/database/src/queries/schedulable-xero-connections.test.ts:33](../../packages/database/src/queries/schedulable-xero-connections.test.ts#L33) |
| Runtime/source | `packages/database/src/queries/schedulable-xero-connections.ts` | 3; [packages/database/src/queries/schedulable-xero-connections.ts:5](../../packages/database/src/queries/schedulable-xero-connections.ts#L5); lines 5, 38, 72 |
| Tests | `packages/database/src/queries/support-submissions.test.ts` | 14; [packages/database/src/queries/support-submissions.test.ts:6](../../packages/database/src/queries/support-submissions.test.ts#L6); lines 6, 11-12, 36-37, 50, 67, 70, 82, 91, 101, 121, 135, 138 |
| Runtime/source | `packages/database/src/queries/support-submissions.ts` | 7; [packages/database/src/queries/support-submissions.ts:3](../../packages/database/src/queries/support-submissions.ts#L3); lines 3, 25, 38, 44, 53, 61, 81 |
| Runtime/source | `packages/database/src/queries/sync-runs.ts` | 16; [packages/database/src/queries/sync-runs.ts:1](../../packages/database/src/queries/sync-runs.ts#L1); lines 1, 28, 38, 43, 59, 95, 101, 118, 147, 153, 168, 197, 203, 212, 222, 231 |
| Tests | `packages/database/src/queries/teams.test.ts` | 7; [packages/database/src/queries/teams.test.ts:41](../../packages/database/src/queries/teams.test.ts#L41); lines 41, 121, 126, 179, 229, 254, 261 |
| Runtime/source | `packages/database/src/queries/teams.ts` | 4; [packages/database/src/queries/teams.ts:17](../../packages/database/src/queries/teams.ts#L17); lines 17, 49, 89, 147 |
| Tests | `packages/database/src/queries/tenant-query-scope.test.ts` | 7; [packages/database/src/queries/tenant-query-scope.test.ts:3](../../packages/database/src/queries/tenant-query-scope.test.ts#L3); lines 3, 73, 120, 125, 140, 553, 569 |
| Tests | `packages/database/src/queries/xero-connection-state.test.ts` | 2; [packages/database/src/queries/xero-connection-state.test.ts:29](../../packages/database/src/queries/xero-connection-state.test.ts#L29); lines 29, 62 |
| Runtime/source | `packages/database/src/queries/xero-connection-state.ts` | 3; [packages/database/src/queries/xero-connection-state.ts:10](../../packages/database/src/queries/xero-connection-state.ts#L10); lines 10, 21, 26 |
| Tests | `packages/database/src/queries/xero-connections.test.ts` | 5; [packages/database/src/queries/xero-connections.test.ts:35](../../packages/database/src/queries/xero-connections.test.ts#L35); lines 35, 42, 51, 74, 95 |
| Runtime/source | `packages/database/src/queries/xero-connections.ts` | 6; [packages/database/src/queries/xero-connections.ts:8](../../packages/database/src/queries/xero-connections.ts#L8); lines 8, 13, 36, 77, 112, 126 |
| Tests | `packages/database/src/queries/xero-ownership.test.ts` | 1; [packages/database/src/queries/xero-ownership.test.ts:15](../../packages/database/src/queries/xero-ownership.test.ts#L15) |
| Runtime/source | `packages/database/src/queries/xero-ownership.ts` | 9; [packages/database/src/queries/xero-ownership.ts:10](../../packages/database/src/queries/xero-ownership.ts#L10); lines 10-11, 16, 29, 34, 37, 42, 47, 60 |
| Runtime/source | `packages/database/src/queries/xero-sync-cursors.ts` | 4; [packages/database/src/queries/xero-sync-cursors.ts:19](../../packages/database/src/queries/xero-sync-cursors.ts#L19); lines 19, 69, 72, 113 |
| Seed/scripts | `packages/database/src/seed/data.ts` | 2; [packages/database/src/seed/data.ts:10](../../packages/database/src/seed/data.ts#L10); lines 10-11 |
| Tests | `packages/database/src/seed/seed.integration.test.ts` | 5; [packages/database/src/seed/seed.integration.test.ts:13](../../packages/database/src/seed/seed.integration.test.ts#L13); lines 13, 68, 85, 91, 99 |
| Seed/scripts | `packages/database/src/seed/seed.ts` | 14; [packages/database/src/seed/seed.ts:10](../../packages/database/src/seed/seed.ts#L10); lines 10, 25, 32, 37, 46, 58, 64, 75, 84, 98, 116, 148, 158, 165 |
| Tests | `packages/database/src/tenant-db.test.ts` | 1; [packages/database/src/tenant-db.test.ts:81](../../packages/database/src/tenant-db.test.ts#L81) |
| Runtime/source | `packages/database/src/tenant-db.ts` | 11; [packages/database/src/tenant-db.ts:48](../../packages/database/src/tenant-db.ts#L48); lines 48-49, 90, 94, 105, 111, 113, 133, 141, 161, 175 |
| Runtime/source | `packages/database/src/tenant-guard.ts` | 2; [packages/database/src/tenant-guard.ts:12](../../packages/database/src/tenant-guard.ts#L12); lines 12, 19 |
| Tests | `packages/database/src/tenant-query.test.ts` | 6; [packages/database/src/tenant-query.test.ts:12](../../packages/database/src/tenant-query.test.ts#L12); lines 12, 23, 33, 37, 44, 48 |
| Runtime/source | `packages/database/src/tenant-query.ts` | 9; [packages/database/src/tenant-query.ts:1](../../packages/database/src/tenant-query.ts#L1); lines 1, 5, 8, 11, 14, 25, 29, 37, 40 |
| Fixtures | `packages/database/src/test-fixtures/slice-14-fixture.ts` | 9; [packages/database/src/test-fixtures/slice-14-fixture.ts:12](../../packages/database/src/test-fixtures/slice-14-fixture.ts#L12); lines 12, 19, 32, 44, 111, 117, 143, 221, 251 |
| Fixtures | `packages/database/src/test-fixtures/tenant-scope.ts` | 1; [packages/database/src/test-fixtures/tenant-scope.ts:7](../../packages/database/src/test-fixtures/tenant-scope.ts#L7) |
| Fixtures | `packages/database/src/test-fixtures/xero-simplification-fixture.ts` | 4; [packages/database/src/test-fixtures/xero-simplification-fixture.ts:18](../../packages/database/src/test-fixtures/xero-simplification-fixture.ts#L18); lines 18, 20, 49, 57 |
| Runtime/source | `packages/database/src/xero-locks.ts` | 3; [packages/database/src/xero-locks.ts:50](../../packages/database/src/xero-locks.ts#L50); lines 50-51, 77 |
| Tests | `packages/database/teams.integration.test.ts` | 10; [packages/database/teams.integration.test.ts:18](../../packages/database/teams.integration.test.ts#L18); lines 18, 23, 28, 30, 35, 45, 48, 54, 73, 105 |
| Tests | `packages/database/tenant-statement-counts.integration.test.ts` | 15; [packages/database/tenant-statement-counts.integration.test.ts:26](../../packages/database/tenant-statement-counts.integration.test.ts#L26); lines 26, 63, 84, 86, 89, 95, 106, 117, 129, 131-133, 137-139 |
| Tests | `packages/database/xero-ownership.integration.test.ts` | 19; [packages/database/xero-ownership.integration.test.ts:26](../../packages/database/xero-ownership.integration.test.ts#L26); lines 26-28, 31, 33, 37, 40, 45, 50, 56, 120-122, 139-140, 151, 154, 194, 203 |
| Tests | `packages/database/xero-provider-fence.integration.test.ts` | 1; [packages/database/xero-provider-fence.integration.test.ts:39](../../packages/database/xero-provider-fence.integration.test.ts#L39) |
| Tests | `packages/database/xero-simplification-schema.integration.test.ts` | 4; [packages/database/xero-simplification-schema.integration.test.ts:93](../../packages/database/xero-simplification-schema.integration.test.ts#L93); lines 93, 96, 102, 104 |
| Tests | `packages/database/xero-sync-cursors.integration.test.ts` | 4; [packages/database/xero-sync-cursors.integration.test.ts:18](../../packages/database/xero-sync-cursors.integration.test.ts#L18); lines 18, 22, 34, 56 |
| Tests | `packages/database/xero-tenancy.integration.test.ts` | 22; [packages/database/xero-tenancy.integration.test.ts:182](../../packages/database/xero-tenancy.integration.test.ts#L182); lines 182, 195, 203, 218, 230, 232, 238, 253, 255, 285, 299, 310, 342, 354, 366, 376, 390, 402, 405, 413, 420, 426 |


### Complete literal migration match register

Every matched SQL line is retained below to cover schema creation, indexes, policies, backfills, joins, SQL functions, comments and changes to the Clerk-named subscription table. Entries on removed tables are historical. This register intentionally includes migration comments rather than treating comments as executable SQL.


#### [packages/database/prisma/migrations/00000000000000_init/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/00000000000000_init/migration.sql)


- L104: `"clerk_org_id" TEXT NOT NULL,`

- L124: `"clerk_org_id" TEXT NOT NULL,`

- L144: `"clerk_org_id" TEXT NOT NULL,`

- L156: `"clerk_org_id" TEXT NOT NULL,`

- L171: `"clerk_org_id" TEXT NOT NULL,`

- L186: `"clerk_user_id" TEXT,`

- L204: `"clerk_org_id" TEXT NOT NULL,`

- L222: `"clerk_org_id" TEXT NOT NULL,`

- L252: `"clerk_org_id" TEXT NOT NULL,`

- L278: `"clerk_org_id" TEXT NOT NULL,`

- L306: `"clerk_org_id" TEXT NOT NULL,`

- L320: `"clerk_org_id" TEXT NOT NULL,`

- L364: `"clerk_org_id" TEXT NOT NULL,`

- L383: `"clerk_org_id" TEXT NOT NULL,`

- L403: `"clerk_org_id" TEXT NOT NULL,`

- L411: `"resolved_clerk_user_id" TEXT,`

- L423: `"clerk_org_id" TEXT NOT NULL,`

- L441: `"clerk_org_id" TEXT NOT NULL,`

- L467: `"clerk_org_id" TEXT NOT NULL,`

- L487: `"clerk_org_id" TEXT NOT NULL,`

- L508: `"clerk_org_id" TEXT NOT NULL,`

- L521: `"clerk_org_id" TEXT NOT NULL,`

- L540: `"clerk_org_id" TEXT NOT NULL,`

- L563: `"clerk_org_id" TEXT NOT NULL,`

- L577: `"clerk_org_id" TEXT NOT NULL,`

- L603: `"clerk_org_id" TEXT NOT NULL,`

- L630: `"clerk_org_id" TEXT NOT NULL,`

- L649: `"clerk_org_id" TEXT NOT NULL,`

- L694: `CREATE TABLE "clerk_org_subscriptions" (`

- L696: `"clerk_org_id" TEXT NOT NULL,`

- L704: `CONSTRAINT "clerk_org_subscriptions_pkey" PRIMARY KEY ("id")`

- L710: `"clerk_org_id" TEXT NOT NULL,`

- L722: `CREATE INDEX "organisations_clerk_org_id_idx" ON "organisations"("clerk_org_id");`

- L728: `CREATE INDEX "organisation_settings_clerk_org_id_idx" ON "organisation_settings"("clerk_org_id");`

- L731: `CREATE INDEX "teams_clerk_org_id_idx" ON "teams"("clerk_org_id");`

- L737: `CREATE INDEX "locations_clerk_org_id_idx" ON "locations"("clerk_org_id");`

- L743: `CREATE INDEX "people_clerk_org_id_idx" ON "people"("clerk_org_id");`

- L764: `CREATE UNIQUE INDEX "people_organisation_id_clerk_user_id_key" ON "people"("organisation_id", "clerk_user_id");`

- L770: `CREATE INDEX "alternative_contacts_clerk_org_id_idx" ON "alternative_contacts"("clerk_org_id");`

- L785: `CREATE INDEX "xero_connections_clerk_org_id_idx" ON "xero_connections"("clerk_org_id");`

- L791: `CREATE INDEX "xero_tenants_clerk_org_id_idx" ON "xero_tenants"("clerk_org_id");`

- L800: `CREATE INDEX "xero_oauth_sessions_clerk_org_id_idx" ON "xero_oauth_sessions"("clerk_org_id");`

- L809: `CREATE INDEX "xero_sync_cursors_clerk_org_id_idx" ON "xero_sync_cursors"("clerk_org_id");`

- L821: `CREATE INDEX "availability_records_clerk_org_id_idx" ON "availability_records"("clerk_org_id");`

- L848: `CREATE INDEX "availability_publications_clerk_org_id_idx" ON "availability_publications"("clerk_org_id");`

- L857: `CREATE INDEX "leave_balances_clerk_org_id_idx" ON "leave_balances"("clerk_org_id");`

- L872: `CREATE INDEX "xero_person_matches_clerk_org_id_idx" ON "xero_person_matches"("clerk_org_id");`

- L890: `CREATE INDEX "public_holiday_jurisdictions_clerk_org_id_idx" ON "public_holiday_jurisdictions"("clerk_org_id");`

- L899: `CREATE INDEX "public_holidays_clerk_org_id_idx" ON "public_holidays"("clerk_org_id");`

- L911: `CREATE INDEX "public_holiday_assignments_clerk_org_id_idx" ON "public_holiday_assignments"("clerk_org_id");`

- L926: `CREATE INDEX "feeds_clerk_org_id_idx" ON "feeds"("clerk_org_id");`

- L932: `CREATE UNIQUE INDEX "feeds_clerk_org_id_slug_key" ON "feeds"("clerk_org_id", "slug");`

- L935: `CREATE INDEX "feed_scopes_clerk_org_id_idx" ON "feed_scopes"("clerk_org_id");`

- L950: `CREATE INDEX "feed_tokens_clerk_org_id_idx" ON "feed_tokens"("clerk_org_id");`

- L962: `CREATE INDEX "notifications_clerk_org_id_idx" ON "notifications"("clerk_org_id");`

- L980: `CREATE INDEX "notification_preferences_clerk_org_id_idx" ON "notification_preferences"("clerk_org_id");`

- L992: `CREATE INDEX "notification_email_queue_clerk_org_id_idx" ON "notification_email_queue"("clerk_org_id");`

- L1007: `CREATE INDEX "sync_runs_clerk_org_id_idx" ON "sync_runs"("clerk_org_id");`

- L1016: `CREATE INDEX "sync_runs_clerk_org_id_organisation_id_xero_tenant_id_run_t_idx" ON "sync_runs"("clerk_org_id", "organisation_id", "xero_tenant_id", "run_type", "status", "started_at");`

- L1019: `CREATE INDEX "failed_records_clerk_org_id_idx" ON "failed_records"("clerk_org_id");`

- L1031: `CREATE INDEX "audit_events_clerk_org_id_idx" ON "audit_events"("clerk_org_id");`

- L1058: `CREATE UNIQUE INDEX "clerk_org_subscriptions_clerk_org_id_key" ON "clerk_org_subscriptions"("clerk_org_id");`

- L1061: `CREATE INDEX "clerk_org_subscriptions_clerk_org_id_idx" ON "clerk_org_subscriptions"("clerk_org_id");`

- L1064: `CREATE INDEX "usage_counters_clerk_org_id_idx" ON "usage_counters"("clerk_org_id");`

- L1067: `CREATE UNIQUE INDEX "usage_counters_clerk_org_id_metric_key_period_start_period__key" ON "usage_counters"("clerk_org_id", "metric_key", "period_start", "period_end");`

- L1214: `ALTER TABLE "clerk_org_subscriptions" ADD CONSTRAINT "clerk_org_subscriptions_plan_key_fkey" FOREIGN KEY ("plan_key") REFERENCES "plans"("key") ON DELETE RESTRICT ON UPDATE CASCADE;`


#### [packages/database/prisma/migrations/20260627000000_stripe_billing/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20260627000000_stripe_billing/migration.sql)


- L11: `ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT;`

- L12: `ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" TEXT;`

- L13: `ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;`

- L14: `ALTER TABLE "clerk_org_subscriptions" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMP(3);`

- L18: `CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_clerk_org_id_counter_type_key" ON "usage_counters"("clerk_org_id", "counter_type");`


#### [packages/database/prisma/migrations/20260714210000_add_stripe_event_created_at/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20260714210000_add_stripe_event_created_at/migration.sql)


- L2: `ALTER TABLE "clerk_org_subscriptions" ADD COLUMN "stripe_event_created_at" TIMESTAMP(3);`


#### [packages/database/prisma/migrations/20260919090000_add_outbound_operations/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20260919090000_add_outbound_operations/migration.sql)


- L10: `"clerk_org_id" TEXT NOT NULL,`

- L31: `CREATE INDEX "outbound_operations_clerk_org_id_idx" ON "outbound_operations"("clerk_org_id");`


#### [packages/database/prisma/migrations/20260919100000_add_stripe_event_delivery_state/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20260919100000_add_stripe_event_delivery_state/migration.sql)


- L6: `ADD COLUMN "clerk_org_id" TEXT,`

- L16: `CREATE INDEX "stripe_events_clerk_org_id_delivery_state_event_created_at_idx" ON "stripe_events"("clerk_org_id", "delivery_state", "event_created_at");`


#### [packages/database/prisma/migrations/20260926060000_add_xero_cleanup_requests/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20260926060000_add_xero_cleanup_requests/migration.sql)


- L10: `"clerk_org_id" TEXT NOT NULL,`

- L26: `"clerk_org_id" TEXT NOT NULL,`

- L48: `CREATE INDEX "xero_cleanup_requests_clerk_org_id_idx" ON "xero_cleanup_requests"("clerk_org_id");`

- L60: `CREATE INDEX "xero_cleanup_attempts_clerk_org_id_idx" ON "xero_cleanup_attempts"("clerk_org_id");`


#### [packages/database/prisma/migrations/20260926130000_add_xero_inactivity_classifications/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20260926130000_add_xero_inactivity_classifications/migration.sql)


- L10: `"clerk_org_id" TEXT NOT NULL,`

- L25: `CREATE INDEX "xero_inactivity_classifications_clerk_org_id_idx" ON "xero_inactivity_classifications"("clerk_org_id");`


#### [packages/database/prisma/migrations/20260927151200_feed_event_publications/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20260927151200_feed_event_publications/migration.sql)


- L8: `"clerk_org_id" TEXT NOT NULL,`

- L24: `CREATE INDEX "feed_event_publications_clerk_org_id_idx" ON "feed_event_publications"("clerk_org_id");`


#### [packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20261007122236_simplify_xero_lifecycle/migration.sql)


- L44: `- A unique constraint covering the columns `[id,clerk_org_id]` on the table `organisations` will be added. If there are existing duplicate values, this will fail.`

- L47: `- A unique constraint covering the columns `[id,clerk_org_id,organisation_id]` on the table `xero_connections` will be added. If there are existing duplicate values, this will fail.`

- L48: `- A unique constraint covering the columns `[organisation_id,clerk_org_id]` on the table `xero_connections` will be added. If there are existing duplicate values, this will fail.`

- L143: `DROP INDEX "sync_runs_clerk_org_id_organisation_id_xero_tenant_id_run_t_idx";`

- L310: `CREATE UNIQUE INDEX "organisations_id_clerk_org_id_key" ON "organisations"("id", "clerk_org_id");`

- L313: `CREATE INDEX "sync_runs_clerk_org_id_organisation_id_xero_connection_id_r_idx" ON "sync_runs"("clerk_org_id", "organisation_id", "xero_connection_id", "run_type", "status", "started_at");`

- L322: `CREATE UNIQUE INDEX "xero_connections_id_clerk_org_id_organisation_id_key" ON "xero_connections"("id", "clerk_org_id", "organisation_id");`

- L325: `CREATE UNIQUE INDEX "xero_connections_organisation_id_clerk_org_id_key" ON "xero_connections"("organisation_id", "clerk_org_id");`

- L337: `ALTER TABLE "xero_connections" ADD CONSTRAINT "xero_connections_organisation_id_clerk_org_id_fkey" FOREIGN KEY ("organisation_id", "clerk_org_id") REFERENCES "organisations"("id", "clerk_org_id") ON DELETE RESTRICT ON UPDATE CASCADE;`

- L343: `ALTER TABLE "xero_oauth_sessions" ADD CONSTRAINT "xero_oauth_sessions_organisation_id_clerk_org_id_fkey" FOREIGN KEY ("organisation_id", "clerk_org_id") REFERENCES "organisations"("id", "clerk_org_id") ON DELETE RESTRICT ON UPDATE CASCADE;`

- L349: `ALTER TABLE "xero_sync_cursors" ADD CONSTRAINT "xero_sync_cursors_xero_connection_id_clerk_org_id_organisa_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;`

- L352: `ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_xero_connection_id_clerk_org_id_organisatio_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;`

- L355: `ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_xero_connection_id_clerk_org_id_organisation_id_fkey" FOREIGN KEY ("xero_connection_id", "clerk_org_id", "organisation_id") REFERENCES "xero_connections"("id", "clerk_org_id", "organisation_id") ON DELETE RESTRICT ON UPDATE CASCADE;`


#### [packages/database/prisma/migrations/20261009025847_public_holiday_preferences/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20261009025847_public_holiday_preferences/migration.sql)


- L7: `"clerk_org_id" TEXT NOT NULL,`

- L21: `CREATE INDEX "public_holiday_preferences_clerk_org_id_idx" ON "public_holiday_preferences"("clerk_org_id");`


#### [packages/database/prisma/migrations/20261009025909_replace_imported_public_holidays/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20261009025909_replace_imported_public_holidays/migration.sql)


- L17: `("id", "clerk_org_id", "organisation_id", "holiday_key", "location_id", "setting",`

- L19: `SELECT gen_random_uuid(), h."clerk_org_id", h."organisation_id", 'custom:' \|\| h."id",`

- L26: `AND l."clerk_org_id" = h."clerk_org_id"`

- L34: `("id", "clerk_org_id", "organisation_id", "holiday_key", "location_id", "setting",`

- L36: `SELECT gen_random_uuid(), h."clerk_org_id", h."organisation_id", 'custom:' \|\| h."id",`


#### [packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20261010000000_row_level_security/migration.sql)


- L25: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L26: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));`

- L31: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L32: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = organisation_settings.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L37: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L38: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = teams.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L43: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L44: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = locations.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L49: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L50: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = people.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L55: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L56: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = alternative_contacts.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L61: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L62: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_connections.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L67: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L68: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_oauth_sessions.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L73: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L74: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_sync_cursors.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L79: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L80: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = availability_records.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L85: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L86: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = outbound_operations.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L91: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L92: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = availability_publications.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L97: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L98: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = leave_balances.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L103: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L104: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = xero_person_matches.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L109: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L110: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = public_holidays.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L115: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L116: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = public_holiday_preferences.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L121: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L122: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feeds.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L127: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L128: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_event_publications.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L133: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L134: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_scopes.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L139: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L140: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = feed_tokens.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L145: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L146: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notifications.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L151: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L152: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notification_preferences.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L157: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L158: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = notification_email_queue.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L163: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L164: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = sync_runs.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L169: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L170: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = failed_records.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L175: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L176: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true) AND (organisation_id IS NULL OR EXISTS (SELECT 1 FROM organisations o WHERE o.id = audit_events.organisation_id AND o.clerk_org_id = current_setting('app.clerk_org_id', true))));`

- L179: `ALTER TABLE clerk_org_subscriptions ENABLE ROW LEVEL SECURITY;`

- L180: `CREATE POLICY tenant_isolation ON clerk_org_subscriptions TO team_calendar_app`

- L181: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L182: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));`

- L183: `GRANT SELECT, INSERT, UPDATE, DELETE ON clerk_org_subscriptions TO team_calendar_app;`

- L187: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L188: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));`


#### [packages/database/prisma/migrations/20261010010000_xero_multi_company/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20261010010000_xero_multi_company/migration.sql)


- L46: `WHERE a.clerk_org_id = f.clerk_org_id`

- L53: `FROM feeds f WHERE t.feed_id = f.id AND t.clerk_org_id = f.clerk_org_id AND f.organisation_id IS NULL;`

- L55: `FROM feeds f WHERE s.feed_id = f.id AND s.clerk_org_id = f.clerk_org_id AND f.organisation_id IS NULL;`

- L57: `FROM feeds f WHERE p.feed_id = f.id AND p.clerk_org_id = f.clerk_org_id AND f.organisation_id IS NULL;`


#### [packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20261014000000_account_manager_visibility/migration.sql)


- L4: `"clerk_org_id" TEXT NOT NULL,`

- L13: `CREATE UNIQUE INDEX "account_settings_clerk_org_id_key" ON "account_settings"("clerk_org_id");`

- L16: `CREATE INDEX "account_settings_clerk_org_id_idx" ON "account_settings"("clerk_org_id");`

- L22: `INSERT INTO "account_settings" ("id", "clerk_org_id", "manager_visibility_scope", "created_at", "updated_at")`

- L23: `SELECT gen_random_uuid(), "clerk_org_id",`

- L28: `GROUP BY "clerk_org_id"`

- L29: `ON CONFLICT ("clerk_org_id") DO NOTHING;`

- L33: `USING (clerk_org_id = current_setting('app.clerk_org_id', true))`

- L34: `WITH CHECK (clerk_org_id = current_setting('app.clerk_org_id', true));`


#### [packages/database/prisma/migrations/20261014010000_manager_account_isolation/migration.sql](/home/hilton/Documents/teamcalendar/packages/database/prisma/migrations/20261014010000_manager_account_isolation/migration.sql)


- L9: `SELECT account_id = current_setting('app.clerk_org_id', true)`

- L12: `WHERE p.id = manager_id AND p.clerk_org_id = account_id`

- L13: `AND EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = p.organisation_id AND o.clerk_org_id = account_id)`

- L21: `clerk_org_id = current_setting('app.clerk_org_id', true)`

- L25: `AND o.clerk_org_id = current_setting('app.clerk_org_id', true)`

- L29: `OR public.tc_manager_belongs_to_account(manager_person_id, clerk_org_id)`


## 5. Environment variables, keys and dependencies

### Clerk environment variables, build and release configuration

Repository-only inventory on 25 October 2026. `AGENTS.md` and `CLAUDE.md` were read. No repository modifications, environment-secret reads, remote service queries, application execution or release checks were performed. File references are relative to `/home/hilton/Documents/teamcalendar`; line numbers describe the current tracked working files.

[packages/auth/keys.ts:4-41](../../packages/auth/keys.ts#L4) defines seven Clerk environment variables. All seven are optional in this schema. `emptyStringAsUndefined: true` at lines 22-24 treats blank values as unset. [apps/app/env.ts:2,18-20](../../apps/app/env.ts#L2) and [apps/api/env.ts:2,20-22](../../apps/api/env.ts#L2) extend the schema; [apps/web/env.ts:1-14](../../apps/web/env.ts#L1) extends only shared configuration and observability.

| Variable | Validation/source | Tracked template/configuration |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Optional `pk_` prefix, [packages/auth/keys.ts:15-18,32-33](../../packages/auth/keys.ts#L15) | Commented test placeholder in [apps/app/.env.example:22](../../apps/app/.env.example#L22), [apps/api/.env.example:21](../../apps/api/.env.example#L21); production app/API presence gate in [packages/next-config/preflight.ts:256](../../packages/next-config/preflight.ts#L256) |
| `CLERK_SECRET_KEY` | Optional `sk_` prefix, [packages/auth/keys.ts:26,38](../../packages/auth/keys.ts#L26) | Commented test placeholder in [apps/app/.env.example:23](../../apps/app/.env.example#L23), [apps/api/.env.example:22](../../apps/api/.env.example#L22); production app/API presence gate in [packages/next-config/preflight.ts:257](../../packages/next-config/preflight.ts#L257) |
| `CLERK_WEBHOOK_SECRET` | Optional `whsec_` prefix, [packages/auth/keys.ts:27,39](../../packages/auth/keys.ts#L27) | API-only example [apps/api/.env.example:23-24](../../apps/api/.env.example#L23); API production presence gate [packages/next-config/preflight.ts:271-272](../../packages/next-config/preflight.ts#L271); consumed by webhook handler [apps/api/app/webhooks/auth/route.ts:369,397](../../apps/api/app/webhooks/auth/route.ts#L369) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Optional string starting `/`, [packages/auth/keys.ts:19,34](../../packages/auth/keys.ts#L19) | `/sign-in` in [apps/app/.env.example:24](../../apps/app/.env.example#L24) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Optional string starting `/`, [packages/auth/keys.ts:20,35](../../packages/auth/keys.ts#L20) | `/sign-up` in [apps/app/.env.example:25](../../apps/app/.env.example#L25) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Optional string starting `/`, [packages/auth/keys.ts:7-10,28-29](../../packages/auth/keys.ts#L7) | `/` in [apps/app/.env.example:26](../../apps/app/.env.example#L26) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Optional string starting `/`, [packages/auth/keys.ts:11-14,30-31](../../packages/auth/keys.ts#L11) | `/` in [apps/app/.env.example:27](../../apps/app/.env.example#L27) |

Related tenant seed configuration: `SEED_CLERK_ORG_ID`, documented in [packages/database/.env.example:15-18](../../packages/database/.env.example#L15) and [README.md:145-151](../../README.md#L145); consumed in [packages/database/seed.ts:41](../../packages/database/seed.ts#L41) and [packages/database/src/seed/data.ts:62-63](../../packages/database/src/seed/data.ts#L62). It selects the real development Clerk organisation instead of the default placeholder. Constants named `CLERK_ORG_A`, `CLERK_ORG_B`, `CLERK_ORG_ID`, `CLERK_KEY_PREFIX` and `CLERK_KEY_TERMINATOR` are source/test constants, not additional environment settings.

[turbo.json:3](../../turbo.json#L3) includes `**/.env.*local` as global dependencies, line 5 uses `envMode: "loose"`, and line 44 explicitly passes only the database URLs. There is no Clerk-specific Turbo env allowlist or hashed `env` list. Loose mode permits ambient Clerk variables to reach tasks; this file does not separately declare them as cache-key inputs. The CI workflow has no Clerk settings ([.github/workflows/ci.yml:42-48](../../.github/workflows/ci.yml#L42) defines database URLs and a documented throwaway Xero key).

Production requirements are separate from the optional runtime schema: [packages/next-config/preflight.ts:156-164](../../packages/next-config/preflight.ts#L156) implements trimmed non-empty checks; lines 256-257 require publishable/secret keys for app/API and line 272 requires the API webhook secret. These checks establish presence, not Clerk instance identity, usable credentials, domain configuration or webhook registration. [packages/next-config/bin/preflight.ts:22-32](../../packages/next-config/bin/preflight.ts#L22) invokes preflight and the restricted-database-role check. Root [package.json:24](../../package.json#L24) exposes `bun run preflight`. The app/API/web build scripts themselves are only `next build` ([apps/app/package.json:6](../../apps/app/package.json#L6), [apps/api/package.json:6](../../apps/api/package.json#L6), [apps/web/package.json:6](../../apps/web/package.json#L6)); the three `vercel.json` files do not add a preflight build command.

Browser release tooling depends on actual Clerk authentication: [tooling/release/e2e/global.setup.ts:3,11-13,24-31](../../tooling/release/e2e/global.setup.ts#L3) calls `clerkSetup()`, signs in each role with `clerk.signIn`, and stores role sessions under `tooling/release/.auth`. [tooling/release/e2e/admission.spec.ts:2,11,23](../../tooling/release/e2e/admission.spec.ts#L2) installs Clerk testing tokens. [tooling/release/e2e/fixture.ts:50-58](../../tooling/release/e2e/fixture.ts#L50) reads the browser Clerk user and active membership. Role emails are `TC_E2E_OWNER_EMAIL`, `TC_E2E_ADMIN_EMAIL`, `TC_E2E_MANAGER_EMAIL` and `TC_E2E_VIEWER_EMAIL` ([tooling/release/e2e/environment.ts:47,108-112](../../tooling/release/e2e/environment.ts#L47)). [README.md:276-287](../../README.md#L276) requires Clerk development/test credentials and controlled fixtures. [tooling/release/e2e/environment.ts:11-18,70-91](../../tooling/release/e2e/environment.ts#L11) requires explicit HTTPS app/API/web candidates with distinct hosts and matching source/deployment/manifest SHAs; [tooling/release/playwright.config.ts:63-69](../../tooling/release/playwright.config.ts#L63) uses the candidate app URL and one worker. This audit did not run that suite.


### Clerk package and lockfile inventory

| Manifest | Dependency | Declared version | Locked resolution/evidence |
|---|---|---|---|
| [packages/auth/package.json:11](../../packages/auth/package.json#L11) | `@clerk/nextjs` | `^7.9.20` | `7.9.20`, [bun.lock:656](../../bun.lock#L656) |
| [packages/auth/package.json:12](../../packages/auth/package.json#L12) | `@clerk/themes` | `^2.4.57` | `2.4.57`, [bun.lock:664](../../bun.lock#L664) |
| [package.json:57](../../package.json#L57) (devDependency) | `@clerk/testing` | `^2.2.50` | `2.2.50`, [bun.lock:662](../../bun.lock#L662) |

These are the only direct `@clerk/*` package declarations in tracked `package.json` manifests. [apps/app/package.json:17](../../apps/app/package.json#L17) and [apps/api/package.json:16](../../apps/api/package.json#L16) depend on workspace `@repo/auth`; the web manifest has no auth dependency ([apps/web/package.json:13-40](../../apps/web/package.json#L13)). Lock workspace declarations repeat the direct versions at [bun.lock:14,215-216](../../bun.lock#L14).

Transitive Clerk packages are `@clerk/backend@3.26.2` ([bun.lock:654](../../bun.lock#L654)), `@clerk/react@6.18.1` ([bun.lock:658](../../bun.lock#L658)), `@clerk/shared@4.41.1` ([bun.lock:660](../../bun.lock#L660)), and `@clerk/themes`' nested `@clerk/shared@3.47.8` ([bun.lock:3840](../../bun.lock#L3840)). Both shared major versions are retained in the lockfile; this is an inventory fact, not a diagnosed defect. Other nested lock keys: `@clerk/testing/dotenv@17.2.2` at 3838 and shared dependencies `csstype@3.1.3`, `js-cookie@3.0.7`, `std-env@3.10.0` at 4432,4434,4436. There are 11 package-resolution keys beginning `@clerk/` in the lockfile, including the nested dependencies, covering seven actual Clerk-package resolutions (six distinct package names, with two shared versions).

Agent tooling is also Clerk-coupled: [skills-lock.json:34-93](../../skills-lock.json#L34) records ten installed `clerk/skills` entries (`clerk`, `clerk-backend-api`, `clerk-billing`, `clerk-cli`, `clerk-custom-ui`, `clerk-nextjs-patterns`, `clerk-orgs`, `clerk-setup`, `clerk-testing`, `clerk-webhooks`). Their skill directories are not tracked in the repository and are outside the tracked documentation count below.


## 6. Authentication webhook events and side effects

Source: [apps/api/app/webhooks/auth/route.ts:17](../../apps/api/app/webhooks/auth/route.ts#L17). The endpoint is `/webhooks/auth`, not `/api/webhooks/auth`. Its seven consumed types are explicitly listed at line 83 and dispatched at line 458.

| Event | Handler evidence | Side effects and response |
|---|---|---|
| `user.created` | [apps/api/app/webhooks/auth/route.ts:100](../../apps/api/app/webhooks/auth/route.ts#L100) | Analytics identify with Clerk ID, avatar, created date, first email/phone, names; capture `User Created`; 201. No Person provisioning here. |
| `user.updated` | [apps/api/app/webhooks/auth/route.ts:121](../../apps/api/app/webhooks/auth/route.ts#L121) | Refresh the same analytics identity properties; capture `User Updated`; 201. Does not update Person rows. |
| `user.deleted` | [apps/api/app/webhooks/auth/route.ts:142](../../apps/api/app/webhooks/auth/route.ts#L142) | If ID exists, identify with deletion timestamp and capture `User Deleted`; 201. Does not delete local rows or clear Person links. |
| `organization.created` | [apps/api/app/webhooks/auth/route.ts:160](../../apps/api/app/webhooks/auth/route.ts#L160) | Group-identify company by Clerk organisation ID/name/avatar. If creator exists, capture `Organisation Created` plus `Organisation Provisioned` activation, deduplicated by organisation ID, using provider event timestamp. 201; invalid/missing timestamp returns retryable 503. Does not create a payroll Organisation row. |
| `organization.updated` | [apps/api/app/webhooks/auth/route.ts:197](../../apps/api/app/webhooks/auth/route.ts#L197) | Update analytics company group name/avatar; capture `Organisation Updated` when creator exists; 201. Does not mirror a company name into the database. |
| `organizationMembership.created` | [apps/api/app/webhooks/auth/route.ts:218](../../apps/api/app/webhooks/auth/route.ts#L218) | Query all unarchived payroll Organisations in the account; for each, call `ensureCurrentUserPerson` in a tenant Result transaction with Clerk user ID, name, email identifier and avatar. Any failed company provisioning returns 503 before membership analytics. On success group-identify user into company and capture `Organisation Member Created` with deterministic delivery UUID. `org:owner` also captures `Customer Admitted`, deduplicated by delivery ID. 201; invalid/missing provider event timestamp returns 503. |
| `organizationMembership.deleted` | [apps/api/app/webhooks/auth/route.ts:262](../../apps/api/app/webhooks/auth/route.ts#L262) | Capture `Organisation Member Deleted`; account-scoped `person.updateMany` sets `clerk_user_id = null` for that user across companies; retains People and history; 201. |

`POST` at line 367 fails closed with 500 if `CLERK_WEBHOOK_SECRET` is missing, requires the three Svix headers (400 when missing), verifies the raw request body signature (400 on failure), parses JSON and validates the envelope and consumed event data with Zod (400 on invalid input). Unknown event types are logged by type/ID, analytics is flushed and 201 returned. This includes `organization.deleted` and `organizationMembership.updated`, which have no handler. Organisation/membership creation uses a millisecond timestamp no earlier than 2020. Logs intentionally exclude webhook PII. Analytics flush runs after handled delivery; this is not a database-backed universal delivery deduplication ledger. Parent replays and partial provisioning rely on the underlying idempotent Person service; activation UUIDs only deduplicate analytics.

## 7. Cross-app requests and background context

### App to API authentication paths

| Caller | Target and method | Context and authentication dependency |
|---|---|---|
| [apps/app/app/(authenticated)/sync/_actions.ts:121](../../apps/app/app/(authenticated)/sync/_actions.ts#L121) | `POST /api/sync/dispatch` | `dispatchManualSyncViaApi` calls `auth()` then `authObject.getToken()` at line 133. Sends `authorization: Bearer ${sessionToken}` at line 146 and a JSON body containing organisation, connection and run type. Missing token is denied; token retrieval/network failures return inline Results. This is the only explicit Clerk bearer-token sender found in `apps/app`. |
| [apps/api/app/api/sync/dispatch/route.ts:28](../../apps/api/app/api/sync/dispatch/route.ts#L28) | Receiver for manual sync | API proxy authenticates the request; route independently resolves `requireOrg()`, `currentUser()` and owner/admin `requireRole()` checks. Account and actor come from auth, not request JSON. Prepares under tenant scope, sends after closure and records audit. Non-production dispatch failure can use `apps/api/lib/sync/execute-local-sync-fallback.ts`; it retains authenticated account/company/actor context. |
| [apps/app/app/(authenticated)/components/notifications-provider.tsx:15](../../apps/app/app/(authenticated)/components/notifications-provider.tsx#L15) | `GET /api/notifications/stream` | Builds API stream URL; [packages/notifications/components/provider.tsx:73](../../packages/notifications/components/provider.tsx#L73) uses `new EventSource(streamUrl, { withCredentials: true })`. No explicit bearer header. Receiver at [apps/api/app/api/notifications/stream/route.ts:222](../../apps/api/app/api/notifications/stream/route.ts#L222) resolves current user/account and scopes replay/polling/live events to them. Cross-origin session cookies, CORS and Clerk proxy/satellite configuration are dependencies. |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts:58](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts#L58) | Browser navigation to `GET /api/xero/oauth/start` | Returns API redirect URL containing account, optional company, return path and user ID. No bearer header. Start route at [apps/api/app/api/xero/oauth/start/route.ts:6](../../apps/api/app/api/xero/oauth/start/route.ts#L6) requires authenticated account/user and owner/admin, checks query account against authenticated account and uses authenticated user ID. Callback at [apps/api/app/api/xero/oauth/callback/route.ts:78](../../apps/api/app/api/xero/oauth/callback/route.ts#L78) requires `auth().orgId/userId`, validates nonce/session binding, then dispatches initial import with both tenant keys and acting user ID. Query identity is not sufficient authority. |

[apps/app/lib/public-api-url.ts:5](../../apps/app/lib/public-api-url.ts#L5) supplies the configured API origin, and `apps/app/proxy.ts` / `apps/api/proxy.ts` plus `packages/auth/proxy.ts` compose Clerk routing and cross-host authentication. `cancelRunAction` in the sync actions dispatches an Inngest cancellation event directly; it is not an additional bearer-token HTTP call. Server actions using domain services directly do not cross the API origin.

### Inngest functions

[packages/jobs/src/functions.ts:13](../../packages/jobs/src/functions.ts#L13) registers ten functions. [packages/jobs/src/client.ts:10](../../packages/jobs/src/client.ts#L10) authenticates the Inngest client with event/signing keys. [apps/api/app/api/inngest/route.ts:6](../../apps/api/app/api/inngest/route.ts#L6) serves its GET/POST/PUT handlers; `/api/inngest` is public to Clerk middleware and uses Inngest authentication. The functions do not obtain Clerk session bearer tokens. Account context comes from validated events or system discovery, followed by scoped database access. This differs from the broad background-fetch wording in PRODUCT.md/AGENTS.md.

| Function or dispatch | Source | Identity/context dependency |
|---|---|---|
| `sync-xero-people` | [packages/jobs/src/handlers/sync-xero-people.ts:38](../../packages/jobs/src/handlers/sync-xero-people.ts#L38) | Required `clerkOrgId`, `organisationId`, `connectionId`; optional run/request time and `triggeredByUserId`. Resolves the current scoped connection before work and uses actor for provenance, not browser-session authorisation. |
| `sync-xero-leave-records` | [packages/jobs/src/handlers/sync-xero-leave-records.ts:64](../../packages/jobs/src/handlers/sync-xero-leave-records.ts#L64) | Same tenant/connection and optional triggering actor context; provider reads and canonical writes retain both tenancy keys. |
| `sync-xero-leave-balances` | [packages/jobs/src/handlers/sync-xero-leave-balances.ts:40](../../packages/jobs/src/handlers/sync-xero-leave-balances.ts#L40) | Same context plus optional person ID; rolling roster and initial-import state remain company scoped. |
| `reconcile-xero-approval-state` | [packages/jobs/src/handlers/reconcile-xero-approval-state.ts:47](../../packages/jobs/src/handlers/reconcile-xero-approval-state.ts#L47) | Same account/company/connection and optional actor. Completion notification goes to `triggeredByUserId` when present; otherwise calls Clerk organisation membership API, limit 100, and filters owner/admin at lines 646-668. No pagination loop here. Individual notifications use each Person's `clerk_user_id`. |
| `initial-xero-sync` | [packages/jobs/src/handlers/initial-xero-sync.ts:19](../../packages/jobs/src/handlers/initial-xero-sync.ts#L19) | Account/company/connection, request timestamp, optional run/actor. Sequences people, leave and balances; matching persisted request timestamp fences completion. |
| `schedule-xero-syncs` | [packages/jobs/src/handlers/schedule-xero-syncs.ts:313](../../packages/jobs/src/handlers/schedule-xero-syncs.ts#L313) | Cron every 15 minutes. System account/connection discovery, then tenant-scoped eligibility and dispatch. Carries both account/company IDs without an active user. Handles dormant grant maintenance and recovery of pending initial import. |
| `reconcile-feed-publications` | [packages/jobs/src/handlers/reconcile-feed-publications.ts:21](../../packages/jobs/src/handlers/reconcile-feed-publications.ts#L21) | Required account/company, optional connection; queries records, materialises publications and queues affected feeds in that tenant. |
| `rebuild-feed-cache` | [packages/jobs/src/handlers/rebuild-feed-cache.ts:17](../../packages/jobs/src/handlers/rebuild-feed-cache.ts#L17) | Required account/feed, nullable company for account feeds, optional connection/reason. Must retain account ownership when company is null. |
| `recount-usage` | [packages/jobs/src/handlers/recount-usage.ts:6](../../packages/jobs/src/handlers/recount-usage.ts#L6) | Account and company event; account-wide seat/company/feed counts persisted to usage counters using `clerk_org_id`. |
| `send-notification-emails` | [packages/jobs/src/handlers/send-notification-emails.ts:7](../../packages/jobs/src/handlers/send-notification-emails.ts#L7) | Cron every two minutes. Discovers queued accounts with system client, then calls `sendQueuedNotificationEmails(account.clerk_org_id)`. Uses queued recipient/email data, not a fresh signed-in user. |
| Dispatch and cancel schemas | [packages/jobs/src/events.ts:20](../../packages/jobs/src/events.ts#L20) | Sync dispatch includes account/company/connection, optional actor, run ID and trigger type. Cancel requires account/company/run. Initial import at line 210 includes account/company/connection/request time and optional actor. |
| Pending dispatch recovery and sync lifecycle | [packages/jobs/src/handlers/recover-xero-import-dispatch.ts:1](../../packages/jobs/src/handlers/recover-xero-import-dispatch.ts#L1); [packages/jobs/src/handlers/sync-run-lifecycle.ts:1](../../packages/jobs/src/handlers/sync-run-lifecycle.ts#L1); [packages/jobs/src/handlers/xero-sync-access.ts:1](../../packages/jobs/src/handlers/xero-sync-access.ts#L1) | Re-resolve account/company ownership and current connection binding; preserve tenant context during recovery, cancellation, run fencing and progress writes. |

Other identity consumers: [packages/notifications/src/dispatch.ts:49](../../packages/notifications/src/dispatch.ts#L49) validates actor/account/company/recipient user IDs; its recipient email resolver at line 249 looks up scoped Person email. `packages/notifications/src/notification-service.ts` and `preferences-service.ts` scope inbox and preferences to user/account. `packages/availability` normalises organisation roles for domain permission checks and routes notifications through linked People; see the import/role catalogue. `packages/billing` stores/routes account identity in subscription rows and Stripe metadata. `packages/analytics` uses Clerk identity in identify/group calls. These survive removal of direct SDK imports unless explicitly migrated.

## 8. Tests, fixtures, mocks and release tooling

The catalogue below covers 285 tracked files: 61 mock Clerk/auth modules; 278 carry synthetic identity/role context; 58 supply mocked auth helpers; 16 reference Clerk SDK, keys or browser globals. Categories overlap. These are static dependency counts, not executed or passing tests.

- Auth wrappers: `packages/auth/helpers.test.ts` fakes `@clerk/nextjs/server` sessions, `isAuthenticated`, `orgId` and `has`, including unauthenticated and missing-account cases. App/API route and action tests mock `@repo/auth/helpers` / `@repo/auth/server`, current user, role membership and `clerkClient` resources. Sync actions test fake `getToken` and assert the outgoing bearer header and missing-token handling.
- UI tests also fake account profile/UserButton hooks and signed-in identity. Membership, invite, remove, role-change and general-settings tests fake Clerk organisation resources and invitations. This coverage must move with the provider contract, not merely rename imports.
- Tenant fixtures: [packages/database/src/live-test-fixture.ts:162](../../packages/database/src/live-test-fixture.ts#L162) generates local synthetic account IDs; live runs derive explicitly owned account IDs from the release manifest. [packages/database/src/test-fixtures/slice-14-fixture.ts:81](../../packages/database/src/test-fixtures/slice-14-fixture.ts#L81) and `xero-simplification-fixture.ts:18` construct synthetic tenant/Person relationships. Many integration tests use these IDs without a Clerk session; they test query isolation/RLS or domain logic rather than provider login.
- Fixture/release guards: `packages/database/src/live-test-fixture.ts`, `tooling/release/manifest-fixtures.ts`, `database-guard.ts`, `cleanup.ts`, `xero-fixture-cleanup.ts`, `integration-inventory.ts`, and their tests embed account ownership and fixture boundaries. Changing identity format affects manifests and cleanup predicates even where auth is not mocked.
- Release browser setup at [tooling/release/e2e/global.setup.ts:13](../../tooling/release/e2e/global.setup.ts#L13) uses `clerkSetup()` and `clerk.signIn()` for owner/admin/manager/viewer emails, then stores browser state in ignored `tooling/release/.auth/*.json`. `admission.spec.ts:11` uses `setupClerkTestingToken` for bot-protection testing. These use controlled real Clerk accounts and testing helpers; they are not unit-test fabricated JWTs.
- [tooling/release/e2e/fixture.ts:45](../../tooling/release/e2e/fixture.ts#L45) loads per-role storage state and asserts `window.Clerk.user`, organisation ID, primary email and membership role against fixture ownership. `environment.ts:109` reads `TC_E2E_OWNER_EMAIL`, `TC_E2E_ADMIN_EMAIL`, `TC_E2E_MANAGER_EMAIL`, `TC_E2E_VIEWER_EMAIL`; `playwright.config.ts:44` sets viewer state. Authentication specs depend on `.cl-signIn-root`; admission specs depend on invitation links. `created-record.ts` validates mapped Clerk user/account IDs against owned database fixtures. Stored auth state, invitation URLs and real emails were not inspected or copied.
- Candidate URL/SHA, fixture ownership and provider observer dependencies remain release admission controls; bearer tokens in Xero provider oracles and Inngest/Neon/KV tooling authenticate those services, not Clerk sessions.

### Exhaustive test, fixture and release file catalogue

Tracked test/spec/fixture/mock/config files and `tooling/release` / `tooling/seed` files matching Clerk SDK/keys/browser globals, Clerk account/user fields, synthetic `org_`/`user_` IDs, listed role strings or mocked auth helpers. Identity-only matches test tenant or actor context; they do not simulate a signed session. Categories overlap.

| File and first evidence line | Dependency kind |
|---|---|
| [apps/api/__tests__/availability-routes.test.ts:4](../../apps/api/__tests__/availability-routes.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/api/app/api/notifications/stream/route.test.ts:4](../../apps/api/app/api/notifications/stream/route.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/api/app/api/support/github-issue/route.test.ts:6](../../apps/api/app/api/support/github-issue/route.test.ts#L6) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/api/app/api/sync/dispatch/route.test.ts:4](../../apps/api/app/api/sync/dispatch/route.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/api/app/api/xero/oauth/callback/route.test.ts:1](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L1) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/api/app/api/xero/oauth/start/route.test.ts:5](../../apps/api/app/api/xero/oauth/start/route.test.ts#L5) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/api/app/webhooks/auth/route.test.ts:61](../../apps/api/app/webhooks/auth/route.test.ts#L61) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [apps/api/app/webhooks/payments/route.test.ts:78](../../apps/api/app/webhooks/payments/route.test.ts#L78) | synthetic identity or role |
| [apps/api/lib/github/build-support-issue-payload.test.ts:153](../../apps/api/lib/github/build-support-issue-payload.test.ts#L153) | synthetic identity or role |
| [apps/api/lib/github/create-support-issue-service.test.ts:71](../../apps/api/lib/github/create-support-issue-service.test.ts#L71) | synthetic identity or role |
| [apps/api/lib/rate-limit/support-rate-limit.test.ts:41](../../apps/api/lib/rate-limit/support-rate-limit.test.ts#L41) | synthetic identity or role |
| [apps/api/lib/support/persist-support-submission-audit.test.ts:6](../../apps/api/lib/support/persist-support-submission-audit.test.ts#L6) | synthetic identity or role |
| [apps/app/__tests__/sign-in.test.tsx:9](../../apps/app/__tests__/sign-in.test.tsx#L9) | mocked auth module |
| [apps/app/__tests__/sign-up.test.tsx:13](../../apps/app/__tests__/sign-up.test.tsx#L13) | mocked auth module |
| [apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts:4](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx:1](../../apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx#L1) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/calendar/page.test.tsx:5](../../apps/app/app/(authenticated)/calendar/page.test.tsx#L5) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/dashboard-body.test.tsx:62](../../apps/app/app/(authenticated)/dashboard-body.test.tsx#L62) | synthetic identity or role |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx:57](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx#L57) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx:57](../../apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx#L57) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/feeds/_actions.test.ts:7](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L7) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/feeds/new/page.test.tsx:1](../../apps/app/app/(authenticated)/feeds/new/page.test.tsx#L1) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/feeds/page.test.tsx:57](../../apps/app/app/(authenticated)/feeds/page.test.tsx#L57) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/layout.test.tsx:4](../../apps/app/app/(authenticated)/layout.test.tsx#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/leave-approvals/_actions.test.ts:7](../../apps/app/app/(authenticated)/leave-approvals/_actions.test.ts#L7) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts:6](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts#L6) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/notifications/_actions.test.ts:4](../../apps/app/app/(authenticated)/notifications/_actions.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/notifications/page.test.tsx:6](../../apps/app/app/(authenticated)/notifications/page.test.tsx#L6) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/people/_actions.test.ts:6](../../apps/app/app/(authenticated)/people/_actions.test.ts#L6) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/people/manager-assignment-action.test.ts:4](../../apps/app/app/(authenticated)/people/manager-assignment-action.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/people/new/_actions.integration.test.ts:8](../../apps/app/app/(authenticated)/people/new/_actions.integration.test.ts#L8) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/people/new/_actions.test.ts:4](../../apps/app/app/(authenticated)/people/new/_actions.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/people/page.test.tsx:5](../../apps/app/app/(authenticated)/people/page.test.tsx#L5) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/plans/_actions.test.ts:8](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L8) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/plans/company-routing.test.ts:5](../../apps/app/app/(authenticated)/plans/company-routing.test.ts#L5) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/plans/page-server.test.tsx:63](../../apps/app/app/(authenticated)/plans/page-server.test.tsx#L63) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/plans/page.test.tsx:295](../../apps/app/app/(authenticated)/plans/page.test.tsx#L295) | synthetic identity or role |
| [apps/app/app/(authenticated)/plans/record-form-data.test.tsx:24](../../apps/app/app/(authenticated)/plans/record-form-data.test.tsx#L24) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/public-holidays/_actions.test.ts:62](../../apps/app/app/(authenticated)/public-holidays/_actions.test.ts#L62) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/public-holidays/page.test.tsx:1](../../apps/app/app/(authenticated)/public-holidays/page.test.tsx#L1) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts:61](../../apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts#L61) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/billing/actions.test.ts:8](../../apps/app/app/(authenticated)/settings/billing/actions.test.ts#L8) | synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/billing/page.test.tsx:8](../../apps/app/app/(authenticated)/settings/billing/page.test.tsx#L8) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/coverage/_actions.test.ts:61](../../apps/app/app/(authenticated)/settings/coverage/_actions.test.ts#L61) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/feeds/_actions.test.ts:61](../../apps/app/app/(authenticated)/settings/feeds/_actions.test.ts#L61) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/feeds/feed-oversight-list.test.tsx:14](../../apps/app/app/(authenticated)/settings/feeds/feed-oversight-list.test.tsx#L14) | synthetic identity or role |
| [apps/app/app/(authenticated)/settings/feeds/feeds-client.test.tsx:22](../../apps/app/app/(authenticated)/settings/feeds/feeds-client.test.tsx#L22) | synthetic identity or role |
| [apps/app/app/(authenticated)/settings/feeds/page.test.tsx:57](../../apps/app/app/(authenticated)/settings/feeds/page.test.tsx#L57) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/general/_actions.test.ts:4](../../apps/app/app/(authenticated)/settings/general/_actions.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:4](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:10](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L10) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts:1](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts#L1) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_match-view.test.ts:8](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_match-view.test.ts#L8) | synthetic identity or role |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/matches-client.test.tsx:56](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/matches-client.test.tsx#L56) | synthetic identity or role |
| [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:15](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L15) | mocked auth module; synthetic identity or role; Clerk SDK, keys or browser globals; auth helper mock |
| [apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts:61](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts#L61) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/settings/leave-approval/leave-approval-settings-client.test.tsx:27](../../apps/app/app/(authenticated)/settings/leave-approval/leave-approval-settings-client.test.tsx#L27) | synthetic identity or role |
| [apps/app/app/(authenticated)/setup/_actions.test.ts:61](../../apps/app/app/(authenticated)/setup/_actions.test.ts#L61) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(authenticated)/sync/_actions.test.ts:57](../../apps/app/app/(authenticated)/sync/_actions.test.ts#L57) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(setup)/onboarding/_actions.test.ts:5](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L5) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(setup)/onboarding/page.test.tsx:62](../../apps/app/app/(setup)/onboarding/page.test.tsx#L62) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx:69](../../apps/app/app/(setup)/onboarding/steps/people-invite-steps.test.tsx#L69) | synthetic identity or role |
| [apps/app/app/(setup)/welcome/_actions.test.ts:61](../../apps/app/app/(setup)/welcome/_actions.test.ts#L61) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/(setup)/welcome/page.test.tsx:57](../../apps/app/app/(setup)/welcome/page.test.tsx#L57) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/actions/availability/manual.test.ts:5](../../apps/app/app/actions/availability/manual.test.ts#L5) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/actions/settings/invite-member.test.ts:4](../../apps/app/app/actions/settings/invite-member.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/actions/settings/remove-member.test.ts:4](../../apps/app/app/actions/settings/remove-member.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/actions/settings/revoke-tokens.test.ts:4](../../apps/app/app/actions/settings/revoke-tokens.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/actions/settings/update-member-role.test.ts:4](../../apps/app/app/actions/settings/update-member-role.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/app/actions/settings/update-org.test.ts:4](../../apps/app/app/actions/settings/update-org.test.ts#L4) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/components/calendar/calendar-live-updates.test.tsx:39](../../apps/app/components/calendar/calendar-live-updates.test.tsx#L39) | synthetic identity or role |
| [apps/app/components/calendar/calendar-month-view.test.tsx:54](../../apps/app/components/calendar/calendar-month-view.test.tsx#L54) | synthetic identity or role |
| [apps/app/components/calendar/calendar-timeline.test.tsx:51](../../apps/app/components/calendar/calendar-timeline.test.tsx#L51) | synthetic identity or role |
| [apps/app/components/calendar/calendar-toolbar.test.tsx:106](../../apps/app/components/calendar/calendar-toolbar.test.tsx#L106) | synthetic identity or role |
| [apps/app/components/dashboard/admin-view.test.tsx:21](../../apps/app/components/dashboard/admin-view.test.tsx#L21) | synthetic identity or role |
| [apps/app/components/dashboard/approval-rows.test.tsx:36](../../apps/app/components/dashboard/approval-rows.test.tsx#L36) | synthetic identity or role |
| [apps/app/components/dashboard/coverage-map.test.tsx:131](../../apps/app/components/dashboard/coverage-map.test.tsx#L131) | synthetic identity or role |
| [apps/app/components/dashboard/dashboard-header.test.tsx:13](../../apps/app/components/dashboard/dashboard-header.test.tsx#L13) | synthetic identity or role |
| [apps/app/components/dashboard/needs-reply.test.tsx:28](../../apps/app/components/dashboard/needs-reply.test.tsx#L28) | synthetic identity or role |
| [apps/app/components/dashboard/timeline-adapter.test.ts:128](../../apps/app/components/dashboard/timeline-adapter.test.ts#L128) | synthetic identity or role |
| [apps/app/components/feed/other-feeds-list.test.tsx:37](../../apps/app/components/feed/other-feeds-list.test.tsx#L37) | synthetic identity or role |
| [apps/app/lib/auth/require-page-role.test.ts:8](../../apps/app/lib/auth/require-page-role.test.ts#L8) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/lib/feeds/recommend-feed.test.ts:12](../../apps/app/lib/feeds/recommend-feed.test.ts#L12) | synthetic identity or role |
| [apps/app/lib/navigation/nav-items.test.ts:11](../../apps/app/lib/navigation/nav-items.test.ts#L11) | synthetic identity or role |
| [apps/app/lib/server/load-onboarding-state.test.ts:40](../../apps/app/lib/server/load-onboarding-state.test.ts#L40) | synthetic identity or role |
| [apps/app/lib/server/onboarding-gate.test.ts:5](../../apps/app/lib/server/onboarding-gate.test.ts#L5) | synthetic identity or role |
| [apps/app/lib/server/require-active-org-page-context-scope.test.ts:6](../../apps/app/lib/server/require-active-org-page-context-scope.test.ts#L6) | mocked auth module; synthetic identity or role; auth helper mock |
| [apps/app/lib/server/require-active-org-page-context.test.ts:9](../../apps/app/lib/server/require-active-org-page-context.test.ts#L9) | mocked auth module; synthetic identity or role; auth helper mock |
| [packages/analytics/instrumentation-client.test.ts:237](../../packages/analytics/instrumentation-client.test.ts#L237) | synthetic identity or role |
| [packages/analytics/server-delivery.test.ts:34](../../packages/analytics/server-delivery.test.ts#L34) | synthetic identity or role |
| [packages/auth/entitlements.test.ts:50](../../packages/auth/entitlements.test.ts#L50) | synthetic identity or role |
| [packages/availability/index.integration.test.ts:75](../../packages/availability/index.integration.test.ts#L75) | synthetic identity or role |
| [packages/availability/index.test.ts:10](../../packages/availability/index.test.ts#L10) | synthetic identity or role |
| [packages/availability/src/analytics/leave-reports-service.test.ts:10](../../packages/availability/src/analytics/leave-reports-service.test.ts#L10) | synthetic identity or role |
| [packages/availability/src/analytics/out-of-office-service.test.ts:9](../../packages/availability/src/analytics/out-of-office-service.test.ts#L9) | synthetic identity or role |
| [packages/availability/src/analytics/request-cache.test.ts:12](../../packages/availability/src/analytics/request-cache.test.ts#L12) | synthetic identity or role |
| [packages/availability/src/analytics/tenant-service-scope.test.ts:16](../../packages/availability/src/analytics/tenant-service-scope.test.ts#L16) | synthetic identity or role |
| [packages/availability/src/approvals/approval-account-scope.test.ts:21](../../packages/availability/src/approvals/approval-account-scope.test.ts#L21) | synthetic identity or role |
| [packages/availability/src/approvals/approval-service.test.ts:42](../../packages/availability/src/approvals/approval-service.test.ts#L42) | synthetic identity or role |
| [packages/availability/src/approvals/multi-company-routing.integration.test.ts:28](../../packages/availability/src/approvals/multi-company-routing.integration.test.ts#L28) | synthetic identity or role |
| [packages/availability/src/calendar/calendar-account-scope.test.ts:38](../../packages/availability/src/calendar/calendar-account-scope.test.ts#L38) | synthetic identity or role |
| [packages/availability/src/calendar/calendar-service.integration.test.ts:17](../../packages/availability/src/calendar/calendar-service.integration.test.ts#L17) | synthetic identity or role |
| [packages/availability/src/calendar/calendar-service.test.ts:7](../../packages/availability/src/calendar/calendar-service.test.ts#L7) | synthetic identity or role |
| [packages/availability/src/dashboard/dashboard-account-scope.test.ts:104](../../packages/availability/src/dashboard/dashboard-account-scope.test.ts#L104) | synthetic identity or role |
| [packages/availability/src/dashboard/dashboard-service.test.ts:121](../../packages/availability/src/dashboard/dashboard-service.test.ts#L121) | synthetic identity or role |
| [packages/availability/src/duration/working-days.test.ts:9](../../packages/availability/src/duration/working-days.test.ts#L9) | synthetic identity or role |
| [packages/availability/src/holidays/holiday-preferences.test.ts:40](../../packages/availability/src/holidays/holiday-preferences.test.ts#L40) | synthetic identity or role |
| [packages/availability/src/holidays/holiday-service.test.ts:22](../../packages/availability/src/holidays/holiday-service.test.ts#L22) | synthetic identity or role |
| [packages/availability/src/holidays/reference-tenant-scope.test.ts:24](../../packages/availability/src/holidays/reference-tenant-scope.test.ts#L24) | synthetic identity or role |
| [packages/availability/src/holidays/resolve-public-holidays.test.ts:19](../../packages/availability/src/holidays/resolve-public-holidays.test.ts#L19) | synthetic identity or role |
| [packages/availability/src/onboarding/wizard-service.test.ts:46](../../packages/availability/src/onboarding/wizard-service.test.ts#L46) | synthetic identity or role |
| [packages/availability/src/people/alternative-contact-service.test.ts:14](../../packages/availability/src/people/alternative-contact-service.test.ts#L14) | synthetic identity or role |
| [packages/availability/src/people/balance-refresh.test.ts:26](../../packages/availability/src/people/balance-refresh.test.ts#L26) | synthetic identity or role |
| [packages/availability/src/people/clerk-access-service.integration.test.ts:19](../../packages/availability/src/people/clerk-access-service.integration.test.ts#L19) | synthetic identity or role |
| [packages/availability/src/people/current-status.test.ts:11](../../packages/availability/src/people/current-status.test.ts#L11) | synthetic identity or role |
| [packages/availability/src/people/current-user-account-scope.test.ts:26](../../packages/availability/src/people/current-user-account-scope.test.ts#L26) | mocked auth module; synthetic identity or role |
| [packages/availability/src/people/current-user-service.integration.test.ts:23](../../packages/availability/src/people/current-user-service.integration.test.ts#L23) | synthetic identity or role |
| [packages/availability/src/people/current-user-service.test.ts:22](../../packages/availability/src/people/current-user-service.test.ts#L22) | mocked auth module; synthetic identity or role |
| [packages/availability/src/people/manager-assignment-service.integration.test.ts:23](../../packages/availability/src/people/manager-assignment-service.integration.test.ts#L23) | synthetic identity or role |
| [packages/availability/src/people/manager-assignment-service.test.ts:34](../../packages/availability/src/people/manager-assignment-service.test.ts#L34) | synthetic identity or role |
| [packages/availability/src/people/manual-balance-service.test.ts:13](../../packages/availability/src/people/manual-balance-service.test.ts#L13) | synthetic identity or role |
| [packages/availability/src/people/people-account-scope.test.ts:21](../../packages/availability/src/people/people-account-scope.test.ts#L21) | synthetic identity or role |
| [packages/availability/src/people/people-service.test.ts:19](../../packages/availability/src/people/people-service.test.ts#L19) | synthetic identity or role |
| [packages/availability/src/people/xero-person-merge-scope.test.ts:47](../../packages/availability/src/people/xero-person-merge-scope.test.ts#L47) | synthetic identity or role |
| [packages/availability/src/people/xero-person-reconciliation.test.ts:60](../../packages/availability/src/people/xero-person-reconciliation.test.ts#L60) | synthetic identity or role |
| [packages/availability/src/plans/plan-service.test.ts:45](../../packages/availability/src/plans/plan-service.test.ts#L45) | synthetic identity or role |
| [packages/availability/src/plans/submit-recovery-service.test.ts:44](../../packages/availability/src/plans/submit-recovery-service.test.ts#L44) | synthetic identity or role |
| [packages/availability/src/plans/submit-service.test.ts:31](../../packages/availability/src/plans/submit-service.test.ts#L31) | synthetic identity or role |
| [packages/availability/src/plans/submit-side-effects.test.ts:59](../../packages/availability/src/plans/submit-side-effects.test.ts#L59) | synthetic identity or role |
| [packages/availability/src/plans/write-operation.test.ts:37](../../packages/availability/src/plans/write-operation.test.ts#L37) | synthetic identity or role |
| [packages/availability/src/records/manual-records-service.test.ts:12](../../packages/availability/src/records/manual-records-service.test.ts#L12) | synthetic identity or role |
| [packages/availability/src/settings/account-approval-settings-service.test.ts:31](../../packages/availability/src/settings/account-approval-settings-service.test.ts#L31) | synthetic identity or role |
| [packages/availability/src/settings/audit-log-service.test.ts:48](../../packages/availability/src/settings/audit-log-service.test.ts#L48) | synthetic identity or role |
| [packages/availability/src/settings/billing-service.test.ts:36](../../packages/availability/src/settings/billing-service.test.ts#L36) | synthetic identity or role |
| [packages/availability/src/settings/manager-scope.test.ts:26](../../packages/availability/src/settings/manager-scope.test.ts#L26) | synthetic identity or role |
| [packages/availability/src/settings/organisation-settings-service.test.ts:42](../../packages/availability/src/settings/organisation-settings-service.test.ts#L42) | synthetic identity or role |
| [packages/availability/src/slice-14-integration-flows.test.ts:66](../../packages/availability/src/slice-14-integration-flows.test.ts#L66) | synthetic identity or role |
| [packages/availability/src/sync/availability-uid.test.ts:7](../../packages/availability/src/sync/availability-uid.test.ts#L7) | synthetic identity or role |
| [packages/availability/src/sync/inbound-leave-normaliser.test.ts:14](../../packages/availability/src/sync/inbound-leave-normaliser.test.ts#L14) | synthetic identity or role |
| [packages/availability/src/sync/sync-monitor-service.test.ts:16](../../packages/availability/src/sync/sync-monitor-service.test.ts#L16) | synthetic identity or role |
| [packages/availability/src/team-coverage/load-manager-coverage.test.ts:45](../../packages/availability/src/team-coverage/load-manager-coverage.test.ts#L45) | synthetic identity or role |
| [packages/availability/src/team-coverage/team-coverage-minimums.test.ts:52](../../packages/availability/src/team-coverage/team-coverage-minimums.test.ts#L52) | synthetic identity or role |
| [packages/availability/src/xero-connection-state.test.ts:14](../../packages/availability/src/xero-connection-state.test.ts#L14) | synthetic identity or role |
| [packages/availability/src/xero-write-claim.test.ts:7](../../packages/availability/src/xero-write-claim.test.ts#L7) | synthetic identity or role |
| [packages/billing/src/stripe.test.ts:123](../../packages/billing/src/stripe.test.ts#L123) | synthetic identity or role |
| [packages/core/src/support-submission.test.ts:35](../../packages/core/src/support-submission.test.ts#L35) | synthetic identity or role |
| [packages/database/authoritative-usage.integration.test.ts:15](../../packages/database/authoritative-usage.integration.test.ts#L15) | synthetic identity or role |
| [packages/database/availability_records.integration.test.ts:26](../../packages/database/availability_records.integration.test.ts#L26) | synthetic identity or role |
| [packages/database/billing.integration.test.ts:23](../../packages/database/billing.integration.test.ts#L23) | synthetic identity or role |
| [packages/database/leave_balances.integration.test.ts:23](../../packages/database/leave_balances.integration.test.ts#L23) | synthetic identity or role |
| [packages/database/live-rollback.integration.test.ts:27](../../packages/database/live-rollback.integration.test.ts#L27) | synthetic identity or role |
| [packages/database/multi-company-migration.integration.test.ts:30](../../packages/database/multi-company-migration.integration.test.ts#L30) | synthetic identity or role |
| [packages/database/onboarding.integration.test.ts:22](../../packages/database/onboarding.integration.test.ts#L22) | synthetic identity or role |
| [packages/database/payroll-entitlements.integration.test.ts:29](../../packages/database/payroll-entitlements.integration.test.ts#L29) | synthetic identity or role |
| [packages/database/public-holiday-preferences-migration.integration.test.ts:47](../../packages/database/public-holiday-preferences-migration.integration.test.ts#L47) | synthetic identity or role |
| [packages/database/row-level-security.integration.test.ts:25](../../packages/database/row-level-security.integration.test.ts#L25) | synthetic identity or role |
| [packages/database/src/live-test-fixture.test.ts:23](../../packages/database/src/live-test-fixture.test.ts#L23) | synthetic identity or role |
| [packages/database/src/live-test-fixture.ts:91](../../packages/database/src/live-test-fixture.ts#L91) | synthetic identity or role |
| [packages/database/src/organisation-settings/repository.test.ts:11](../../packages/database/src/organisation-settings/repository.test.ts#L11) | synthetic identity or role |
| [packages/database/src/queries/account-companies.test.ts:30](../../packages/database/src/queries/account-companies.test.ts#L30) | synthetic identity or role |
| [packages/database/src/queries/account-settings.test.ts:23](../../packages/database/src/queries/account-settings.test.ts#L23) | synthetic identity or role |
| [packages/database/src/queries/activation-dashboard.test.ts:51](../../packages/database/src/queries/activation-dashboard.test.ts#L51) | synthetic identity or role |
| [packages/database/src/queries/availability-records.test.ts:29](../../packages/database/src/queries/availability-records.test.ts#L29) | synthetic identity or role |
| [packages/database/src/queries/billing.test.ts:72](../../packages/database/src/queries/billing.test.ts#L72) | synthetic identity or role |
| [packages/database/src/queries/feeds.test.ts:29](../../packages/database/src/queries/feeds.test.ts#L29) | synthetic identity or role |
| [packages/database/src/queries/outbound-operations.test.ts:58](../../packages/database/src/queries/outbound-operations.test.ts#L58) | synthetic identity or role |
| [packages/database/src/queries/people.test.ts:27](../../packages/database/src/queries/people.test.ts#L27) | synthetic identity or role |
| [packages/database/src/queries/public-holiday-resolution.test.ts:15](../../packages/database/src/queries/public-holiday-resolution.test.ts#L15) | synthetic identity or role |
| [packages/database/src/queries/schedulable-xero-connections.test.ts:33](../../packages/database/src/queries/schedulable-xero-connections.test.ts#L33) | synthetic identity or role |
| [packages/database/src/queries/support-submissions.test.ts:11](../../packages/database/src/queries/support-submissions.test.ts#L11) | synthetic identity or role |
| [packages/database/src/queries/teams.test.ts:41](../../packages/database/src/queries/teams.test.ts#L41) | synthetic identity or role |
| [packages/database/src/queries/tenant-query-scope.test.ts:125](../../packages/database/src/queries/tenant-query-scope.test.ts#L125) | synthetic identity or role |
| [packages/database/src/queries/xero-connection-state.test.ts:29](../../packages/database/src/queries/xero-connection-state.test.ts#L29) | synthetic identity or role |
| [packages/database/src/queries/xero-connections.test.ts:35](../../packages/database/src/queries/xero-connections.test.ts#L35) | synthetic identity or role |
| [packages/database/src/queries/xero-ownership.test.ts:15](../../packages/database/src/queries/xero-ownership.test.ts#L15) | synthetic identity or role |
| [packages/database/src/seed/seed.integration.test.ts:13](../../packages/database/src/seed/seed.integration.test.ts#L13) | synthetic identity or role |
| [packages/database/src/tenant-db.test.ts:81](../../packages/database/src/tenant-db.test.ts#L81) | synthetic identity or role |
| [packages/database/src/tenant-query.test.ts:8](../../packages/database/src/tenant-query.test.ts#L8) | synthetic identity or role |
| [packages/database/src/test-fixtures/slice-14-fixture.ts:12](../../packages/database/src/test-fixtures/slice-14-fixture.ts#L12) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/database/src/test-fixtures/tenant-scope.ts:7](../../packages/database/src/test-fixtures/tenant-scope.ts#L7) | synthetic identity or role |
| [packages/database/src/test-fixtures/xero-simplification-fixture.ts:18](../../packages/database/src/test-fixtures/xero-simplification-fixture.ts#L18) | synthetic identity or role |
| [packages/database/teams.integration.test.ts:18](../../packages/database/teams.integration.test.ts#L18) | synthetic identity or role |
| [packages/database/tenant-statement-counts.integration.test.ts:26](../../packages/database/tenant-statement-counts.integration.test.ts#L26) | synthetic identity or role |
| [packages/database/xero-ownership.integration.test.ts:26](../../packages/database/xero-ownership.integration.test.ts#L26) | synthetic identity or role |
| [packages/database/xero-provider-fence.integration.test.ts:39](../../packages/database/xero-provider-fence.integration.test.ts#L39) | synthetic identity or role |
| [packages/database/xero-simplification-schema.integration.test.ts:93](../../packages/database/xero-simplification-schema.integration.test.ts#L93) | synthetic identity or role |
| [packages/database/xero-sync-cursors.integration.test.ts:18](../../packages/database/xero-sync-cursors.integration.test.ts#L18) | synthetic identity or role |
| [packages/database/xero-tenancy.integration.test.ts:182](../../packages/database/xero-tenancy.integration.test.ts#L182) | synthetic identity or role |
| [packages/design-system/providers/public.test.ts:31](../../packages/design-system/providers/public.test.ts#L31) | Clerk SDK, keys or browser globals |
| [packages/feeds/index.integration.test.ts:150](../../packages/feeds/index.integration.test.ts#L150) | synthetic identity or role |
| [packages/feeds/src/cache/feed-invalidation.test.ts:64](../../packages/feeds/src/cache/feed-invalidation.test.ts#L64) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/feeds/src/feed-service.test.ts:14](../../packages/feeds/src/feed-service.test.ts#L14) | synthetic identity or role |
| [packages/feeds/src/preview/preview-service.test.ts:52](../../packages/feeds/src/preview/preview-service.test.ts#L52) | synthetic identity or role |
| [packages/feeds/src/projection/feed-projection.test.ts:37](../../packages/feeds/src/projection/feed-projection.test.ts#L37) | synthetic identity or role |
| [packages/feeds/src/publication/feed-representation.test.ts:58](../../packages/feeds/src/publication/feed-representation.test.ts#L58) | synthetic identity or role |
| [packages/feeds/src/publication/publication-service.test.ts:21](../../packages/feeds/src/publication/publication-service.test.ts#L21) | synthetic identity or role |
| [packages/feeds/src/render/render-feed.test.ts:63](../../packages/feeds/src/render/render-feed.test.ts#L63) | synthetic identity or role |
| [packages/feeds/src/scope/feed-manager-scope.test.ts:43](../../packages/feeds/src/scope/feed-manager-scope.test.ts#L43) | synthetic identity or role |
| [packages/feeds/src/scope/feed-ownership.test.ts:4](../../packages/feeds/src/scope/feed-ownership.test.ts#L4) | synthetic identity or role |
| [packages/feeds/src/scope/feed-scope.test.ts:58](../../packages/feeds/src/scope/feed-scope.test.ts#L58) | synthetic identity or role |
| [packages/feeds/src/tenant-scope.test.ts:61](../../packages/feeds/src/tenant-scope.test.ts#L61) | synthetic identity or role |
| [packages/feeds/src/tokens/token-request-rollback.test.ts:19](../../packages/feeds/src/tokens/token-request-rollback.test.ts#L19) | synthetic identity or role |
| [packages/feeds/src/tokens/token-service.test.ts:16](../../packages/feeds/src/tokens/token-service.test.ts#L16) | synthetic identity or role |
| [packages/jobs/src/activation.test.ts:63](../../packages/jobs/src/activation.test.ts#L63) | synthetic identity or role |
| [packages/jobs/src/events.test.ts:39](../../packages/jobs/src/events.test.ts#L39) | synthetic identity or role |
| [packages/jobs/src/handlers/initial-xero-sync.test.ts:37](../../packages/jobs/src/handlers/initial-xero-sync.test.ts#L37) | synthetic identity or role |
| [packages/jobs/src/handlers/rebuild-feed-cache.test.ts:83](../../packages/jobs/src/handlers/rebuild-feed-cache.test.ts#L83) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/jobs/src/handlers/reconcile-feed-publications-scope.test.ts:28](../../packages/jobs/src/handlers/reconcile-feed-publications-scope.test.ts#L28) | synthetic identity or role |
| [packages/jobs/src/handlers/reconcile-feed-publications.test.ts:51](../../packages/jobs/src/handlers/reconcile-feed-publications.test.ts#L51) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts:7](../../packages/jobs/src/handlers/reconcile-xero-approval-state.integration.test.ts#L7) | synthetic identity or role |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.test.ts:17](../../packages/jobs/src/handlers/reconcile-xero-approval-state.test.ts#L17) | mocked auth module; synthetic identity or role; Clerk SDK, keys or browser globals; auth helper mock |
| [packages/jobs/src/handlers/recount-usage.test.ts:61](../../packages/jobs/src/handlers/recount-usage.test.ts#L61) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/jobs/src/handlers/recover-xero-import-dispatch.test.ts:68](../../packages/jobs/src/handlers/recover-xero-import-dispatch.test.ts#L68) | synthetic identity or role |
| [packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts:15](../../packages/jobs/src/handlers/schedule-xero-syncs.integration.test.ts#L15) | synthetic identity or role |
| [packages/jobs/src/handlers/schedule-xero-syncs.test.ts:38](../../packages/jobs/src/handlers/schedule-xero-syncs.test.ts#L38) | synthetic identity or role |
| [packages/jobs/src/handlers/send-notification-emails.test.ts:4](../../packages/jobs/src/handlers/send-notification-emails.test.ts#L4) | synthetic identity or role |
| [packages/jobs/src/handlers/sync-run-lifecycle.test.ts:14](../../packages/jobs/src/handlers/sync-run-lifecycle.test.ts#L14) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/jobs/src/handlers/sync-xero-leave-balances.integration.test.ts:33](../../packages/jobs/src/handlers/sync-xero-leave-balances.integration.test.ts#L33) | synthetic identity or role |
| [packages/jobs/src/handlers/sync-xero-leave-balances.test.ts:15](../../packages/jobs/src/handlers/sync-xero-leave-balances.test.ts#L15) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts:89](../../packages/jobs/src/handlers/sync-xero-leave-records.integration.test.ts#L89) | synthetic identity or role |
| [packages/jobs/src/handlers/sync-xero-leave-records.test.ts:25](../../packages/jobs/src/handlers/sync-xero-leave-records.test.ts#L25) | synthetic identity or role; Clerk SDK, keys or browser globals |
| [packages/jobs/src/handlers/sync-xero-people.integration.test.ts:37](../../packages/jobs/src/handlers/sync-xero-people.integration.test.ts#L37) | synthetic identity or role |
| [packages/jobs/src/handlers/sync-xero-people.test.ts:14](../../packages/jobs/src/handlers/sync-xero-people.test.ts#L14) | synthetic identity or role |
| [packages/jobs/src/handlers/tenant-step-scope.test.ts:49](../../packages/jobs/src/handlers/tenant-step-scope.test.ts#L49) | synthetic identity or role |
| [packages/jobs/src/handlers/xero-sync-access.test.ts:56](../../packages/jobs/src/handlers/xero-sync-access.test.ts#L56) | synthetic identity or role |
| [packages/next-config/preflight.test.ts:21](../../packages/next-config/preflight.test.ts#L21) | Clerk SDK, keys or browser globals |
| [packages/notifications/src/account-inbox-scope.test.ts:19](../../packages/notifications/src/account-inbox-scope.test.ts#L19) | synthetic identity or role |
| [packages/notifications/src/dispatch.test.ts:63](../../packages/notifications/src/dispatch.test.ts#L63) | synthetic identity or role |
| [packages/notifications/src/email-queue-service.test.ts:86](../../packages/notifications/src/email-queue-service.test.ts#L86) | synthetic identity or role |
| [packages/notifications/src/notification-service.test.ts:50](../../packages/notifications/src/notification-service.test.ts#L50) | synthetic identity or role |
| [packages/notifications/src/preferences-service.test.ts:39](../../packages/notifications/src/preferences-service.test.ts#L39) | synthetic identity or role |
| [packages/notifications/src/sse/broker.test.ts:74](../../packages/notifications/src/sse/broker.test.ts#L74) | synthetic identity or role |
| [packages/notifications/src/tenant-scope.test.ts:53](../../packages/notifications/src/tenant-scope.test.ts#L53) | synthetic identity or role |
| [packages/observability/log.test.ts:24](../../packages/observability/log.test.ts#L24) | synthetic identity or role |
| [packages/observability/scrubber.test.ts:15](../../packages/observability/scrubber.test.ts#L15) | synthetic identity or role |
| [packages/xero/src/adapter/auth-recovery.test.ts:21](../../packages/xero/src/adapter/auth-recovery.test.ts#L21) | synthetic identity or role |
| [packages/xero/src/adapter/xero-write-adapter.test.ts:85](../../packages/xero/src/adapter/xero-write-adapter.test.ts#L85) | synthetic identity or role |
| [packages/xero/src/au/read.test.ts:35](../../packages/xero/src/au/read.test.ts#L35) | synthetic identity or role |
| [packages/xero/src/au/write.test.ts:74](../../packages/xero/src/au/write.test.ts#L74) | synthetic identity or role |
| [packages/xero/src/nz/read.test.ts:36](../../packages/xero/src/nz/read.test.ts#L36) | synthetic identity or role |
| [packages/xero/src/oauth/activation.test.ts:57](../../packages/xero/src/oauth/activation.test.ts#L57) | synthetic identity or role |
| [packages/xero/src/oauth/authorisation.test.ts:117](../../packages/xero/src/oauth/authorisation.test.ts#L117) | synthetic identity or role |
| [packages/xero/src/oauth/canonical-session.test.ts:92](../../packages/xero/src/oauth/canonical-session.test.ts#L92) | synthetic identity or role |
| [packages/xero/src/oauth/disconnect.integration.test.ts:56](../../packages/xero/src/oauth/disconnect.integration.test.ts#L56) | synthetic identity or role |
| [packages/xero/src/oauth/disconnect.test.ts:113](../../packages/xero/src/oauth/disconnect.test.ts#L113) | synthetic identity or role |
| [packages/xero/src/oauth/provider-connection.integration.test.ts:60](../../packages/xero/src/oauth/provider-connection.integration.test.ts#L60) | synthetic identity or role |
| [packages/xero/src/oauth/provider-connection.test.ts:24](../../packages/xero/src/oauth/provider-connection.test.ts#L24) | synthetic identity or role |
| [packages/xero/src/oauth/service.integration.test.ts:54](../../packages/xero/src/oauth/service.integration.test.ts#L54) | synthetic identity or role |
| [packages/xero/src/oauth/service.test.ts:83](../../packages/xero/src/oauth/service.test.ts#L83) | synthetic identity or role |
| [packages/xero/src/rate-limit/shared-store.integration.test.ts:102](../../packages/xero/src/rate-limit/shared-store.integration.test.ts#L102) | synthetic identity or role |
| [packages/xero/src/rate-limit/shared-store.test.ts:28](../../packages/xero/src/rate-limit/shared-store.test.ts#L28) | synthetic identity or role |
| [packages/xero/src/rate-limit/xero-fetch.test.ts:237](../../packages/xero/src/rate-limit/xero-fetch.test.ts#L237) | synthetic identity or role |
| [packages/xero/src/read/dispatch.test.ts:54](../../packages/xero/src/read/dispatch.test.ts#L54) | synthetic identity or role |
| [packages/xero/src/resolution/resolve-employee.test.ts:54](../../packages/xero/src/resolution/resolve-employee.test.ts#L54) | synthetic identity or role |
| [packages/xero/src/resolution/resolve-leave-type.test.ts:56](../../packages/xero/src/resolution/resolve-leave-type.test.ts#L56) | synthetic identity or role |
| [packages/xero/src/uk/read.test.ts:37](../../packages/xero/src/uk/read.test.ts#L37) | synthetic identity or role |
| [packages/xero/src/write/dispatch-idempotency.test.ts:59](../../packages/xero/src/write/dispatch-idempotency.test.ts#L59) | synthetic identity or role |
| [packages/xero/src/write/dispatch.test.ts:20](../../packages/xero/src/write/dispatch.test.ts#L20) | synthetic identity or role |
| [tooling/release/cleanup.ts:61](../../tooling/release/cleanup.ts#L61) | synthetic identity or role |
| [tooling/release/database-guard.test.ts:26](../../tooling/release/database-guard.test.ts#L26) | synthetic identity or role |
| [tooling/release/database-guard.ts:29](../../tooling/release/database-guard.ts#L29) | synthetic identity or role |
| [tooling/release/e2e/admission.spec.ts:2](../../tooling/release/e2e/admission.spec.ts#L2) | Clerk SDK, keys or browser globals |
| [tooling/release/e2e/created-record.ts:21](../../tooling/release/e2e/created-record.ts#L21) | synthetic identity or role |
| [tooling/release/e2e/fixture.ts:50](../../tooling/release/e2e/fixture.ts#L50) | Clerk SDK, keys or browser globals |
| [tooling/release/e2e/global.setup.ts:3](../../tooling/release/e2e/global.setup.ts#L3) | Clerk SDK, keys or browser globals |
| [tooling/release/e2e/provider-snapshot-cli.test.ts:24](../../tooling/release/e2e/provider-snapshot-cli.test.ts#L24) | synthetic identity or role |
| [tooling/release/e2e/provider-snapshot-cli.ts:25](../../tooling/release/e2e/provider-snapshot-cli.ts#L25) | synthetic identity or role |
| [tooling/release/e2e/xero-disconnect-fixture.test.ts:11](../../tooling/release/e2e/xero-disconnect-fixture.test.ts#L11) | synthetic identity or role |
| [tooling/release/e2e/xero-disconnect-fixture.ts:4](../../tooling/release/e2e/xero-disconnect-fixture.ts#L4) | synthetic identity or role |
| [tooling/release/e2e/xero-disconnect-observer-cli.test.ts:7](../../tooling/release/e2e/xero-disconnect-observer-cli.test.ts#L7) | synthetic identity or role |
| [tooling/release/e2e/xero-disconnect-observer-cli.ts:19](../../tooling/release/e2e/xero-disconnect-observer-cli.ts#L19) | synthetic identity or role |
| [tooling/release/e2e/xero-disconnect.spec.ts:49](../../tooling/release/e2e/xero-disconnect.spec.ts#L49) | synthetic identity or role |
| [tooling/release/e2e/xero-import-observer.test.ts:11](../../tooling/release/e2e/xero-import-observer.test.ts#L11) | synthetic identity or role |
| [tooling/release/e2e/xero-import-observer.ts:48](../../tooling/release/e2e/xero-import-observer.ts#L48) | synthetic identity or role |
| [tooling/release/e2e/xero-provider-oracle.test.ts:66](../../tooling/release/e2e/xero-provider-oracle.test.ts#L66) | synthetic identity or role |
| [tooling/release/e2e/xero-provider-oracle.ts:78](../../tooling/release/e2e/xero-provider-oracle.ts#L78) | synthetic identity or role |
| [tooling/release/e2e/xero-publication-probe.test.ts:91](../../tooling/release/e2e/xero-publication-probe.test.ts#L91) | synthetic identity or role |
| [tooling/release/e2e/xero-readonly-assertions.test.ts:275](../../tooling/release/e2e/xero-readonly-assertions.test.ts#L275) | synthetic identity or role |
| [tooling/release/e2e/xero-readonly-assertions.ts:324](../../tooling/release/e2e/xero-readonly-assertions.ts#L324) | synthetic identity or role |
| [tooling/release/list-failed-stripe-events.ts:9](../../tooling/release/list-failed-stripe-events.ts#L9) | synthetic identity or role |
| [tooling/release/manifest-fixtures.test.ts:24](../../tooling/release/manifest-fixtures.test.ts#L24) | synthetic identity or role |
| [tooling/release/manifest-fixtures.ts:53](../../tooling/release/manifest-fixtures.ts#L53) | synthetic identity or role |
| [tooling/release/write-protected-manifest.test.ts:13](../../tooling/release/write-protected-manifest.test.ts#L13) | synthetic identity or role |
| [tooling/release/xero-fixture-cleanup.test.ts:10](../../tooling/release/xero-fixture-cleanup.test.ts#L10) | synthetic identity or role |
| [tooling/release/xero-fixture-cleanup.ts:9](../../tooling/release/xero-fixture-cleanup.ts#L9) | synthetic identity or role |

### Every mocked auth-module reference


80 additional `vi.mock`, `vi.doMock` or `vi.importActual` references target these auth modules. They are not included in the 147 declaration total.

| Source | Module |
| --- | --- |
| [apps/api/__tests__/availability-routes.test.ts:4](../../apps/api/__tests__/availability-routes.test.ts#L4) | `@repo/auth/helpers` |
| [apps/api/app/api/notifications/stream/route.test.ts:12](../../apps/api/app/api/notifications/stream/route.test.ts#L12) | `@repo/auth/helpers` |
| [apps/api/app/api/support/github-issue/route.test.ts:13](../../apps/api/app/api/support/github-issue/route.test.ts#L13) | `@repo/auth/helpers` |
| [apps/api/app/api/sync/dispatch/route.test.ts:19](../../apps/api/app/api/sync/dispatch/route.test.ts#L19) | `@repo/auth/helpers` |
| [apps/api/app/api/xero/oauth/callback/route.test.ts:1](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L1) | `@repo/auth/helpers` |
| [apps/api/app/api/xero/oauth/callback/route.test.ts:29](../../apps/api/app/api/xero/oauth/callback/route.test.ts#L29) | `@repo/auth/server` |
| [apps/api/app/api/xero/oauth/start/route.test.ts:10](../../apps/api/app/api/xero/oauth/start/route.test.ts#L10) | `@repo/auth/helpers` |
| [apps/app/__tests__/sign-in.test.tsx:9](../../apps/app/__tests__/sign-in.test.tsx#L9) | `@repo/auth/components/sign-in` |
| [apps/app/__tests__/sign-up.test.tsx:13](../../apps/app/__tests__/sign-up.test.tsx#L13) | `@repo/auth/components/sign-up` |
| [apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts:15](../../apps/app/app/(authenticated)/analytics/leave-reports/_actions.test.ts#L15) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx:1](../../apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx#L1) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx:18](../../apps/app/app/(authenticated)/analytics/out-of-office/page.test.tsx#L18) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/calendar/page.test.tsx:25](../../apps/app/app/(authenticated)/calendar/page.test.tsx#L25) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/calendar/page.test.tsx:28](../../apps/app/app/(authenticated)/calendar/page.test.tsx#L28) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx:57](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx#L57) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx:74](../../apps/app/app/(authenticated)/feeds/@modal/(.)[feedId]/page.test.tsx#L74) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx:57](../../apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx#L57) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx:73](../../apps/app/app/(authenticated)/feeds/[feedId]/page.test.tsx#L73) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/feeds/_actions.test.ts:37](../../apps/app/app/(authenticated)/feeds/_actions.test.ts#L37) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/feeds/new/page.test.tsx:1](../../apps/app/app/(authenticated)/feeds/new/page.test.tsx#L1) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/feeds/new/page.test.tsx:15](../../apps/app/app/(authenticated)/feeds/new/page.test.tsx#L15) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/feeds/page.test.tsx:57](../../apps/app/app/(authenticated)/feeds/page.test.tsx#L57) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/feeds/page.test.tsx:74](../../apps/app/app/(authenticated)/feeds/page.test.tsx#L74) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/layout.test.tsx:17](../../apps/app/app/(authenticated)/layout.test.tsx#L17) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/layout.test.tsx:18](../../apps/app/app/(authenticated)/layout.test.tsx#L18) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/leave-approvals/_actions.test.ts:28](../../apps/app/app/(authenticated)/leave-approvals/_actions.test.ts#L28) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts:34](../../apps/app/app/(authenticated)/leave-approvals/account-scope.test.ts#L34) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/notifications/_actions.test.ts:18](../../apps/app/app/(authenticated)/notifications/_actions.test.ts#L18) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/notifications/page.test.tsx:15](../../apps/app/app/(authenticated)/notifications/page.test.tsx#L15) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/notifications/page.test.tsx:24](../../apps/app/app/(authenticated)/notifications/page.test.tsx#L24) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/people/_actions.test.ts:28](../../apps/app/app/(authenticated)/people/_actions.test.ts#L28) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/people/manager-assignment-action.test.ts:10](../../apps/app/app/(authenticated)/people/manager-assignment-action.test.ts#L10) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/people/new/_actions.integration.test.ts:13](../../apps/app/app/(authenticated)/people/new/_actions.integration.test.ts#L13) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/people/new/_actions.test.ts:18](../../apps/app/app/(authenticated)/people/new/_actions.test.ts#L18) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/people/page.test.tsx:11](../../apps/app/app/(authenticated)/people/page.test.tsx#L11) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/people/page.test.tsx:14](../../apps/app/app/(authenticated)/people/page.test.tsx#L14) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/plans/_actions.test.ts:63](../../apps/app/app/(authenticated)/plans/_actions.test.ts#L63) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/plans/company-routing.test.ts:24](../../apps/app/app/(authenticated)/plans/company-routing.test.ts#L24) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/plans/page-server.test.tsx:74](../../apps/app/app/(authenticated)/plans/page-server.test.tsx#L74) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/plans/record-form-data.test.tsx:24](../../apps/app/app/(authenticated)/plans/record-form-data.test.tsx#L24) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/public-holidays/_actions.test.ts:73](../../apps/app/app/(authenticated)/public-holidays/_actions.test.ts#L73) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/public-holidays/_actions.test.ts:77](../../apps/app/app/(authenticated)/public-holidays/_actions.test.ts#L77) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/public-holidays/page.test.tsx:1](../../apps/app/app/(authenticated)/public-holidays/page.test.tsx#L1) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/public-holidays/page.test.tsx:53](../../apps/app/app/(authenticated)/public-holidays/page.test.tsx#L53) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts:67](../../apps/app/app/(authenticated)/settings/audit-log/_actions.test.ts#L67) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/billing/page.test.tsx:24](../../apps/app/app/(authenticated)/settings/billing/page.test.tsx#L24) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/settings/billing/page.test.tsx:28](../../apps/app/app/(authenticated)/settings/billing/page.test.tsx#L28) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/coverage/_actions.test.ts:68](../../apps/app/app/(authenticated)/settings/coverage/_actions.test.ts#L68) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/feeds/_actions.test.ts:68](../../apps/app/app/(authenticated)/settings/feeds/_actions.test.ts#L68) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/feeds/page.test.tsx:57](../../apps/app/app/(authenticated)/settings/feeds/page.test.tsx#L57) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/settings/feeds/page.test.tsx:76](../../apps/app/app/(authenticated)/settings/feeds/page.test.tsx#L76) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/general/_actions.test.ts:19](../../apps/app/app/(authenticated)/settings/general/_actions.test.ts#L19) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:23](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L23) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts:63](../../apps/app/app/(authenticated)/settings/integrations/xero/_actions.test.ts#L63) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:36](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L36) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts:76](../../apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.test.ts#L76) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts:1](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts#L1) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts:33](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.test.ts#L33) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts:17](../../apps/app/app/(authenticated)/settings/integrations/xero/shared-connection.integration.test.ts#L17) | `@repo/auth/node_modules/@clerk/nextjs/dist/esm/server/index.js` |
| [apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts:70](../../apps/app/app/(authenticated)/settings/leave-approval/_actions.test.ts#L70) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/setup/_actions.test.ts:68](../../apps/app/app/(authenticated)/setup/_actions.test.ts#L68) | `@repo/auth/server` |
| [apps/app/app/(authenticated)/sync/_actions.test.ts:57](../../apps/app/app/(authenticated)/sync/_actions.test.ts#L57) | `@repo/auth/helpers` |
| [apps/app/app/(authenticated)/sync/_actions.test.ts:74](../../apps/app/app/(authenticated)/sync/_actions.test.ts#L74) | `@repo/auth/server` |
| [apps/app/app/(setup)/onboarding/_actions.test.ts:26](../../apps/app/app/(setup)/onboarding/_actions.test.ts#L26) | `@repo/auth/server` |
| [apps/app/app/(setup)/onboarding/page.test.tsx:76](../../apps/app/app/(setup)/onboarding/page.test.tsx#L76) | `@repo/auth/server` |
| [apps/app/app/(setup)/welcome/_actions.test.ts:69](../../apps/app/app/(setup)/welcome/_actions.test.ts#L69) | `@repo/auth/server` |
| [apps/app/app/(setup)/welcome/page.test.tsx:57](../../apps/app/app/(setup)/welcome/page.test.tsx#L57) | `@repo/auth/helpers` |
| [apps/app/app/(setup)/welcome/page.test.tsx:76](../../apps/app/app/(setup)/welcome/page.test.tsx#L76) | `@repo/auth/server` |
| [apps/app/app/actions/availability/manual.test.ts:13](../../apps/app/app/actions/availability/manual.test.ts#L13) | `@repo/auth/server` |
| [apps/app/app/actions/settings/invite-member.test.ts:9](../../apps/app/app/actions/settings/invite-member.test.ts#L9) | `@repo/auth/server` |
| [apps/app/app/actions/settings/remove-member.test.ts:10](../../apps/app/app/actions/settings/remove-member.test.ts#L10) | `@repo/auth/server` |
| [apps/app/app/actions/settings/revoke-tokens.test.ts:10](../../apps/app/app/actions/settings/revoke-tokens.test.ts#L10) | `@repo/auth/server` |
| [apps/app/app/actions/settings/update-member-role.test.ts:10](../../apps/app/app/actions/settings/update-member-role.test.ts#L10) | `@repo/auth/server` |
| [apps/app/app/actions/settings/update-org.test.ts:12](../../apps/app/app/actions/settings/update-org.test.ts#L12) | `@repo/auth/server` |
| [apps/app/lib/auth/require-page-role.test.ts:8](../../apps/app/lib/auth/require-page-role.test.ts#L8) | `@repo/auth/server` |
| [apps/app/lib/server/require-active-org-page-context-scope.test.ts:12](../../apps/app/lib/server/require-active-org-page-context-scope.test.ts#L12) | `@repo/auth/helpers` |
| [apps/app/lib/server/require-active-org-page-context.test.ts:15](../../apps/app/lib/server/require-active-org-page-context.test.ts#L15) | `@repo/auth/helpers` |
| [packages/availability/src/people/current-user-account-scope.test.ts:30](../../packages/availability/src/people/current-user-account-scope.test.ts#L30) | `@repo/auth/server` |
| [packages/availability/src/people/current-user-service.test.ts:22](../../packages/availability/src/people/current-user-service.test.ts#L22) | `@repo/auth/server` |
| [packages/jobs/src/handlers/reconcile-xero-approval-state.test.ts:35](../../packages/jobs/src/handlers/reconcile-xero-approval-state.test.ts#L35) | `@repo/auth/server` |


## 9. Documentation and UI copy

### Documentation catalogue, including historical plans and tasks

Method: enumerate `git ls-files -z`; search case-insensitive literal `clerk` in tracked text; exclude path components `.git`, `node_modules`, `.next`, `generated`, `vendor`, and skip non-example environment files without opening them. The full scoped scan found **567 files and 6,739 matching lines**. A matching line is counted once even if it contains multiple occurrences. Documentation means `.md`, `.mdx`, `.txt` or `.rst`. It includes prose, code examples and Clerk-based identifiers such as `clerk_org_id`.

**28 documentation files, 391 matching lines**. All are Markdown. The catalogue below is exhaustive for that definition and tracked working-tree scope. It includes 7 files under `docs/superpowers/plans`, 5 under `docs/superpowers/specs`, 5 report files, the Xero call-path audit, both task files, and root/package documents. No tracked `plans/` files were present. `CLAUDE.md` imports AGENTS rather than spelling Clerk, and therefore has zero literal matches.

| Documentation file | Matching lines | Exact line catalogue |
|---|---:|---|
| `.design-sync/NOTES.md` | 1 | 9 |
| `AGENTS.md` | 43 | 124, 191, 209, 212, 220-222, 225-229, 236-237, 243, 245, 255-256, 260, 266, 269, 279, 284, 288, 290, 294, 331, 335, 354, 383, 385, 402, 422-423, 450, 477-479, 485, 497-498, 540, 562 |
| `PRODUCT.md` | 50 | 123, 139, 145-146, 149-150, 156, 159-161, 169-171, 179-180, 200, 265, 269-270, 324, 333, 371, 383, 385, 389, 433, 459, 467, 471, 475, 495, 499, 519, 522-523, 527, 547, 636, 752-754, 760, 766, 792-793, 796, 804, 810, 846, 856 |
| `README.md` | 15 | 55, 64, 79, 96, 112, 145, 147-148, 151, 217-218, 256, 276, 286, 306 |
| `SECURITY.md` | 1 | 75 |
| `ScreenCatalogue.md` | 36 | 32, 70, 91, 158, 166, 207, 209, 213, 215, 229, 231, 235, 237, 247-248, 251, 253, 257, 259, 261, 297, 405, 426, 431, 433, 663, 665, 698, 802, 842, 844, 873, 902, 947, 949, 1003 |
| `apps/app/lib/server/README.md` | 10 | 4, 13, 28, 42, 48, 59, 65, 67, 73, 77 |
| `docs/reports/2026-10-07-xero-final-architecture-audit.md` | 2 | 223, 231 |
| `docs/reports/2026-10-07-xero-http-simplification.md` | 1 | 107 |
| `docs/reports/2026-10-07-xero-incremental-sync.md` | 1 | 30 |
| `docs/reports/2026-10-08-xero-architecture-audit.md` | 3 | 145, 173, 204 |
| `docs/reports/2026-10-08-xero-http-follow-up.md` | 1 | 83 |
| `docs/superpowers/plans/2026-10-07-xero-simplification.md` | 7 | 9, 16, 65, 142, 156, 197, 281 |
| `docs/superpowers/plans/2026-10-09-bundled-public-holidays.md` | 4 | 18, 90, 138, 146 |
| `docs/superpowers/plans/2026-10-09-calendar-feeds.md` | 3 | 9, 20, 66 |
| `docs/superpowers/plans/2026-10-09-dashboard-redesign.md` | 4 | 17, 47, 206, 215 |
| `docs/superpowers/plans/2026-10-09-onboarding.md` | 12 | 9, 20, 70-75, 77, 91, 94, 158 |
| `docs/superpowers/plans/2026-10-10-xero-multi-company.md` | 32 | 5, 13, 15, 27-28, 40-41, 44, 50, 56, 63, 75, 77, 103, 108, 110, 114, 118, 122-123, 125, 132-133, 172, 179, 184, 186, 213, 235-236, 249-250 |
| `docs/superpowers/plans/2026-10-12-tenant-transaction-per-request.md` | 36 | 5, 19, 98, 144, 147, 151, 153-155, 165, 172-173, 184, 194, 199, 202, 260, 275, 342, 346, 367, 369, 380, 388, 427, 440, 455-456, 479, 481, 504, 507, 517, 554, 568, 606 |
| `docs/superpowers/specs/2026-10-07-xero-simplification-design.md` | 9 | 26, 79, 92, 103, 118, 124, 129, 136, 204 |
| `docs/superpowers/specs/2026-10-09-bundled-public-holidays-design.md` | 2 | 94, 100 |
| `docs/superpowers/specs/2026-10-09-calendar-feeds-design.md` | 1 | 139 |
| `docs/superpowers/specs/2026-10-09-onboarding-design.md` | 7 | 10-11, 37, 55, 71, 83, 158 |
| `docs/superpowers/specs/2026-10-11-tenant-database-round-trips-options.md` | 16 | 9, 17-18, 20, 60, 70, 102, 107, 112-113, 117, 119, 129, 144, 150, 210 |
| `docs/xero-call-path-audit.md` | 23 | 3, 13-15, 17-18, 22-23, 25, 27, 31, 40-42, 46, 48-50, 56, 58-59, 65, 67 |
| `packages/database/QUERIES.md` | 41 | 8, 17, 20-21, 24, 27, 38, 45, 51, 65, 78, 86, 92, 106, 112, 126, 132, 138, 153, 160, 165, 178, 181, 184, 187, 207, 211, 236, 254-255, 261, 268, 276, 285, 288, 292, 305, 309, 312, 323, 331 |
| `tasks/lessons.md` | 1 | 90 |
| `tasks/todo.md` | 29 | 3, 50, 160, 222, 291, 421, 441, 463, 693, 721, 893, 905, 949, 1030, 1032, 1054, 1077, 1079, 1083, 1089, 1097, 1140, 1154, 1161, 1163, 1195, 1219, 1226, 1293 |

Current design and source-of-truth implications: `AGENTS.md`, `PRODUCT.md` and `README.md` explicitly make Clerk Organisations the account boundary, membership/role provider and billing anchor. `ScreenCatalogue.md` describes Clerk-driven authentication and organisation/account controls. `packages/database/QUERIES.md` embeds the Clerk tenant key in query examples. Historical documents and tasks retain earlier verification claims and open work; they are not current-runtime proof. In particular, [tasks/todo.md:260-301](../../tasks/todo.md#L260) records a dated preview review, while [README.md:306](../../README.md#L306) links `docs/early-access-admission.md`, which is absent from tracked files in this checkout. The missing linked runbook is recorded as a documentation gap, not recreated in this audit.


### UI copy and returned messages mentioning Clerk

Literal Clerk-facing copy appears in these source locations. Imports, property names, comments and implementation-only identifiers are excluded from this table. The exhaustive TSX candidate search additionally found 48 non-test TSX files and 342 Clerk matching lines, most of which are tenant identifiers rather than visible copy.

| File | Lines | Copy/surface |
|---|---|---|
| `apps/app/app/(authenticated)/people/people-client.tsx` | 354,671,709,825 | Reconcile Clerk access button and dialog title; failure to load the access review; one-to-one email matches linked to their Clerk account |
| `apps/app/app/(authenticated)/plans/page.tsx` | 235 | Empty-state description: Clerk account could not be linked to a single person profile |
| `apps/app/app/(authenticated)/settings/general/general-client.tsx` | 115 | Account name is managed in Clerk; fixed account slug |
| `apps/app/app/(authenticated)/settings/integrations/integrations-client.tsx` | 50,61 | Xero shared at the Clerk Organisation level; payroll organisations in this Clerk Organisation |
| `apps/app/app/(authenticated)/settings/integrations/xero/matches/matches-client.tsx` | 71,96 | Enter Clerk user ID to link; Link to Clerk user |
| `apps/web/app/security/page.tsx` | 55,96,101-102,168,187 | Clerk-authenticated routes; identity and membership; Clerk Organisation tenancy and processing; service-provider list |
| `apps/web/src/data/changelog.ts` | 107 | Multi-tenant architecture with Clerk Organisation isolation |
| `apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts` | 154 | Validation message requests the Clerk user ID or a linked candidate person |
| `packages/availability/src/people/clerk-access-service.ts` | 506 | Fallback returned error: failed to evaluate Clerk access |
| `packages/availability/src/people/current-user-service.ts` | 268 | Ambiguous-match returned error: multiple people match the Clerk user's email |
| `apps/api/app/api/xero/oauth/start/route.ts` | 44 | JSON error: missing Clerk organisation ID |
| `packages/core/src/support-submission.ts` | 177 | Formatted support-message label: Clerk organisation ID |
| `packages/xero/src/oauth/service.ts` | 186 | Returned validation error: selected Xero tenant does not match this Clerk organisation country |

The table contains **13 files and 23 matching lines**: 6 TSX files/16 lines of literal UI copy, one marketing data file/one line, five returned-message files/five lines, and one support formatter/one line. Two additional database invariant strings contain Clerk but are infrastructure errors, not established user-visible UI copy: [packages/database/src/tenant-db.ts:51,96](../../packages/database/src/tenant-db.ts#L51). Logs in [apps/api/app/webhooks/auth/route.ts:332,342,374,417,423,443](../../apps/api/app/webhooks/auth/route.ts#L332) and [apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts:296](../../apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts#L296) also mention Clerk but are not UI copy.


## 10. Deployment and domains


| App | Hosting evidence | Documented production origin | Local template origin | Preview evidence |
|---|---|---|---|---|
| `apps/app` | [apps/app/vercel.json:1-5](../../apps/app/vercel.json#L1), Vercel schema and Bun runtime | `https://app.teamcalendar.online/`, [README.md:85](../../README.md#L85); source fallback [apps/web/src/lib/auth-link-values.ts:1](../../apps/web/src/lib/auth-link-values.ts#L1) | `http://localhost:3000`, [apps/app/.env.example:30](../../apps/app/.env.example#L30), dev port [apps/app/package.json:8](../../apps/app/package.json#L8) | Recorded app preview `https://teamcalendar-bunuguuqw-hiltonb.vercel.app`, [tasks/todo.md:265-270](../../tasks/todo.md#L265) |
| `apps/api` | [apps/api/vercel.json:1-11](../../apps/api/vercel.json#L1), Vercel schema, Bun runtime, daily keep-alive cron | `https://api.teamcalendar.online/`, [README.md:86](../../README.md#L86) | `http://localhost:3002`, [apps/api/.env.example:29](../../apps/api/.env.example#L29), dev port [apps/api/package.json:8-9](../../apps/api/package.json#L8) | Recorded API preview `https://teamcalendar-dc53hdt7e-hiltonb.vercel.app`, [tasks/todo.md:267-270](../../tasks/todo.md#L267) |
| `apps/web` | [apps/web/vercel.json:1-5](../../apps/web/vercel.json#L1), Vercel schema and Bun runtime | `https://teamcalendar.online/`, [README.md:87](../../README.md#L87) | `http://localhost:3001`, [apps/web/.env.example:13](../../apps/web/.env.example#L13), dev port [apps/web/package.json:8](../../apps/web/package.json#L8) | No concrete web preview hostname was established by tracked configuration reviewed here |

These are repository declarations and historical records. **Current deployed domains, DNS, TLS, Clerk instance domains, project bindings, environment values and deployment health are NOT VERIFIED by this audit.** [tasks/todo.md:265-270](../../tasks/todo.md#L265) records the app/API previews as READY at commit `c2a3a60120e6ee4a1c446b17325a678e3d97bcb9` in a 21 October review; that is dated evidence, not a live recheck. The same review records a failed Preview preflight, including absent API Clerk webhook-secret metadata ([tasks/todo.md:283-301](../../tasks/todo.md#L283)). Do not treat older statements about missing local linkage at lines 217-224 as current provider evidence; the review explicitly supersedes those findings at lines 262-263.

Shared URL configuration is `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL` and `NEXT_PUBLIC_DOCS_URL` ([packages/next-config/keys.ts:7-14,21-27](../../packages/next-config/keys.ts#L7)), with environment classification and Vercel origin metadata at lines 11-13,25-33,42-46. All three `.env.example` files provide the same local app/web/API origins. These templates are not environment observations. No tracked `.vercel/project.json` exists in root or app directories.

Web auth redirects in [apps/web/next.config.ts:7-10,15-36](../../apps/web/next.config.ts#L7) route `/sign-in`, `/login`, `/sign-up` and `/register` to the configured app origin. [apps/web/src/lib/auth-link-values.ts:14-29](../../apps/web/src/lib/auth-link-values.ts#L14) defaults to the production app origin and rejects localhost-like origins when Vercel environment is production; previews can use an explicit preview app URL. This function selects an origin, not a Clerk custom domain.

App CSP permits Clerk development/production domains and derives a custom Clerk frontend origin from the publishable-key hostname ([apps/app/proxy.ts:6-27,47-89](../../apps/app/proxy.ts#L6)). This establishes support for key-derived frontend origins; it does not establish which hostname or Clerk instance is configured. The public app route matcher also permits `/__clerk(.*)` ([apps/app/proxy.ts:29-34](../../apps/app/proxy.ts#L29)). No publishable key was decoded and no actual Clerk frontend origin was inspected.


## Risks

1. **Account and user identity mapping:** 30 models carry account IDs; People and match resolution store Clerk user links, and 17 additional actor/recipient/user columns store provider identity without a `clerk_` prefix. Preserve account/company separation, provenance, notification ownership and foreign-key scope while mapping identities. No local membership or users table currently replaces Clerk.
2. **Isolation is a database contract:** explicit tenant filters, `app.clerk_org_id`, 29 RLS policies, five composite relations and the manager-account SECURITY DEFINER function must agree. Replacing imports alone leaves the current tenant boundary and privileged discovery paths intact. Historical migrations also retain removed Clerk-bearing objects and require an explicit replay strategy.
3. **Roles have several mechanisms:** exact `requireRole`, hierarchical page guards, session-role comparisons, navigation allowlists and normalised plain domain roles differ. `org:member` is a type-only production literal, not a granted viewer fallback; `org:superuser` is tested as unknown. Preserve owner protections, account membership and manager/report visibility.
4. **Provider-hosted UI and admission:** sign-in, invitation acceptance, mandatory organisation choice, account profile, member invites/removal and email matching depend on Clerk components/API shapes. Preserve invite-only admission and disabled personal accounts. [README.md:306](../../README.md#L306) links a missing tracked `docs/early-access-admission.md`, so that runbook could not be inventoried.
5. **Webhook parity:** seven events drive analytics and Person links. User deletion and membership-role updates do not perform the same local side effects as membership deletion; organisation deletion is ignored. Signed delivery, event timestamps, retryable provisioning failures, partial provisioning and analytics deduplication need explicit migration treatment.
6. **Cross-origin auth:** manual sync sends a Clerk session bearer token; SSE and Xero OAuth navigation use different browser/session paths. Key-derived Clerk frontend origins, `__clerk` proxy routes, CSP, CORS and app/API host configuration must remain coherent across local, Preview and Production.
7. **Background identity:** Inngest authenticates independently while carrying account/company and optional actor IDs. Reconciliation recipient discovery still calls Clerk; its owner/admin membership read has limit 100 without pagination. Other member surfaces also use bounded membership lists, while the access-review service paginates. Remapping users must preserve pending events, recipient links and queued email.
8. **Billing, analytics and external identity:** account IDs are stored in subscription/usage records and Stripe routing metadata, analytics groups, support messages, feed identity inputs and job/audit provenance. Changing an identity namespace without preserving these associations can alter billing, notification access and calendar identity.
9. **Configuration and tooling:** runtime key validation is optional and normalises blank strings, whereas documented conventions require absence and production preflight checks presence. Preflight does not prove credential validity, instance pairing, webhook registration or domain readiness. Turbo loose mode has no explicit Clerk cache-key env list. Tests mock provider contracts in many places; browser release tooling requires real controlled accounts and Clerk testing support.
10. **Evidence gaps:** production origins and the recorded app/API Preview URLs are repository evidence, not a live deployment inventory. No current web Preview hostname, DNS/TLS state, Clerk dashboard configuration, live token acceptance or webhook health was established. Historical Preview preflight findings cannot establish current absence of keys.

## File counts per area

Counts are distinct files within each row; rows overlap and must not be summed. Import counts refer to parsed declarations rather than textual mentions. The literal Clerk scan is case-insensitive and counts each matching source line once. Tests/catalogues also include `@repo/auth` and synthetic identity patterns that need not contain the word Clerk.

| Area | Files | Basis |
|---|---:|---|
| Import/re-export/type-query declarations | 109 | 147 declarations: 133 production, 14 test; 100 production files and 9 test files |
| clerkClient constructions | 11 | 12 production constructions; injected service API methods also catalogued |
| Direct org:* production role checks | 71 | 203 literal operands/arguments; six requested role strings tabulated |
| Database schema | 1 | 32 explicit Clerk columns, 40 index/unique objects, five composite relations |
| Clerk-matching migration SQL | 15 | 182 literal matching lines; linked historical drop migrations are additional context |
| Database runtime/source with Clerk matches | 27 | Raw SQL call sites and ORM helpers catalogued; generated source excluded |
| Database fixture files with Clerk matches | 4 | Includes live fixture support |
| Database seed/scripts with Clerk matches | 3 | Seed identity and scoped verification scripts |
| Database tests with literal Clerk matches | 40 | Broader synthetic-identity test catalogue can include additional files |
| Webhook implementation | 1 | Seven consumed event types |
| Explicit app-to-API Clerk bearer sender | 1 | Manual sync dispatch; separate SSE and OAuth paths described |
| Inngest registered function implementations | 10 | Ten functions, plus shared client/events/access/lifecycle/recovery support |
| Test/fixture/release identity catalogue | 285 | 61 mocked-module files, 278 synthetic-identity files, 58 helper-mock files, 16 SDK/key/browser-global files; overlapping categories |
| Documentation with literal Clerk matches | 28 | 391 matching lines, excluding this new inventory |
| Visible/returned/support copy | 13 | 23 matching source lines |
| Direct Clerk dependency manifests | 2 | Three direct packages; lockfile separate |
| Deployment app configuration | 3 | Three vercel.json files; templates/README/tasks supply origin evidence |
| All tracked literal Clerk matches | 567 | 6739 matching lines across all file types |

Tracked literal Clerk matches by repository area:

| Area | Files | Matching lines |
|---|---:|---:|
| `(root files)` | 9 | 191 |
| `.design-sync` | 2 | 2 |
| `apps/api` | 30 | 331 |
| `apps/app` | 148 | 1214 |
| `apps/web` | 5 | 11 |
| `docs/reports` | 5 | 8 |
| `docs/superpowers` | 12 | 133 |
| `docs/xero-call-path-audit.md` | 1 | 23 |
| `packages/auth` | 12 | 52 |
| `packages/availability` | 100 | 1861 |
| `packages/billing` | 1 | 11 |
| `packages/core` | 4 | 16 |
| `packages/database` | 93 | 1174 |
| `packages/design-system` | 1 | 1 |
| `packages/feeds` | 23 | 473 |
| `packages/jobs` | 37 | 508 |
| `packages/next-config` | 3 | 7 |
| `packages/notifications` | 12 | 159 |
| `packages/observability` | 3 | 9 |
| `packages/xero` | 36 | 399 |
| `tasks` | 2 | 30 |
| `tooling/release` | 28 | 126 |
| Total | 567 | 6739 |
