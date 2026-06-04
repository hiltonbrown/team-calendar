# Prompt 10: Seed data for development (build step 1)

## Role and context

You are a senior engineer on LeaveSync. Build step 1 calls for organisation, people, team and
location seed data keyed by `clerk_org_id`. The schema and its tests exist, but there is no
seed script anywhere (`packages/database/package.json` has no `seed` entry; no `*seed*` file).
A seed makes local development and manual QA of the calendar, person, and feed views possible
without a live Xero connection. This slice adds an idempotent seed.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/10-seed-data`. Best run after prompt 01 (schema parity) so the seed
  reflects the final schema.
- Australian English. No em dashes.
- This slice owns the seed script (under `tooling/seed/` per the documented monorepo layout,
  or `packages/database` with a `seed` script) and a `package.json` script entry. Do not change
  `schema.prisma` or migrations. Do not change tenancy keys or the Clerk integration.
- Every seeded row sets `clerk_org_id` and, where applicable, `organisation_id`. The seed is
  idempotent (re-running does not duplicate rows). Use realistic AU data (a single Clerk Org,
  one or two Organisations, teams, locations with AU region codes, a handful of people).
- The seed must not write Xero tokens or any secret. It seeds canonical data only, not
  `xero_connections` credentials.
- Do not use `as any` or suppression. Add a smoke test or a documented manual verification.
- If a seeded `clerk_org_id` needs to correspond to a real Clerk Organisation for the app to
  render, document that linkage requirement in the PR rather than inventing a fake that breaks
  auth; stop and record it in `BLOCKED.md` if it blocks a usable dev tenant.

## Authoritative references

- `PRODUCT.md` build order step 1, tenancy model, and the `organisations`/`teams`/`locations`/
  `people` schema notes.
- Documented layout: `tooling/seed/` (`PRODUCT.md:150-153`).
- `packages/database/prisma/schema.prisma`, `packages/database/package.json`.

## Phased steps

1. **Seed script** that upserts: one Clerk Org worth of data (`clerk_org_id`), one to two
   `organisations` (AU `country_code`), `teams`, `locations` (AU `region_code` such as QLD),
   and several `people` with a mix of `source_system` values. Make upserts idempotent on the
   natural keys (for example people on `(organisation_id, source_system, source_person_key)`).
2. **Script entry**: add `"seed"` to the relevant `package.json` and document
   `bun run db:push` followed by the seed in the README dev setup.
3. **Verification**: a small test or script assertion that the seed runs twice without
   creating duplicates and that every row carries `clerk_org_id`.

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass. Where a database is available, run the seed twice and confirm idempotency.

## Commits and PR

Conventional commits, for example: `feat: idempotent dev seed for org, people, teams,
locations`, `docs: document seed in dev setup`. Push and open a PR titled "Seed data for
development".

## Acceptance criteria

- [ ] An idempotent seed script exists and is wired to a `package.json` script.
- [ ] Seeded rows carry `clerk_org_id` (and `organisation_id` where applicable).
- [ ] Re-running the seed creates no duplicates.
- [ ] No secrets or Xero tokens are seeded.
- [ ] Dev setup docs mention the seed step.
