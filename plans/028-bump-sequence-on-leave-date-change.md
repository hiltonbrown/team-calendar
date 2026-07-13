# Plan 028: Increment feed SEQUENCE when leave dates change

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/feeds/src/publication/publication-service.ts packages/feeds/src/publication/publication-service.test.ts packages/database/prisma/schema.prisma`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none (coordinate with plan 023 if both land together — both
  touch feeds, but different files)
- **Category**: bug / migration
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

When published leave moves to different dates (an employee reschedules; Xero-side
edit picked up by inbound sync), the ICS feed emits the new `DTSTART`/`DTEND`
under the **same UID and the same SEQUENCE**. Per RFC 5545, SEQUENCE is the
signal calendar clients use to decide whether a revision supersedes what they
hold; Outlook and Google routinely ignore a same-SEQUENCE update. So subscribers
keep showing the person as away on the old dates indefinitely.

The cause: `materiallyChanged` in the publication service compares UID, summary,
description, all-day flag, and privacy mode, but **not** start/end. When those are
the only things that changed, the function returns early and never increments
`published_sequence`. Persisting the published start/end on the publication row
and adding them to the comparison fixes it.

## Current state

- The comparison omits dates, and returns early when false (skipping the
  `published_sequence: { increment: 1 }` in the update path):

```ts
// packages/feeds/src/publication/publication-service.ts:138-144
const materiallyChanged =
  existing.published_uid !== published.uid ||
  existing.published_summary !== published.summary ||
  existing.published_description !== published.description ||
  existing.published_all_day !== published.allDay ||
  existing.privacy_mode !== published.privacyMode;
```

```ts
// publication-service.ts:160-173 (update path — only reached when materiallyChanged)
const updated = await client.availabilityPublication.update({
  data: {
    privacy_mode: published.privacyMode,
    published_all_day: published.allDay,
    published_at: publishedAt,
    published_description: published.description,
    published_sequence: { increment: 1 },
    published_summary: published.summary,
    published_uid: published.uid,
  },
  ...
});
```

- The projected record (`projectPublishedRecord`) does **not** currently include
  start/end:

```ts
// publication-service.ts:186-205 (projectPublishedRecord returns allDay, description, privacyMode, summary, uid)
```

- The publication row has no persisted start/end:

```prisma
// packages/database/prisma/schema.prisma (AvailabilityPublication)
model AvailabilityPublication {
  ...
  published_uid          String
  published_summary      String
  published_description  String?
  published_all_day      Boolean  @default(false)
  published_sequence     Int      @default(0)
  published_at           DateTime
  privacy_mode           availability_privacy_mode
  ...
  @@map("availability_publications")
}
```

- The record row (`RecordRow`) has `starts_at` / `ends_at` available (the ICS
  render reads `record.starts_at`/`record.ends_at`). Confirm the field names on
  the `RecordRow` type used by `projectPublishedRecord`:
  `grep -n "starts_at\|ends_at\|RecordRow" packages/feeds/src/publication/publication-service.ts`.

- There are two write paths in `materialiseAvailabilityPublication`: the **create**
  path (insert when no publication exists, above line 120) and the **update** path
  (excerpt above). Both must persist the new columns. There are two Prisma
  `select` shapes: `existingPublicationSelect` (used to load `existing`) and
  `publicationSelect`. The new columns must be added to the select used by
  `materiallyChanged` so `existing.published_starts_at`/`ends_at` are available.

- Conventions: `packages/feeds` owns publication/projection; tests co-located
  (`publication-service.test.ts`); migration convention per plan 025's notes
  (drift check must pass).

## Commands you will need

| Purpose          | Command                                                                 | Expected on success |
|------------------|-------------------------------------------------------------------------|---------------------|
| Format+generate  | `cd packages/database && bunx prisma format && bunx prisma generate`     | exit 0              |
| Create migration | `bun run migrate` (needs dev `DATABASE_URL`)                            | new migration dir   |
| Drift check      | `cd packages/database && bunx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | "This is an empty migration" |
| Typecheck        | `bun run typecheck`                                                      | exit 0              |
| Unit test        | `bunx vitest run packages/feeds/src/publication/publication-service.test.ts` | all pass |

## Scope

**In scope**:
- `packages/database/prisma/schema.prisma` — add `published_starts_at` /
  `published_ends_at` to `AvailabilityPublication`.
- `packages/database/prisma/migrations/<new>/migration.sql` — additive columns +
  backfill.
- `packages/feeds/src/publication/publication-service.ts` — project start/end,
  compare them in `materiallyChanged`, persist them in create + update paths, add
  them to the relevant `select`.
- `packages/feeds/src/publication/publication-service.test.ts` — tests.

**Out of scope**:
- The ICS render / projection for the feed body (`render-feed.ts`,
  `feed-projection.ts`) — the render already reads live `record.starts_at`/`ends_at`;
  do not change it here.
- UID generation.
- The `derived_sequence ?? published_sequence` fallback in `feed-projection.ts`
  (a separate concern — see Maintenance notes; do not change it in this plan).

## Git workflow

- Branch: `improve/028-sequence-on-date-change`
- Conventional commits (e.g. `fix(feeds): bump published SEQUENCE when leave dates change`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add persisted start/end to the publication schema + migration

Add to `AvailabilityPublication` (nullable so the migration can add them without a
default, then backfill):

```prisma
  published_starts_at    DateTime?
  published_ends_at      DateTime?
```

Generate the migration with
`cd packages/database && bunx prisma migrate dev --create-only --name add_published_dates`
(NOT plain `bun run migrate` — Prisma only generates the DDL for the new
columns, and the backfill must be appended to the **draft** migration before it
is applied; the repo rule against hand-editing migrations applies to already
generated-and-applied migrations, not to customising a `--create-only` draft,
which is the standard Prisma workflow for data migrations). Append the backfill
so a first post-migration materialisation does not spuriously bump SEQUENCE for
every record, then apply with `bunx prisma migrate dev`:

```sql
ALTER TABLE "availability_publications" ADD COLUMN "published_starts_at" TIMESTAMP(3);
ALTER TABLE "availability_publications" ADD COLUMN "published_ends_at" TIMESTAMP(3);
UPDATE "availability_publications" p
  SET "published_starts_at" = r."starts_at",
      "published_ends_at"   = r."ends_at"
  FROM "availability_records" r
  WHERE r."id" = p."availability_record_id";
```

(Confirm the `availability_records` date column names with
`grep -n "starts_at\|ends_at" packages/database/prisma/schema.prisma`.)

**Verify**: drift check → "This is an empty migration"; `bunx prisma generate` → exit 0.

### Step 2: Project start/end and add them to the comparison

- In `projectPublishedRecord`, add `startsAt: record.starts_at` and
  `endsAt: record.ends_at` to the returned object (and its type).
- Add to `materiallyChanged`:

```ts
  existing.published_starts_at?.getTime() !== published.startsAt.getTime() ||
  existing.published_ends_at?.getTime() !== published.endsAt.getTime() ||
```

Compare by `getTime()` (or normalise both to ISO) to avoid `Date` identity
pitfalls; account for the `existing.*` values being nullable (a pre-backfill or
null row should count as changed so it gets populated).
- Add `published_starts_at: true, published_ends_at: true` to the `select` that
  loads `existing` (the one feeding `materiallyChanged`).

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Persist start/end in both write paths

- Update path (`publication-service.ts:160`): add
  `published_starts_at: published.startsAt, published_ends_at: published.endsAt`
  to the `data`.
- Create path (the insert above line 120): add the same two fields to the create
  `data`.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Tests

Add cases to `publication-service.test.ts`:
1. A record whose **only** change is its dates (UID/summary/description/all-day/
   privacy identical) → `changed: true` and `published_sequence` incremented.
2. A record with no changes at all (including dates) → `changed: false`,
   sequence unchanged.
3. Create path persists `published_starts_at`/`published_ends_at`.

**Verify**: `bunx vitest run packages/feeds/src/publication/publication-service.test.ts` → all pass.

## Test plan

- New cases in Step 4 (date-only change bumps sequence; no-op stays; create
  persists dates).
- Structural pattern: existing `materialiseAvailabilityPublication` tests in the
  same file.
- Verification: the vitest command in Step 4 → all pass; drift check green.

## Done criteria

ALL must hold:

- [ ] `AvailabilityPublication` has `published_starts_at`/`published_ends_at` with a backfilling migration
- [ ] Drift check reports "This is an empty migration"
- [ ] `materiallyChanged` compares start and end
- [ ] Both create and update paths persist the new columns
- [ ] `bun run typecheck` exits 0
- [ ] Test proving a date-only change increments `published_sequence` passes
- [ ] `bunx vitest run packages/feeds/src/publication/publication-service.test.ts` passes
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match live code (drift).
- `RecordRow` does not expose `starts_at`/`ends_at` (report the actual field
  names).
- The backfill `UPDATE` cannot be expressed against the actual column names.
- The drift check will not report an empty migration.

## Maintenance notes

- Reviewer: confirm the backfill runs, so the first materialisation after deploy
  does not bump SEQUENCE for every existing record (a mass SEQUENCE bump is
  harmless to clients but noisy and would trigger feed rebuilds org-wide).
- **Deferred, related, NOT in this plan**: `feed-projection.ts` uses
  `record.publication?.published_sequence ?? record.derived_sequence`. If a record
  is ever served with a higher `derived_sequence` before its publication exists,
  a later `published_sequence: 0` could make SEQUENCE decrease and wedge that
  UID. Investigate separately whether that window is reachable; do not change it
  here.
- When a materially-changed publication is written, ensure the feed cache is
  invalidated for the affected feed (interacts with plan 023's cache-key change);
  a reviewer landing both should confirm the record-change → invalidate path fires.
