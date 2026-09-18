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

Source: `plans/go-live.md`. Baseline: `main` at
`ee8c41094a841e4d2ac6a8d4493b2b8356069bb9`, repository 6.0.2,
Bun 1.4.0, Node v24.21.0. The supplied go-live plan was initially untracked.
The baseline remote check found only `main`. The user has authorised committing
and pushing the go-live planning documents; implementation remains unverified.

### Tasks

- [x] Establish Git state and preserve supplied plan and unrelated changes.
- [x] Archive historical task evidence and carry forward unresolved follow-ups.
- [ ] Read current product, design, architecture, environment and release contracts.
- [ ] Record baseline build, static checks, types, tests and migration state.
- [ ] Reconcile improve plans and retired Git preview execution policies.
- [ ] Audit all direct dependencies against current stable releases, upgrade and verify.
- [ ] Complete deep improve audit and implement verified AU-launch P0/P1/P2 findings.
- [ ] Verify configured Neon, migration history, empty-database construction and zero drift.
- [ ] Verify tenant isolation, authorisation, Xero writes/sync, jobs, feeds and notifications.
- [ ] Use Impeccable for all UI remediation and final app/web/design-system review.
- [ ] Run production-like app/API/web and role-based Australian browser workflows.
- [ ] Complete dashboard timeline and feed URL desktop/mobile/light/dark browser follow-ups.
- [ ] Run frozen install, check, build, typecheck, boundaries, unit and integration gates.
- [ ] Run app/API/web preflights, docs validation and React Email build.
- [ ] Reconcile docs, inspect final diff, review fixes, merge verified work and clean temporary resources.
- [ ] Produce the evidence-based readiness report for the exact tested candidate.

### External security follow-ups carried forward

- [ ] Verify rotation of the credential formerly exposed in `.mcp.json`.
- [ ] Obtain GitHub Support purge of retained pull-request refs and cached commit views.
- [ ] Re-audit a fresh remote mirror after purge.

### Review

In progress. Historical verification in `tasks/archive.md` is not evidence for
this release candidate. Current run logs are under `/tmp/teamcalendar-go-live`;
durable results and constraints will be recorded in the release report.
