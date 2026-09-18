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
