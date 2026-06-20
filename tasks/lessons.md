# Lessons

## Repo conventions inferred during the finalisation audit (2026-06)

- The dev/integration database is built with `db push` (schema-direct), not
  `migrate deploy`. The migration history has drifted from `schema.prisma`: several
  tables and columns exist only in the schema. Always diff migration `CREATE TABLE`
  names against `schema.prisma` `@@map` names before claiming the schema is shippable.
  Treat `migrate:deploy` (the documented production command) as the source of truth for
  launch readiness, not `db push`.
- Tenant isolation is enforced through `scopedQuery(clerkOrgId, organisationId)` in
  `packages/database/src/tenant-query.ts`. New tenant-scoped queries should compose this
  helper. Writes (`update`/`delete`) on tenant tables should also carry both IDs in the
  `where` clause even when keyed by a unique id (Prisma extended-where supports this).
- The "optional env var must be absent, not empty string" rule applies to env Zod
  schemas only (`packages/*/keys.ts`). Prisma column `@default("")` and Zod field
  `.default("")` are not env vars and are out of scope for that rule.
- Em-dash / Australian-English rules target shippable surfaces (code, UI copy, comments,
  product docs). Agent-instruction files (CLAUDE/AGENTS/GEMINI) and vendored
  `skills/next-forge/*` are governance/template material; flag rather than silently edit.
- `packages/analytics` is in use and is NOT on the forbidden-package list. `/webhooks`
  in `apps/api` is a Clerk user webhook (svix), unrelated to the forbidden
  `@repo/webhooks` package.
- Xero access tokens are short-lived (~30 min). Any sync/write path must refresh
  proactively; `connectionActive` only checks expiry, it does not refresh.
- After merging executor branches, check `git worktree list --porcelain`,
  `git branch -vv`, and `git branch --no-merged main` before declaring the repo
  tidy. A clean merge can still leave an auxiliary worktree checked out on an
  already-merged branch, which looks suspicious to the user even when the branch is
  contained in `main`.
- Treat `git fsck` dangling objects as normal unless it reports missing or corrupt
  objects. Do not present dangling commits/blobs from prior rebases or abandoned
  work as repository corruption.
