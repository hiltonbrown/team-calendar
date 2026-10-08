# Xero incremental inbound sync, Prompt 5

The phase continues on `work` from `75a939ae`. Existing incremental retrieval,
initial-import orchestration, nightly reconciliation and business-hours cadence
from that commit are retained. This phase removes the remaining obsolete employee
snapshot policy and corrects demonstrated completion/failure gaps. Fresh
independent review found no remaining Critical, Important or Minor findings
after the demonstrated defects were corrected.

## Provider contracts and retained behaviour

Current [Xero-owned AU OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au.yaml)
was downloaded again and checked alongside official documentation and Context7.
`GET /Employees` and `GET /LeaveApplications/v2` support the modification header
and pagination of 100 raw items per page. The [AU leave documentation](https://developer.xero.com/documentation/api/payrollau/leaveapplications/)
confirms V2 includes requested/rejected states that V1 omits. Balance retrieval
uses employee detail and its actual `LeaveBalances`; it has no invented delta
mechanism or amount calculation.

- Initial full import traverses all employee and leave pages and the entire
  40-person-page balance roster before persisting completion.
- Normal AU polling sends the saved `people` or `leave_records` cursor minus a
  fixed two-minute overlap, formatted as UTC seconds, on every page.
- Watermarks advance to run start only after complete successful application.
  Empty complete deltas are valid; they never establish absence.
- Normal cadence stays every 15 minutes on weekdays 07:00 through 18:59 local,
  hourly otherwise. Balances remain rolling hourly. Manual full sync and nightly
  full reconciliation between 01:00 and 02:59 are separate from polling.
- NZ/UK retain supported paging/per-employee reads, with no fabricated AU filter.
- Cursor CAS, persistence and deletion inference enforce both `clerk_org_id`
  and `organisation_id`, the active connection and expected provider tenant.

## Corrections and TDD evidence

| Demonstrated defect | Final correction and regression |
| --- | --- |
| Complete empty or large employee deletion permanently blocked | Remove empty/20%/>5 thresholds and the 24-hour missing-marker policy; real PG regressions first failed on sole-person, 20%, 50% and six-person deletion |
| Dead persistent employee missing marker | Remove `Person.xero_missing_since`, all runtime writes and obsolete tests; actual schema absence assertion first failed |
| Deferred leave change considered successfully applied | Local/CAS conflicts retain the watermark, prevent absence inference and keep sweep staleness; duplicate/older already-applied snapshots still complete; unit and real PG regressions first failed, then retry of the same delta succeeded |
| Cancelled empty leave response skipped the batch cancellation check | Recheck the existing run fence before completion; real PG regression first returned succeeded and then cancelled without archival/cursor movement |
| Malformed AU balance detail became empty success or missing amount became zero | Validate employee identity, actual balance array and numeric amount; isolate provider parse failures per employee, preserving valid empty/zero values; parser/fetch regressions failed before the correction |
| Fenced people run could commit after the outside cancellation check | Existing active-run check inside final scoped transaction, before cursor/archive writes; cancelled/failed status regressions first archived rows, then preserved them |
| Full leave archival committed before a later cursor/dispatch failure | Cursor CAS, absence archival and connection completion share one scoped transaction; real PG fenced-cursor and dispatch-failure regressions first left archived rows, then rolled back |

Full employee archival and cursor completion now commit together. A SQL failure
after both mutations rolls both back. Manual people, foreign accounts, another
Organisation under the same account and returning employee identity remain
protected. Record validation, parsing, provider, persistence, truncation and
cancellation retain the prior cursor. Full leave finalisation retains the
existing feed enqueue before committing progress so dispatch failure rolls back
absence/cursor changes; it adds no queue, lease or durable state.

## Schema

Official Prisma 7.10.0 generated
`20261007220000_remove_person_xero_missing_since`: one `DROP COLUMN` with no
compatibility storage/backfill. Prisma generated output was regenerated rather
than edited. Migration deploy/status and schema diff passed against the explicitly
owned local PostgreSQL database; no difference was detected. The migration chain
now contains 27 migrations.

## Verification

Fresh corrected-source repository gates:

- `bun run check`: 1,153 files passed.
- `bun run typecheck --force --concurrency=3`: all 19 tasks passed uncached,
  including Prisma generation.
- `bun run test --force --continue=always --concurrency=2 -- --maxWorkers=2`:
  all 2,965 tests across 18 tasks passed uncached.
- `bun run test:integration --continue=always --concurrency=2`: all 259
  PostgreSQL/Redis integration tests across 6 tasks passed uncached.

Focused corrected-source evidence: 37 people unit/PG tests, 51 leave units,
19 leave PG tests, 46 Xero read/balance tests, 30 balance/initial-import units,
11 person reconciliation units and 4 schema PG tests passed. Database gates
use the explicitly owned loopback PostgreSQL fixture; integration additionally
uses the owned local Redis REST fixture. Unit tests do not enable database
access. No live provider call or application-browser verification is claimed.

## Independent review

Fresh independent inbound review identified the two final run/transaction fence
findings above. Both were reproduced before correction. Corrected-source rereview
confirmed both resolved and found no remaining Critical, Important or Minor
findings. The reviewer inspected the existing nested transaction and feed
dispatch contracts; no new queue or persistent state was required. Full gate
results above are implementer-run evidence, separate from the read-only review.
No unrelated OAuth/write redesign or new provider lifecycle infrastructure was
added.
