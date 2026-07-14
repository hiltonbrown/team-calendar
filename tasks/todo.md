# Plan 023: Stop the ICS feed cache from invalidating its own key on every render

## Tasks
- [x] Drift check and git verification
- [x] Step 1: Inventory every feedCacheKey caller
- [x] Step 2: Remove feedUpdatedAt from the key
- [x] Step 3: Update all call sites
- [x] Step 4: Prove the render/rebuild keys match and survive an updated_at bump
- [x] Step 5: Confirm the invalidation paths cover every content change
- [ ] Git commit and cleanup (skip plans/README.md update)

