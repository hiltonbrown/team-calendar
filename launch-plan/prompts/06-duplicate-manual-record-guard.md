# Prompt 06: Duplicate manual-record guard (build step 8)

## Role and context

You are a senior engineer on LeaveSync. The `availability_records` unique constraint
`(organisation_id, source_type, source_remote_id)` is NULL-distinct in PostgreSQL, so it does
not prevent duplicate manual records where `source_remote_id IS NULL`. PRODUCT makes it a
non-negotiable that `packages/availability` must guard against duplicate manual records at the
application layer, with a test asserting the guard. The audit could not locate such a guard or
test. This slice adds it.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/06-duplicate-manual-guard`.
- Australian English. No em dashes.
- This slice owns the manual-availability create path in `packages/availability` and its
  co-located test. Do not change `schema.prisma`, migrations, tenancy keys, or the Clerk
  integration.
- The guard returns an expected-failure `Result`, not a thrown error, for the duplicate case.
  Both scope keys (`clerk_org_id`, `organisation_id`) participate in the lookup.
- Do not use `as any` or suppression. Preserve existing tests and add the new one.
- If "duplicate" needs a definition beyond same person, record type, and overlapping or
  identical start/end window, stop and record the definition question in `BLOCKED.md`.

## Authoritative references

- `PRODUCT.md` non-negotiable on the NULL-distinct constraint and the required guard
  (the final non-negotiable bullet), and the `availability_records` notes (:352-356).
- The manual create path: `apps/app/app/actions/availability/manual.ts` into the
  `@repo/availability` create function (the canonical create lives in `packages/availability/src`).
- `launch-plan/REVIEW.md` "Critical findings" C6.

## Phased steps

1. **Locate the canonical manual-create function** in `packages/availability/src` used by
   `apps/app/app/actions/availability/manual.ts` and `apps/api/app/api/availability/route.ts`.
2. **Add the guard**: before insert, query for an existing manual record
   (`source_remote_id IS NULL`) for the same `clerk_org_id`, `organisation_id`, `person_id`,
   `record_type`, and the same start/end window; if found, return a typed duplicate `Result`
   error. Define "same window" precisely (identical `starts_at`/`ends_at`; if overlap should
   also count, confirm via `BLOCKED.md` first).
3. **Surface the error** cleanly through the server action and route handler as a
   user-facing message, without leaking internal detail.
4. **Co-located test** asserting: a second identical manual record is rejected; a
   non-duplicate (different person, type, or window) is accepted; the guard is scoped so an
   identical record in a different `organisation_id` is allowed.

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass, including the new guard test.

## Commits and PR

Conventional commits, for example: `feat: guard against duplicate manual availability
records`, `test: assert duplicate manual-record guard`. Push and open a PR titled "Duplicate
manual-record guard".

## Acceptance criteria

- [ ] Duplicate manual records (`source_remote_id IS NULL`) are rejected before insert.
- [ ] The duplicate case returns a typed `Result` error, not a thrown error.
- [ ] The guard is tenant-scoped; identical records in different Organisations are allowed.
- [ ] A co-located test asserts the guard, matching the PRODUCT non-negotiable.
