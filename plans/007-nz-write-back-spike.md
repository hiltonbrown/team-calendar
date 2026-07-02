# Plan 007: NZ payroll write-back spike (investigate and specify, doc-only)

> **Executor instructions**: This is a design/spike plan. Your deliverable is a
> written report, not code. Do not modify any file outside `plans/`. If
> anything in the "STOP conditions" section occurs, stop and report. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- packages/xero/src`
> If `packages/xero/src/au/write.ts` or `packages/xero/src/write/` changed
> since this plan was written, compare the "Current state" notes against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (spike; the build it specifies is L)
- **Risk**: LOW (doc-only)
- **Depends on**: none (plan 003 improves the interim error message independently)
- **Category**: direction
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

The marketing site (`apps/web/app/integrations/page.tsx`) and PRODUCT.md both advertise Xero Payroll support for Australia, New Zealand and the United Kingdom, but leave write-back (submit, approve, decline, withdraw) is implemented for AU only. The NZ and UK modules are stubs carrying the only TODO markers in the entire repository (`TODO(nz-payroll)` and `TODO(uk-payroll)`, four each). Implementing NZ write-back is the clearest stated-but-undelivered feature in the product, but it is an L-effort build against a different Xero API with real payroll consequences. This spike produces the design document that makes that build plannable: endpoint and payload deltas versus the AU implementation, prerequisites, fixture strategy, and open questions. NZ before UK because PRODUCT.md's region list and the tenancy model treat regions uniformly and NZ is the smaller API delta from AU (verify this claim in the spike; if UK turns out closer, say so).

## Current state

- `packages/xero/src/au/write.ts` (264 lines) is the reference implementation: exports `submitLeaveApplication` (line 32), `approveLeaveApplication` (line 90), `declineLeaveApplication` (line 105), `withdrawLeaveApplication` (line 123), against `XERO_DEFAULT_BASE_URL = "https://api.xero.com"` (line 15).
- `packages/xero/src/nz/write.ts` and `packages/xero/src/uk/write.ts`: four stub functions each, returning a hardcoded error (`code: "unknown_error"` at commit 8790bdb; plan 003 changes this to `region_not_supported_error`). Each stub carries a `TODO(nz-payroll)` / `TODO(uk-payroll)` comment.
- `packages/xero/src/write/dispatch.ts` routes by `payroll_region` (AU/NZ/UK) from the XeroTenant; the plumbing for NZ is already in place, only the region module is missing.
- `packages/xero/src/write/types.ts` defines the shared input types (`SubmitLeaveApplicationInput` etc., lines 42-69) and `XeroWriteError`. Region modules must keep these signatures.
- Read-side region handling already exists: `packages/xero/src/au/read.ts` has a co-located test (`au/read.test.ts`); check whether `nz/` and `uk/` read modules exist and how leave records for NZ tenants sync today. That asymmetry (inbound sync working, outbound stubbed, or both stubbed) is a key spike question.
- Repo rules that bind the future build (CLAUDE.md, "Xero adapter rules"): all Xero code in `packages/xero`, region logic in subdirectories; raw write error payloads to `xero_write_error_raw` (admin audit only); rate limiting inside the package; fixture-based tests for region-specific parsers; outbound writes return `Result<T, XeroWriteError>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm no source changes | `git status --short` | only files under `plans/` |

## Suggested executor toolkit

- Use the Context7 MCP tools (or web search if available) for current Xero Payroll NZ API documentation; the AU and NZ Payroll APIs are separate products with different endpoints and payload shapes. Do not rely on memory for endpoint paths or field names; cite the doc URLs you used.
- Read `packages/xero/src/au/write.ts` and `packages/xero/src/au/write.test.ts` fully before writing the deltas section.

## Scope

**In scope** (files you may create or modify):

- `plans/007-report-nz-write-back.md` (create; the deliverable)
- `plans/README.md` (status row)

**Out of scope**: all source code, including the NZ stubs. No Xero API calls against real tenants.

## Steps

### Step 1: Characterise the AU baseline

From `au/write.ts` and its test, document in the report: the exact endpoints called per operation, request/response shapes, how approval and decline map to Xero AU leave application state, how errors map to `XeroWriteError` variants, how the encrypted token from `XeroTenantForWrite.xero_connection` is used, and how rate limiting wraps the calls (see `packages/xero/src/rate-limit/`).

**Verify**: report section "AU baseline" exists with file:line citations per operation.

### Step 2: Map the NZ deltas from official documentation

For each of the four operations, document against the Xero Payroll NZ API: endpoint path and version, payload shape, the NZ leave model's differences (leave types, units, part-day handling, approval states), whether decline-with-reason exists as a first-class concept, and any operations NZ simply does not support (if an operation has no NZ equivalent, that is a headline finding, not a footnote). Cite the documentation URL for every claim.

**Verify**: report section "NZ deltas" covers all four operations with doc citations.

### Step 3: Establish the read-side and resolution prerequisites

Check what already works for NZ tenants: does `packages/xero/src/nz/` have read/sync modules, do `resolve-employee.ts` and `resolve-leave-type.ts` (in `packages/xero/src/resolution/`) handle NZ ids, and does inbound leave sync populate `availability_records` for NZ today? List every prerequisite the write build depends on (for example: NZ leave-type mapping tables, employee id resolution, units conversion).

**Verify**: report section "Prerequisites" lists each with status (exists / missing / unknown).

### Step 4: Specify the build plan skeleton and open questions

Write: the proposed file list for the build (mirroring `au/`), a fixture strategy (recorded sandbox responses per operation, stored like the existing AU fixtures; name where AU fixtures live), a test list (per CLAUDE.md: fixture-based mapper tests, dispatch tests, error mapping tests), a sandbox/testing prerequisite section (Xero NZ demo company, app scopes needed), and open questions for the maintainer, each with a suggested default. Include a coarse effort estimate for the build broken down by operation.

**Verify**: report sections "Build skeleton", "Fixtures and tests", "Open questions" exist; `git status --short` shows only `plans/` changes.

## Test plan

Not applicable (doc-only). The report's "Fixtures and tests" section is the test plan for the future build.

## Done criteria

- [ ] `plans/007-report-nz-write-back.md` exists with sections: AU baseline, NZ deltas, Prerequisites, Build skeleton, Fixtures and tests, Open questions
- [ ] Every NZ API claim cites a documentation URL; every repo claim cites file:line
- [ ] `git status --short` shows changes only under `plans/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- You cannot access current Xero Payroll NZ documentation (no Context7 result, no web access); a deltas section from memory is worse than none.
- You discover NZ inbound leave sync is also stubbed or absent (not just write-back); the spike's scope assumption changes and the maintainer should re-scope before you continue.
- Any step tempts you to modify source code or call Xero APIs.

## Maintenance notes

- The UK spike should be a copy of this plan with region swapped, written only after the NZ build lands and has burned in; UK Payroll is a third distinct API and lessons from NZ will change the questions.
- Plan 003's `region_not_supported_error` and its tests are the tripwire: when the NZ build lands, those tests fail and point at everything that must flip.
