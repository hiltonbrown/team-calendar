# Plan 015: Test SSE org broadcast, core date utils, and public-holiday projection

> **Executor instructions**: Follow step by step, running every verification
> command. If a STOP condition occurs, stop and report. Update `plans/README.md`
> when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/notifications/src/sse packages/core/index.ts packages/feeds/src/projection/feed-projection.ts`
> Compare against live code; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (test-only)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

Three untested paths, each with a concrete blast radius:

1. **Org-wide SSE broadcast** — `publishOrganisationNotificationEvent`
   (`packages/notifications/src/sse/broker.ts:88-100`) fans out to every listener
   whose stream key **ends with** `:${organisationId}`. Suffix-matching on a
   `userId:organisationId` key is the cross-tenant-leak-prone path (the security
   baseline forbids leaking notifications across org boundaries). Only the per-user
   `publishNotificationEvent` is tested.
2. **Core date utils** — `toDateOnly`, `startOfUtcDay`, `endOfUtcDay`,
   `formatDateRangeLabel` (`packages/core/index.ts:31-49`) underpin ICS `DATE`
   rendering and feed horizons. An off-by-one shifts all-day event boundaries
   across every feed. Untested.
3. **Public-holiday feed projection** — `projectPublicHolidays` /
   `holidayAppliesToLocation` (`feed-projection.ts:199-327`) apply non-trivial
   per-location jurisdiction matching. The existing projection test returns `[]`
   holidays, so this branch never runs.

## Current state

- `packages/notifications/src/sse/broker.ts:88-100` (`publishOrganisationNotificationEvent`,
  suffix match), `streamKey`, `listenerCount`. `broker.test.ts:8` covers only
  per-user delivery.
- `packages/core/index.ts:31-49` (the four date helpers). No test references them.
- `packages/feeds/src/projection/feed-projection.ts:199-327` (`projectPublicHolidays`,
  `holidayAppliesToLocation`); `feed-projection.test.ts:37` returns `[]` from
  `publicHolidayFindMany`.

## Commands you will need

| Purpose   | Command                                                       | Expected on success |
|-----------|---------------------------------------------------------------|---------------------|
| Install   | `bun install`                                                 | exit 0              |
| Tests     | `bunx vitest run packages/notifications packages/core packages/feeds` | all pass    |

## Scope

**In scope** (new/extended test files only):
- `packages/notifications/src/sse/broker.test.ts` (extend)
- `packages/core/date.test.ts` (create, or co-locate per repo convention)
- `packages/feeds/src/projection/feed-projection.test.ts` (extend)

**Out of scope**:
- Any non-test source. If a test reveals a bug, STOP and report.

## Git workflow

- Branch: `advisor/015-broadcast-date-holiday-tests`
- Conventional commits, e.g. `test(notifications): cover org-wide SSE broadcast`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Org broadcast isolation

Extend `broker.test.ts`: subscribe multiple users across **two** orgs, call
`publishOrganisationNotificationEvent({ organisationId: orgA })`, and assert that
only org-A listeners (all of them) fire and **no** org-B listener fires. Also assert
`listenerCount` correctness. Include a case with a non-UUID / edge org id to ensure
the suffix match cannot match the wrong org.

### Step 2: Core date utils

Create a test asserting `toDateOnly`, `startOfUtcDay`, `endOfUtcDay` boundaries
(including a value near a UTC day boundary) and `formatDateRangeLabel` formatting.
Cover the exact boundary that matters for all-day ICS events (start inclusive, end
handling).

### Step 3: Public-holiday projection branches

Extend `feed-projection.test.ts` with an `includes_public_holidays: true` feed and a
`publicHolidayFindMany` fixture covering each `holidayAppliesToLocation` branch:
per-location assignment override (non-working vs working), `CUSTOM`-country
inclusion, region-code mismatch exclusion, and the `id:date` dedup.

**Verify (each step)**: `bunx vitest run packages/notifications packages/core packages/feeds`
→ all pass.

## Test plan

- SSE: org-scoped fan-out (only target org fires), `listenerCount`, edge org id.
- Date: boundary correctness for the four helpers.
- Holiday projection: each location/jurisdiction branch + dedup.
- Verification: `bunx vitest run packages/notifications packages/core packages/feeds`.

## Done criteria

ALL must hold:

- [ ] Broker test proves org-A broadcast does not reach org-B listeners
- [ ] Core date util test exists and passes
- [ ] Holiday-projection test exercises each `holidayAppliesToLocation` branch
- [ ] `bunx vitest run packages/notifications packages/core packages/feeds` passes
- [ ] `bun run check` exits 0
- [ ] No non-test source modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The org broadcast leaks to another org's listeners (the suffix match is wrong) —
  report as a security finding; do not fix source here.
- A date helper produces an off-by-one at a UTC boundary — report it.

## Maintenance notes

- The SSE isolation test is the regression guard for the cross-tenant notification
  boundary; keep it green on any broker key-scheme change.
- Reviewer: confirm the broadcast test asserts the **negative** (org-B does not
  fire), which is the security-relevant assertion.
