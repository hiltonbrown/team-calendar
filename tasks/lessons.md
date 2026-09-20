# Lessons

This file records reusable patterns learned from user corrections and verified
failures. Canonical product, architecture, security, and design rules belong in
`PRODUCT.md`, `AGENTS.md`, `SECURITY.md`, and `DESIGN.md`. Keep each lesson
actionable; keep one-off task evidence in the review for that task.

## Product and design

- Put the calendar-app refresh explanation and “No re-keying” sentence in a
  separate paragraph from the leave submission and publication description.

- Keep the homepage problem statement’s closing “Keep leave, travel and out
  of office plans…” sentence in its own paragraph.

- In the homepage problem statement, use “Leave approved in a text message”
  to identify the communication channel explicitly.

- Marketing copy should name the missed action and its practical consequence.
  Avoid contrived metaphors, dramatic filler and invented scenes such as
  “the patchwork holds until it doesn’t” or lost Monday mornings.

- Hero copy must distinguish approved leave write-back to Xero from calendar
  publication of travel, out of office, WFH and other availability updates.

- When constructing dynamic CSS class names with template literals, prefer
  array filtering (`[baseClass, cond && activeClass].filter(Boolean).join(' ')`)
  over inline template string concatenation to eliminate missing-space bugs.

- Avoid broad child tag selectors like `.container span` that unintentionally match
  and override nested badges or pill chips with higher CSS specificity. Use
  targeted class names on direct child elements instead.

- Keep the homepage sync diagram on a transparent canvas without a dot grid.
  Size the SVG independently of its wrapper, and avoid fixed minimum heights
  that leave empty space beneath the mobile alternative.

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

- Explicit authority to use the live Neon database persists for the release.
  Implement target, ownership, rollback and cleanup safeguards and continue the
  authorised tests; do not turn incomplete tooling into another permission
  question or a reason to fall back to disposable database evidence.
- When the user explicitly authorises live database verification, that authority
  persists for the scoped release run. Build and enforce identity, ownership and
  cleanup safeguards as implementation work; do not turn incomplete safeguards
  into another permission gate.
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
- Use array format `{ find, replacement }` for Vitest path aliases when path
  prefixes overlap (e.g. `@repo` and `@repo/database/live-test-fixture`). Object
  syntax keys are subject to Biome alphabetical re-sorting, which causes shorter
  prefixes to shadow specific subpaths.
- Differentiate local ephemeral CI containers (`localhost`) from protected remote
  databases. Scope local database test permissions (`ALLOW_LOCAL_DATABASE_TESTS=1`)
  strictly to integration steps to preserve unit test network isolation while
  allowing deterministic local test fixture allocation without remote manifests.
- Temporary external test resources require explicit user approval, isolated
  identifiers, and cleanup. Do not present a test as complete if its required
  database-backed coverage did not run.
- In Next.js development mode, always use `http://localhost:<port>` rather than
  `http://127.0.0.1:<port>` in headless browser/Playwright verification scripts.
  Next.js enforces `allowedDevOrigins` (defaulting to `localhost`), blocking HMR
  WebSockets and client chunk hydration when navigated via numeric IP.

## Repository hygiene

- When asked to replace multiple documents with one, create one standalone
  source of truth, remove the superseded files and update their references.
  Do not retain redirect stubs or consolidation history unless requested.
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
- For timestamp-guarded webhook mirrors, inspect the atomic write result. A
  zero-row write can be a concurrent equal-time collision and must trigger
  authoritative reconciliation or a retryable failure before the receipt is
  marked processed.
- Describe external provider controls as required configuration until concrete
  provider evidence identifies the account, access list, rule and delivery
  result. Repository intent is not proof that a mailbox or dashboard rule exists.

- Avoid clipped, paired slogans in marketing headlines such as “Your whole
  team. On payroll or off.” State the useful outcome in natural language and
  explain payroll eligibility in the supporting copy.

- Keep private contact-form recipients in server-side configuration only. Do not
  repeat their addresses in public-facing copy, responses or task summaries.
- Vercel environment downloads omit sensitive values. Verify the environment
  inventory before declaring a setting absent or attempting to replace it.

- Calendar contrast refinements must preserve a clearly visible outer boundary.
  Use the theme-aware outline token when tonal surfaces alone do not define it.

- For live verification, inspect the relevant Vercel project environment inventories and pull Production, Preview and Development values before treating missing local variables as missing configuration. Compare database targets across environments. Sensitive values omitted from downloads are not evidence of absence.
- When a user confirms an existing database connection and says to continue,
  treat the live-target authorisation as settled. Investigate executable test
  isolation and available provider configuration before returning the same
  prerequisite list or asking them to locate credentials again.

- Use an exclusive selector for discrete country/currency choices. A range
  slider wrongly suggests a continuous scale and duplicates the selection UI.

- Keep Integrations focused on connections to payroll and accounting systems,
  availability and supported regions. Functional advantages and calendar demos
  belong on Features; do not repeat them on Integrations.
- When simplifying Integrations, retain data-flow details: what each connection
  reads, writes and never accesses. These explain integration scope and are not
  duplicate product features.
- Preserve the integrations hero when distilling lower-page content unless its
  replacement is explicitly requested; restore the user’s reference hero when asked.
