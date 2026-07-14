# Plan 028: Increment feed SEQUENCE when leave dates change

## Tasks
- [x] Create branch `improve/028-sequence-on-date-change` from base branch `preview` (Done: checked out `improve/028-sequence-on-date-change`)
- [x] Drift check: verify no unexpected modifications to in-scope files
- [x] Step 1: Add `published_starts_at` and `published_ends_at` to the `AvailabilityPublication` model in `packages/database/prisma/schema.prisma`
- [x] Verify Step 1: Run `cd packages/database && bunx prisma format` and `bunx prisma generate`
- [x] Step 2: Create a Prisma migration with `--create-only` and append the SQL backfill logic
- [x] Verify Step 2: Run `bunx prisma migrate dev` to apply migration, and check drift with `bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (Done: created manual migration file, executed it via `prisma db execute`, and ran `db:push`; drift check confirmed empty migration)
- [x] Step 3: Project starts_at/ends_at in `projectPublishedRecord`, add them to `materiallyChanged` comparison, and include them in `select` inside `packages/feeds/src/publication/publication-service.ts`
- [x] Verify Step 3: Run `bun run typecheck` (Done: successfully compiled typecheck)
- [x] Step 4: Persist `published_starts_at` / `published_ends_at` in both create and update paths in `packages/feeds/src/publication/publication-service.ts`
- [x] Verify Step 4: Run `bun run typecheck` (Done: successfully compiled typecheck)
- [x] Step 5: Write unit tests in `packages/feeds/src/publication/publication-service.test.ts` to test date-only change increments SEQUENCE, no-op doesn't, and create persists dates
- [x] Verify Step 5: Run tests using `bunx vitest run packages/feeds/src/publication/publication-service.test.ts` (Done: 7 tests passed successfully)
- [x] Final verification: Run `bun run check` (Done: ultracite check passed successfully)
