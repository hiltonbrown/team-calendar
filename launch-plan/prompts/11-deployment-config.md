# Prompt 11: Deployment configuration for Vercel Hobby

## Role and context

You are a senior engineer on LeaveSync. This is the final slice: it readies `app`, `api` and
`web` for deployment on Vercel Hobby (a three-project limit, so `docs` and `email` are not
deployed). The audit found three deployment gaps: incomplete `.env.example` coverage, KV and
Inngest env vars that bypass typed validation, and an unresolved Xero OAuth callback strategy
for preview deployments. This slice closes them.

## Hard rules

- Branch first off the latest `main`: `git checkout main && git pull origin main && git
  checkout -b launch/11-deployment-config`. Best run after prompt 02 (build ungated from
  integration tests).
- Australian English. No em dashes.
- This slice owns `.env.example` files, env validation (`packages/feeds/keys.ts` or equivalent
  for KV, `packages/jobs` for Inngest), and the Xero OAuth callback handling in
  `packages/xero/src/oauth` plus its documentation. Do not change `schema.prisma`, migrations,
  tenancy keys, or the Clerk integration. Do not reintroduce forbidden packages.
- Optional env vars with format constraints must be commented out, not set to `""` (empty
  strings fail Zod format validation even for optional fields).
- Do not use `as any` or suppression. Preserve and update tests.
- The preview-deployment OAuth strategy is an architectural choice. Pick the documented
  default (register a single production callback and disable Xero connect on preview
  deployments) unless there is reason to choose a per-environment Xero app; if the choice is
  unclear, stop and record it in `BLOCKED.md` before coding.

## Authoritative references

- `CLAUDE.md` "Environment variables" table and "Platform notes".
- `PRODUCT.md` deployment notes (Vercel `app`/`api`/`web` only; `email` dev-preview only).
- `apps/{app,api,web}/.env.example`, `apps/{app,api,web}/env.ts`, `packages/*/keys.ts`,
  `packages/feeds/src/cache/feed-cache.ts:121-122`, `packages/xero/src/oauth/service.ts:932-941`,
  `apps/api/app/api/xero/oauth/callback/route.ts`.
- `launch-plan/REVIEW.md` "Deployment blockers" and "Open decisions".

## Phased steps

1. **Complete `.env.example`** for `apps/app`, `apps/api`, `apps/web` so every variable the app
   actually needs is documented (commented out where optional with a format constraint):
   notably `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`,
   `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and the Sentry DSN the observability package
   validates. Keep `GITHUB_TOKEN`/`OWNER`/`REPO` api-only and commented out.
2. **Bring KV and Inngest under typed validation.** Add `KV_REST_API_URL`/`KV_REST_API_TOKEN`
   to a `keys()` schema and read them through it in
   `packages/feeds/src/cache/feed-cache.ts` instead of bare `process.env`; validate
   `INNGEST_*` in `packages/jobs`. A missing required value should fail fast, not silently
   no-op caching or leave jobs unsigned.
3. **Resolve the preview-deployment OAuth callback.** Implement the chosen strategy in
   `packages/xero/src/oauth/service.ts` (`callbackUrl()`) and the callback route, and document
   it in `apps/api/.env.example` and the README: the redirect URI must be one Xero has
   pre-registered. The documented default is to use the registered production callback and
   gate the Xero connect flow off on preview/non-production deployments.
4. **Document the deploy.** A short README section: three Vercel projects (`app`, `api`,
   `web`), `docs` and `email` not deployed, the cron on `apps/api`, and the required env per
   project.

## Verification gate

`bun install`, `bun run build` (no database), `bun run check`, `bun run boundaries`,
`bun run test` must pass. Confirm a missing required KV/Inngest var now fails validation
rather than silently degrading.

## Commits and PR

Conventional commits, for example: `docs: complete env.example for app, api, web`,
`feat: validate KV and Inngest env vars`,
`feat: resolve Xero OAuth callback for preview deployments`,
`docs: Vercel Hobby deployment guide`. Push and open a PR titled "Deployment configuration for
Vercel Hobby".

## Acceptance criteria

- [ ] `.env.example` documents every required var for `app`, `api`, `web`; optional
      format-constrained vars are commented out, not `""`.
- [ ] KV and Inngest vars are typed-validated; a missing required value fails fast.
- [ ] The Xero OAuth callback strategy for preview deployments is implemented and documented.
- [ ] A deployment guide names the three Vercel projects and the per-project env.
- [ ] `GITHUB_*` remain api-only and out of client bundles.
