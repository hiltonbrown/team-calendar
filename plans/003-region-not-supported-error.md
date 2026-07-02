# Plan 003: Give NZ/UK write-back stubs a distinct region_not_supported_error with a plain-language message

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- packages/xero/src/write/types.ts packages/xero/src/nz/write.ts packages/xero/src/uk/write.ts packages/xero/src/write/dispatch.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

Xero write-back (submit, approve, decline, withdraw) is implemented for AU payroll only. The NZ and UK modules are intentional stubs, but they return `code: "unknown_error"`, whose plain-language message is "Something went wrong when sending this to Xero. Try again or contact support if the issue continues." A user on an NZ or UK Xero file therefore sees a misleading transient-failure message, retries pointlessly, and eventually contacts support. There is also no way for telemetry to distinguish "region not built yet" from real unknown failures. A dedicated error variant fixes the message, makes the state machine's decision explicit, and gives sync-health reporting a countable signal for regional demand.

## Current state

- `packages/xero/src/write/types.ts` - defines `XeroWriteError` as a union of variants (lines 3-10: `auth_error`, `conflict_error`, `network_error`, `not_found_error`, `rate_limit_error`, `unknown_error`, `validation_error`) and `toPlainLanguageMessage(error)` (lines 71-92), an exhaustive switch over `error.code` ending in a `never` check, so adding a variant without adding a message case is a compile error. This is the mechanism that guarantees full propagation.
- `packages/xero/src/nz/write.ts` - all four operations return a hardcoded error:

```ts
// packages/xero/src/nz/write.ts:9-17
const writeBackNotAvailableError = {
  code: "unknown_error" as const,
  message: "NZ payroll write-back is not yet available.",
};

const approvalNotAvailableError = {
  code: "unknown_error" as const,
  message: "NZ payroll approval is not yet available.",
};
```

- `packages/xero/src/uk/write.ts` - identical structure with UK wording.
- `packages/xero/src/write/dispatch.ts` - routes by region; its fallback for an unrecognised region string (lines 94-102) also returns `code: "unknown_error"` with message "Unsupported payroll region.".
- `packages/xero/src/adapter/xero-write-adapter.ts` - calls `toPlainLanguageMessage(res.error)` at lines 165, 206, 241, 277 to build the user-facing message; it flows automatically once the new case exists.
- Existing tests: `packages/xero/src/write/types.test.ts` and `packages/xero/src/write/dispatch.test.ts` (extend both).

Documented constraints this plan must honour:

- CLAUDE.md, "Xero adapter rules": "Outbound writes return `Result<T, XeroWriteError>`." The rule lists the original five variants, but the code already grew `network_error` and `not_found_error`, so adding a variant follows established practice.
- CLAUDE.md: "Xero write errors are surfaced to the user in plain language." and "Australian English in all UI copy". No em dashes anywhere.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Xero package tests | `cd packages/xero && NODE_ENV=test bunx vitest run` | all pass |
| Full unit tests | `bun run test` | exit 0 |

## Scope

**In scope**:

- `packages/xero/src/write/types.ts`
- `packages/xero/src/nz/write.ts`
- `packages/xero/src/uk/write.ts`
- `packages/xero/src/write/dispatch.ts`
- `packages/xero/src/write/types.test.ts`
- `packages/xero/src/write/dispatch.test.ts`
- Any test file that currently asserts the NZ/UK stubs return `unknown_error` (find with the grep in step 3)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `packages/xero/src/au/write.ts` - the real implementation.
- `packages/xero/src/adapter/xero-write-adapter.ts` - no change needed; the message flows through `toPlainLanguageMessage`.
- `packages/availability` and any UI in `apps/app` - UI gating (disabling buttons for NZ/UK organisations) is a deliberate follow-up, not this plan.
- Implementing actual NZ or UK write-back.

## Git workflow

- Branch: `advisor/003-region-not-supported-error`
- Commit message: `feat(xero): add region_not_supported_error for NZ and UK write-back stubs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the variant and its plain-language message

In `packages/xero/src/write/types.ts`:

1. Add `| XeroWriteErrorVariant<"region_not_supported_error">` to the `XeroWriteError` union, keeping the union alphabetically ordered (it currently is).
2. Add a case to `toPlainLanguageMessage` before the `default`:

```ts
case "region_not_supported_error":
  return "Sending leave to Xero is not yet available for this payroll region. Manage this leave directly in Xero for now.";
```

The exhaustive `never` default will force the compiler to accept only a complete switch.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Use the variant in the stubs and the dispatch fallback

1. In `packages/xero/src/nz/write.ts`, change both error constants to `code: "region_not_supported_error" as const` and keep messages specific: "NZ payroll write-back is not yet available." and "NZ payroll approval is not yet available." (the `message` field is the internal detail; the user-facing text comes from `toPlainLanguageMessage`).
2. Same change in `packages/xero/src/uk/write.ts` with UK wording.
3. In `packages/xero/src/write/dispatch.ts`, change `unsupportedRegion()` to return `code: "region_not_supported_error"` with its existing message.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

### Step 3: Update and extend tests

1. Find existing assertions on the old code: `grep -rn "unknown_error" packages/xero/src --include="*.test.ts"`. Update any that assert the NZ/UK stubs or the dispatch fallback return `unknown_error`; leave assertions about genuine unknown errors (AU error mapping, adapter tests) alone.
2. In `packages/xero/src/write/types.test.ts`, add a test that `toPlainLanguageMessage({ code: "region_not_supported_error", message: "x" })` returns the sentence from step 1 exactly.
3. In `packages/xero/src/write/dispatch.test.ts`, add or update tests asserting that each of the four operations dispatched with region `"NZ"` and `"UK"` resolves to `{ ok: false }` with `error.code === "region_not_supported_error"`, and that an unrecognised region string does the same.

**Verify**: `cd packages/xero && NODE_ENV=test bunx vitest run` → all pass.

## Test plan

Covered by step 3. Structural pattern: follow the existing tests in `packages/xero/src/write/dispatch.test.ts` and `packages/xero/src/write/types.test.ts`. Final check: `bun run test` → exit 0 (catches any test elsewhere, for example in `packages/availability` or `packages/jobs`, that asserted the old error code; if one appears, update its expectation to the new code, and note it in your report).

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] `grep -rn "unknown_error" packages/xero/src/nz packages/xero/src/uk` returns no matches
- [ ] `grep -n "region_not_supported_error" packages/xero/src/write/dispatch.ts` shows the fallback uses the new code
- [ ] `cd packages/xero && NODE_ENV=test bunx vitest run` passes, including the new cases
- [ ] `bun run test` exits 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `toPlainLanguageMessage` no longer has the exhaustive `never` default (the propagation guarantee this plan relies on).
- Any code outside `packages/xero` switches on `XeroWriteError["code"]` string literals in a way that breaks at typecheck (search: `grep -rn "unknown_error\|rate_limit_error" packages/availability apps --include="*.ts" | grep -v node_modules | grep -v test`). If matches switch exhaustively on the variants, report before editing files outside scope.
- Updating a failing test requires changing behaviour rather than an expected string or code.

## Maintenance notes

- Follow-up (deliberately deferred): gate submit/approve UI for organisations whose XeroTenant `payroll_region` is NZ or UK, showing a banner instead of a failing action; and count `region_not_supported_error` occurrences in sync-health reporting as a regional-demand signal.
- When NZ write-back is implemented (see `TODO(nz-payroll)` markers), delete the error constants in `nz/write.ts`; the tests from step 3 will fail and point at themselves for updating.
