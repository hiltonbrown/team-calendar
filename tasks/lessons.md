# Lessons

This file records reusable patterns learned from user corrections and verified
failures. Canonical product, architecture, security, and design rules belong in
`PRODUCT.md`, `AGENTS.md`, `SECURITY.md`, and `DESIGN.md`. Keep each lesson
actionable; keep one-off task evidence in the review for that task.

## Product and design

- When a page's authored scrollytelling already demonstrates the product, keep
  the hero to one promise, one proof sentence and one action. Do not make the
  visitor decode a second full interactive demo before the narrative begins.
- For homepage hero copy, default to the shortest complete message hierarchy:
  one outcome, one scope statement and one proof sentence. Do not repeat product
  concepts across the heading and body.
- When a restoration request names `main` or a live surface as the reference,
  treat that explicit reference as authoritative. Do not substitute an older
  historical snapshot merely because the request also says “previous”.
- Keep internal design-direction names out of product chrome. User-facing
  surface titles should use the established route or product name unless the
  user explicitly approves a rename.
- Make time the primary axis in calendar visualisations. Anchor today, preserve
  chronological order at every viewport, and use atmosphere, intensity, and
  provenance as supporting signals.
- Put the decision signal on the timeline axis itself. For team coverage, show
  known unavailable counts and peak thresholds in each date column; do not hide
  them only in the selected-day detail or imply that unreported days mean zero.
- Do not silently restyle vendored or governance files solely to satisfy product
  language or presentation rules. Flag the difference and change the canonical
  source when appropriate.
- Before splitting route CSS, identify shared selector ownership as well as
  route consumers. If a route stylesheet owns global layout primitives, expand
  the approved scope explicitly and extract those primitives before changing
  imports.
- Before generating a placeholder for a real personal subject or pet, confirm
  distinctive appearance details first. Treat a later correction as an asset
  invariant and preserve it in the prompt, alt text and visible disclosure.

## Xero integration

- Before claiming a live Xero sync works, verify the full path: event acceptance,
  registered function execution, terminal run outcome, and authorised,
  tenant-scoped source records persisted with their downstream data. Queue
  acknowledgement and synthetic tests alone are insufficient evidence.
- Keep inbound discovery separate from approval reconciliation. An inbound sync
  discovers Xero leave; reconciliation only refreshes records Team Calendar
  already knows about.
- Test adapters with representative regional payloads. AU leave reads require
  V2 semantics, period-level statuses, Pay Items leave-type metadata, and Xero
  `/Date(...)/` normalisation.
- Validate each outbound body against that operation's contract, not a read
  fixture. AU LeaveApplications writes use a top-level JSON array, while reads
  return a `LeaveApplications` envelope.
- Omit `LeavePeriods` for date-only AU leave submissions. Xero should derive
  hours from the employee's payroll calendar; Team Calendar day counts are not
  valid `NumberOfUnits` for hour-based entitlements.
- Refresh credentials before expiry on every sync and write path.
  `connectionActive` describes connection state; it is not token-refresh logic.

## Tenancy and configuration

- Compose tenant-scoped database access with
  `scopedQuery(clerkOrgId, organisationId)`. Include both identifiers in update
  and delete filters, even when the record ID is unique.
- Apply the absent-not-empty rule to optional environment variables with format
  validation, not to unrelated Prisma or Zod defaults.
- Treat migration deployment as the launch-readiness source of truth. A
  successful schema-direct `db push` does not prove that production migrations
  reproduce the schema.

## Verification and CI

- Initialise expensive module registries once after mocks are declared. A fast
  cached import is not evidence that repeated initialisation will fit CI worker
  timeouts.
- Run production builds from a clean generated-file state. Configuration loaded
  before application generation must not depend on application path aliases or
  optional full-app environment validation, and ignored generated files such as
  `next-env.d.ts` must not be explicit lint targets.
- Treat CI as layered. When fixing one gate reveals another failure, inspect
  earlier run history before attributing the newly visible failure to the latest
  change.
- Update unit and integration expectations together when production behaviour
  changes. Use source history to distinguish a stale integration assertion from
  a production regression.
- Temporary external test resources require explicit user approval, isolated
  identifiers, and cleanup. Do not present a test as complete if its required
  database-backed coverage did not run.

## Repository hygiene

- When the operator asks an execution sequence not to block, continue through
  safe in-scope fallbacks and put concrete tooling or environment limitations
  in `plans/README.md`; do not turn a non-product constraint into a new approval
  stop.
- When the user authorises a concrete resolution for a plan's documented truth
  conflict, record the decision and residual issue in `plans/README.md`, then
  continue execution. Do not reopen the same STOP condition as a blocker.
- Stop every persistent development process used for verification, then confirm
  the expected ports are free before hand-off.
- Before calling a repository tidy, inspect registered worktrees, branch tracking,
  and branches not merged into the target branch. A clean working tree is only
  one part of repository state.
- Treat dangling Git objects as normal cleanup residue unless `git fsck` reports
  missing or corrupt objects.
