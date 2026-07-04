# Plan 003: Give NZ/UK write-back stubs a distinct region_not_supported_error with a plain-language message

## Plan
- [x] Step 1: Verify STOP conditions
  - [x] Check `packages/xero/src/write/types.ts` for the exhaustive `never` switch in `toPlainLanguageMessage`.
  - [x] Search for other packages switching on `XeroWriteError["code"]` (e.g. `unknown_error`, `rate_limit_error`) to see if adding a variant will break compilation.
- [x] Step 2: Implement variant and plain-language message
  - [x] Add `region_not_supported_error` to the `XeroWriteError` union in `packages/xero/src/write/types.ts`.
  - [x] Add the case for `region_not_supported_error` to `toPlainLanguageMessage` in `packages/xero/src/write/types.ts`.
  - [x] Run `bun run typecheck` to verify compilation.
- [x] Step 3: Update stubs and dispatch fallback
  - [x] Update `packages/xero/src/nz/write.ts` constants to use `region_not_supported_error`.
  - [x] Update `packages/xero/src/uk/write.ts` constants to use `region_not_supported_error`.
  - [x] Update `packages/xero/src/write/dispatch.ts` `unsupportedRegion` function to return `region_not_supported_error`.
  - [x] Run `bun run typecheck` and `bun run check` to verify.
- [x] Step 4: Find, update, and add tests
  - [x] Find existing assertions on `unknown_error` in `packages/xero/src` tests.
  - [x] Add test for the new plain-language message in `packages/xero/src/write/types.test.ts`.
  - [x] Add/update tests in `packages/xero/src/write/dispatch.test.ts` to assert that NZ, UK, and unknown regions return `region_not_supported_error`.
- [x] Step 5: Run full verification suite
  - [x] Run `cd packages/xero && NODE_ENV=test bunx vitest run` and confirm all tests pass.
  - [x] Run `bun run test` from workspace root and confirm exit 0.
- [x] Step 6: Git commit and document results
  - [x] Verify `git status` shows only expected files modified.
  - [x] Commit with message: `feat(xero): add region_not_supported_error for NZ and UK write-back stubs`
  - [x] Skip `plans/README.md` status row update (as per executor override).

## Review
- Verified exhaustive \`never\` switch exists in \`toPlainLanguageMessage\`.
- Verified no other packages use exhaustive switches on \`XeroWriteError["code"]\`.
- Implemented \`region_not_supported_error\` in \`packages/xero/src/write/types.ts\` and \`toPlainLanguageMessage\` mapping.
- Updated NZ stubs (\`packages/xero/src/nz/write.ts\`), UK stubs (\`packages/xero/src/uk/write.ts\`), and unrecognised region fallback (\`packages/xero/src/write/dispatch.ts\`) to return the new error code.
- Added and updated tests in \`packages/xero/src/write/types.test.ts\` and \`packages/xero/src/write/dispatch.test.ts\`.
- Verified typecheck, formatting/linting (with Biome autofixes), xero tests, and full test suite all pass.

