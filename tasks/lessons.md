# Lessons

This file records reusable patterns learned from user corrections and verified
failures. Canonical product, architecture, security and design rules belong in
`PRODUCT.md`, `AGENTS.md`, `SECURITY.md` and `DESIGN.md`; execution discipline
lives in `AGENTS.md`. Keep each lesson to one actionable bullet under its topic.
Keep one-off task evidence in that task's review, not here.

## Product UI and CSS

- Build dynamic CSS class names with array filtering
  (`[baseClass, cond && activeClass].filter(Boolean).join(' ')`), not template
  string concatenation, to avoid missing-space bugs.
- Avoid broad child tag selectors such as `.container span`; they match and
  override nested badges or chips. Put targeted class names on direct children.
- Before splitting route CSS, identify shared selector ownership as well as route
  consumers. If a route stylesheet owns global layout primitives, expand the
  approved scope explicitly and extract them before changing imports.
- Make time the primary axis in calendar visualisations. Anchor today, preserve
  chronological order at every viewport, and use atmosphere, intensity and
  provenance as supporting signals.
- Put the decision signal on the timeline axis itself. For team coverage, show
  known unavailable counts and peak thresholds in each date column; do not hide
  them in the selected-day detail or imply that unreported days mean zero.
- Calendar contrast refinements must keep a clearly visible outer boundary. Use
  the theme-aware outline token when tonal surfaces alone do not define it.
- Use an exclusive selector for discrete choices such as country or currency. A
  range slider implies a continuous scale.
- Keep internal design-direction names out of product chrome. Surface titles use
  the established route or product name unless the user approves a rename.
- When a restoration request names `main` or a live surface as the reference,
  treat it as authoritative. Do not substitute an older snapshot because the
  request also says "previous".
- Do not restyle vendored or governance files solely to satisfy product language
  or presentation rules. Flag the difference and change the canonical source.
- Before generating a placeholder for a real person or pet, confirm distinctive
  appearance details. Treat a later correction as an asset invariant across the
  prompt, alt text and visible disclosure.

## Xero integration

- Before claiming a live Xero sync works, verify the full path: event acceptance,
  registered function execution, terminal run outcome, and authorised,
  tenant-scoped source records persisted with their downstream data. Queue
  acknowledgement and synthetic tests alone are insufficient.
- Keep inbound discovery separate from approval reconciliation. Inbound sync
  discovers Xero leave; reconciliation only refreshes records Team Calendar
  already knows about.
- Test adapters with representative regional payloads. AU leave reads require V2
  semantics, period-level statuses, Pay Items leave-type metadata and Xero
  `/Date(...)/` normalisation.
- Validate each outbound body against that operation's contract, not a read
  fixture. AU LeaveApplications writes use a top-level JSON array; reads return a
  `LeaveApplications` envelope.
- Omit `LeavePeriods` for date-only AU leave submissions. Xero derives hours from
  the employee's payroll calendar; Team Calendar day counts are not valid
  `NumberOfUnits` for hour-based entitlements.
- Refresh credentials before expiry on every sync and write path.
  `connectionActive` describes connection state; it is not token-refresh logic.
- Accept only the documented Xero scope-denial forms: the exact standalone
  `WWW-Authenticate` token and a valid Bearer error challenge. Test both
  spellings, and keep provider wire observations separate from documentation
  evidence.
- An approval to run a specific provider campaign is not a general rate-limit
  exemption. Preserve shared limits, counters, cooldowns and `Retry-After`, and
  never report unknown prior provider usage as zero.

## Tenancy and configuration

- Compose tenant-scoped database access with
  `scopedQuery(clerkOrgId, organisationId)`. Include both identifiers in update
  and delete filters, even when the record ID is unique.
- Apply the absent-not-empty rule to optional environment variables with format
  validation, not to unrelated Prisma or Zod defaults.
- Treat migration deployment as the launch-readiness source of truth. A
  successful `db push` does not prove production migrations reproduce the schema.
- Keep private contact-form recipients in server-side configuration only. Do not
  repeat their addresses in public copy, responses or task summaries.
- Vercel environment downloads omit sensitive values. Inspect the Production,
  Preview and Development inventories and compare database targets before
  declaring a setting absent or replacing it.
- Describe external provider controls as required configuration until concrete
  provider evidence identifies the account, access list, rule and delivery
  result. Repository intent does not prove a mailbox or dashboard rule exists.

## Data integrity and evidence

- Unknown is not zero and archive is not abandonment. Evaluate proven active
  signals first, then protect unknowns, then evaluate candidates. An unreadable
  signal stays unknown while other proven signals still decide.
- Preserve historical usage across token or credential rotation. A new token
  without a timestamp must not erase earlier consumption.
- After an asynchronous independent observation, re-read durable state before
  applying the result. Require the target intent and authority to be unchanged,
  and preserve unrelated entries added during the wait.
- Recovery must freshly establish prior writer closure before any cleanup,
  including when fixture verification fails.
- Validate each receipt before accounting for duplicates. Keep independently
  proven failures regardless of sibling validity or order, and carry
  incomplete-evidence markers through every phase. A receipt's phase must match
  the action or terminal stage it records.
- Apply exact candidate equality in offline report validation as well as in the
  runner. Non-null metadata does not prove two components share a candidate.
- Readiness requires each named assertion at every required evidence level. A
  successful suite exit does not establish individual case-level passes.
- For timestamp-guarded webhook mirrors, inspect the atomic write result. A
  zero-row write can be an equal-time collision and must trigger authoritative
  reconciliation or a retryable failure before the receipt is marked processed.

## Verification and CI

- Separate host-caused gate failures from repository failures. Record the
  host-limited gate as NOT VERIFIED with the exact command for a capable host,
  and continue independent work. Do not swap tooling (for example Turbopack for
  Webpack) to obtain a green result.
- Do not present a test as complete if its required database-backed coverage did
  not run. Temporary external test resources require explicit user approval,
  isolated identifiers and cleanup.
- Treat CI as layered. When fixing one gate reveals another failure, inspect
  earlier run history before blaming the latest change.
- Update unit and integration expectations together when production behaviour
  changes. Use source history to tell a stale assertion from a regression.
- Initialise expensive module registries once after mocks are declared. A fast
  cached import does not prove repeated initialisation fits CI worker timeouts.
- Run production builds from a clean generated-file state. Configuration loaded
  before application generation must not depend on app path aliases or optional
  full-app environment validation, and ignored generated files such as
  `next-env.d.ts` must not be explicit lint targets.
- Use the array form `{ find, replacement }` for Vitest aliases when prefixes
  overlap (for example `@repo` and `@repo/database/live-test-fixture`). Biome
  re-sorts object keys, letting shorter prefixes shadow specific subpaths.
- Scope `ALLOW_LOCAL_DATABASE_TESTS=1` to integration steps against local
  ephemeral containers only. It never authorises a remote database, and unit
  tests stay network-isolated.
- In Next.js development, use `http://localhost:<port>`, not
  `http://127.0.0.1:<port>`, in browser and Playwright verification.
  `allowedDevOrigins` defaults to `localhost` and blocks HMR and hydration
  otherwise.

## Working with the operator

- When told not to block, a host permission denial ends only the denied action.
  Record it with the exact operator command in `plans/README.md` in the same
  turn, finish every independent deliverable and report. Do not close with "if
  you approve" offers or option menus.
- When the user settles a decision or authorises a resolution, record it and
  continue. Do not reopen the same question or turn incomplete tooling into a new
  permission gate.
- When an environment obstacle blocks a plan step, report the exact issue, keep
  the affected checks NOT VERIFIED, and continue independent work.

## Repository hygiene

- When replacing multiple documents with one, create a single standalone source
  of truth, remove the superseded files and update references. Do not keep
  redirect stubs or consolidation history unless requested.
- Stop every persistent development process used for verification, then confirm
  the expected ports are free before hand-off.
- Before calling a repository tidy, inspect registered worktrees, branch tracking
  and branches not merged into the target. A clean working tree is only part of
  repository state.
- Treat dangling Git objects as normal cleanup residue unless `git fsck` reports
  missing or corrupt objects.
