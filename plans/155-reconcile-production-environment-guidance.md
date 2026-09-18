# Plan 155: Reconcile production environment guidance

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Confidence: HIGH
- Category: documentation, operations
- Depends on: none
- Planned at: `a4182a0`, 2026-09-18
- Status: DONE

Implemented in `9304f81` and locally integrated as `39f98ea`. Preflight tests
passed 13/13, Mint reported no broken links, and the diff check passed.

## Why this matters

The README contains a detailed environment matrix that mostly matches
`packages/next-config/preflight.ts`, followed by concise prose that omits
required Sentry, Xero, webhook and email settings and describes some enforced
values as optional. An operator following the summary can create a production
configuration guaranteed to fail the executable preflight.

## Scope

- `README.md`
- Preflight tests only if a small exported requirement table is already the
  clear source of truth

Do not change runtime environment requirements or provider configuration.

## Implementation

1. Treat `runProductionPreflight` as authoritative and reconcile the concise
   README production minimums with its actual early-access and paid-mode checks.
2. Prefer one canonical matrix and short references to it over duplicated
   requirement lists. Preserve absent-not-empty guidance and supported aliases.
3. Verify every required variable name in the documentation appears in the
   current preflight and that paid-only requirements stay conditional.

## Verification

- Documentation link/format checks
- Preflight unit tests
- `git diff --check`

## STOP conditions

Stop if source schemas and preflight intentionally disagree; that is a runtime
contract defect requiring a separate implementation plan, not documentation
wording.
