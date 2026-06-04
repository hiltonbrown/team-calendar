# Pre-launch cleanup: baseline

Captured before any changes, on branch `chore/pre-launch-cleanup` (forked from the working branch).

## Verification command results (baseline)

| Command | Result | Notes |
|---|---|---|
| `bun install` | PASS | 3405 packages installed cleanly. |
| `bun run build` | FAIL | `@repo/cms#build` fails: `basehub build` needs `BASEHUB_TOKEN`. `cms` is a forbidden package, removed in Phase 1. |
| `bun run check` | PASS | 674 files checked, 0 errors, 23 warnings. Three broken-symlink notices under `.claude/skills` (not repo source). |
| `bun run boundaries` | FAIL | 52 `cannot import` issues. Pre-existing. Includes forbidden-package issues (`@repo/collaboration` x5, `@repo/webhooks` x1) plus many unrelated missing-dependency issues (e.g. `apps/api` importing `@repo/core`, `@repo/availability` without declaring them). |
| `bun run test` | FAIL | `@repo/database#test` fails: 2 test files error on `Invalid environment variables` (missing `DATABASE_URL`). Environmental, pre-existing, unrelated to this cleanup. `@repo/core` tests pass (8 tests). |

These baseline failures (cms build, boundaries, database env tests) pre-date this work. The acceptance bar is "no new failures versus baseline".

## Route page.tsx count under apps/app

**55** `page.tsx` files.

## Forbidden packages (PRODUCT.md): directory presence

| Package | Directory exists? |
|---|---|
| `ai` | yes |
| `cms` | yes |
| `collaboration` | no (importers still present) |
| `feature-flags` | no |
| `internationalization` | yes |
| `payments` | no |
| `rate-limit` | yes |
| `security` | no |
| `storage` | yes |
| `webhooks` | no (importer still present) |

## Forbidden `@repo/<pkg>` importer counts (files, excluding the package's own package.json)

| Package | Importer files (incl. own package.json) | Real importers to fix |
|---|---|---|
| `ai` | 1 | 0 (only its own package.json) |
| `cms` | 9 | apps/web legal pages, sitemap, next.config, env, tsconfig, package.json |
| `collaboration` | 5 | apps/app liveblocks config, collaboration auth route, cursors, collaboration-provider, avatar-stack |
| `feature-flags` | 0 | 0 |
| `internationalization` | 14 | apps/web `[locale]` tree, proxy.ts, package.json |
| `payments` | 0 | 0 |
| `rate-limit` | 4 | apps/web contact action, env, package.json |
| `security` | 0 | 0 |
| `storage` | 1 | 0 (only its own package.json) |
| `webhooks` | 1 | apps/app webhooks page (also a Phase 3 deletion) |

## Screen Catalogue

No standalone Screen Catalogue file is present in the repository (searched `*.md`, `*.mdx`, and content for "Screen Catalogue"). Decisions therefore rely on `PRODUCT.md` (authoritative) and the explicit canonical-route and deletion lists given in the task.
