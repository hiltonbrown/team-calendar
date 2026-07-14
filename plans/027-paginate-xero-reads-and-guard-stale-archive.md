# Plan 027: Paginate Xero reads and stop archiving leave records from a truncated fetch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/xero/src/au/read.ts packages/xero/src/read/dispatch.ts packages/jobs/src/handlers/sync-xero-leave-records.ts packages/jobs/src/handlers/sync-xero-people.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (data loss)
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

The Xero AU Payroll reads for `LeaveApplications` and `Employees` are issued with
**no pagination**, and the leave-records sync then archives every
`xero_leave` record whose remote id was **not** in the fetch result. Xero AU
Payroll v1 list endpoints return a bounded page (100 records) and require a
`page` query parameter to retrieve the rest. So for any tenant with more than a
page of leave applications, only the first page is fetched, and every other leave
record in the org is archived on **every scheduled sync**: `archived_at` set,
`include_in_feed: false`, `publish_status: "archived"`. Those records vanish from
all ICS feeds, the calendar, and approvals. The same unpaged `Employees` read
means people beyond the first page never get a `Person` row, which then makes
their leave records fail with `person_not_found`.

This is silent, recurring, tenant-wide data loss that gets worse the more real
data a customer has. Two fixes are needed and both must land: (1) paginate the
reads so the full set is fetched, and (2) make the archive step refuse to run
when the fetch was truncated, so a partial read can never destroy data even if a
future pagination regression occurs.

## Current state

- `packages/xero/src/au/read.ts:104` — `fetchLeaveRecords` GETs
  `${baseUrl()}/payroll.xro/1.0/LeaveApplications` with no `page` param and
  returns `{ leaveRecords, rawResponse }`:

```ts
// packages/xero/src/au/read.ts:127-160 (abridged)
const response = await xeroFetch({
  init: { headers: { ...Authorization, "Xero-Tenant-Id": ... }, method: "GET" },
  orgKey: orgRateLimitKey({ ... }),
  url: `${baseUrl()}/payroll.xro/1.0/LeaveApplications`,
});
// ... return { ok: true, value: { leaveRecords: mapXeroLeaveRecords(rawPayload), rawResponse: rawPayload } };
```

- `packages/xero/src/au/read.ts:38` — `fetchEmployees` has the identical shape
  against `/payroll.xro/1.0/Employees`, returning `{ employees, rawResponse }`.

- `packages/xero/src/read/dispatch.ts:45,81` — `fetchEmployeesForRegion` /
  `fetchLeaveRecordsForRegion` dispatch AU to those functions and re-declare the
  same return types.

- The destructive archive and its call site:

```ts
// packages/jobs/src/handlers/sync-xero-leave-records.ts:241-243
const stale = await archiveStaleRecords(
  context,
  fetched.map((record) => record.leaveApplicationId).filter(Boolean)
);
```

```ts
// packages/jobs/src/handlers/sync-xero-leave-records.ts:638-660 (abridged)
async function archiveStaleRecords(context, fetchedRemoteIds: string[]) {
  if (fetchedRemoteIds.length === 0) return { archived: 0, personIds: [] };
  const stale = await database.availabilityRecord.findMany({
    where: { ...scoped(context), archived_at: null,
             source_remote_id: { notIn: fetchedRemoteIds }, source_type: "xero_leave" },
    select: { id: true, person_id: true },
  });
  // ... updateMany -> archived_at/include_in_feed:false/publish_status:"archived"
}
```

- `fetched` comes from `fetchLeaveRecordsForRegion` at
  `sync-xero-leave-records.ts:182`. The employees fetch is consumed at
  `sync-xero-people.ts:160,187` (people sync does **not** archive — verify with
  `grep -n "archive" packages/jobs/src/handlers/sync-xero-people.ts`; only the
  leave-records handler has the destructive archive).

- Rate limiting: all Xero HTTP goes through `xeroFetch`
  (`packages/xero/src/rate-limit/xero-fetch.ts`) which enforces 60/min per org.
  Extra pages mean extra calls under this limiter — that is expected and handled;
  do not bypass `xeroFetch`.

- **Xero pagination contract (VERIFY before implementing — do not assume)**: Xero
  Payroll AU v1 list endpoints accept `?page=N` (1-based) and return up to 100
  items per page; an empty/short page signals the end. Confirm the exact
  parameter name, page size, and the JSON envelope key for the array using
  Context7 (`use context7` for "Xero Payroll AU LeaveApplications pagination")
  and the mappers `mapXeroLeaveRecords` / `mapXeroEmployees` (see how they read
  the payload array). If the real contract differs, adapt the loop and STOP-report
  the discrepancy so line-level details in this plan can be corrected.

- Conventions: `packages/xero` owns all Xero HTTP; functions return
  `XeroWriteResult<T>` (a `Result`); tests are co-located Vitest with fixtures.
  See `packages/xero/src/au/read.test.ts` for the fixture-based mapper test style.

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                                      | exit 0              |
| Unit test | `bunx vitest run packages/xero/src/au/read.test.ts packages/jobs/src/handlers/sync-xero-leave-records.test.ts` | all pass |
| Lint      | `bun run check`                                                          | exit 0              |

## Suggested executor toolkit

- Use Context7 (`use context7`) to confirm the Xero Payroll AU pagination
  contract before writing the loop. Do not rely on memory for the page size or
  parameter name.

## Scope

**In scope**:
- `packages/xero/src/au/read.ts` — add pagination loops to `fetchLeaveRecords`
  and `fetchEmployees`; add a `complete: boolean` to the `fetchLeaveRecords`
  return value.
- `packages/xero/src/read/dispatch.ts` — propagate the `complete` flag on the
  leave-records return type (and keep employees' shape or add `complete` there
  too if you gate anything on it — but nothing archives people, so employees only
  needs pagination, not the flag).
- `packages/jobs/src/handlers/sync-xero-leave-records.ts` — skip
  `archiveStaleRecords` when `complete === false`.
- Tests: `packages/xero/src/au/read.test.ts`,
  `packages/jobs/src/handlers/sync-xero-leave-records.test.ts`.

**Out of scope**:
- NZ/UK branches in `dispatch.ts` — leave the `unknown_error` stubs (a separate
  region-error concern, already handled by prior plan 003).
- `mapXeroLeaveRecords` / `mapXeroEmployees` mappers — do not change mapping.
- The `xeroFetch` rate limiter — reuse it as-is for each page.
- Leave-balance sync (`fetchLeaveBalances`) — it already iterates per-employee
  with its own progress/rate handling; not part of this plan.

## Git workflow

- Base branch: `preview` — all development lands on `preview`, not `main`. Create this branch from `preview` and, if you merge, merge back into `preview`. Earlier-numbered plans in this batch also land on `preview` first, so the drift-check diff may legitimately include their changes; treat a mismatch as a STOP condition only when it is not explained by an earlier plan's documented scope.
- Branch: `improve/027-xero-pagination-archive-guard`
- Conventional commits (e.g. `fix(xero): paginate AU reads and guard stale-archive against truncated fetch`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the Xero pagination contract

Using Context7 and the mappers, confirm: the query parameter (expected `page`),
the 1-based page numbering, the page size (expected 100), and how to detect the
last page (a page returning fewer than the page size, or an empty page). Write
these down. If they differ from the expectations above, STOP and report.

### Step 2: Paginate `fetchLeaveRecords` and return `complete`

Wrap the single GET in a page loop: request `?page=1`, accumulate mapped records,
request `?page=2`, and so on until a page returns fewer than the page size (or
empty). Return `{ leaveRecords: <all pages>, rawResponse: <last or first page>, complete: true }`
on a clean finish.

Before deciding what `rawResponse` should carry, check its consumers
(`grep -rn "rawResponse" packages/xero packages/jobs`). The per-record audit
payload stored in `source_payload_json` comes from the mapper's per-record
`rawPayload` (`sync-xero-leave-records.ts:578`), so each record's raw data must
be sourced from the page it appeared on — the mappers already do this per page,
so accumulating mapped records preserves it. If `rawResponse` itself turns out to
have a consumer that needs the full fetch, return an array of page payloads
instead and adjust that consumer; if it is unconsumed, the first page is fine. Set `complete: false` only if you deliberately cap the loop
(e.g. a safety max-pages guard) or a mid-loop page errors after at least one
successful page — in that case return what you have with `complete: false` rather
than failing the whole fetch, OR return the error `Result`; pick one and be
consistent. The simplest correct design: loop to exhaustion, always `complete: true`
on success; only ever set `complete: false` if you add a hard page cap. Preserve
existing error handling (auth_error / network_error / `mapXeroReadHttpError`) per
page.

Update the return type of `fetchLeaveRecords` and the AU branch of
`fetchLeaveRecordsForRegion` in `dispatch.ts` to include `complete: boolean`.

**Verify**: `bun run typecheck` → the compiler flags the sync handler's
destructure of the result; that is expected and handled in Step 4.

### Step 3: Paginate `fetchEmployees`

Apply the same page loop to `fetchEmployees`. Employees do not need a `complete`
flag (nothing archives people), so its return type can stay
`{ employees, rawResponse }` — just make it fetch all pages.

**Verify**: `bun run typecheck` → exit 0 for the employees path.

### Step 4: Guard the archive against a truncated fetch

In `sync-xero-leave-records.ts`, read `complete` from
`leaveRecordsResult.value` and pass it (or gate on it) so `archiveStaleRecords`
is **skipped entirely** when `complete === false`. Concretely, at the call site
(`:241`), only call `archiveStaleRecords` when the fetch reported `complete`;
otherwise set `counts.archived = 0` and log a warning
(`log.warn("Skipped stale-archive because the Xero leave fetch was truncated", {...})`)
using the observability logger (`import { log } from "@repo/observability/log"`).

Also keep the existing `fetchedRemoteIds.length === 0` early-return in
`archiveStaleRecords` — an empty fetch must never archive everything.

**Verify**: `bun run typecheck` → exit 0.

### Step 5: Tests

- In `read.test.ts`: a fixture test proving that when Xero returns a full first
  page then a short second page, `fetchLeaveRecords` returns the union of both
  and `complete: true`; and that a single short page returns `complete: true`.
  Mock `xeroFetch` per page (follow the existing mock style in the file).
- In `sync-xero-leave-records.test.ts`: a test proving `archiveStaleRecords` is
  **not** invoked (no records archived) when the fetch result has
  `complete: false`; and the existing archive-happy-path test still passes with
  `complete: true`.

**Verify**: `bunx vitest run packages/xero/src/au/read.test.ts packages/jobs/src/handlers/sync-xero-leave-records.test.ts` → all pass.

## Test plan

- New tests listed in Step 5 (multi-page union, complete flag true/false,
  archive skipped on truncation).
- Structural pattern: fixture-based mock of `xeroFetch` in `read.test.ts`; the
  existing archive test in `sync-xero-leave-records.test.ts`.
- Verification: the vitest command in Step 5 → all pass, plus `bun run check`.

## Done criteria

ALL must hold:

- [ ] `fetchLeaveRecords` and `fetchEmployees` request successive pages until exhaustion
- [ ] `fetchLeaveRecords` (and the AU dispatch branch) return `complete: boolean`
- [ ] `sync-xero-leave-records.ts` skips `archiveStaleRecords` when `complete === false`
- [ ] `bun run typecheck` exits 0
- [ ] New tests prove multi-page union AND archive-skipped-on-truncation
- [ ] `bunx vitest run packages/xero/src/au/read.test.ts packages/jobs/src/handlers/sync-xero-leave-records.test.ts` passes
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Xero pagination contract (Step 1) differs materially from the expectation
  (different parameter, no pagination, cursor-based) — report the real contract.
- Any excerpt in "Current state" does not match live code (drift).
- You cannot construct the archive-skip test without changing the handler's
  public shape beyond the in-scope files.
- The assumption "people sync does not archive" turns out false (grep in Step 4's
  context) — report before touching people archiving.

## Maintenance notes

- Reviewer must scrutinise the archive guard above the pagination: even if
  pagination is perfect today, "archive everything not returned by the fetch" is
  a destructive default, so `complete === false ⇒ archive nothing` is the durable
  safety net and must never be weakened.
- Extra pages increase per-run Xero calls; watch the 60/min limiter behaviour on
  the largest tenants. If throughput becomes an issue, batching/backoff belongs
  in `xeroFetch`, not here.
- If NZ/UK reads are ever implemented, they must return `complete` and honour the
  same archive guard.
