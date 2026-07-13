# Plan 029: Stop publishing `notes_internal` into the token-served ICS feed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**: `git diff --stat 123bbd8..HEAD -- packages/feeds/src/projection/feed-projection.ts packages/feeds/src/publication/publication-service.ts packages/feeds/src/render/render-feed.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (changes published feed content)
- **Depends on**: none (touches the same files as plan 028; land them in either
  order but re-check excerpts if 028 landed first)
- **Category**: security (data minimisation)
- **Planned at**: commit `123bbd8`, 2026-07-12

## Why this matters

For any feed in `named` privacy mode, the field `notes_internal` is copied into
the ICS event `DESCRIPTION` and served over the unauthenticated (token-bearing)
feed URL, then synced into third-party calendar clients (Google, Apple, Outlook).
The field name and PRODUCT.md both indicate this is internal-only data:
`PRODUCT.md:614` specifies `DESCRIPTION` = "allowed metadata only". Anyone holding
the feed URL — which by design leaves the product boundary — receives internal
notes that should not be there. This is an over-exposure / data-minimisation
defect: internal notes must not cross into the published feed.

**Product decision embedded in this plan**: there is no existing "public-safe
note" field, so the correct minimal fix is to **stop emitting `notes_internal`
into the feed** entirely. The event still carries the person, record type,
dates, and privacy-appropriate summary; only the internal free-text note is
removed from the published projection. If a deliberately-public note field is
wanted later, it is a separate additive feature — do not invent one here.

## Current state

- Projection copies `notes_internal` into the event `description` for `named`
  mode:

```ts
// packages/feeds/src/projection/feed-projection.ts:183
description: privacyMode === "named" ? record.notes_internal : null,
```

- The published-record projection persists the same into `published_description`:

```ts
// packages/feeds/src/publication/publication-service.ts:199 (in projectPublishedRecord)
description: record.privacy_mode === "named" ? record.notes_internal : null,
```

- The render writes `description` straight into the VEVENT `DESCRIPTION`:

```ts
// packages/feeds/src/render/render-feed.ts:60-67 (approx)
// calendar.createEvent({ ..., description, ... })
```

- The token-served **HTML** render shares the same projection and also emits the
  description (`packages/feeds/src/render/render-html.ts:251` —
  `${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}`), so
  fixing the projection fixes both outputs; expect `render-html.test.ts` to need
  the same expectation updates as `render-feed.test.ts`.

- Confirm there are no other readers of `notes_internal` in the feeds package
  before editing: `grep -rn "notes_internal" packages/feeds`.

- Conventions: privacy transforms are applied at projection time in
  `packages/feeds`; tests co-located (`feed-projection.test.ts`,
  `publication-service.test.ts`, `render-feed.test.ts`).

## Commands you will need

| Purpose   | Command                                                                 | Expected on success |
|-----------|-------------------------------------------------------------------------|---------------------|
| Grep      | `grep -rn "notes_internal" packages/feeds`                               | as expected         |
| Typecheck | `bun run typecheck`                                                      | exit 0              |
| Unit test | `bunx vitest run packages/feeds/src/projection/feed-projection.test.ts packages/feeds/src/publication/publication-service.test.ts packages/feeds/src/render/render-feed.test.ts` | all pass |
| Lint      | `bun run check`                                                          | exit 0              |

## Scope

**In scope**:
- `packages/feeds/src/projection/feed-projection.ts` — stop reading `notes_internal`.
- `packages/feeds/src/publication/publication-service.ts` — stop reading
  `notes_internal` in `projectPublishedRecord`.
- Tests in the feeds package.

**Out of scope**:
- The `notes_internal` column itself (it is a legitimate internal field consumed
  elsewhere in the app — do NOT drop it from the schema).
- Adding a new public note field (deliberately deferred — not this plan).
- The feed cache key / SEQUENCE logic (plans 023 / 028).
- Any non-feed reader of `notes_internal` (people/records UI) — leave untouched.

## Git workflow

- Branch: `improve/029-no-internal-notes-in-feed`
- Conventional commits (e.g. `fix(feeds): stop publishing internal notes into ICS description`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove `notes_internal` from the live projection

In `feed-projection.ts:183`, change the `description` to no longer read
`notes_internal`. Set it to `null` (the ICS render already handles a null
description by omitting `DESCRIPTION`). Keep the surrounding fields unchanged.

```ts
description: null,
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Remove `notes_internal` from the published projection

In `publication-service.ts` `projectPublishedRecord` (line ~199), likewise set
`description: null`. This stops `published_description` being populated with
internal notes for newly materialised/updated publications.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Confirm no remaining feed reader

Run `grep -rn "notes_internal" packages/feeds`. Expect **no matches** after Steps
1-2 (or only in a comment/test you are about to update). If a match remains in
non-test code, it is another feed exposure of the same field — handle it the same
way and note it.

### Step 4: Tests

- In `feed-projection.test.ts`: assert that a `named`-mode record with a
  populated `notes_internal` projects `description: null` (the regression guard).
- In `publication-service.test.ts`: assert `projectPublishedRecord` /
  `published_description` is not populated from `notes_internal`.
- In `render-feed.test.ts` (if it asserts on DESCRIPTION): confirm the VEVENT has
  no `DESCRIPTION` carrying the internal note.
- In `render-html.test.ts` (if it asserts on the description paragraph): confirm
  the HTML output carries no internal note.

**Verify**: `bunx vitest run packages/feeds/src/projection/feed-projection.test.ts packages/feeds/src/publication/publication-service.test.ts packages/feeds/src/render/render-feed.test.ts packages/feeds/src/render/render-html.test.ts` → all pass.

## Test plan

- New/updated cases in Step 4 proving internal notes never reach the projected
  event or the rendered ICS body.
- Structural pattern: existing projection/render tests in the same files.
- Verification: the vitest command in Step 4 → all pass.

## Done criteria

ALL must hold:

- [ ] `grep -rn "notes_internal" packages/feeds` returns no non-test source matches
- [ ] `feed-projection.ts` and `publication-service.ts` no longer read `notes_internal`
- [ ] `bun run typecheck` exits 0
- [ ] A test proves a `named`-mode record with internal notes projects `description: null`
- [ ] `bunx vitest run packages/feeds/...` (the three files) passes
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match live code (drift).
- Step 3 reveals a feed reader of `notes_internal` outside the two edited files —
  report it before deciding scope.
- A stakeholder-visible test asserts internal notes *should* appear in named-mode
  feeds (that would indicate the behaviour is intended — report the contradiction
  with PRODUCT.md:614 rather than proceeding).

## Maintenance notes

- Existing `published_description` values already stored from internal notes are
  not purged by this change; they will be overwritten (to null) on the next
  materialisation of each record. A reviewer may request a one-off
  `UPDATE availability_publications SET published_description = NULL` backfill to
  scrub already-published notes immediately — treat that as an optional follow-up
  and flag it in the PR.
- If a genuine public note field is later introduced, it must be a distinct
  column that is explicitly authored as public, never `notes_internal`.
- Reviewer should confirm the feed cache is invalidated so already-cached bodies
  carrying the note are refreshed (interacts with plan 023).
