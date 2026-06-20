# Server Helpers

This directory contains server-only helpers for authenticated app routes. These
helpers establish the Clerk Organisation and LeaveSync organisation context that
pages need before calling domain services.

All files import `server-only` or are intended for server contexts. Do not import
them from Client Components.

## Current Pattern

Server pages should resolve the active organisation first, then call the relevant
domain service or query with both `clerkOrgId` and `organisationId`.

```typescript
import { listAvailabilityRecords } from "@repo/availability";
import { requireActiveOrgPageContext } from "@/lib/server/require-active-org-page-context";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const context = await requireActiveOrgPageContext(org);

  const records = await listAvailabilityRecords({
    clerkOrgId: context.clerkOrgId,
    organisationId: context.organisationId,
  });

  // Render with already-scoped data.
}
```

## Live Files

### `require-active-org-page-context.ts`

Use this from Server Components that need an active organisation. It accepts the
optional `org` query value, validates it when present, otherwise falls back to the
selected Clerk Organisation and ensures a default LeaveSync organisation exists.

It returns:

```typescript
{
  clerkOrgId,
  organisationId,
  orgQueryValue,
  orgSource,
}
```

Invalid or inaccessible organisation context calls `notFound()`.

### `get-active-org-context.ts`

Validates a supplied `organisationId` against the authenticated Clerk
Organisation. Use it when a route already has an explicit organisation id and
needs a `Result` instead of page-level `notFound()` handling.

### `ensure-default-organisation.ts`

Creates or resolves the default LeaveSync organisation for a Clerk Organisation.
It is used by `requireActiveOrgPageContext` when no `org` query value is present
and the current Clerk Organisation does not yet have a LeaveSync organisation.

### `load-onboarding-state.ts`

Loads the onboarding checklist state for setup surfaces. This is the only
remaining page-shaped loader in this directory. It scopes every query by both
`clerkOrgId` and `organisationId`.

## Rules

1. Resolve `clerkOrgId` and `organisationId` before loading tenant data.
2. Pass both ids to domain services and database queries.
3. Prefer `requireActiveOrgPageContext()` for page routes.
4. Keep Xero, availability, and feed behaviour in their domain packages.
5. Keep Client Components data-free; pass already-scoped data from server code.
