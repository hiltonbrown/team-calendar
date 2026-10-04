# Ordinary campaign admission implementation plan

Goal: allow ordinary authenticated AU actions without a campaign bootstrap
sentinel, while preserving active-campaign isolation and all mandatory tenant,
binding, database and shared rate-limit controls.

Spec: `160-au-transition-contract-v1.md`; go-live X2's ordinary-action dependency.
The user instructed continuous execution and live database use on 4 October.
Implement inline with the executing-plans skill. Do not expand the frozen harness.

## Tasks

1. Add an ordinary-only store reader which accepts successfully observed absence
   of both sentinel and reservation. Strict campaign readers retain denial.
   Test normal work, malformed/orphan/active reservations and transport failure.
2. Allow ordinary invocation/provider ownership before sentinel initialisation.
   Keep exact operation identity, uncertain retention, atomic acquisition checks
   and advisory locking. Test acquisition races and bootstrap during completion.
3. Route ordinary access, persistence, provider and maintenance checks through
   the ordinary reader; campaign authority/tickets/observation stay strict.
   Run database and Xero regressions, source gates and one independent review.
4. Resume Plan 160: route protected suites only under the protected runner,
   freeze the candidate, refresh live ownership/restore/consumer evidence and
   replay integration against authorised Neon. Continue bounded UI proof only
   when the existing real safety controls admit it. Record unavailable proof
   as NOT VERIFIED; never replace Neon with a local database.

## Verification

Use RED then GREEN for changes. Run root lint, types and unit tests, frozen
release-tool checks and the protected live integration runner. Ordinary CI's
localhost gate is separate and never the operator's test target.
