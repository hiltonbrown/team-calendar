# Plan 148: Reconcile upgrade gates and docs tooling

## Status

- Priority: P2, go-live gate remediation
- Effort: M
- Risk: LOW
- Confidence: HIGH
- Category: dependencies, tests, tooling
- Depends on: Plans 146 and 147
- Planned at: `1000053`, 2026-09-18
- Status: DONE

The first execution stopped as required because Mint 4.2.901 no longer accepts
the retained `mint.json` without auto-migrating it to `docs.json`. Its link
checker also exposed eight stale Mintlify-documentation examples in four local
pages. The repository has no deployed docs application and the conversion is a
tool-owned configuration migration, so execution is re-planned to review and
adopt that generated configuration explicitly rather than retaining a legacy
file that cannot pass the maintained gate.

The gate remediation was implemented in `4c4c859` and locally integrated as
`33416c0`. After explicit approval, the Mint configuration/link migration was
implemented in `0b2ff27` and locally integrated as `a4182a0`. Focused app, API
and Xero suites, frozen install, repository check, monorepo typecheck, web build
and docs lint passed. The aggregate build's environment-dependent app/API stage
remains part of the final candidate gate.

## Why this matters

The stable dependency overlay passes a Bun 1.4.0 frozen install and boundary
check, but Biome 2.5.14 reports 21 errors and three warnings and Vitest 5 with
React 19.3 exposes three order-dependent feed tests. Several proposed Biome
autofixes are unsafe because they remove real nullable runtime guards. The docs
workspace also calls an undeclared, obsolete `mintlify` binary, and Node 26
types exceed the repository's minimum supported Node 22 runtime.

## Scope

- The exact files named by the current `bun run check` diagnostics, excluding
  `leave-approval-settings-client.tsx`, which Plan 146 owns
- `apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts`
- Feed table and subscribe-instructions test files, production components only
  if a browser reproduction proves a real product defect
- Root `package.json`, `apps/docs/package.json`, `apps/docs/mint.json`, the
  generated `apps/docs/docs.json`, the four docs pages reported by Mint, and
  `bun.lock`
- `plans/README.md`

No global lint-rule disable, weakened assertion, production feed change based
only on test leakage, or pre-release dependency.

## Implementation

1. Preserve genuine `RegExp.exec()` null branches with narrow justified Biome
   suppressions and focused unmatched-input tests. Remove the one dead AppError
   message fallback and three obsolete suppressions. Add narrow CSS specificity
   suppressions only where the diagnostic compares unrelated component rules.
2. Finish every Radix dialog/menu/select interaction before test exit and await
   portal removal. Keep the behavioural assertions. Prefer complete async user
   interactions over partial event sequences. Change production code only if
   the same failure reproduces in a browser.
3. Pin `@types/node` to the current Node 22 line, add the current stable `mint`
   CLI to the docs workspace, change scripts to `mint dev` and
   `mint broken-links`, and regenerate the lockfile with Bun 1.4.0.
4. Generate Mint's `docs.json` migration from the existing `mint.json`, inspect
   it for semantic parity, retain the generated configuration and remove the
   superseded legacy file. Repair the eight reported links with current valid
   destinations or plain explanatory text where they are illustrative external
   Mintlify examples rather than Team Calendar routes.
5. Run the focused tests, frozen install, docs lint and repository gates.

## Verification

- Focused parser/rate-limit/calendar tests named by changed files
- Complete feed test files together and all feed suites
- `bun install --frozen-lockfile`
- `bun run --cwd apps/docs lint`
- Final candidate check, build, typecheck, boundaries, unit and integration

## STOP conditions

Stop if Mint's generated `docs.json` loses navigation, theme, branding or API
semantics from the retained configuration; if Node 22 types reveal intentional
Node 24-only runtime code; or if a feed failure reproduces in the browser and
requires a production UX fix. Re-plan a material migration or product fix
rather than hiding it in tooling or test cleanup.
