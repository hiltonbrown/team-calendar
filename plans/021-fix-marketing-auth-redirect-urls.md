# Plan 021: Fix marketing sign-in and sign-up links so production routes to the app domain

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. When done, update the status row for this plan in
> `plans/README.md`, unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 341dce9..HEAD -- apps/web/env.ts apps/web/app/components/header/index.tsx apps/web/app/features/components/hero-section.tsx apps/web/app/features/components/final-cta-section.tsx apps/web/app/features/components/interactive-hero.tsx apps/web/.env.example apps/web/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `341dce9`, 2026-06-27

## Why this matters

The public marketing site sends users to the authenticated product for sign-in
and sign-up. In production those links must resolve to
`https://app.teamcalendar.online/sign-in` and
`https://app.teamcalendar.online/sign-up`. The current marketing components build
those URLs directly from `NEXT_PUBLIC_APP_URL`; if the deployed web project has
the local development value, the production homepage renders
`http://localhost:3000/sign-in` and `http://localhost:3000/sign-up`, which are
dead links for real users.

This plan fixes the deployed configuration and adds a source-level guard so the
web app cannot silently ship localhost auth links in a production build again.

## Current state

### The production URLs are already documented

`README.md:71`:

```md
| `https://app.teamcalendar.online/` | Authenticated product application. | Used by employees, managers, admins, and account owners to manage leave, manual availability, teams, feeds, Xero connections, reports, and account settings. |
```

`README.md:73`:

```md
| `https://teamcalendar.online/` | Public marketing website. | Explains Team Calendar to prospective customers, publishes product and integration information, and routes visitors into sign-in, sign-up, support, and documentation journeys. |
```

### The web app inherits `NEXT_PUBLIC_APP_URL`

`apps/web/env.ts:6`:

```ts
export const env = createEnv({
  extends: [core(), email(), observability()],
  server: {},
  client: {},
  runtimeEnv: {},
});
```

`packages/next-config/keys.ts:20`:

```ts
NEXT_PUBLIC_APP_URL: z.string().url().optional(),
```

`packages/next-config/keys.ts:33`:

```ts
NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
```

The env schema validates URL shape, but it does not reject a localhost URL in a
Vercel production or preview build.

### Marketing auth links are duplicated

`apps/web/app/components/header/index.tsx:11`:

```ts
const signInHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-in`
  : "/";
const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";
```

`apps/web/app/features/components/hero-section.tsx:5`:

```ts
const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";
```

`apps/web/app/features/components/final-cta-section.tsx:4`:

```ts
const signUpHref = env.NEXT_PUBLIC_APP_URL
  ? `${env.NEXT_PUBLIC_APP_URL}/sign-up`
  : "/";
```

`apps/web/app/features/components/interactive-hero.tsx:710`:

```ts
const signUpHref = "/sign-up"; // fallback standard path
```

This last fallback points to `/sign-up` on the marketing domain, which does not
host the authenticated Clerk sign-up route. The authenticated routes live in
`apps/app`:

`apps/app/app/(unauthenticated)/(auth)/sign-in/[[...sign-in]]/page.tsx:13`:

```ts
const SignInPage = () => <SignIn />;
```

`apps/app/app/(unauthenticated)/(auth)/sign-up/[[...sign-up]]/page.tsx:14`:

```ts
const SignUpPage = () => <SignUp />;
```

### Local examples use localhost by design

`apps/web/.env.example:9`:

```env
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Keep this development default. The fix is to make deployed production
configuration correct and to fail fast when a production build receives a
localhost app URL.

## Commands you will need

All commands run from the repo root unless the command explicitly changes
directory.

| Purpose | Command | Expected on success |
|---|---|---|
| Check current production env names | `cd apps/web && vercel env ls production` | exit 0; `NEXT_PUBLIC_APP_URL` is listed |
| Set production app URL | `cd apps/web && printf 'https://app.teamcalendar.online\n' \| vercel env add NEXT_PUBLIC_APP_URL production` | exit 0; Vercel records the production value |
| Typecheck web | `cd apps/web && NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run typecheck` | exit 0 |
| Build web | `cd apps/web && NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run build` | exit 0 |
| Check built output | `rg -n "http://localhost:3000/sign-(in|up)" apps/web/.next/server apps/web/.next/static` | exit 1, no matches |
| Repo lint | `bun run check` | exit 0 |

If `vercel env add` reports that `NEXT_PUBLIC_APP_URL` already exists, remove or
update the existing production value through the Vercel dashboard or the Vercel
CLI, then rerun the production deployment. Do not print secret env values.

## Scope

**In scope** (the only source files you should modify):

- `apps/web/src/lib/auth-links.ts` (create)
- `apps/web/app/components/header/index.tsx`
- `apps/web/app/features/components/hero-section.tsx`
- `apps/web/app/features/components/final-cta-section.tsx`
- `apps/web/app/features/components/interactive-hero.tsx`
- `plans/README.md` (status row update only)

**Deployment config in scope**:

- Vercel `web` project production env var `NEXT_PUBLIC_APP_URL`

**Out of scope**:

- Do not change `apps/app` sign-in or sign-up pages. They already own the auth
  routes.
- Do not change Clerk route env vars in `packages/auth/keys.ts` or
  `apps/app/.env.example`; those are relative paths for the authenticated app
  and are correct.
- Do not change `apps/web/.env.example`; the localhost value is appropriate for
  local development.
- Do not introduce a new test framework or Vitest config for `apps/web`.
- Do not add database, Xero, Clerk secret, or auth provider changes.

## Git workflow

- Branch: `advisor/021-fix-marketing-auth-redirects`.
- Commit message style: conventional commits. Suggested message:
  `fix(web): route marketing auth links to app domain`.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create a single auth-link helper for the marketing app

Create `apps/web/src/lib/auth-links.ts`.

Use named exports only. Match the repo's TypeScript style: strict types, no
`any`, no default export, short comments only when they clarify non-obvious
intent.

The helper must:

- Import `env` from `@/env`.
- Define the production fallback origin as
  `https://app.teamcalendar.online`, matching `README.md`.
- Normalise `env.NEXT_PUBLIC_APP_URL` to an origin with `new URL(value).origin`.
- Reject localhost app URLs when `process.env.NODE_ENV === "production"`.
  Treat `localhost`, `127.0.0.1`, and `0.0.0.0` as local hosts.
- Export `signInHref` and `signUpHref`.
- Ensure both exported hrefs are absolute app-domain URLs when
  `NEXT_PUBLIC_APP_URL` is configured.
- Fall back to `https://app.teamcalendar.online` only when
  `NEXT_PUBLIC_APP_URL` is absent.

Target shape:

```ts
import { env } from "@/env";

const PRODUCTION_APP_ORIGIN = "https://app.teamcalendar.online";
const LOCAL_APP_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const resolveAppOrigin = (): string => {
  const configuredUrl = env.NEXT_PUBLIC_APP_URL ?? PRODUCTION_APP_ORIGIN;
  const appUrl = new URL(configuredUrl);

  if (
    process.env.NODE_ENV === "production" &&
    LOCAL_APP_HOSTS.has(appUrl.hostname)
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must point to the Team Calendar app domain in production."
    );
  }

  return appUrl.origin;
};

const appOrigin = resolveAppOrigin();

export const signInHref = `${appOrigin}/sign-in`;
export const signUpHref = `${appOrigin}/sign-up`;
```

If TypeScript or Next reports that `process.env.NODE_ENV` is unavailable in this
client-imported module, use `env.NEXT_PUBLIC_APP_URL` plus a small helper
exported from a server-safe module instead. Stop and report if this requires
changing shared env validation in `packages/next-config`.

**Verify**:

`rg -n "signInHref|signUpHref|PRODUCTION_APP_ORIGIN" apps/web/src/lib/auth-links.ts`
prints the two named exports and the production origin constant.

### Step 2: Replace duplicated marketing links with the helper

Update the four marketing components:

- In `apps/web/app/components/header/index.tsx`, remove the `env` import and the
  local `signInHref` / `signUpHref` constants. Import both constants from
  `@/src/lib/auth-links` or the repo's existing alias form if the TypeScript
  config uses a different mapping.
- In `apps/web/app/features/components/hero-section.tsx`, remove the `env`
  import and local `signUpHref`; import `signUpHref`.
- In `apps/web/app/features/components/final-cta-section.tsx`, remove the `env`
  import and local `signUpHref`; import `signUpHref`.
- In `apps/web/app/features/components/interactive-hero.tsx`, replace the local
  `const signUpHref = "/sign-up";` with the shared `signUpHref` import.

Do not change button labels, classes, layout, or copy.

**Verify**:

`rg -n "NEXT_PUBLIC_APP_URL|/sign-up\"; // fallback standard path|const sign(In|Up)Href\\s*=" apps/web/app/components/header apps/web/app/features/components`

Expected result: exit 1, no matches in those marketing components. It is fine
for `signInHref` and `signUpHref` imports/usages to remain.

### Step 3: Correct the deployed web project env var

In Vercel, set the `apps/web` project production value:

```bash
cd apps/web
vercel env ls production
printf 'https://app.teamcalendar.online\n' | vercel env add NEXT_PUBLIC_APP_URL production
```

If `vercel env add` refuses because `NEXT_PUBLIC_APP_URL` already exists, update
the existing production value through the Vercel dashboard to exactly:

```text
https://app.teamcalendar.online
```

Then redeploy the web project so the `NEXT_PUBLIC_*` value is embedded into the
new production build. Do not print env values other than this public URL.

**Verify**:

After redeploy, open `https://teamcalendar.online/` and inspect the header links.
The Sign in link must be `https://app.teamcalendar.online/sign-in`; the Sign up
link must be `https://app.teamcalendar.online/sign-up`.

### Step 4: Run local verification

Run:

```bash
cd apps/web
NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run typecheck
NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run build
cd ../..
rg -n "http://localhost:3000/sign-(in|up)" apps/web/.next/server apps/web/.next/static
bun run check
```

Expected results:

- Typecheck exits 0.
- Build exits 0.
- The `rg` command exits 1 with no matches.
- `bun run check` exits 0.

If the build fails because of the production localhost guard, the Vercel or shell
env still contains `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Correct the env
and rerun the build.

## Test plan

No new automated test is required because `apps/web` has no existing Vitest
configuration or test script. Do not add a new test harness for this small
routing fix.

Use these regression checks instead:

- `cd apps/web && NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run typecheck`
- `cd apps/web && NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run build`
- `rg -n "http://localhost:3000/sign-(in|up)" apps/web/.next/server apps/web/.next/static` returns no matches.
- Manual production check after redeploy: Sign in and Sign up on
  `https://teamcalendar.online/` point to `https://app.teamcalendar.online`.

## Done criteria

All must hold:

- [ ] `apps/web/src/lib/auth-links.ts` exists and exports `signInHref` and
  `signUpHref`.
- [ ] No marketing component constructs auth hrefs directly from
  `env.NEXT_PUBLIC_APP_URL`.
- [ ] `apps/web/app/features/components/interactive-hero.tsx` no longer uses
  the marketing-domain fallback `"/sign-up"`.
- [ ] Vercel production env for the `web` project has
  `NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online`.
- [ ] `cd apps/web && NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run typecheck` exits 0.
- [ ] `cd apps/web && NEXT_PUBLIC_APP_URL=https://app.teamcalendar.online bun run build` exits 0.
- [ ] `rg -n "http://localhost:3000/sign-(in|up)" apps/web/.next/server apps/web/.next/static` exits 1 with no matches.
- [ ] `bun run check` exits 0.
- [ ] `plans/README.md` status row for plan 021 is updated.

## STOP conditions

Stop and report back if:

- The code at the cited current-state locations does not match this plan after
  the drift check.
- The fix requires changing `packages/next-config/keys.ts` or Clerk route env
  validation in `packages/auth/keys.ts`.
- `apps/web` turns out to use a different import alias than `@/src/lib/...` and
  the correct alias is not obvious from `apps/web/tsconfig.json`.
- Vercel CLI access is unavailable and no operator can update the public
  `NEXT_PUBLIC_APP_URL` production env value in the dashboard.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

The marketing app should have exactly one source for product-app auth URLs. Any
future marketing CTA that signs in, signs up, starts trial, or opens onboarding
should import from `apps/web/src/lib/auth-links.ts` instead of rebuilding URLs
from env values in the component.

Reviewers should check both source and deployed configuration. A source change
alone does not update `NEXT_PUBLIC_*` values already embedded in a production
Vercel build; the web project must be redeployed after correcting the env var.
