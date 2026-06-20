# Plan 017 (SPIKE): HTML calendar view renderer over the existing feed projection

> **Executor instructions**: This is a DESIGN/SPIKE plan, not a build-everything
> plan. Produce the design artefact and a thin prototype described below; do NOT
> ship a full feature. If a STOP condition occurs, stop and report. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 400eb53..HEAD -- packages/feeds/src/projection packages/feeds/src/render packages/feeds/src/preview`
> Compare against live code; on a mismatch, note it in your design doc.

## Status

- **Priority**: P3
- **Effort**: M (spike)
- **Risk**: LOW (additive renderer over a proven projection)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `400eb53`, 2026-06-20
- **Issue**: <!-- filled when published via --issues -->

## Why this matters

The feed projection is already render-agnostic. `projectFeedEvents`
(`packages/feeds/src/projection/feed-projection.ts`) returns `PreviewEvent[]` with
privacy, provenance, record type, and contactability **already resolved at
projection time** (matching the rule "privacy transforms applied during
publication projection, not at render time"). That single projection is consumed
by **two** renderers today: the ICS path (`render/render-feed.ts`, a thin
ical-generator pass) and the in-app preview (`preview/preview-service.ts`). The
README lists "HTML calendar views" as roadmap that needs "no structural change".

So a shareable read-only HTML availability page is **one renderer away** — it
reuses the exact projection, privacy rules, scoping, and cache machinery the ICS
path already exercises. This is the cheapest genuinely-new surface the architecture
affords.

## What to investigate / produce

Produce a design document at `plans/017-html-calendar-design.md` plus a thin
prototype renderer that turns a `PreviewEvent[]` into HTML for one feed.

### Investigate

1. **Projection reuse**: read `feed-projection.ts` (`projectFeedEvents`,
   `PreviewEvent`), `render/render-feed.ts`, and `preview/preview-service.ts`.
   Confirm the projection carries everything an HTML view needs (it should) and
   document the shared shape.
2. **Surface decision**: token-gated public route in `apps/api` (mirroring
   `GET /ical/:token.ics`) vs. an authenticated in-app page in `apps/app`. Document
   the privacy story — an HTML surface must inherit the feed's `privacy_mode` (the
   projection already applies it).
3. **Caching**: the ICS path caches by `feed_id + etag` in Vercel KV and serves
   304s. Document whether/how the HTML renderer reuses that cache key/etag pattern.
4. **Layout**: a minimal month/list HTML layout consistent with `DESIGN.md`.

### Prototype (thin slice only)

- Add a `render/render-html.ts` (or similar) that takes the **same**
  `projectFeedEvents` output and returns an HTML string for one feed. Cover it with
  a unit test asserting privacy-masked events render masked (reuse a projection
  fixture from the existing feed tests). Do NOT wire a public route, auth, or
  caching yet — the design doc scopes those.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Install   | `bun install`                                         | exit 0              |
| Tests     | `bunx vitest run packages/feeds`                      | all pass            |
| Typecheck | `bunx tsc --noEmit -p packages/feeds/tsconfig.json`   | exit 0              |

## Scope

**In scope**:
- `plans/017-html-calendar-design.md` (primary deliverable)
- A prototype `render-html` module + its unit test in `packages/feeds/src/render/`
- Reading (not modifying) the projection and existing renderers

**Out of scope**:
- Wiring a public route, auth, or KV caching (design only).
- Changing `projectFeedEvents` or the privacy transforms — reuse them as-is.

## Git workflow

- Branch: `advisor/017-html-calendar-spike`
- Conventional commits, e.g. `docs(plans): html calendar design` and
  `feat(feeds): html renderer prototype`.
- Do NOT push/PR unless instructed.

## Done criteria

ALL must hold:

- [ ] `plans/017-html-calendar-design.md` answers: projection reuse, public-vs-app
      surface + privacy story, caching/etag reuse, layout, and open questions
- [ ] A prototype `render-html` turns `projectFeedEvents` output into HTML, with a
      unit test proving privacy-masked events stay masked
- [ ] `bunx vitest run packages/feeds` passes; `bunx tsc --noEmit -p packages/feeds/tsconfig.json` exits 0
- [ ] `bun run check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `projectFeedEvents` does **not** carry enough display-ready, privacy-applied data
  for an HTML view (i.e. the projection is more ICS-specific than expected) —
  document precisely what is missing; do not change the projection in this spike.

## Maintenance notes

- The privacy invariant is load-bearing: the HTML renderer must consume the
  already-projected events and never re-derive visibility. The prototype test pins
  this.
- The follow-up build (route/auth/cache) is scoped by the design doc.
- Reconciled on 2026-06-20 after drift in
  `packages/feeds/src/projection/feed-projection.ts` and
  `packages/feeds/src/projection/feed-projection.test.ts`. The live
  `PreviewEvent` shape still carries display-ready, privacy-applied fields for
  HTML rendering, including `summary`, `displayName`, `description`, `location`,
  `recordType`, `contactabilityStatus`, `isPublicHoliday`, `startsAt`, `endsAt`,
  `allDay`, `publishedUid`, and `publishedSequence`.
