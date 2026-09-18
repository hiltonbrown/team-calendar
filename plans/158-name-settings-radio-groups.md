# Plan 158: Name settings radio groups

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Confidence: HIGH
- Category: accessibility, app
- Depends on: Impeccable final audit
- Planned at: `2d0e04b`, 2026-09-18
- Status: DONE

Implemented in `77adcb4` and locally integrated as `f6f8aa1`. Five focused
tests, app typecheck, scoped Biome, the Impeccable detector and diff checks
passed; the detector reported zero findings on the changed files.

## Why this matters

Radio groups in leave approval and feed settings have nearby explanatory text
but no programmatic group name or labelled relationship. Screen-reader users
hear individual options without the question or setting they answer, failing
WCAG 1.3.1 and 4.1.2. Recurrence preview date chips also use 10px operational
text below the design-system readability floor.

## Scope

- Leave-approval settings client and tests
- Feed settings client and tests
- Recurrence-fields preview and focused tests

Use Impeccable Operate, audit and polish guidance. Preserve existing content,
layout and behaviour.

## Implementation

1. Give every affected `RadioGroup` an accessible name using a visible heading
   or label through `aria-labelledby`, plus `aria-describedby` where existing
   explanatory copy adds context. Keep IDs stable and unique.
2. Add accessibility assertions for group roles and names in focused tests.
3. Raise recurrence preview chips to the existing minimum readable small-text
   token without changing density or hierarchy, and cover the intended class.

## Verification

- Focused settings and recurrence tests
- App typecheck, scoped check and production build
- Browser/snapshot check where authentication permits

## STOP conditions

Stop if a shared design-system primitive should own the labelling contract for
all consumers; make that narrow shared correction and test representative uses
instead of duplicating attributes.
