# Plan 160: Prove the approved AU leave flow against Xero and record the result

> **Executor instructions**: Follow this plan step by step. Run every
> verification and confirm the expected result before moving on. If a STOP
> condition occurs, stop and report; do not improvise. When done, update the
> Plan 160 row in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 3b825e5..HEAD -- packages/database/src/live-campaign-fixture.ts packages/database/src/xero-campaign-store.ts packages/xero/src/au packages/availability apps/app/app/\(authenticated\)/leave-approvals apps/app/app/\(authenticated\)/plans .github/workflows/ci.yml
> ```
>
> If any of these files changed, compare the excerpts below against the live
> code. On a mismatch, treat it as a STOP condition.

## Status

- **Status**: IN PROGRESS (rescoped 3 October 2026)
- **Priority**: P1
- **Effort**: M
- **Risk**: MED. Step 4 writes real leave into Xero's Demo Company (AU).
- **Category**: tests, correctness verification
- **Planned at**: commit `3b825e5`, 2026-10-03
- **Depends on**: `plans/160-au-transition-contract-v1.md` (approved, implemented). Steps 3 to 6 also depend on the campaign-sentinel decision under "Blocking dependency" below. Operator inputs in Step 3.

## Why this matters

Leave approved in Team Calendar now creates real payroll leave in Xero
(`au-contract-v1`). That path has never run end to end against Xero. Unit tests,
fixture tests and the protected integration runner all pass or fail without a
real provider. This plan runs the approved AU flow once through the real UI
against the authorised demo payroll company, then records what happened in a
short, sanitised report.

## What changed in this rescope, and why

The previous version of this plan targeted a 26-scenario, 92-subcase, 40-charter-case
campaign with an execution lease, worker fencing, causal receipt producers and a
cryptographic evidence bundle. About 22,000 lines of harness exist under
`tooling/release/` and none of it has run a single provider case. On 2 October the
user stopped further campaign tooling and asked for the AU flow to be proved
through the real UI first. This plan follows that decision:

- **Kept**: the AU flow, its provider readbacks, scoped cleanup and an honest report.
- **Frozen, not extended**: `tooling/release/run-xero-e2e.ts`, `xero-scenarios.ts`,
  `xero-campaign-collector.ts`, `xero-ledger.ts`, `xero-report.ts` and the
  `tooling/release/e2e/` specs. Do not add drivers, leases or producers to them.
  Their existing tests must keep passing.
- **Deferred to `plans/go-live.md`**: fresh OAuth connect, scheduled-sync proof,
  multi-entity, reconnect/disconnect, token-refresh observation, PITR restore and
  the Plan 161 charter matrix. They remain NOT VERIFIED. This plan does not claim them.

The three execution diaries (`160-execution-review.md`, `160-completion-review.md`,
`160-execution-prerequisites.md`) are retired to git history at `3b825e5`. The
facts from them that still matter are below.

## Current state

**Merged in main** (all at or before `3b825e5`):

- `37b4818`: approved AU workflow. Submit is local; manager approval creates scheduled
  leave in Xero synchronously, recorded as outbound operation action `approve`.
- `9ed5f12`, `7431c27`: repairs for the 12 jobs integration failures seen in protected
  run `4740964c` (Prisma spy race, NZ pagination timeout, approval-reconciliation
  fixtures aged out of the 90-day window; dates are now relative to `Date.now()`).
  **Never replayed** against a database.
- `2588d97`: decline copy for local AU leave.
- Live database has all 23 migrations, including `20261002000000_approval_create_operation`.

**CI is red on main.** Every CI run on `main` since `42bb840` (27 September) has failed.
At `3b825e5` the `Run integration tests` step fails six `packages/xero` suites
with `Campaign fixture requires the protected online test runner`. The guard:

```typescript
// packages/database/src/live-campaign-fixture.ts:41-50
export async function initialiseLiveCampaignFixture(fixture: LiveTestFixture) {
  assertTestDatabaseConnectionAllowed();
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.ALLOW_LIVE_DATABASE_TESTS !== "I_ACKNOWLEDGE_LIVE_MUTATION"
  ) {
    throw new Error(
      "Campaign fixture requires the protected online test runner"
    );
  }
```

These suites are protected-runner suites by design. After that guard,
`initialiseLiveCampaignFixture` also reads the `TC_RELEASE_MANIFEST` file, queries
`current_setting('neon.project_id')` and related Neon settings (which do not exist on
plain PostgreSQL), requires `release:active-run` keys in Redis, and builds a
`XeroCampaignStore`, whose constructor rejects any non-`https:` URL
(`xero-campaign-store.ts`, near line 190). CI's store is `http://localhost:8079`.
`packages/database/xero-campaign.integration.test.ts:73-76` separately throws
`Protected manifest absent` without `TC_RELEASE_MANIFEST`. Making them run in CI would
mean rebuilding the protected environment inside CI. They are not CI suites.

Turbo stops at the first failing package, so suites in `packages/jobs` and
`packages/database` that call the same fixture have probably never been observed in CI
either. Find them all with:

```bash
grep -rln "initialiseLiveCampaignFixture\|TC_RELEASE_MANIFEST" --include="*.integration.test.ts" packages apps
```

At `3b825e5` this lists ten or more files across `packages/jobs`, `packages/xero` and
`packages/database`.

**Known operational gaps** (observed 2 October; re-check, do not trust):

- Vercel environments lack `XERO_APP_TIER`, `XERO_RATE_NAMESPACE_EPOCH` and
  `XERO_CREDENTIAL_DOMAIN_ID`. Without them Xero admission fails closed, locally and
  probably in Production.
- Clerk development instance has only `org:admin` and `org:member` roles. The user
  approved creating `org:manager`, `org:viewer` and four dedicated dev users
  (admin, manager, employee, viewer), plus two Clerk user links and one reporting
  relationship on two demo people. None of this has been created.
- The single stored Xero connection's access token expired 25 September 2026 and has
  no canonical credential-owner row. A refresh may succeed; a UI reconnect may be needed.

**Blocking dependency: the campaign sentinel.** Every ordinary authenticated server
action (manual availability in `apps/app/app/(authenticated)/plans/_actions.ts`, leave
approvals, Xero settings) is wrapped by `withAuthenticatedXeroCampaignAction`
(`apps/app/lib/server/xero-campaign-action.ts`), which calls
`withXeroCampaignScopedInvocation` (`packages/database/src/xero-campaign-access.ts:1052`).
That reads `XeroCampaignStore.readOrganisation`, which throws `XeroCampaignDeniedError`
when KV holds no campaign sentinel for `XERO_CREDENTIAL_DOMAIN_ID`
(`xero-campaign-store.ts`, `snapshot`, near line 250). The only writer of the sentinel is
`initialiseXeroCampaign` (`xero-campaign-access.ts:509`), and no application code or
operator script calls it. Users then see "This action is temporarily unavailable. Try
again later." Production still runs `42bb840`, which predates this wrapping.

Steps 3 to 6 cannot run until one of these is decided by the user:
(a) remove the campaign gate from ordinary production actions, in its own plan
(recommended; see `plans/README.md`); or (b) add a reviewed operator command that
initialises the sentinel per environment. Do not hand-write Redis keys.

**User authority for provider writes** (recorded 2 October): Demo Company (AU) only;
the seven employees in the private fixture proposal; at most 20 new leave requests
dated 2 to 6 November 2026; approve, decline and withdraw those new requests only.
Existing leave and connection deletion are excluded. Exact IDs live in the private
fixture proposal under `.cache/` and are never copied into tracked files.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test` | exit 0 |
| Harness tests (frozen) | `bun run test:release-tools` | exit 0 |
| Integration gate | CI `Run integration tests` step on the pushed branch | green |
| Protected live integration | `TURBO_CONCURRENCY=1 bun --env-file=<private-run-env> ./tooling/release/run-live-integration.ts --manifest <fresh-private-db-manifest> --evidence-dir <private-evidence-dir>` | all suites pass, cleanup PASS |
| Single test file | `bunx vitest run <path>` | pass |

Never run `bun run test:integration` locally. It sets `ALLOW_LOCAL_DATABASE_TESTS=1`
and `.env.local` points at live Neon. Integration runs only in CI (localhost
containers) or through the protected runner (live Neon, per the 27 September user
instruction in `plans/README.md`).

## Scope

**In scope**:
- The protected-only integration suites found by the Step 1 grep (gating lines only).
- `packages/database/src/live-campaign-fixture.ts` (a new exported predicate only) and
  its existing test `packages/database/src/live-campaign-fixture.test.ts`.
- `reports/xero-e2e/<YYYY-MM-DD>-au-flow.md` (create).
- `plans/README.md` Plan 160 row.

**Out of scope**:
- Any production behaviour in `xero-campaign-access.ts`, server actions, jobs or `packages/xero`.
  If the AU flow exposes a product defect, record it and STOP; the fix gets its own plan.
- The frozen harness listed above.
- Vercel configuration, deployments, Clerk changes and provider writes outside the
  recorded authority. Step 3 is an operator checklist, not executor work.

## Git workflow

Branch `fix/160-ci-integration-gate` for Step 1. Conventional commits, for example
`test: run campaign fixture suites only under the protected runner`. Push only to get the CI
result, and only if the operator allows it. Do not merge.

## Steps

### Step 1: Make CI's integration gate green

Gate the protected-only suites so they skip visibly outside the protected runner,
instead of crashing CI. Do not change what they assert.

1. In `packages/database/src/live-campaign-fixture.ts`, export
   `isProtectedLiveRun(): boolean`, true only when `NODE_ENV === "test"`,
   `ALLOW_LIVE_DATABASE_TESTS === "I_ACKNOWLEDGE_LIVE_MUTATION"` and
   `TC_RELEASE_MANIFEST` is set. Leave `initialiseLiveCampaignFixture` unchanged.
2. In each file from the Current state grep, wrap the top-level `describe` with
   `describe.skipIf(!isProtectedLiveRun())` and move any top-level fixture or manifest
   work into `beforeAll` inside it, so that nothing runs at import time when skipped.
   Keep every `it` and assertion byte-for-byte.
3. Add two cases to the existing `packages/database/src/live-campaign-fixture.test.ts`:
   the predicate is false with no flags, and false with the flag but no manifest path.

**Verify**: `bunx vitest run packages/database/src/live-campaign-fixture.test.ts` passes.
`bun run check` and `bun run typecheck` exit 0. `grep -c "skipIf(!isProtectedLiveRun())"`
across the grep's files equals the number of files the grep listed. Push the branch:
the CI `Test` job is green, and its log shows those suites as skipped. If CI then
fails an unrelated suite, fix only test-environment causes. A product failure is a STOP.

### Step 2: Replay the protected live integration once

Run the protected runner (command above) at the Step 1 commit. This replays
`9ed5f12` and `7431c27` against live Neon, as the user's live-database policy requires.

**Verify**: runner reports all suites passed, cleanup PASS, owned selectors empty
and lease released. Record run ID, test count and pass/fail count in the README row.
If the 12 previously failing jobs tests fail again, STOP and report the names and
first assertion error of each.

### Step 3: Operator prerequisites (human, not executor)

The operator confirms each item and records yes/no in the README row. Steps 4 to 6
do not start until all are yes.

- [ ] The campaign-sentinel blocking dependency is resolved (option a or b).
- [ ] Local `.env.local` has `XERO_APP_TIER=starter`, a local-only
      `XERO_CREDENTIAL_DOMAIN_ID` UUID and `XERO_RATE_NAMESPACE_EPOCH`, and the namespace is
      initialised (user removed the 24-hour hold on 2 October):
      `bun run --cwd packages/xero rate:initialise-namespace --credential-domain-id <uuid> --epoch <epoch> --allow-immediate-admission --acknowledge-unknown-prior-usage`.
      Check: saving a manual availability entry in the local app succeeds.
- [ ] Clerk dev roles `org:manager`, `org:viewer` and the four approved dev users exist,
      with the approved person links and reporting relationship.
- [ ] The demo Xero connection works: the app's Xero settings page shows it connected
      and a manual sync reads employees. If not, reconnect through the UI.
- [ ] The connected Xero organisation name is `Demo Company (AU)`, read live.
- [ ] The user accepts that approved leave which Xero refuses to withdraw (see Step 4,
      row 7) may stay in the demo company, or names an approved removal method.

### Step 4: Run the AU flow through the real UI

Use the local dev servers (`bun run dev`) and the four dev users. Every request uses
one of the seven approved employees and dates 2 to 6 November 2026.

Local dev writes to the live Neon database, which Production also uses. Only the demo
organisation's records may change. Before the first action, record:
- the demo organisation's `availability_records` ids overlapping 2 to 6 November;
- in Xero's own UI (Demo Company (AU), Payroll, Leave), each approved employee's leave
  for 2 to 6 November.

Write budget for Steps 4 and 5 together: at most 10 Xero writes (creates, rejects).
Keep a running count. Each action is attempted once; never retry a refused provider call.

For each row, perform the action in the UI, then read back:
- **local**: `select id, approval_status, source_remote_id, xero_write_error from availability_records where id = $1 and clerk_org_id = $2;`
  and `select action, status, known_remote_id from outbound_operations where availability_record_id = $1;`
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

**Verify**: every row's observed local and provider state matches the table, or the
mismatch is recorded as a FAIL with the readback output. Write count is at most 10.

### Step 5: Clean up

Locally submitted requests have no Xero record: decline or withdraw them in the app
(no provider call). Approved requests are removed only by the app's withdraw (a
provider reject), once each, within the remaining write budget. Re-read each provider ID. List anything that remains
in Xero (expected: approved leave Xero refused to withdraw in row 7), with ID alias
and reason. Remove the temporary Clerk links and reporting relationship only if the
operator asks; restore their recorded before-values.

**Verify**: every created local record is `declined`, `withdrawn` or listed as
accepted residue. No change to leave outside the run's IDs: compare both
before-lists recorded at the start of Step 4 with the current state.

### Step 6: Write the report

Create `reports/xero-e2e/<YYYY-MM-DD>-au-flow.md` with: commit SHA, date, environment
(local dev servers, live Neon, Demo Company (AU)), the Step 4 table with an
observed column and PASS/FAIL per row, provider write count, residue list, and an
explicit "Not covered" list copied from "Deferred to go-live" above. Use aliases
(`employee-1`, `leave-a`) instead of real names, Xero IDs, emails or feed URLs.

**Verify**: `grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-|@|https?://' reports/xero-e2e/*-au-flow.md`
returns nothing, then read the file once by eye for names. `git diff --check` exits 0.

## Done criteria

- [ ] CI `Test` job green on the Step 1 commit.
- [ ] Protected live integration run passes at that commit; run ID in the README row.
- [ ] All nine Step 4 rows recorded with PASS or FAIL and readback evidence.
- [ ] Cleanup done; residue explicitly listed or none.
- [ ] `reports/xero-e2e/<date>-au-flow.md` exists and passes the Step 6 check.
- [ ] Plan 160 row in `plans/README.md` updated: DONE if every row passed, otherwise
      BLOCKED with the failing rows named.

## STOP conditions

- The connected Xero organisation is not `Demo Company (AU)`.
- A provider write would exceed 20 requests, use dates outside 2 to 6 November 2026,
  or touch leave the run did not create.
- Approval produces two provider applications, or an `approve` operation stuck in an
  uncertain state. Do not retry; the contract requires administrator recovery.
- The write count would exceed 10, or a provider call is refused and the next step would retry it.
- Any fix appears to need production code (`xero-campaign-access.ts`, actions, jobs,
  `packages/xero`). Record it; it needs its own plan.
- Step 1 seems to require weakening the protected runner path.

## Maintenance notes

- If the campaign control plane is removed, the protected-only suites gated in Step 1
  go with it. Do not keep them alive independently.
- `tooling/release/` campaign harness is frozen. Deleting it is a separate decision;
  until then its tests stay in `test:release-tools`.
- Re-run Step 4 rows 2 and 7 after any change to `packages/xero/src/au/write.ts`.
