# Current work

Last reviewed: 2026-09-18

## Documentation task: replace go-live plans

- [x] Check the plan against current repository contracts, scripts and open work.
- [x] Create `plans/go-live.md`, remove both superseded files and update references.
- [x] Verify the standalone plan, links and removal of stale references.

### Review

Complete. Created `plans/go-live.md` and removed both previous files without
redirects. Checked the plan against current product/design contracts, manifests,
CI, preflight, job registration and open remediation. It now records the actual
repository baseline, Plans 144–146, external security/browser follow-ups,
execution order and evidence-based release criteria.

Updated the plan index and active task reference. Verified that both old files
are absent, no stale filename references remain, local links resolve, listed
scripts exist, and document structure/whitespace checks pass. Application and
release gates were not executed for this documentation-only change. Existing
implementation changes and release verification status are preserved.

## Active plan: Australian go-live implementation and release validation

Source: `plans/go-live.md`. Tested source candidate:
`822a7c659509765df7be9fb99f22abce3d798b7a`. Documentation context:
`17c34db41d51c47b20d0323222e77e7d0d541ee2`. Repository 6.0.2,
Bun 1.4.0. The baseline remote check found only `main`. No remote push or
production deployment was performed.

### Tasks

- [x] Establish Git state and preserve supplied plan and unrelated changes.
- [x] Archive historical task evidence and carry forward unresolved follow-ups.
- [x] Read current product, design, architecture, environment and release contracts.
- [x] Record build, static checks, types, tests and configured migration state.
- [x] Reconcile improve plans and retired Git preview execution policies.
- [x] Audit direct dependencies, complete stable upgrades and verify the lockfile.
- [x] Complete the deep improve audit and integrate verified AU-launch source fixes.
- [x] Verify configured Neon migration history and zero schema drift.
- [ ] Prove the committed migration chain against an independent fresh empty database.
- [ ] Complete end-to-end tenant, role, Xero write, feed, job and notification workflows.
- [x] Use Impeccable for UI remediation and source-level final review.
- [ ] Run production-like app/API/web and role-based Australian browser workflows.
- [ ] Complete dashboard timeline and feed URL desktop/mobile/light/dark browser follow-ups.
- [x] Run frozen install, database client build, check, build, typecheck, boundaries, unit and integration gates.
- [ ] Make app/API/web production preflights pass for the configured launch mode.
- [x] Run docs validation and the React Email build.
- [x] Reconcile plans and documentation, review fixes and integrate verified source work locally.
- [x] Produce the evidence-based readiness report for the exact tested candidate.

### External security follow-ups carried forward

- [ ] Verify rotation of the credential formerly exposed in `.mcp.json`.
- [ ] Obtain GitHub Support purge of retained pull-request refs and cached commit views.
- [ ] Re-audit a fresh remote mirror after purge.

### Review

Source remediation and automated repository verification are complete for the
recorded candidate. Frozen install, database client generation, repository
checks, app/API/web builds, typecheck, boundaries, unit and integration suites,
configured Neon migration status and drift, docs lint and React Email build
passed. Recent live AU people, leave and balance sync runs also succeeded.

The decision remains `NOT READY FOR GO-LIVE`. Production preflights fail on
missing configuration, the latest app and web deployments are in error, and
fresh-database migration proof, physical browser coverage, authenticated role
workflows, outbound Xero write-back and external security follow-ups are not
verified. See `tasks/go-live-readiness-report.md`. No remote push or deployment
was performed.

## Active execution: consolidated Australian go-live plan

Candidate branch: `codex/go-live-candidate`, based on `80ac9f7`. Live Neon test
authority is explicit and persists for this release. Verification safeguards
are implementation work, not a new permission gate.

- [ ] D1: unit/live database isolation. Source-only CI, exact 21-suite runtime
  allowlist, lazy connection denial, candidate-bound protected manifest,
  durable KV read-back, active-run fencing, pre-write zero-residue assertion,
  FK-ordered cleanup and focused live rollback proof are implemented. The
  exact protected workflow patch is reviewable but unapplied. Full suite
  fixture ownership conversion, consumer restore implementation and provider
  restore evidence remain open.
- [x] C6: empty and missing manager scope fails closed. Focused availability
  suites pass 42 tests in 3 files.
- [x] C4/C5: missing email transport fails before queue selection and malformed
  availability JSON returns 400 after authentication. Focused suites pass 49 tests.
- [x] R1/R2/R3 and T3: source contracts and focused gates pass on declared
  Node/Bun versions; deployed evidence remains part of O1.
- [x] G3: provisional identity and obsolete launch/region claims removed. Focused
  web suites pass 22 tests in 5 files.
- [x] P4/P5 source and privacy behaviour: public provider excludes auth, analytics
  initialisation is conditional and URL data is sanitised. Identical Turbopack
  analyses reduced `analyze.data` from 540,368 to 507,582 bytes and
  `modules.data` from 2,149,679 to 1,996,006 bytes. These are analyser metadata
  sizes, not compressed route-JavaScript savings.
  Decoded Turbopack data shows Clerk browser parts fell from 65 parts
  (110,455 raw / 34,964 per-part compressed bytes) to zero. Home browser module
  parts fell from 2,678,373 / 1,181,555 to 2,533,524 / 1,133,010; About from
  2,564,021 / 1,156,608 to 2,417,857 / 1,107,839; Pricing from
  2,631,576 / 1,168,019 to 2,486,744 / 1,119,481. These totals include async
  chunks and are not network initial-transfer sizes. PostHog moved out of the
  app entry synchronous graph.
- [x] C1/C2/C3 source: submit side effects remain recoverable through durable
  completion; provisioning deduplicates; failed/equal-time Stripe deliveries
  reconcile authoritatively and remain replayable. Live journey proof remains.
- [x] P1/P2/P3 source: Plans, People and sync views use bounded, stable pages,
  exact scoped counts and batched hydration. Guarded database parity proof is
  still part of D1/T1.
- [x] G1 source: early-access application, invite-only entry contract, stable
  provider idempotency and durable activation capture are implemented. Provider
  mailbox, Clerk role and delivered production evidence remain open.
- [ ] T1: Playwright runner scaffold and production Clerk CSP repair exist. The
  mutation journeys must be bound to exact manifest-owned fixtures with full
  reconciliation before execution.
- [x] T2 source and local gates: docs links and rendered email checks pass.
- [ ] G2 and O1: production configuration, candidate deployment, rollback-aware
  live journeys, monitoring/alerts and launch decision remain open.

### Current external evidence

- Live Neon read-only identity and the 12 applied migration checksums were
  verified; project/branch/restore metadata is still unavailable.
- API health responds; the deployed Inngest registration endpoint fails because
  production signing configuration is absent.
- App and web deployment configuration was repaired for the prior partial
  Better Stack group, then the unrelated status integration was explicitly
  disabled. A reviewed candidate has not been deployed.
- Host Bun 1.3.14 is not release evidence; candidate gates use the existing
  `/home/hilton/.bun/bin/bun` 1.4.0 executable.
