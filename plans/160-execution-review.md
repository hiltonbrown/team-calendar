# Plan 160 execution review, 27 September 2026

Status: IN PROGRESS. Current documentation-verification baseline: main `514efb5`,
with merged/tested runtime `5d5889c` and local merge `f3dd965`. Initial reviewer
baseline: `d6da4e8fbab70e3135e3a7a33fd49cb0c24a91a2`. The dated initial sections
below retain their original observations; follow-up integration and updated-plan
verification appear later in this record.
User instruction: execute Plan 160, reconcile stops and continue. During the initial pass the improve advisor
did not edit source or merge the executor branch. This file records fresh observations,
separate from the historical evidence in the main plan.

## Ownership and verification sequence

- Executor: `/home/hilton/.codex/worktrees/xero-e2e-verification/teamcalendar`,
  branch `codex/xero-e2e-verification`. Correct harness defects and complete independent
  collection work; preserve refused operational admission until runtime enforcement exists.
- Online verifier: `/home/hilton/.codex/worktrees/xero-online-verification/teamcalendar`,
  frozen baseline `d6da4e8`. Refresh and run the existing protected Neon/Redis inventory
  while independent harness work proceeds. No source edits or local database provision.
- Advisor: inspect every diff hunk, meaningful regression and verification result; rerun
  criteria in the isolated executor checkout, update plan/index and render a verdict.

## Fresh operational observations

Read-only Vercel API project metadata at 02:14:00-02:14:03 UTC:

| App | Production state | Production source | Deployment |
| --- | --- | --- | --- |
| app | READY | `d6da4e8fbab70e3135e3a7a33fd49cb0c24a91a2` | `dpl_4XHuj7kWZfuzhsK7fX2dLU8JhuV9` |
| api | READY | `d6da4e8fbab70e3135e3a7a33fd49cb0c24a91a2` | `dpl_BgFT6KHAwH5Nge8Y7R5MuRiJUCDJ` |
| web | READY | `d6da4e8fbab70e3135e3a7a33fd49cb0c24a91a2` | `dpl_7SdH3Yj2yA7ngM1hZnCYYswYez69` |

This supersedes the prior older-deployment observation. READY and matching baseline
metadata do not verify a future harness candidate, effective configuration or application
behaviour. Production app/API metadata lacks `XERO_APP_TIER`,
`XERO_RATE_NAMESPACE_EPOCH`, `XERO_CREDENTIAL_DOMAIN_ID`,
`XERO_TOKEN_ENCRYPTION_ACTIVE_VERSION` and `XERO_TOKEN_ENCRYPTION_KEYS_JSON`.
Existing OAuth client, redirect and legacy encryption key names are present.

All nine app/API/web Production, Preview and Development environment pulls succeeded
at 02:14:42-02:14:53 UTC. Values were parsed in memory and never displayed or persisted
by this review. All six app/API database targets have the same password-free fingerprint
of hostname, port, role and database:
`ad57f0a29312402bf4171ffa321a9b4c88b024404f80b975a65ae1eca6677dda`.
Web has no database target. Sensitive OAuth/KV values omitted from a pull do not prove
absence; existing local configuration contains these key names and is not reproduced.

Fresh Inngest API read-back from the production signing key at 02:14:51-02:14:53 UTC:
one production environment, zero active apps, zero archived apps, zero running/queued/
paused runs. The nonterminal inventory includes a fresh explicit time range. These
observations establish unregistered-consumer metadata, not campaign worker readiness.
Refresh again at protected-run admission; do not turn them into a pause claim.

## Runtime contract boundary

Own source reads confirm `currentXeroWorkerCapability()` remains false in
`tooling/release/xero-execution-guard.ts`. `XeroSyncScope` in
`packages/jobs/src/handlers/xero-sync-access.ts` verifies Clerk/payroll tenant and binding
generation. `SyncEventSchema` in `packages/jobs/src/events.ts` and the people handler
input in `packages/jobs/src/handlers/sync-xero-people.ts` have no E2E campaign/run authority.
The existing generation fence therefore cannot establish owned campaign admission.
The ordinary database guard requires all consumers paused or strictly unregistered;
supplying a version 2 manifest cannot let workers run under version 1 observer authority.

Plan 159 remains TODO in the index; an approved AU transition decision is not supplied
by this execution instruction. The executor must document the concrete runtime handoff
and continue independent work. No deployment, activation, customer backfill, provider
payroll mutation or deletion was performed by this review.

## Review checklist

Approved discovery prerequisite: an own read of `e2e/fixture.ts` confirmed eager
`releaseEnvironment()` at module import. Permit only lazy validation inside `useRole`
before browser context creation, with no ownership or auth bypass. This small scope
extension serves Plan 160's explicit five-spec inventory requirement and is recorded
in the main plan; ordinary journey behaviour stays protected.

- [x] Read complete plan, lessons and execution workflow; check drift and source scope.
- [x] Refresh deployment metadata, all environment scopes and strict worker inventories.
- [x] Review durable recovery, no-effect proof, connection scope and output-failure changes.
- [x] Review collection provenance, terminal ordering and all catalogue accounting.
- [x] Verify current source gates, online inventory and independent cleanup evidence.
- [x] Re-render sanitised diagnostic evidence and record verdict without fabricated PASS.

Report only results supported by tool output in this session. Preserve missing/failed
checks and the distinction between source, database, application/browser/provider and
production sign-off evidence.

## Frozen source and reviewer rerun

Runtime candidate: `76a5dfb2b8c87faf27d6313e31c114b053be1f4c`, clean isolated
branch `codex/xero-e2e-verification`. Scope: harness, co-located tests, the explicitly
approved lazy fixture validation, prerequisite handoff and appended task history.
No application, schema, dependency or payroll policy change. The advisor has read the
source/test diff, including receipt provenance and the full synthetic catalogue fixture.

The executor's fresh source gates passed 457 release-tool tests in 32 files, 2,810
repository tests in 18 uncached tasks, lint, build, both type checks and boundaries.
The advisor independently verified lint, build (4 uncached tasks), repository types
(19 uncached tasks), release-tool types and boundaries. The initial reviewer release
rerun failed one X26 ordering assertion (456/457 passed). The initial repository rerun
failed the unchanged 25 ms AU stalled-401 deadline assertion under concurrent execution.
These initial failures remain recorded. Final full-suite reruns pass with the same
assertions and timeouts, as detailed below.

Reviewer logs: `/tmp/plan160-advisor-76a5dfb/`. Source gates clear inherited service
credentials; build supplies synthetic valid settings only. Explicit Turbo task and
Vitest file concurrency flags will distinguish host contention from a correctness gap.
No test timeout, assertion, inventory or production guard is weakened.

The stale-parent-ledger regression was run with the previous behaviour temporarily
restored in the isolated executor checkout: it failed because local cleanup ran despite
an unresolved child intent. The fixed source passes that test. The advisor directly
read `/tmp/plan160-r1-old-behaviour.log`; this is a meaningful behaviour regression,
not a missing-export/compiler failure.

## Independent checks during implementation

At 02:30 UTC the advisor ran, with inherited service credentials cleared:

```bash
env -i PATH="$PATH" HOME="$HOME" bun --no-env-file ./node_modules/vitest/vitest.mjs run --config tooling/release/vitest.config.ts tooling/release/e2e/xero-browser-mutation-scope.test.ts tooling/release/xero-e2e.config.test.ts
```

PASS: two files, 19 tests. Strict action payload cases exercise correct and foreign
organisation/connection/mode/confirmation metadata, additional fields and invalid leave
scope. Discovery enumerates all 92 suffixes and 18 auxiliary tests in five files,
110 tests total. A separate denial test confirms unguarded discovery is refused and role
execution still validates its environment. No browser scenario or provider action ran.
This is an intermediate source check, not final-candidate verification.

Review corrections before source freeze: preserve a valid failed assertion when a sibling
level is malformed; bind lifecycle assertion, ownership and terminal cleanup to the same
owned alias, Clerk/payroll organisation and generation; reject invalid/reversed collection
windows; stop browser supervision timers after a bounded unresolved shutdown. The independent
online verifier additionally identified a valid terminal cleanup FAIL being discarded when
its action observation was unavailable. The executor must preserve that failure without
granting cleanup PASS from an unmatched receipt. These are source review findings, not
observed customer or provider failures.

## Fresh baseline protected online campaign

Run `5395107d-fb98-4626-b695-11aaae5c0088`, source
`d6da4e8fbab70e3135e3a7a33fd49cb0c24a91a2`, 02:23:39-02:31:11 UTC.
The full existing protected runner exited 0: 27 files, 246 tests, six uncached tasks.
Package results: app 2, database 52, feeds 15, availability 21, Xero 72, jobs 84.
The advisor directly read the runner JSON, command ledger, before/after audit JSON
and final checks, and confirmed the verification checkout is clean.

Independent read-back: all 39 owned selectors zero; outside-owned catalogue digest
unchanged; all 38 table counts and server-side all-column content hashes unchanged,
covering 204 pre-existing rows. All 21 migration checksums match, zero pending,
12 integrity checks clean, immutable trigger enabled, legacy fallback binding unchanged.
Pre/post Prisma schema diff exits 0 with no difference. Fresh strict Inngest inventory,
durable manifest and released fence are confirmed. No migration, schema edit, deployment
or provider action was needed.

The configured URL now uses the pooler hostname for the same previously authorised
Neon endpoint. The old direct-host manifest was correctly refused before mutation.
A fresh manifest binds the current exact hostname, project/branch/endpoint, role,
database and SQL timeline. The observed fresh timeline/LSN is a reference, not proof
of restore retention or a successful restore exercise. Provider metadata exposed no
retention/snapshot detail, so restore availability remains NOT VERIFIED.

Private evidence:
`/home/hilton/.codex/worktrees/xero-online-verification/teamcalendar/tooling/release/test-results/5395107d-fb98-4626-b695-11aaae5c0088/`.
Files are 0600, directories 0700; temporary downloaded credentials were removed.
Runner outcome PASS coexists with charter report NOT_VERIFIED, deployed SHA null and
all per-case browser/provider evidence missing. A second fresh protected run must
identify the corrected executor candidate; this baseline does not certify that future
source.

## Final source verification and verdict

Verdict: APPROVE the scoped harness corrections. Plan 160 remains IN PROGRESS because
the operational lease, actual case and controlled-handler drivers, causal no-effect
producer, sanctioned fixture/session handoff and approved AU transition contract are
still absent. No source-unit, discovery or domain-inventory result becomes LIVE or
CONTROLLED campaign evidence. The prerequisite design is
`plans/160-execution-prerequisites.md` in the executor branch.

Runtime commit: `76a5dfb2b8c87faf27d6313e31c114b053be1f4c`. Test-only clock correction:
`c52c5fa16958ca5bc637c3803882f21efc5c2b8a`. The advisor directly compared these commits:
only `tooling/release/xero-campaign-collector.test.ts` differs. It replaces the real
2,100 ms sleep with a controlled Date-only clock, advances action/terminal phases,
restores Date in finally and preserves all exit, X26, 40-case and ordering assertions.
The original intermittent failure cause remains unconfirmed; no production defect
or runtime freshness rule was changed by this test correction.

Final isolated HEAD: `eb604d02dfc93ccd4d628a013298d9098badc4b9`. Its last commit adds only
the actual diagnostic pair and task/prerequisite documentation. The executor checkout is
clean; runtime remains byte-identical to the online-tested commit. Main contains only
advisor plan/index/review/handoff changes; no source merge, branch commit, push or deployment.

| Independent advisor check | Result |
| --- | --- |
| Full lint | PASS, 1,156 files, no fixes |
| Build with synthetic settings | PASS, four uncached tasks |
| Repository types after build | PASS, 19 uncached tasks |
| Repository unit gate | PASS, 2,810 tests, 18 uncached tasks |
| Release-tool tests | PASS, 457 tests in 32 files, both constrained and original default command |
| Release-tool types | PASS |
| Package boundaries | PASS, 1,072 files in 21 packages |
| Offline renderer | Exit 2, both reports byte-identical, no service credentials |

The repository rerun used the same gate with explicit task/file concurrency:
`bun --no-env-file run test -- --force --concurrency=1 -- --maxWorkers=1`.
All assertions, timeouts and inventory remain unchanged. The corrected harness passed
`bun --no-env-file run test:release-tools -- --maxWorkers=1` and then the original
`bun --no-env-file run test:release-tools` (8.428 seconds). Reviewer logs and command
results remain under `/tmp/plan160-advisor-76a5dfb/`.

## Final protected online inventory

Run `f782ad54-69b6-4bf3-ada0-08a535215c19`, actual runtime candidate
`76a5dfb2b8c87faf27d6313e31c114b053be1f4c`, 02:51:41-02:59:38 UTC. PASS:
27 files, 246 tests, six uncached tasks; suite duration 7 minutes 19.683 seconds.
The advisor directly read all seven command exits, inventory totals, runner JSON and
pre/post audit comparisons. App 2, database 52, feeds 15, availability 21, Xero 72,
jobs 84. This is fresh exact-runtime evidence, not relabelled baseline evidence.

Independent post-readback: 39 owned selectors zero; all 38 table counts and all-column
server content hashes unchanged across 204 pre-existing rows; catalogue unchanged;
21 migration checksums match, zero pending; 12 integrity checks clean; immutable trigger
enabled; existing legacy binding unchanged; fence released; strict consumer isolation
and durable manifest verified. Only LSN changed between target identity snapshots,
consistent with the owned test writes; database, role, endpoint, branch, project and
timeline stayed identical. Both schema diffs exit 0 with no difference. Credentials
were removed and the verification checkout is clean.

Private bundle:
`/home/hilton/.codex/worktrees/xero-online-verification/teamcalendar/tooling/release/test-results/f782ad54-69b6-4bf3-ada0-08a535215c19/`.
The independently repeated terminal-failure probe produces exit 1 for a verified cleanup
failure while the missing action remains NOT VERIFIED. Its proof uses private synthetic
artefacts only; it makes no online-data or provider mutation.

Actual host tools: Bun 1.3.14 (repository declares 1.4.0), Prisma 7.10.0, Vitest 5.0.1,
Vercel CLI 54.17.3 on Node 24.21.0. No runtime upgrade was performed. Neon restore
retention/availability and restore exercise remain NOT VERIFIED. The domain runner
outcome is PASS, while its charter report remains NOT_VERIFIED with deployed SHA null.

## Fresh diagnostic delivery

Actual CLI refusal: `2026-09-27-0663c396-8a8c-432e-ba06-173a914b2513`, exit 2,
`manifest-unavailable`, verified run/candidate/harness identities null. Both sanitised
JSON and Markdown exist in the executor checkout under `reports/xero-e2e/`. Counts:
26 parent scenarios, 92 subcases, 40 charter cases, 93 levels; zero LIVE or CONTROLLED
execution, zero PASS or FAIL scenario claims. Scenario validation errors are empty.
The inherited charter engine describes absent lifecycle input as malformed evidence;
the outer report and every scenario state the actual missing-manifest reason.

The advisor reran the actual offline renderer with inherited credentials cleared,
in `/tmp/plan160-advisor-76a5dfb/offline/`: exit 2, both formats byte-identical.
JSON SHA-256: `f23ef606930b6c6b96c12b47b59ee214c681d1b1e9d8dc0abd0a24eda91cbe82`.
Markdown SHA-256: `ec391207721dc55202d1c2f7da9aff5be50b7d8a4b4f88a8564ee92b164cb340`.
No synthetic PASS was published. The report is a completed diagnostic deliverable,
not full Xero application verification or production sign-off.

## Follow-up review and authorised main integration

The user requested a further error and oversight pass, corrections, then commit and
merge to main. This explicitly authorises local integration after verification and
supersedes the skill's default no-merge rule. It does not authorise a push, deployment,
worker activation or provider campaign.

- [x] Re-read lessons and inspect the committed branch and uncommitted advisor records.
- [x] Complete independent recovery and evidence reviews and vet every finding.
- [x] Correct confirmed defects with meaningful regressions in the isolated checkout.
- [x] Freeze corrected runtime and complete source gates and protected online verification.
- [x] Commit review records and merge the verified branch into main; verify the merged tree.

The full campaign status remains IN PROGRESS. This follow-up reviews the source slice,
its recovery safety and reporting truth; absent operational prerequisites cannot be
relabelled verified observations.

Confirmed follow-up defects, all reproduced with private synthetic artefacts and no
database or provider operations:

1. Same-run recovery started with browser closure assumed true. An earlier unknown
   shutdown retained the fence, but `--recover` immediately allowed local cleanup
   and fence release without checking the previous browser writers.
2. `observeXeroNoEffect` persisted its pre-await ledger snapshot, overwriting an
   intervening observed remote effect and a sibling intent. Re-read current state,
   reject changed targets and preserve siblings before persisting a disposition.
3. A closed child with a surviving owned process group was bounded but never sent
   termination signals. Terminate lingering descendants while retaining unknown
   closure after forced shutdown.
4. Duplicate layer/level and cleanup indexes could discard later verified failures.
   Validate each receipt independently; duplicate conflicts deny PASS, while a
   verified FAIL survives in either order and cleanup failure remains monotonic.
5. A strict-schema scenario sibling with foreign operation correlation could hide
   a separately verified failure. Validate correlation and layer semantics per link
   before aggregation; invalid siblings cannot discard validated failures.
6. Offline report identity accepted a harness SHA different from its candidate.
   Require equality consistently with the runtime admission check.
7. Null lifecycle evidence was described as malformed input. Distinguish absent
   evidence from malformed payloads without granting either a verified status.
8. Terminal collection discarded the earlier phase's invalid-evidence limitations.
   A duplicate valid lifecycle PASS index was flagged during actions but became a
   full synthetic PASS after terminal cleanup. Preserve same-run limitations across
   the phase merge as well as defects.
9. Lifecycle assertion and ownership artefacts accepted `phase: terminal` with
   action-window timestamps. Require action provenance for both kinds and terminal
   provenance for cleanup, with hash-consistent negative regressions.

The advisor independently reproduced findings 1 to 5 against the original branch.
Probe scripts are `/tmp/plan160-recovery-mode-review.ts`,
`/tmp/plan160-recovery-review.ts` and `/tmp/plan160-review-probes.ts`; temporary
fixture directories are removed. Findings 6 and 7 were verified by direct reads of
the report admission and lifecycle builders. These defects are source/harness
behaviour, not observed provider or customer incidents.

Further independent synthetic probes are `/tmp/plan160-phase-review.ts` and
`/tmp/plan160-review-phase.ts`. Both reproduced erroneous exit 0 acceptance before
the corrections; they create no external observations or campaign authority.

Duplicate winner selection also requires semantic assertion validation, not merely
matching receipt bytes. `/tmp/plan160-semantic-review.ts` reproduced a genuine FAIL
being replaced by a hash-consistent duplicate naming another charter requirement.
Use the shared assertion validator before selecting observations; retain cleanup
readiness as a separate terminal requirement. Extra valid evidence at known levels
is not rejected solely for being additional: the charter defines minimum required
levels, and extra evidence cannot substitute for any mandatory assertion.

Follow-up runtime and tests are frozen at
`5d5889c65a1caf545cfde8cc8198392b8ddd6e7f`, ten scoped tooling files. The advisor
read all final runtime hunks and meaningful regression bodies. Original independent
reproductions now show: stale no-effect rejected with both durable entries retained;
same-run recovery without writer proof keeps local cleanup/release calls at zero;
lingering process group receives SIGTERM/SIGKILL without granting closure; all four
receipt conflict/correlation failures preserve FAIL and exit 1; semantic duplicate
failure remains FAIL/exit 1; earlier invalid flags survive terminal collection with
exit 2; contradictory lifecycle action phases remain NOT VERIFIED/exit 2.

Independent advisor gates at that runtime: full lint PASS (1,156 files), release-tool
types PASS, original full release-tool command PASS (505 tests in 32 files). All
service credentials were cleared. Logs: `/tmp/plan160-followup-review/`.

Fresh actual missing-manifest diagnostic `ab5dbf95-8931-489b-a53f-45ee1dceda50`
returns exit 2, 26 scenarios/92 suffixes/40 charter cases/93 levels, zero LIVE or
CONTROLLED cases, null unadmitted execution identities and no malformed diagnosis
for absent lifecycle evidence. The advisor independently re-rendered the actual
saved report without credentials from an isolated `/tmp` working directory: both
files byte-identical, exit 2. JSON SHA-256:
`8a0bfb93d6f54ad479d52220056bba6e3900b49a9b5f320ed6ffff3b3fddf5e1`;
Markdown SHA-256:
`597b50832b56bf9c04e656ce8132b0492c5133915fd7a51f4d781e294ec641a1`.

Executor full source gates also PASS on the frozen follow-up runtime: build four
uncached tasks (13.742 seconds), then repository types 19 uncached tasks (10.348
seconds), repository units 2,810 tests in 18 uncached tasks (2 minutes 59.367 seconds)
and boundaries 1,072 files/21 packages. The advisor independently read the logs and
recomputed the unit total. The exact unit command retained the prior assertions and
timeouts: `bun --no-env-file run test -- --force --concurrency=1 -- --maxWorkers=1`.
All eleven Prisma generator whitespace-only outputs were compared and restored
after the gates; no generated or application source differs from the frozen commit.

Main's previously missing declared `jose` installation was refreshed through
`bun --no-env-file install --frozen-lockfile`: two packages installed, no lockfile or
source change. Post-merge checks passed using this repaired local installation.

Final protected online run `b207173c-ec6b-4bef-ba68-3937ad8227df` PASS at exact
runtime `5d5889c65a1caf545cfde8cc8198392b8ddd6e7f`, 03:26:45.886 to 03:34:15.360 UTC:
27 files/246 tests/six uncached tasks, suite duration 6 minutes 52.816 seconds. The
advisor directly read all seven command exits (zero), the actual inventory totals,
runner receipt, schema outputs and pre/post audit comparisons. App 2, database 52,
feeds 15, availability 21, Xero 72, jobs 84.

Independent final read-back confirms 39 owned selectors zero, unchanged 38 table
counts/all-column content hashes across 204 existing rows, catalogue unchanged,
21 matching migration checksums/zero pending, 12 clean integrity checks, enabled
immutable trigger, unchanged legacy binding, verified durable manifest/strict
consumer isolation and released fence. Both schema comparisons report no difference.
Only observation time and identity LSN change; source/run/migrations/content/checks/
trigger/legacy binding remain identical. Temporary credentials were removed and the
online checkout is clean. Original campaigns are preserved separately.

Private final evidence:
`/home/hilton/.codex/worktrees/xero-online-verification/teamcalendar/tooling/release/test-results/b207173c-ec6b-4bef-ba68-3937ad8227df/`.
Domain runner outcome/inventory/cleanup PASS, complete phase, exit zero and released
fence. Its charter stays NOT_VERIFIED with deployed SHA null. Current PITR/restore,
actual authenticated browser/provider campaign and per-case observations remain
NOT VERIFIED. These aggregate tests do not supply charter sign-off.

Follow-up source verdict: APPROVE. All confirmed review defects are corrected and
required gates pass. The user-authorised local merge contains this verified
candidate; no push, deployment or worker/provider capability is enabled.

Final executor HEAD: `d27b0f1ee86c4ff23cdde1acead41a5253c117e0`, clean. Its delta
from online-tested runtime `5d5889c` contains only the prerequisite/task/lesson records
and two actual diagnostic formats. The advisor read that documentation delta, verified
its allowed scope and confirmed all runtime and test bytes remain unchanged.
The main plan records were committed separately at `6453d15` before integration.


Authorised main integration completed without conflicts at
`f3dd965f717fd10bb9d8d0025e087549e53f3541`, combining advisor documentation `6453d15`
and clean executor final HEAD `d27b0f1`. Tested runtime `5d5889c` is an ancestor;
`git diff` across the entire tree outside `plans`, `tasks` and `reports` is empty.
The merge preserves every source, test, dependency, schema and generated byte from
the fully verified candidate.

Independent post-merge checks in the main checkout PASS with cleared service
credentials: lint (1,156 files), release-tool types, the original full release-tool
command (505 tests/32 files, 15.332 seconds), boundaries (1,072 files/21 packages)
and whitespace. Logs are in `/tmp/plan160-postmerge-review/`. Full repository tests,
build/types and protected online evidence remain applicable to the identical source.
The published diagnostic hashes are unchanged. Full Plan 160 remains IN PROGRESS
and actual browser/provider/PITR observations remain NOT VERIFIED.


## Updated-plan verification, 27 September 2026

Verification baseline: main `514efb5`, after merge `f3dd965`. Scope is the four
updated Plan 160 documents: the execution plan, prerequisites, review and index.
This review changes plans only; it does not repeat a provider campaign or infer
new deployment/database observations.

- [x] Read lessons and compare the updated plans with the merged source.
- [x] Complete fresh-context implementation and independent evidence reviews.
- [x] Reconcile actionable baselines, completed steps and remaining prerequisites.
- [x] Verify local references, catalogue/report identity and recorded evidence.
- [x] Validate the final plan-only diff and record the result.


Result: APPROVE the corrected plans. Both independent reviews confirmed the current
source/evidence records and identified stale executable instructions in the main
plan/index. Those instructions still called for already-merged recovery, collector,
report-output and discovery work. The active drift baseline and excerpts now match
`5d5889c`; Steps 1-2 preserve completed contracts, and Step 3 starts the remaining
operational work. The completion ledger separates verified source from unresolved
lease/producers/campaign/restore evidence. Recovery adapter requirements explicitly
include fresh independent prior-writer proof. The prerequisite/review headers record
main integration, and initial observations remain labelled history.

The documented discovery expectation is corrected from 97 tests/three specs to
110 tests/five specs (92 registered suffixes plus 18 auxiliary guards). A fresh
credential-free `--list` invocation confirms 110/5 and exit 0; no scenario executed.
Fresh credential-free release-tool types also exit 0. Private command logs are
`/tmp/plan160-plan-verification/{types,discovery}.log`.

Independent evidence review rechecked ancestry, exact runtime equality, available
gate summaries, protected run summary/inventory and actual diagnostic bytes. All
recorded counts, verdicts, cleanup evidence and report hashes agree. The latest
report still has 26 scenarios/92 suffixes/40 charter cases/93 levels, null admitted
run/candidate/harness identity, zero LIVE/CONTROLLED and NOT VERIFIED. Both reviewers
re-read the corrections and approved them with no remaining actionable finding.

Plan validation confirms 37 local Markdown links resolve, all scenario/subcase/cohort
tables are byte-identical to the merged plan, report hashes unchanged and the entire
source/test tree unchanged. Exactly these four plan files changed; whitespace and
added-text language checks pass. No source, report, task, environment or external
resource changed during this documentation verification. No database/provider suite
was repeated, no deployment state was refreshed, and campaign/PITR remains NOT VERIFIED.
