# Plan 160: Verify the AU leave flow in Xero

> Follow the steps in order and check each result before continuing. Stop and
> report if a STOP condition occurs. Update the Plan 160 row in `plans/README.md`
> with the result.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 604d754..HEAD -- packages/database/src/live-campaign-fixture.ts packages/database/src/xero-campaign-store.ts packages/database/xero-campaign.integration.test.ts packages/jobs/src/handlers packages/xero/src/au packages/xero/src/oauth packages/xero/src/rate-limit packages/availability apps/app/app/\(authenticated\)/leave-approvals apps/app/app/\(authenticated\)/plans .github/workflows/ci.yml
> ```
>
> If any of these files changed, check the affected steps against the current
> code. Stop if their assumptions or safety requirements no longer hold.

## Status

- **Status**: TODO from Step 1; Steps 3 to 6 BLOCKED (reconciled 4 October 2026)
- **Priority**: P1
- **Effort**: M
- **Risk**: MED. Step 4 writes real leave into Xero's Demo Company (AU).
- **Category**: tests, correctness verification
- **Planned at**: commit `604d754`, 2026-10-04
- **Depends on**: `plans/160-au-transition-contract-v1.md` (approved, implemented). Steps 3 to 6 also depend on the campaign-sentinel decision under "Blocker" below. Operator inputs in Step 3.

## Purpose

Verify local AU submission, manager approval and the resulting Xero leave through
Team Calendar's UI in Demo Company (AU). Record local and provider results,
clean up the test requests and write a sanitised report. Live verification is
still pending.

## Scope decision

The following harness files are frozen: `tooling/release/run-xero-e2e.ts`,
`xero-scenarios.ts`, `xero-campaign-collector.ts`, `xero-ledger.ts`, `xero-report.ts`
and the `tooling/release/e2e/` specs. Do not add drivers, leases or evidence
producers. Keep their existing tests passing.

Fresh OAuth connection, scheduled sync, multiple payroll entities, reconnect,
disconnect, token refresh, PITR restore and the Plan 161 lifecycle matrix belong
to `plans/go-live.md`. They remain NOT VERIFIED.

## Current state

Ordinary CI supplies localhost PostgreSQL/HTTP Redis and
`ALLOW_LOCAL_DATABASE_TESTS`. Campaign fixtures require the protected live
runner, acknowledgement and manifest. Step 1 must separate these suites from
ordinary CI without changing their assertions or weakening the fixture checks.

These suites are protected-runner suites by design. After that guard,
`initialiseLiveCampaignFixture` also reads the `TC_RELEASE_MANIFEST` file, queries
`current_setting('neon.project_id')` and related Neon settings (which do not exist on
plain PostgreSQL), requires `release:active-run` keys in Redis, and builds a
`XeroCampaignStore`, whose constructor rejects any non-`https:` URL
(`xero-campaign-store.ts`, near line 190). CI's store is `http://localhost:8079`.
`packages/database/xero-campaign.integration.test.ts:73-76` separately throws
`Protected manifest absent` without `TC_RELEASE_MANIFEST`. These suites require
the protected runner and must be skipped in ordinary CI.

Discover the protected suites before editing:

```bash
rg -l 'initialiseLiveCampaignFixture|TC_RELEASE_MANIFEST' --glob '*.integration.test.ts' packages apps
```

Use the returned file list. Check environment settings, Clerk roles, user links
and the demo connection through the Step 3 checklist before execution.

**Blocker: the campaign sentinel.** Ordinary authenticated server actions
(manual availability in `apps/app/app/(authenticated)/plans/_actions.ts`, leave
approvals and Xero settings) are wrapped by `withAuthenticatedXeroCampaignAction`
(`apps/app/lib/server/xero-campaign-action.ts`), which calls
`withXeroCampaignScopedInvocation` (`packages/database/src/xero-campaign-access.ts:1052`).
That reads `XeroCampaignStore.readOrganisation`, which throws `XeroCampaignDeniedError`
when KV holds no campaign sentinel for `XERO_CREDENTIAL_DOMAIN_ID`
(`xero-campaign-store.ts`, `snapshot`, near line 250). The ordinary application path has
no reviewed operator initialisation command.
`initialiseXeroCampaign` and the protected test fixture can establish sentinels, but
protected test initialisation is not permission to initialise an application namespace.
Without the sentinel, users see "This action is temporarily unavailable. Try
again later."

Steps 3 to 6 cannot run until one of these is decided by the user:
(a) remove the campaign gate from ordinary production actions, in its own plan
(recommended; tracked under go-live X2); or (b) add a reviewed operator command that
initialises the sentinel per environment. Do not hand-write Redis keys.

**User authority for provider writes** (recorded 2 October): Demo Company (AU) only;
the seven employees in the private fixture proposal; at most 20 new leave requests
dated 2 to 6 November 2026; approve, decline and withdraw those new requests only.
Existing leave and connection deletion are excluded. Exact IDs live in the private
fixture proposal under `.cache/` and are never copied into tracked files.

## Verification commands

| Purpose | Command | Expected |
| --- | --- | --- |
| Lint | `bun run check` | exit 0 |
| Types | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test` | exit 0 |
| Harness tests (frozen) | `bun run test:release-tools` and `bun run typecheck:release-tools` | both exit 0 |
| Integration gate | CI `Run integration tests` step on the candidate pull request | green |
| Protected live integration | `TURBO_CONCURRENCY=1 bun --env-file=<private-run-env> ./tooling/release/run-live-integration.ts --manifest <fresh-private-db-manifest> --evidence-dir <private-evidence-dir>` | all suites pass, cleanup PASS |
| Single test file | `bunx vitest run <path>` | pass |

Never run `bun run test:integration` locally. It sets `ALLOW_LOCAL_DATABASE_TESTS=1`
and does not authorise Neon access. Integration runs only in CI (localhost
containers) or through the protected runner (live Neon).

## Scope

**In scope**:

- The protected-only integration suites found by the Step 1 `rg` discovery
  (discovery gating and necessary hook placement only).
- `packages/database/src/live-campaign-fixture.ts` (a new exported predicate only) and
  its existing test `packages/database/src/live-campaign-fixture.test.ts`.
- `reports/xero-e2e/<YYYY-MM-DD>-au-flow.md` (create).
- `plans/README.md` Plan 160 row.

**Out of scope**:

- Any production behaviour in `xero-campaign-access.ts`, server actions, jobs or `packages/xero`.
  If the AU flow exposes a product defect, record it and STOP; the fix gets its own plan.
- The frozen harness listed above.
- Vercel configuration, deployments, Clerk changes and provider writes outside the
  recorded authority. Step 3 is an operator checklist, not code implementation. Steps 4 and 5 require
  the recorded provider authority plus the verified prerequisites.

## Git workflow

Branch `fix/160-ci-integration-gate` for Step 1. Conventional commits, for example
`test: run campaign fixture suites only under the protected runner`.
The workflow runs for pull requests targeting `main` and pushes to `main`; a feature
branch push alone does not trigger it. With publication authorised, use a candidate
pull request targeting `main` and capture its exact SHA and run result. Do not merge
or push directly to `main` to obtain verification.

## Steps

### Step 1: Make CI's integration gate green

Skip protected-only suites outside the protected runner and show the skips in
CI output. Preserve their assertions.

1. In `packages/database/src/live-campaign-fixture.ts`, export
   `isProtectedLiveRun(): boolean`, true only when `NODE_ENV === "test"`,
   `ALLOW_LIVE_DATABASE_TESTS === "I_ACKNOWLEDGE_LIVE_MUTATION"` and
   `TC_RELEASE_MANIFEST` is set. Leave `initialiseLiveCampaignFixture` unchanged.
2. In each file from the Current state `rg` discovery, wrap the top-level `describe` with
   `describe.skipIf(!isProtectedLiveRun())` and move any top-level fixture or manifest
   work into `beforeAll` inside it. Move file-level `beforeAll`, `afterAll`,
   `beforeEach` and `afterEach` into the gated suite as well, preserving hook order
   and the initialisation-before-mutation requirement. Several fixture hooks are
   currently after the suite; gating `describe` alone leaves them active. Pure
   allocation helpers may remain outside only if they perform no I/O or mutation.
   Preserve test cases and assertions; do not skip ordinary localhost suites.
3. Add cases to the existing `packages/database/src/live-campaign-fixture.test.ts`:
   the predicate is false with no flags, with wrong acknowledgement or `NODE_ENV`,
   and with the acknowledgement but absent/empty manifest path; it is true only
   with all three inputs. Restore stubbed environment after each case. This is a
   discovery predicate only: manifest validation and write admission stay in the
   unchanged fixture, so a present invalid manifest must still fail the protected run.

**Verify**: `bunx vitest run packages/database/src/live-campaign-fixture.test.ts` passes.
`bun run check`, `bun run typecheck`, `bun run test`, `bun run test:release-tools`
and `bun run typecheck:release-tools` exit 0. Review all discovered files for
ungated hooks and import-time I/O. Check hook placement, not just the number of
`skipIf` calls.
The candidate PR CI `Test` job must be green, including `bun run test:integration`,
and its log must identify the protected suites as skipped while ordinary
integration suites execute. Record candidate SHA, CI run reference and skip inventory.
If CI exposes an unrelated failure, record it and STOP. Keep unrelated repairs outside this plan.

### Step 2: Replay the protected live integration once

Run the protected runner (command above) at the Step 1 commit. The previous
protected run had 12 jobs test failures. Their repairs still need a database replay.

**Verify**: runner reports all suites passed, cleanup PASS, owned selectors empty
and lease released. Record run ID, test count and pass/fail count in the README row.
If any test fails, STOP and report its name and first assertion error.

### Step 3: Operator checks

The operator confirms each item and records yes/no in the README row. Steps 4 to 6
do not start until all are yes.

- [ ] The campaign-sentinel blocking dependency is resolved (option a or b), with
      reviewed namespace authority and read-back evidence. Clearing an action gate
      does not waive worker/consumer isolation or protected live database admission.
- [ ] The exact UI run has reviewed ownership, before-values, active-consumer
      isolation and scoped cleanup/restoration evidence. If the only applicable
      route still refuses with `worker-isolation-unavailable`, keep this run
      NOT VERIFIED and STOP. Direct Playwright or manual UI use is not a bypass.
- [ ] Local `.env.local` has `XERO_APP_TIER=starter`, a local-only
      `XERO_CREDENTIAL_DOMAIN_ID` UUID and `XERO_RATE_NAMESPACE_EPOCH`, and the namespace is
      initialised:
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
organisation's records may change under the Step 3 authority. STOP before mutation
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
observed column and PASS/FAIL/NOT VERIFIED per row, provider write count, residue list, and an
explicit "Not covered" list of the work assigned to go-live under Scope decision. Use aliases
(`employee-1`, `leave-a`) instead of real names, Xero IDs, emails or feed URLs.

**Verify**: `rg -n '[0-9a-f]{8}-[0-9a-f]{4}-|@|https?://' reports/xero-e2e/*-au-flow.md`
has no matches (exit 1), then read the report for identifying names. If it exits 2
(or higher), fix the command/input error; that is not a clean sanitisation check. `git diff --check` exits 0.

## Done criteria

- [ ] CI `Test` job green on the Step 1 commit.
- [ ] Protected live integration run passes at that commit; run ID in the README row.
- [ ] All nine Step 4 rows recorded with PASS, FAIL or NOT VERIFIED and their evidence boundary.
- [ ] Cleanup done; residue explicitly listed or none.
- [ ] `reports/xero-e2e/<date>-au-flow.md` exists and passes the Step 6 check.
- [ ] Plan 160 row in `plans/README.md` updated: DONE if every row passed, otherwise
      BLOCKED with failed/unverified rows or missing prerequisites named. Any failed
      or unverified required row keeps the plan incomplete.

## STOP conditions

- The connected Xero organisation is not `Demo Company (AU)`.
- A provider write would exceed 20 requests, use dates outside 2 to 6 November 2026,
  or touch leave the run did not create.
- Approval produces two provider applications, or an `approve` operation stuck in an
  uncertain state. Do not retry; the contract requires administrator recovery.
- The write count would exceed 10, or a provider call is refused and the next step would retry it.
- Any fix appears to need production code (`xero-campaign-access.ts`, actions, jobs,
  `packages/xero`). Record it; it needs its own plan.
- Step 1 requires weakening the protected runner checks.

## Maintenance notes

- If the campaign control plane is removed, the protected-only suites gated in Step 1
  go with it. Do not keep them alive independently.
- `tooling/release/` campaign harness is frozen. Deleting it is a separate decision;
  until then its tests stay in `test:release-tools`.
- Re-run Step 4 rows 2 and 7 after any change to `packages/xero/src/au/write.ts`.
