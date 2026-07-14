# Plan 025: Add a composite index for `approval_status` on availability records

## Tasks
- [x] Create branch `improve/025-approval-status-index` from base branch `preview`
- [x] Step 1: Add the index `@@index([organisation_id, approval_status, submitted_at])` to `AvailabilityRecord` in `packages/database/prisma/schema.prisma`
- [x] Verify Step 1: Run `cd packages/database && bunx prisma format` to format the schema
- [x] Step 2: Generate the migration using `bun run migrate` or manually if dev DB is not available
- [x] Verify Step 2: Run drift check `cd packages/database && bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` to confirm schema and migrations match (drift check skipped as offline / dev database URL is not set; verified schema is valid via `prisma validate`)
- [x] Step 3: Regenerate Prisma client and typecheck the workspace
- [x] Verify Step 3: Run `bun run typecheck`
- [x] Git commit and prepare report

## Merge consolidation: preview

- [x] Inventory worktrees, branches, and uncommitted changes
- [ ] Commit outstanding worktree changes to their owning branches
- [ ] Integrate all distinct work into `preview`, preserving existing equivalent fixes
- [ ] Verify repository topology and targeted checks
- [ ] Record merge result
