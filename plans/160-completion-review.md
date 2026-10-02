# Plan 160 completion continuation, updated 2 October 2026

Status: PARTIAL, source delivery ready for the requested commit and merge; full Plan 160 verification is not complete. The user has stopped further campaign tooling and fixture preparation. Reviewed source through `7431c27`, plus the separately reviewed AU copy follow-up, is the merge scope. Uncommitted native lease, observer, browser-driver and registration changes are excluded and preserved in the isolated worktree.

## Current delivery and evidence, 2 October 2026

- `40e794d` completed ordinary invocation lifetimes, authenticated action/OAuth admission, exact provider request grants and binding-generation reconciliation. `37b4818` implemented the approved `au-contract-v1`: AU submission stays local pending manager approval, then approval creates the Xero leave. Subsequent adapter/modal test corrections are included.
- `0daa463` corrected the shipped tenant-selection function ID, allowed exact in-flight persistence to close during drain and prevented new provider dispatch after revocation. Reviewer regression: 163 tests passed.
- `a4cab6b` added explicit immediate namespace admission with unknown prior-usage acknowledgement and configured domain/epoch equality. Existing counters, cooldowns, provider Retry-After and Starter 1,000/day limits remain. Focused verification: 72 tests, Xero types and scoped lint passed. The user removed the fixed 24-hour wait; it is not a remaining execution prerequisite.
- The clean `b89bd36` checkpoint passed the repository unit gate (18 tasks), lint and type gates. The guarded live continuation completed backup and migration to schema 23. Its integration replay reported **137 PASS, 12 FAIL**. Cleanup, lease release and two independent postchecks passed. This is a failed integration gate, not a passing release or browser/provider result.
- `9ed5f12` repaired the Prisma-proxy race injection and removed unrelated leave/publication creation from the employee pagination test while preserving exact 20+1 traversal and real cursor/staleness assertions. Forty-two unit tests, jobs types and scoped lint passed. `7431c27` moved approval-reconciliation fixture dates into the actual live lookback window. These test repairs have **not been replayed against the live database**.
- `2588d97` makes the decline explanation and success/retry toast accurate for locally pending AU leave. Three modal tests and scoped lint passed; no new provider evidence is attributed to copy changes.

The user authorised a bounded AU cohort of seven privately identified employees, at most 20 new requests dated 2 to 6 November 2026, with approval, decline and withdrawal limited to those new requests. Existing leave and connection deletion remain outside that authority. Fresh provider demo-company confirmation and authenticated role sessions are still required. Preparation stopped before sentinel/rate initialisation, Clerk/person changes, candidate app launch or provider mutations. Actual browser/provider verification, deployed-candidate claims, scheduled-job proof, PITR availability and restore exercise remain **NOT VERIFIED**.

The next authorised verification can use candidate app/API development servers and ordinary guarded synchronous actions against the approved live fixtures. Deployment and registered candidate jobs are requirements for deployed/scheduled campaign claims, not blanket prerequisites for those synchronous actions. No guard bypass or false paused-consumer declaration is permitted. General lease/CLI and full-catalogue driver expansion is deferred; it is not part of this merge.

## Historical implemented scope, 29 September 2026

- Durable shared campaign sentinel, immutable resources and exact run/candidate/tenant/binding/function tickets; guarded dispatch, worker, scheduler and maintenance paths; provider effect accounting through complete response consumption.
- Provider-neutral database write guard with advisory locking, fresh pre/post authority, transaction rollback and invocation lifetime enforcement. Guarded array and nested transactions are rejected. Started writes drain before wrapper closure; a transaction already committing may finish while draining.
- Read-only repeatable-read observer coexistence with fresh authority checks, and GET-only provider observations. Version 1 protected domain-runner isolation remains unchanged.
- Causal provider/canonical leave, persisted submit-operation and scheduled worker observation producers. The scheduled producer correlates authenticated actual worker/scheduler API results with runtime tickets and scoped SQL; it does not replace missing live execution with a label.
- Manifest-owned campaign domains, 13 real sentinel fixture setups and narrow shared-store cleanup. The inventory grows from 27 to 28 suites. Six new online integration assertions cover real campaign admission/revocation and guarded database rollback/lifetime.

The protected test children use dedicated `TC_TEST_KV_*` credentials with existing manifest authority. The ordinary limiter keeps its existing test configuration; three provider stubs delegate only the exact real campaign-store endpoint. Real Clerk/Xero/email/billing credentials are excluded from the integration child environment.

## Historical source verification, 29 September 2026

Source gates at that checkpoint PASS: 3,056 repository tests across 18 uncached tasks, 594 release-tool tests across 35 files, four uncached builds, 19 uncached repository type tasks, release types, lint and package boundaries across 1,094 files. Protected online results are pending. Earlier full source gates passed before a final review found the protected child KV credential mismatch; that mismatch is corrected, independently reviewed and covered by 36 focused tests. It is not promoted to a live result. Development iterations also found stale mocks, fixture counts, one inventory count and a test-only cross-package import; these were corrected before the final gates.

## Remaining full-campaign prerequisites

The campaign capability remains unavailable. Authenticated action/OAuth admission, exact mutation targets, binding-generation changes and ordinary invocation lifetimes are now committed. Independent campaign-wide prior-writer/drain/restoration proof, the real default execution lease, complete multi-step scenario drivers and controlled handler recipes remain deferred, unmerged work. The X08 spec remains unexecuted; producing scheduled receipts is only a foundation.

The AU transition decision is approved and implemented. Bounded fixture authority is recorded above; fresh provider identity confirmation and authenticated session readbacks remain unverified. No campaign variables were found in nine fresh Vercel pulls. App/API metadata confirms missing tier, namespace epoch and credential-domain settings, and all six app/API environment database URLs share one target. READY deployments are at the older main candidate, not this branch. Full case-level browser/provider execution, current PITR retention/availability and actual restore exercise remain NOT VERIFIED.

A historical non-fixture scheduled leave-balances SyncRun remains `running` with database-native start time `2026-09-27 10:04:29.191` (timestamp without time zone, queried in a GMT SQL session). Its entire row and all public table content must be preserved. It is not treated as proof of a currently executing worker or a terminal successful job. Fresh authenticated cloud, host and SQL inventories are required before and throughout the protected domain run. No worker is paused or resumed when those inventories prove current absence.

Domain integration results and aggregate unit results never certify the 26 scenarios, 92 suffixes, 40 charter cases or 93 evidence levels. The actual [diagnostic](../reports/xero-e2e/2026-09-29-f92d3068-dd9d-4a76-8ec2-88545bc87ad4.md) and matching JSON exit 2 with `manifest-unavailable`, zero LIVE/CONTROLLED execution and null admitted candidate/harness/run identity. All 26 scenarios, 92 suffixes, 40 charter cases and 93 levels are represented. Credential-free offline rendering exits 2 and reproduces both formats byte-for-byte. JSON SHA-256: `390e6779aec61cef9e27f2ee030abe0a96463f51ded9c722f955d2af79f4e3a1`; Markdown: `5f7e15ed0c1861b9a99204c1b74a3423694fe195fe349816e73f20cbef7ee4f8`. The first reproduction attempt selected an unsupported output directory; the documented `reports/xero-e2e` destination was then used successfully in an isolated temporary working directory.

## Historical admission review, 29 September 2026

Independent core review found an overly broad payroll path prefix in the new provider guard. The correction permits only the inventoried regional read GET endpoints and separately scoped token POST. Unknown endpoints/methods, traversal aliases and unsupported query parameters deny admission. Generic campaign worker tickets cannot authorise payroll mutations. Ordinary unreserved provider writes retain their existing behaviour. Focused runtime/store tests pass 106 assertions; complete source gates pass after this correction. The complete concurrent run first exposed an existing 10 ms management-client deadline test that could expire before dispatch under load. Its clock is now controlled and the deadline advances only after a dispatch barrier; the no-DELETE assertion remains. The final serial uncached source run exits zero.

The first live preflight stopped before acquisition or any mutation because it classified 23 pre-existing editor/MCP runtimes as application workers. The helper now records exact independently reviewed process identities, retaining denial for unknown runtimes. Actual SQL schema comparison is included before and after the protected run. No editor or MCP process was stopped. No source/campaign verdict is inferred from that failed preflight.

## Protected continuation and disconnect, 30 September 2026

Frozen source `72a71154158af7c00dd95462980fa11c88b92c13` passed the complete offline gates recorded above. Its online attempts did not pass:

- Run `215b476a-d811-49ad-8857-518c970424eb` was interrupted because Turbo tasks used additional process groups outside the monitor's initial group. The runner had created four owned organisations and three owned people. Independent recovery established writer closure, removed only owned fixtures and released the lease. Read-back found 40 table snapshots and 446 baseline rows unchanged, zero owned residue, schema equality and the historical marker preserved. This attempt remains INTERRUPTED / NOT VERIFIED.
- Run `2c4671c8-c1c2-480b-8acf-03917a1c4850` passed fresh preflight and monitoring but failed six Xero integration suites during setup, with 57 tests skipped. Prisma could not deserialize the PostgreSQL `name` type in the new fixture identity query, and one rate-store suite lacked the established `server-only` mock. The protected runner completed cleanup and released ownership. Independent failed-run postcheck found 41 zero owned selectors, unchanged 40-table content/schema and outside-owned catalogue, and the same unresolved historical marker. This is a failed suite, not a PASS.

The monitor had been corrected to track exact PID/start/user/parent identities across Turbo process groups, gate execution until initial SQL/cloud/owner checks succeed and use pidfds for safe shutdown; offline synthetic-child regressions passed. The disconnect then removed the temporary worktree, its ignored private receipts and uncommitted changes. The committed `72a7115` source and tracked diagnostic reports survived. Work was restored to a persistent ignored worktree. The observed historical results are documented here, but their private receipts are no longer locally available for independent reinspection. A fresh protected run is required for the next candidate.

The fixture identity query now casts `current_database()` and `current_user` to text, and the rate-store suite has the established marker mock; focused fixture tests pass 23/23. The earlier `00:04 UTC` marker wording was a client conversion error: PostgreSQL returns this column without time zone, and the host parser applied Brisbane time. Direct SQL text showed start `2026-09-27 10:04:29.191`, update `10:04:29.278`; no historical row changed or became terminal.

Further review found that an ordinary provider request can start before campaign reservation and finish afterward without durable accounting. Direct pause/resume writes now use one guarded update/audit transaction. Provider-attempt accounting has focused unit coverage and two new protected real-store cases authored; full gates and online execution remain pending. An accepted response can still precede local persistence, so this does not establish full prior-writer closure. Both source corrections require exact-candidate verification; the broader action/OAuth admission, lease, scenario drivers and operational prerequisites remain open. No previous offline or online result is attributed to their changed source.

## Fresh source and diagnostic verification, 30 September 2026

The source correction is committed at `3b7c511d0c96b26de067e8b36b78f6d45e427c70`.
After the ordered Vitest alias correction, the final sanitised source run passed:
`bun run check` (1,183 files), `bun run typecheck` (19 tasks), package boundaries
(1,094 files), `bun run test` (18 tasks, 3,067 tests), release-tool tests
(594), release-tool types and four uncached build tasks. `git diff --check`
passes after restoring generated Prisma output verified to differ only in
trailing whitespace. The required protected `test:integration` gate remains
pending and must not be counted as PASS.

The actual 30 September [no-manifest diagnostic](../reports/xero-e2e/2026-09-30-7d393fee-409b-4dc1-8162-833eebe67944.md)
exits 2 with `manifest-unavailable`; JSON and Markdown reproduce byte-for-byte
via the offline renderer, also exit 2. It represents 26 NOT VERIFIED cases,
zero LIVE/CONTROLLED executions, and null admitted candidate/harness/run identity.
The protected online domain gate must be rerun against this exact candidate.
No new browser/provider or PITR evidence has been generated.
