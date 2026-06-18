# Plan 018 (SPIKE): NZ and UK payroll write-back and read

> **Executor instructions**: This is a DESIGN/SPIKE plan for a multi-region
> capability. Produce the design artefact and ONE region's fixture-tested read+write
> behind the existing region switch; do NOT enable writes against live payroll
> without maintainer sign-off. If a STOP condition occurs, stop and report. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/xero/src/nz packages/xero/src/uk packages/xero/src/au packages/xero/src/write packages/xero/src/read`
> Compare against live code; on a mismatch, note it in your design doc.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED (writes to a customer's live payroll once enabled)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

The product markets AU/NZ/UK Xero support (CLAUDE.md, PRODUCT.md), but only **AU**
can actually submit/approve/sync. `packages/xero/src/nz/write.ts` and
`packages/xero/src/uk/write.ts` are pure stubs returning
`"...write-back is not yet available."` with `TODO(nz-payroll)`/`TODO(uk-payroll)`
on all four operations; `nz/read.ts` and `uk/read.ts` are ~12 lines each vs.
`au/read.ts` (340) and `au/write.ts` (264, a real implementation hitting
`api.xero.com`). The region dispatchers already route all three regions
(`write/dispatch.ts`, `read/dispatch.ts`), so the seam is in place — the
rate-limiting, crypto, and OAuth layers are region-agnostic and done.

Closing this unlocks two stated markets with no architectural change. The cost is
the per-region Xero Payroll API differences (NZ and UK have distinct leave
endpoints and payload shapes) and the safety of writing to live payroll.

## What to investigate / produce

Produce a design document at `plans/018-nz-uk-payroll-design.md`, then implement
**one** region (recommend NZ) as the reference, fixture-tested, behind the existing
`payrollRegion` switch — with live writes left disabled pending maintainer sign-off.

### Investigate

1. **AU reference**: read `packages/xero/src/au/read.ts` and `au/write.ts` and the
   dispatchers (`write/dispatch.ts`, `read/dispatch.ts`) to document the exact
   contract each region module must satisfy (function signatures, `Result` types,
   error mapping via `mapHttpError`/`toPlainLanguageMessage`).
2. **Xero NZ/UK Payroll API**: use Context7 / Xero developer docs to capture the
   NZ and UK leave-application read and write endpoints and payload shapes, and how
   they differ from AU. Record citations in the design doc.
3. **Region-specific mapping**: what `recordType` ↔ leave-type mapping and
   date/unit handling differ per region.
4. **Safety**: how to gate enablement (feature flag / env / `payrollRegion` guard)
   so AU stays untouched and NZ/UK writes are off until a sandbox Xero file per
   region has been validated.

### Implement (one region, fixture-tested, writes disabled)

- Implement `packages/xero/src/nz/read.ts` and `nz/write.ts` mirroring the AU module
  structure, with **fixture-based mapper tests** per the repo's Xero-adapter rules
  (`grep -rl "fixture" packages/xero/src/au` for the existing pattern).
- Keep NZ write-back **disabled** at the dispatch/guard level (return the existing
  "not yet available" until explicitly enabled), so this lands safely without
  touching a live NZ payroll. Document the one-line change that enables it post
  sandbox validation.
- Do **not** implement UK in this plan — it follows the same template once NZ is the
  proven reference.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `bun install`                                         | exit 0              |
| Tests     | `bunx vitest run packages/xero`                       | all pass            |
| Typecheck | `bunx tsc --noEmit -p packages/xero/tsconfig.json`    | exit 0              |

## Scope

**In scope**:
- `plans/018-nz-uk-payroll-design.md` (primary deliverable)
- `packages/xero/src/nz/read.ts`, `packages/xero/src/nz/write.ts` + fixture tests
- The dispatch/guard wiring needed to register NZ **with writes still disabled**

**Out of scope**:
- UK implementation (same template later).
- Enabling live NZ writes (requires a sandbox Xero file + maintainer sign-off).
- Any change to AU modules or the region-agnostic OAuth/crypto/rate-limit layers.

## Git workflow

- Branch: `advisor/018-nz-payroll-spike`
- Conventional commits, e.g. `docs(plans): nz/uk payroll design` and
  `feat(xero): nz read+write (writes gated off)`.
- Do NOT push/PR unless instructed.

## Done criteria

ALL must hold:

- [ ] `plans/018-nz-uk-payroll-design.md` documents the region contract, the NZ/UK
      Xero API differences (with citations), region mapping, and the enablement
      gate, plus open questions for the maintainer
- [ ] NZ read+write implemented with fixture-based mapper tests, mirroring AU
- [ ] NZ live write-back remains **disabled** behind the documented gate
- [ ] `bunx vitest run packages/xero` passes; `bunx tsc --noEmit -p packages/xero/tsconfig.json` exits 0
- [ ] `bun run check` exits 0; AU behaviour unchanged (AU tests still pass)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The NZ/UK Xero Payroll leave API cannot be confirmed from official docs (do not
  guess payload shapes for a payroll write path) — deliver the design doc with the
  open questions and stop before implementing.
- Implementing NZ would require changing AU modules or the shared dispatch contract
  in a way that risks AU — report the coupling.

## Maintenance notes

- Live enablement per region must follow sandbox validation against a real NZ/UK
  Xero file; the design doc owns that checklist.
- UK is a copy of the NZ template once NZ is proven; do not start it until then.
- Reviewer: the safety property is that AU is untouched and NZ writes stay gated off
  until explicitly enabled.
