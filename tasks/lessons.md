# Lessons

When the user says to continue without blocking after a recommended plan
resolution, carry that resolution into a concrete implementation and verification
record. Reuse the settled live-Neon authority and existing protected runner;
do not repeat the policy question or substitute a local database.

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

- Treat a gate failure caused by the agent host separately from a repository failure. Keep the
  plan in progress, record the host-limited gate as NOT VERIFIED, preserve the exact production
  gate for a capable host, and continue every independent deliverable. Do not swap Turbopack for
  Webpack merely to obtain a green build result.

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
- A host permission denial ends only the denied action. Record it with the
  exact operator command in `plans/README.md` in the same turn, finish every
  independent deliverable, and report. Never close with “if you approve” offers
  or a menu of options after the operator has said not to block.
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

- When distilling Features, retain the Short answers section alongside the calendar
  demo and teammate table; simplify its wording instead of removing it.

- When an executable plan hits an environment obstacle, report the exact issue,
  reconcile the plan with new user authorisation, and continue independent
  work. Keep blocked checks marked NOT VERIFIED until their actual gates run.

- When the user explicitly rules out a local database, do not offer localhost,
  Docker or a local fallback again. Use only the authorised online database
  through the protected live runner, and keep blocked live gates explicit.

- For Plan 161 execution, use the already authorised online Neon database through
  the protected live runner. This session-wide decision overrides later plans
  that still prescribe localhost or Docker. Read this rule before provisioning
  any database; reconcile stale plan database instructions and refresh live
  ownership, restore, consumer-isolation and cleanup evidence instead.

- Xero scope denial documentation includes an exact standalone WWW-Authenticate token as well as a valid Bearer error challenge. Accept only these documented forms, test both spellings, and keep actual provider wire validation separate from documentation evidence.


## Plan 161h reconciliation

- Archive is not evidence of abandonment when subscription, human or feed history is unknown. Keep active signals first, then unknown protection, then candidate evaluation.
- Preserve recent consumption across token rotation for active feeds; a new token with no timestamp must not erase historical use. Unreadable individual signals remain unknown while other proven active signals still decide activity.
- Charter readiness requires each exact assertion at every required evidence level. A successful integration suite exit cannot establish forty case-level PASS observations.

## Plans 160 to 161h live verification reminder, 27 September 2026

- The Plan 161 online Neon rule at lines 211 to 215 remains authoritative. A synthetic build URL is only a build setting, never the integration-test target. Once domain fixes are frozen, begin their regression campaign through the protected live runner with refreshed ownership, restore, consumer isolation and cleanup evidence while independent harness work continues. Do not delay live verification behind unrelated harness builds or revisit local database setup.

## Plan 160 evidence and recovery review

- Apply exact candidate equality in offline report validation as well as the execution runner. Non-null metadata cannot establish that the harness and application share a candidate.
- After an asynchronous independent observation, re-read durable state before applying its result. Require the target intent and authority to remain unchanged; preserve unrelated entries added during the wait. Recovery must freshly establish prior writer closure before any cleanup, including when fixture verification fails.
- Validate each receipt before accounting for duplicates. Keep independently proven failures regardless of sibling validity or order, and carry incomplete-evidence markers through every collection phase. Assertion, ownership and cleanup receipt phases must match the actual action or terminal stage.


## All-plan live database authority

- The user's instruction to use the live database applies to all authorised plans.
  Follow the protected online runner and refresh ownership, restore, consumer
  isolation, cleanup and exact-candidate evidence. Stale plan instructions for a
  local or disposable database are superseded; incomplete tooling is implementation
  work, not a reason to request the same database permission again.

## 2026-10-02: approved campaign namespace admission

The user explicitly removed a fixed 24-hour testing or new-namespace hold for this approved Xero campaign. Honour that authorisation through an explicit immediate-admission operator policy with acknowledgement that prior provider usage is unknown. Preserve the configured credential domain and epoch, all existing counters/cooldowns, Starter 1,000/day, minute/concurrency controls and provider Retry-After. Do not interpret this campaign approval as a general exemption from rate limits, or report unknown prior usage as zero.

## 2026-10-02: prove the approved flow before expanding the harness

The user corrected work that expanded campaign infrastructure without reaching the approved AU browser/provider flow. Separate controls required for the next authorised operation from reusable tooling that can wait. Use existing reviewed guards and a bounded, concrete execution procedure to prove the user flow first. Do not let a general runner, every catalogue driver, repeated host inventory or repeated already-passing tests become substitutes for execution. Add infrastructure only when a specific unresolved safety or evidence requirement makes it necessary for that next operation, and state that dependency explicitly.

## 2026-10-02: enforce user instructions before acting

Failure: explicit instructions to work efficiently, avoid busy work and finish the
authorised task were acknowledged without promptly changing execution. Inferred
completeness and production-quality goals drove unnecessary framework work and
repeated verification. A new broad test run after the user requested commit and
merge repeated the scope failure. The guidance was already available; the failure
was not enforcing it when choosing actions.

- Before each tool call or delegation, identify the current deliverable and its
  stopping condition. Proceed only when the action delivers required work, fixes
  an observed defect or removes a demonstrated blocker.
- Apply explicit user constraints before inferred improvements, skill workflows
  and plan extensions. Production quality does not authorise scope expansion.
- Reuse valid evidence. Repeat verification only when relevant changes invalidate
  it, an observed failure needs investigation or an explicit gate requires it.
- Give subagents the same scope, constraints and stopping condition. On a user
  correction, immediately stop conflicting delegated work and revise remaining
  assignments before further execution.
- Treat "commit and merge" as the current operation. Preserve unfinished work,
  record verification gaps and complete the authorised operation; do not silently
  add another implementation or verification phase.
- Stop when the requested outcome is achieved and report its evidence and limits.
  Acknowledging a correction or recording a lesson does not replace changing the
  next action. The user should not need to repeat the instruction.
