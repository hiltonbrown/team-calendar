# Tenant-Safe Read Services

This document describes the tenant-safe read query services implemented in `packages/database/src/queries/`.

## Overview

All read services follow these principles:
- **Tenant isolation**: All queries filter by both `accountId` and `organisationId`
- **Type safety**: Return `Result<T, AppError>` types from `@repo/core`
- **No throwing**: Expected failures (not found, cross-org access denied) return error results, not exceptions
- **Named exports only**: Each service exports functions, never defaults

## Modules

### `organisations.ts`

Manages Account and Organisation entities.

```typescript
// List all organisations for a Account
listOrganisationsByAccount(accountId: AccountId): Promise<Result<OrganisationData[]>>

// Get a specific organisation within scope
getOrganisationById(accountId: AccountId, organisationId: OrganisationId): Promise<Result<OrganisationData>>
```

**Tenant scoping**: Filtered by `accountId` and `organisationId`.

---

### `people.ts`

Manages people and team members.

```typescript
// List people for an organisation with optional filters
listPeopleForOrganisation(
  accountId: AccountId,
  organisationId: OrganisationId,
  filters?: { teamId?: string; locationId?: string; isActive?: boolean }
): Promise<Result<PersonData[]>>

// Get a person profile with team and location relations
getPersonProfile(
  accountId: AccountId,
  organisationId: OrganisationId,
  personId: PersonId
): Promise<Result<PersonData & { team: {...} | null; location: {...} | null }>>
```

**Tenant scoping**: Filtered by `accountId` and `organisationId`.

**Exported types**:
- `PersonData`: Core person attributes

---

### `availability-records.ts`

Manages availability entries (leave, WFH, training, travel, client site).

```typescript
// List availability for calendar view with date range and optional filters
listAvailabilityForCalendar(
  accountId: AccountId,
  organisationId: OrganisationId,
  dateRange: { startDate: Date; endDate: Date },
  filters?: {
    recordTypes?: string[];
    sourceTypes?: string[];
    publishStatus?: string;
    personIds?: PersonId[];
  }
): Promise<Result<AvailabilityRecordData[]>>

// List all availability for a specific person in a date range
listAvailabilityForPerson(
  accountId: AccountId,
  organisationId: OrganisationId,
  personId: PersonId,
  dateRange: { startDate: Date; endDate: Date }
): Promise<Result<AvailabilityRecordData[]>>

// List pending (submitted) approval records
listPendingApprovalRecords(
  accountId: AccountId,
  organisationId: OrganisationId,
  filters?: { personIds?: PersonId[]; recordTypes?: string[] }
): Promise<Result<AvailabilityRecordData[]>>
```

**Tenant scoping**: Filtered by `accountId` and `organisationId`. Date range filtering is implemented with `startsAt` <= `endDate` and `endsAt` >= `startDate`.

**Exported types**:
- `AvailabilityRecordData`: Includes all record metadata and status

---

### `leave-balances.ts`

Manages leave balance data from Xero.

```typescript
// List leave balances for a person
listLeaveBalancesForPerson(
  accountId: AccountId,
  organisationId: OrganisationId,
  personId: PersonId
): Promise<Result<LeaveBalanceData[]>>
```

**Tenant scoping**: Filtered by `accountId`, `organisationId`, and `person_id`.

**Exported types**:
- `LeaveBalanceData`: Balance including leave type ID and balance amount

---

### `feeds.ts`

Manages calendar feeds and their configuration.

```typescript
// List all feeds for an organisation
listFeedsForOrganisation(
  accountId: AccountId,
  organisationId: OrganisationId
): Promise<Result<FeedData[]>>

// Get complete feed detail with scopes and tokens
getFeedDetail(
  accountId: AccountId,
  organisationId: OrganisationId,
  feedId: FeedId
): Promise<Result<FeedDetailData>>
```

**Tenant scoping**: Filtered by `accountId` and `organisation_id`.

**Exported types**:
- `FeedData`: Basic feed metadata
- `FeedDetailData`: Extended with scopes (team, location, person rules) and tokens (with expiry/revoke info)

---

### `notifications.ts`

Manages in-app notifications.

```typescript
// List notifications for a user with optional filters
listNotificationsForUser(
  accountId: AccountId,
  userId: string,
  filters?: { isRead?: boolean; types?: string[] }
): Promise<Result<NotificationData[]>>

// Count unread notifications for a user
countUnreadNotifications(
  accountId: AccountId,
  userId: string
): Promise<Result<number>>
```

**Tenant scoping**: Filtered by `accountId` and `recipient_user_id`.

**Exported types**:
- `NotificationData`: Includes type, payload, read status

---

### `teams.ts`

Team coverage minimums and counts-only coverage reads.

```typescript
// Teams with their coverage minimum and active headcount
listTeamsWithCoverageMinimum(input: { accountId; organisationId }): Promise<Result<TeamCoverageMinimumRow[]>>

// Set or clear (null) one team's minimum; pass a transaction client to join a caller's transaction
setTeamCoverageMinimum(input: { accountId; organisationId; teamId; minimum }, client?): Promise<Result<TeamCoverageMinimumChange>>

// People away per team and day (approved, non-archived records of active people); numbers only
countAwayPeopleByTeamAndDay(input: { accountId; organisationId; teamIds; from; to; timezone; awayRecordTypes }): Promise<Result<Map<teamId, Map<dateKey, number>>>>
```

**Tenant scoping**: Filtered by `accountId` and `organisationId`, on records and on the people they belong to. A team from another tenant is `not_found`.

---

## Using These Services

### From apps/app

Import query functions directly from the queries submodule:

```typescript
// Server Component or API Route
import {
  listPeopleForOrganisation,
  getPersonProfile,
  listAvailabilityForCalendar,
} from "@repo/database/queries/people";
import { requireAccount } from "@repo/auth";
import type { OrganisationId } from "@repo/core";

export default async function TeamPage({ organisationId }: { organisationId: OrganisationId }) {
  const accountId = requireAccount();
  
  const peopleResult = await listPeopleForOrganisation(
    accountId,
    organisationId
  );
  
  if (!peopleResult.ok) {
    throw new Error(peopleResult.error.message);
  }
  
  return (
    <div>
      {peopleResult.value.map(person => (
        <div key={person.id}>{person.firstName} {person.lastName}</div>
      ))}
    </div>
  );
}
```

### Error Handling

All query functions return `Result<T, AppError>` where `AppError` has:
- `code`: One of `"bad_request" | "not_found" | "unauthorised" | "forbidden" | "conflict" | "internal"`
- `message`: Human-readable error description

```typescript
const result = await getPersonProfile(accountId, organisationId, personId);

if (!result.ok) {
  switch (result.error.code) {
    case "not_found":
      // Person doesn't exist or is outside org scope
      break;
    case "internal":
      // Database error
      break;
  }
}
```

## Tenant Scoping Enforcement

Every query enforces dual scoping:

1. **Primary boundary**: `accountId` from `(await getSession())?.accountId`
2. **Secondary boundary**: `organisationId` for data within that Account

Example from `organisations.ts`:
```typescript
const organisation = await database.organisation.findFirst({
  where: {
    accountId,        // Primary: prevent cross-account access
    organisationId      // Secondary: access only specific org
  }
});
```

This prevents:
- User from Account A accessing data from Account B
- User from accessing organisations they don't belong to
- Cross-organisation data leakage

## Integration with apps/app

The authenticated app (`apps/app`) should:

1. Always obtain `accountId` from `requireAccount()` or `getAccountId()`
2. Obtain `organisationId` from user context (e.g., org switcher selection)
3. Pass both to all query functions
4. Never construct queries directly using Prisma client

Example flow:
```typescript
// app/app/(authenticated)/layout.tsx
import { requireAccount } from "@repo/auth";
import { useOrganization } from "@clerk/nextjs";

export default function AuthLayout() {
  const accountId = requireAccount(); // Server-side enforcement
  const { organization } = useOrganization(); // Client-side context
  
  return (
    <OrganisationProvider accountId={accountId} organisation={organization}>
      <Outlet />
    </OrganisationProvider>
  );
}

// app/app/(authenticated)/people/page.tsx
"use client";
import { useContext } from "react";
import { OrganisationContext } from "./context";
import { listPeopleForOrganisation } from "@repo/database/queries/people";

export default function PeoplePage() {
  const { accountId, organisationId } = useContext(OrganisationContext);
  const [people, setPeople] = useState([]);
  
  useEffect(() => {
    listPeopleForOrganisation(accountId, organisationId).then(result => {
      if (result.ok) setPeople(result.value);
    });
  }, [accountId, organisationId]);
  
  return <PeopleList data={people} />;
}
```

## Test Strategy

Tests for these services should verify:

1. **Valid queries return data**: Happy path with correct scoping
2. **Cross-org access is denied**: Queries with mismatched `accountId` and `organisationId` return `not_found`
3. **Isolation holds under filters**: Filtered queries still respect org boundaries
4. **Empty results are valid**: Queries on orgs with no matching data return empty arrays, never throw

See `availability_records.test.ts` in the repo root for the existing test pattern.

## Xero persistence

Use `getScopedXeroConnection({ accountId, organisationId, connectionId? })` to resolve customer access, then its canonical `authorisation` relation. `xero_authorisations` is system scoped and unique per verified app/user. Never expose grants directly across account boundaries or copy tokens into connections or OAuth sessions. `advanceXeroSyncCursor` performs monotonic completed-provider watermark updates scoped to both keys and connection ID. Balances and regional leave roster progress belongs on `XeroConnection`, distinct from provider timestamps. Only AU employees and V2 leave support modification-watermark deltas; full or incremental completion and all relevant upserts must succeed before cursor commit. Initial-import completion compares the event `requestedAt` with `initial_sync_requested_at`, preventing an older job from completing a newer reconnect request.

`OutboundOperation` is the sole remote leave write journal for approve, decline and withdraw. Stable UUID keys, exact request identity and the five-minute replay cutoff are persisted before dispatch; attempt generation protects leave-operation finalisation. Customer queries and compare-and-set updates always apply both tenancy keys. Customer DTOs expose connection/sync health and safe recovery information, never token envelopes or raw authorisation access.
