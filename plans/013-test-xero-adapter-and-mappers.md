# Plan 013: Test the Xero write adapter and read mappers

> **Executor instructions**: Follow step by step, running every verification
> command. If a STOP condition occurs, stop and report. Update `plans/README.md`
> when done unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e1b06a3..HEAD -- packages/xero/src/adapter packages/xero/src/read`
> Compare against live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (test-only)
- **Depends on**: none (ideally before plan 007 which touches sync handlers)
- **Category**: tests
- **Planned at**: commit `e1b06a3`, 2026-06-18
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

Three critical Xero paths run only in production:

1. **Write adapter** (`packages/xero/src/adapter/xero-write-adapter.ts`) — the seam
   between availability services and the region writers. Its tenant resolution +
   proactive-refresh-then-reload branch, the "Xero is not connected" surface, and
   the **raw-error → plain-language translation** (a security requirement: never
   expose raw Xero errors to employees) are untested. The only test referencing
   `XeroWriteAdapter` stubs it as `{}` (`apps/app/.../plans/_actions.test.ts`).
2. **Leave-application-status mapper** (`packages/xero/src/read/leave-application-status.ts`)
   — `mapLeaveApplicationStatus` normalises status aliases
   (`SCHEDULED`→`APPROVED`, `PENDING`→`SUBMITTED`, etc.) and feeds approval-state
   reconciliation. A wrong alias silently flips a record's canonical status. No
   test references it.
3. **AU employee mapper** (`packages/xero/src/read/employees.ts`) —
   `mapXeroEmployees` (ID-casing fallback, whitespace→null, malformed→`[]`) is the
   people-sync mapper and is untested at field level.

The repo's testing rules explicitly require fixture-based tests for Xero response
mappers and adapter behaviour.

## Current state

- `packages/xero/src/adapter/xero-write-adapter.ts:53-70` `getTenant` (loads tenant,
  calls `ensureFreshXeroConnection`, reloads on refresh); `:139-149` (and the three
  sibling write ops) return `auth_error` "Xero is not connected." and translate
  `XeroWriteError`→`ProviderWriteError` via `toPlainLanguageMessage`.
- `packages/xero/src/read/leave-application-status.ts:26-49` + alias table `:122-140`.
- `packages/xero/src/read/employees.ts:35-66`.
- Existing patterns to follow: the AU **write** error-mapping test
  (`it.each` over HTTP statuses) and the `toPlainLanguageMessage` test already in
  `packages/xero` — find them with `grep -rl "toPlainLanguageMessage\|it.each" packages/xero --include='*.test.ts'`.

## Commands you will need

| Purpose   | Command                                                | Expected on success |
|-----------|--------------------------------------------------------|---------------------|
| Install   | `bun install`                                          | exit 0              |
| Tests     | `bunx vitest run packages/xero`                        | all pass            |
| Typecheck | `bunx tsc --noEmit -p packages/xero/tsconfig.json`     | exit 0              |

## Scope

**In scope** (new test files only):
- `packages/xero/src/adapter/xero-write-adapter.test.ts` (create)
- `packages/xero/src/read/leave-application-status.test.ts` (create)
- `packages/xero/src/read/employees.test.ts` (create)

**Out of scope**:
- Changing any non-test source. If a test reveals a bug, STOP and report it — do
  not fix production code in this plan.
- NZ/UK read/write stubs (intentional stubs; covered by plan 018).

## Git workflow

- Branch: `advisor/013-xero-tests`
- Conventional commits, e.g. `test(xero): cover write adapter and read mappers`.
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Confirm the gaps

`grep -rl "xero-write-adapter\|mapLeaveApplicationStatus\|mapXeroEmployees" packages/xero --include='*.test.ts'`
— confirm none are meaningfully tested (the adapter appears only as a stub). If any
already has real coverage, narrow this plan to the remaining ones and note it.

### Step 2: Test the write adapter

Mock `database.xeroTenant`, `ensureFreshXeroConnection`, and the region write
dispatch (`../write/dispatch` or equivalent). Cover, for at least the submit and
approve operations (the four share structure):
- **Not connected**: null tenant → result is `auth_error` "Xero is not connected."
- **Refresh-then-reload**: when `ensureFreshXeroConnection` reports `refreshed`, the
  tenant is re-loaded before the write.
- **Error translation**: a region `XeroWriteError` → returned `userMessage` equals
  `toPlainLanguageMessage(error)` and contains **no** raw payload / Xero code.

### Step 3: Test the status mapper

Fixture/table-driven `it.each` over: each alias → canonical status
(`SCHEDULED`→`APPROVED`, `PENDING`→`SUBMITTED`, `DECLINED`→`REJECTED`, etc.), the
multi-key casing fallback order, unrecognised/empty → `UNKNOWN`, and
`approvedAt` null on unparseable dates.

### Step 4: Test the employee mapper

Fixtures covering the `EmployeeID`/`EmployeeId` casing fallback, whitespace-trim →
null, and malformed payload → `[]`.

**Verify (each step)**: `bunx vitest run packages/xero` → all pass, new tests
included.

## Test plan

- Three new test files as above; assertions are concrete (no snapshot-only, no
  asserting-nothing). The adapter tests must assert the **absence** of raw error
  detail in the user-facing message.
- Verification: `bunx vitest run packages/xero` + `bunx tsc --noEmit -p packages/xero/tsconfig.json`.

## Done criteria

ALL must hold:

- [ ] The three new test files exist and pass
- [ ] Adapter test asserts not-connected, refresh-then-reload, and no-raw-leak
      translation
- [ ] Status-mapper test covers every alias + UNKNOWN + bad date
- [ ] `bunx vitest run packages/xero` passes; `bunx tsc --noEmit -p packages/xero/tsconfig.json` exits 0
- [ ] `bun run check` exits 0
- [ ] No non-test source modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- A test reveals a real bug in the adapter or a mapper (e.g. an alias maps wrong, or
  a raw payload leaks into `userMessage`) — report it as a finding; do not fix
  source in this test-only plan.
- The adapter's dependencies cannot be mocked without importing real Xero
  credentials — report the wiring issue.

## Maintenance notes

- These tests pin the security-critical "no raw Xero error to employees" behaviour;
  any change to error translation must keep them green.
- Reviewer: read what the tests assert, not just that they pass — a test that only
  checks a result shape and not the absence of raw detail is insufficient.
