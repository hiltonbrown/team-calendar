# Plan 160: Verify the bounded AU leave flow

Reconciled on 7 October 2026 with the [approved Xero simplification](../docs/superpowers/specs/2026-10-07-xero-simplification-design.md) and [AU transition contract](160-au-transition-contract-v1.md). **All live rows are NOT VERIFIED.** Live Xero credentials are unavailable in this session. Historical source/provider observations never substitute for current-candidate evidence.

## Purpose and scope

Verify local AU submission, manager approval, remote decisions/withdrawal and the resulting Xero state through Team Calendar's real UI in Demo Company (AU). Independently read provider state, clean up the owned requests and publish a sanitised report. Preserve the nine-row bounded flow below. Fresh OAuth, complete initial import, scheduled/manual/nightly sync, reconnect, refresh, disconnect, multi-entity isolation and the wider release journey matrix belong to [go-live](go-live.md) and the approved implementation plan Task 13.

Use the surviving browser release suite and independent provider snapshot/import/publication assertions. The existing protected live database runner, fixture ownership, target/restore checks and consumer isolation remain applicable. Removed Xero control-plane tooling is not an execution prerequisite.

## 1. Verify the candidate and local integration

Run the approved candidate gates on disposable local PostgreSQL/Redis: `bun run check`, `bun run build`, `bun run typecheck`, `bun run boundaries`, `bun run test`, `bun run test:integration`, `bun run test:release-tools` and `bun run typecheck:release-tools`. Generate Prisma and deploy the full migration chain on that disposable target, then verify schema equality as required by implementation Task 13. Build precedes route-aware type checking.

Compare discovered integration suites with `tooling/release/integration-inventory.ts`; counts follow the actual registry. Preserve localhost-only guards and generic release ownership. Do not fabricate a live manifest for local CI or grant CI production credentials. Record actual command/exit/counts in `tasks/todo.md`; no PASS is claimed by this document.

## 2. Protected live integration, when authorised and available

Use `tooling/release/run-live-integration.ts` with a fresh private manifest, explicit target identity, current restore capability, observed consumer isolation, owned fixture allocation and cleanup. `ALLOW_LOCAL_DATABASE_TESTS=1` never authorises Neon access; never invoke root integration directly against live Neon.

```bash
TURBO_CONCURRENCY=1 bun --env-file=<private-run-env> ./tooling/release/run-live-integration.ts --manifest <fresh-private-db-manifest> --evidence-dir <private-evidence-dir>
```

Require all registered applicable suites, cleanup and outside-owned-data postchecks to pass, and the generic run fence to release. Record the run ID and real counts. A failure stays visible; local fixture tests do not prove provider success.

## 3. Operator prerequisites

The following recorded 2 October write authority is retained as a scope limit, not expanded by this reconciliation: Demo Company (AU) only; the seven employees in the private fixture proposal; at most 20 new leave requests dated 2 to 6 November 2026; approve, decline and withdraw only those new requests. Existing leave and connection deletion are excluded. Exact IDs stay in the private fixture proposal and never enter tracked reports.

Before any mutation, verify:

- The exact candidate and controlled role sessions agree with the protected fixture manifest and actual target. Observe current consumer isolation and scoped cleanup/restoration; missing authority or protection leaves the journey NOT VERIFIED.
- App/API configuration has the registered callback, valid encryption keyring, configured commercial `XERO_APP_TIER`, canonical authorisation and shared KV quotas. Ordinary quota keys initialise atomically; store failure denies calls.
- Granted consent supports exactly the requested `offline_access accounting.settings.read payroll.employees payroll.settings.read` capabilities. Never infer actual grants from the request string.
- The approved Clerk users, person links, reporting line and `org:manager`/`org:viewer` roles are present and scoped correctly.
- The actual connected provider file is `Demo Company (AU)` and manual full sync reaches a successful fresh terminal run with persisted rows. Queue acknowledgement is insufficient.
- An accepted residue procedure exists if scheduled leave cannot be withdrawn because it is in a pay run. This authority does not permit deleting the connection or unrelated leave.

Remote approve/decline/withdraw persist immutable UUID idempotency keys and exact request identity in `OutboundOperation`. In-request replay uses the same key only within five minutes of first dispatch, inside Xero's six-minute retention. Unknown outcomes beyond that cutoff require authoritative GET and administrator recovery; a new key or background replay cannot resolve uncertainty.

## 4. Run the AU flow through the real UI

Use the local dev servers (`bun run dev`) and the four dev users. Every request uses
one of the seven approved employees and dates 2 to 6 November 2026.

Confirm the actual database target privately before starting. If the selected target is shared/live, use its protected manifest and consumer-isolation requirements. Only the owned demo organisation's records may change under the applicable authority. STOP before mutation
if any prerequisite or applicable live-execution safety gate is unresolved. Before the first action, record:

- the demo organisation's `availability_records` ids overlapping 2 to 6 November,
  filtered by both `clerk_org_id` and `organisation_id`;
- in Xero's own UI (Demo Company (AU), Payroll, Leave), each approved employee's leave
  for 2 to 6 November.

Write budget for Steps 4 and 5 together: at most 10 Xero writes (creates, rejects).
Keep a running count. Each action is attempted once; never retry a refused provider call.

For each row, perform the action in the UI, then check:

- **local**: `select id, approval_status, source_remote_id, xero_write_error from availability_records where id = $1 and clerk_org_id = $2 and organisation_id = $3;`
  and `select action, status, known_remote_id from outbound_operations where availability_record_id = $1 and clerk_org_id = $2 and organisation_id = $3;`
- **provider**: read the employee's leave for the dates in Xero's own UI and match it
  to `source_remote_id`. This is independent of the app's own mapping code. Do not
  write a script that decrypts tokens.

| # | Actor | Action | Expected local | Expected provider |
| --- | --- | --- | --- | --- |
| 1 | employee | create draft, submit | `submitted`, no outbound row, `source_remote_id` null | nothing created (check employee's leave for the dates) |
| 2 | manager | approve row 1 | `approved`, one `approve` operation with status `completed`, `source_remote_id` set | exactly one application with that ID, matching employee, type, dates, units |
| 3 | manager | decline a new submitted request without reason | rejected inline, still `submitted` | nothing created |
| 4 | manager | decline with reason | `declined`, no outbound row | nothing created |
| 5 | employee | withdraw a new submitted request | `withdrawn`, no outbound row | nothing created |
| 6 | manager outside the reporting line (or viewer) | approve a submitted request | denied inline, unchanged | nothing created |
| 7 | employee | withdraw the approved row 2 | either `withdrawn` with provider rejected, or an inline plain-language error and still `approved` | record which; never a raw Xero error shown to the employee |
| 8 | admin | run a manual Xero sync | row 2 still one local record, no duplicate | unchanged |
| 9 | any | open the personal ICS feed URL | row 2's dates present if still approved; declined/withdrawn absent | n/a |

Double-click the approve button during row 2. Expect exactly one provider application
and one `approve` operation. A second application is a FAIL and a STOP; count it
against the budget and list it in cleanup.

**Verify**: record PASS when the local and provider results match the table. Record
FAIL for a mismatch and retain the checks privately. Missing or
unexecuted observations are NOT VERIFIED. Write count is at most 10.

## 5. Clean up

Locally submitted requests have no Xero record: decline or withdraw them in the app
(no provider call). Approved requests are removed only by the app's withdraw (a
provider reject), once each, within the remaining write budget. Re-read each provider ID. List anything that remains
in Xero (expected: approved leave Xero refused to withdraw in row 7), with ID alias
and reason. Remove the temporary Clerk links and reporting relationship only if the
operator asks; restore their recorded before-values.

**Verify**: every created local record is `declined`, `withdrawn` or listed as
accepted residue. No change to leave outside the run's IDs: compare both
before-lists recorded at the start of Step 4 with the current state.

## 6. Write the report

Create `reports/xero-e2e/<YYYY-MM-DD>-au-flow.md` with: commit SHA, date, environment
(local dev servers, live Neon, Demo Company (AU)), the Step 4 table with an
observed column and PASS/FAIL/NOT VERIFIED per row, provider write count, residue list, and an
explicit "Not covered" list of the wider release work assigned to go-live. Use aliases
(`employee-1`, `leave-a`) instead of real names, Xero IDs, emails or feed URLs.

**Verify**: `rg -n '[0-9a-f]{8}-[0-9a-f]{4}-|@|https?://' reports/xero-e2e/*-au-flow.md`
has no matches (exit 1), then read the report for identifying names. If it exits 2
(or higher), fix the command/input error; that is not a clean sanitisation check. `git diff --check` exits 0.

## Completion and stopping conditions

- Record every required row as PASS, FAIL or NOT VERIFIED with attributable local/provider evidence, candidate SHA, observed write count and cleanup/residue.
- A missing credential, unavailable entitlement, incomplete terminal run or unexecuted observation remains NOT VERIFIED. Any required failed/unverified row keeps this plan incomplete.
- Stop mutations for a foreign target/person, dates or requests outside the recorded authority, exhausted write budget, uncertain create, duplicate provider application, or unresolved fixture/consumer protection.
- Do not retry refused calls or ambiguous creates as another operation. Use the approved idempotency/recovery boundary.
- Record defects in the owning approved implementation task; do not restore removed compatibility or verification infrastructure.
- Update the plan index only from real evidence. Re-run approval and withdrawal observations after relevant AU wire-contract changes.
