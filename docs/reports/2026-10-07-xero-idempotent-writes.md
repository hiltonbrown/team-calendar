# Xero native idempotent writes, Prompt 6

The phase continues on `work` from `e875525d`. The existing native key, request
journal, replay cutoff and synchronous user-triggered flow are retained. This
phase removes duplicate parsing and failure classification, and corrects proven
transport and domain recovery gaps. It introduces no outbound job, provider SDK,
dependency, schema state or compatibility path.

## Current official provider contracts

Fresh Xero-owned [AU OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au.yaml)
confirms `Idempotency-Key` on these exact operations:

| Operation | Method and path | Application use |
| --- | --- | --- |
| Create leave | `POST /LeaveApplications` | Local manager approval creates scheduled leave |
| Update leave | `POST /LeaveApplications/{id}` | Not dispatched by the current application |
| Approve requested leave | `POST /LeaveApplications/{id}/approve` | Imported requested leave |
| Reject leave | `POST /LeaveApplications/{id}/reject` | Imported decline and remote withdrawal |

All use AU Payroll 1.0 and `payroll.employees`. The create body remains a JSON
array; date-only creation supplies no guessed periods or units. Submit remains
local. [AU leave documentation](https://developer.xero.com/documentation/api/payrollau/leaveapplications/)
and `plans/160-au-transition-contract-v1.md` remain the business contract.

Fresh [NZ OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-nz.yaml)
and [UK OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-uk.yaml)
declare keys on employee-leave POST/PUT, with none on their DELETE operation.
These regional adapters remain unavailable and make no outbound call. No
endpoint is enabled or changed merely because another endpoint supports a key.

The current [Xero idempotency guide](https://developer.xero.com/documentation/guides/idempotent-requests/idempotency/)
specifies POST/PUT/PATCH processing, app-wide keys up to 128 characters and a
six-minute retention window. The existing persisted UUID is 36 characters;
exact tenant/method/URL/body identity and a fixed five-minute application cutoff
prevent unsafe replay. A cached failure does not permit a new key. Separate
logical operations use different UUIDs. Provider documentation was rechecked
with Context7 and fresh official specifications, not inferred from old plans.

## Corrections and TDD

| Demonstrated defect | Correction and regression |
| --- | --- |
| Lost response/503 followed by retry admission failure was classified as never dispatched | The common transport retains earlier uncertainty for the current synchronous call; first pre-dispatch failure remains definite, successful exact-key replay still completes |
| Later 4xx/429 could downgrade earlier uncertainty | Retain dispatched unknown outcome, safe response correlation/status and existing journal/key; no fresh key is authorised |
| AU response accepted a wrong target, multiple results, contradictory IDs or embedded validation errors | Parse once in the common AU request; require one confirmed result and the expected transition ID; unconfirmed 2xx outcomes retain uncertainty |
| Correlation mapping accepted unsafe header values and lost the alternate header | Share a bounded safe extractor between transport logging, HTTP errors and unconfirmed envelopes |
| Create and imported transitions used different failure classifiers | Reuse the existing shared domain classifier; create respects prior uncertainty and genuine before-dispatch failure |
| Definitively refused approved withdrawal became failed approval state | Preserve approved status, sequence and publication with existing diagnostics/audit; uncertain writes remain blocked |
| Imported operation prepared but never dispatched offered no retry after claim expiry | Expose only its original approve/decline action; preserve the journal key/actor and block live claims, dispatched preparations and expired uncertain operations |
| Refused withdrawal still announced success and hid its persisted error | The action returns a plain-language failure after persistence/revalidation; the approved row retains the error display without a failed-approval control |

Expected RED evidence preceded implementation: nine transport regressions, four
correlation assertions, 23 AU parser failures, three domain failure assertions
and two imported action assertions. Independent review identified the last
withdrawal UI finding; both action/page regressions failed before correction,
then all 34 focused action/page tests passed. Focused corrected-source runs
passed 201 Xero tests and 176 availability/repository tests before final gates.
An additional repository regression pins distinct 36-character UUIDs for
separate logical mutations, alongside existing stable-key replay coverage.
The bounded auth-replay regression now starts with a genuinely definite 401;
a separate regression checks that 503s followed by 401 remain uncertain.

## Simplification and retained domain recovery

The common AU request returns a confirmed remote ID and raw response once;
submit no longer reparses it. Create no longer keeps a parallel certainty
classifier. The shared transport owns native-key retry identity, admission,
deadlines, safe diagnostics and response buffering. Existing access resolution
owns authentication and required capabilities. Four provider attempts include
the initial request and the one permitted definite-authentication replay.
[Xero rate limits](https://developer.xero.com/documentation/best-practices/api-call-efficiencies/rate-limits/)
and `Retry-After` remain enforced within the absolute operation/replay deadline.
Unsupported ambiguous mutations retain their single-attempt behaviour.

`dispatchPhase` describes whether processing could have started; it is not a
second provider duplicate-prevention mechanism. `outcome_unknown`, the existing
claim, immutable actor/request identity, accepted/completed checkpoints and
attempt generation protect competing business actions, crashes, local-save
loss and recovery after Xero's cache expires. They remain necessary for Plan
160. Approval reconciliation stays read-only toward Xero and excludes unresolved
operations. The obsolete schema comment claiming AU creation has no native key
is corrected; Prisma output is generated by the official CLI, with no DDL change.

## Verification and review

Fresh corrected-source check/typecheck/unit gates passed before integration.
The existing disconnect integration assertion still expected failed approval
after a definitively refused withdrawal. It now asserts approved only for that
case, retaining every other failure/uncertainty/disconnect assertion. All 36
focused disconnect PostgreSQL tests then passed. Final repository gates passed
after this assertion update. Integration uses only the
explicitly owned loopback PostgreSQL and Redis fixtures. Unit commands do not
enable database access.

- `bun run check`: 1,155 files passed on final source.
- `bun run typecheck --concurrency=3`: all 19 tasks passed; the earlier full
  corrected-source run was uncached and included official Prisma generation.
  After the assertion update, 15 valid task results were reused and all changed
  tasks reran successfully.
- `bun run test --continue=always --concurrency=2 -- --maxWorkers=2`: all 3,038
  tests across 18 tasks passed. The earlier full run was uncached; subsequent
  source/test changes reran the affected packages, with final Xero coverage
  661 tests and 17 unchanged package results reused.
- `bun run test:integration --continue=always --concurrency=2`: all 259 local
  PostgreSQL/Redis tests across 6 tasks passed uncached.

Fresh independent review identified one Important end-to-end refusal issue,
reproduced by the two action/page tests above. The narrow corrective source and
RED/GREEN evidence were verified; the finding is closed. Remaining Critical,
Important and Minor findings: zero. Full repository gate results are separately
implementer-run evidence. No live Xero mutation or application-browser
verification is claimed.
