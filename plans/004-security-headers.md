# Plan 004: Add security response headers (frame, sniff, referrer) to all apps, with CSP report-only on the product app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report, do not improvise. When done, update the status row for this plan
> in `plans/README.md` unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8790bdb..HEAD -- packages/next-config/index.ts apps/app/next.config.ts apps/api/next.config.ts apps/web/next.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a wrong CSP can break Clerk or PostHog; mitigated by shipping CSP in Report-Only mode)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8790bdb`, 2026-07-02

## Why this matters

None of the three deployed apps set browser hardening headers. There is no `Content-Security-Policy`, no `X-Frame-Options`, no `X-Content-Type-Options`, and no `Referrer-Policy` anywhere in the repo (verified: no `headers()` in any Next config, nothing in the `vercel.json` files, no middleware setting them). The product app (`apps/app`) is an authenticated surface holding payroll-adjacent data; today any site can frame it (clickjacking) and browsers will MIME-sniff responses. This plan adds the safe, low-risk headers everywhere and a report-only CSP on the product app so a real CSP can be enforced later with evidence instead of guesswork.

## Current state

- `packages/next-config/index.ts` - shared Next config consumed by all apps. Full current content of the `config` export (44-line file):

```ts
// packages/next-config/index.ts:4-41
export const config: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-neon",
    "@prisma/adapter-pg",
  ],
  images: { /* avif/webp, img.clerk.com remote pattern */ },
  // biome-ignore lint/suspicious/useAwait: rewrites is async
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
      { source: "/ingest/decide", destination: "https://us.i.posthog.com/decide" },
    ];
  },
  skipTrailingSlashRedirect: true,
};
```

- `apps/app/next.config.ts` and `apps/api/next.config.ts` are identical: they import `{ config }` from `@repo/next-config`, wrap with `withLogging`, conditionally `withSentry` and `withAnalyzer`, and export. `apps/web/next.config.ts` should follow the same pattern (confirm when you open it).
- Route protection lives in `apps/app/proxy.ts` (repo rule: not `middleware.ts`). Do not add a middleware file for headers; use the Next config `headers()` function instead.
- Relevant third parties on `apps/app`: Clerk (auth UI, scripts from clerk domains and the `img.clerk.com` image host), PostHog (proxied through `/ingest/...` rewrites, so same-origin), Sentry (error transport), Vercel (deployment).
- Feed endpoint `GET /ical/:token.ics` in `apps/api` serves `text/calendar` to calendar clients; extra response headers are harmless to those clients.

Repo conventions: Biome 2 + Ultracite (`bun run check`); comments only where intent is non-obvious; Australian English; no em dashes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Build all apps | `bun run build` | exit 0 |
| Dev server (app) | `cd apps/app && bun run dev` | serves on port 3000 |
| Header check | `curl -sI http://localhost:3000 \| grep -i x-frame` | shows the header |

## Scope

**In scope**:

- `packages/next-config/index.ts` (add `securityHeaders` export and a `headers()` entry in `config`)
- `apps/app/next.config.ts` (extend headers with report-only CSP)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `apps/app/proxy.ts` - route protection; headers do not belong there.
- Creating any `middleware.ts` - forbidden by repo convention.
- An enforced (non-report-only) CSP - explicitly deferred until report data exists.
- `apps/docs`, `apps/email` - not deployed to production Vercel projects.
- The `vercel.json` files.

## Git workflow

- Branch: `advisor/004-security-headers`
- Commit message: `feat(security): add hardening response headers and report-only CSP`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add shared baseline headers in packages/next-config

In `packages/next-config/index.ts`, add an exported constant and wire it into `config`:

```ts
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// inside config:
  // biome-ignore lint/suspicious/useAwait: headers is async
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
```

All apps that consume `config` (app, api, web) pick this up with no further change.

**Verify**: `bun run typecheck` → exit 0. `bun run check` → exit 0.

### Step 2: Add a report-only CSP to apps/app only

In `apps/app/next.config.ts`, after building `nextConfig`, override `headers` to append the CSP to the shared baseline:

```ts
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.sentry.io https://us.i.posthog.com",
  "img-src 'self' data: blob: https://img.clerk.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
].join("; ");

nextConfig = {
  ...nextConfig,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};
```

Import `securityHeaders` from `@repo/next-config` (extend the existing import). Note this intentionally overrides the shared `headers()` for this app, so include the baseline entries as shown. `'unsafe-inline'`/`'unsafe-eval'` are acceptable in a Report-Only starter policy; tightening comes later with nonce support.

If the Clerk instance uses a custom domain (check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`'s frontend API host in `apps/app/.env.example` or the Clerk dashboard reference in the env file comments), add that host to `script-src` and `connect-src`.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Verify headers are actually served

1. `bun run build` → exit 0 (proves `headers()` is valid config in all three apps).
2. Start only the product app: `cd apps/app && bun run dev` (port 3000). Then in another shell:
   - `curl -sI http://localhost:3000/sign-in | grep -iE "x-frame-options|x-content-type-options|referrer-policy|content-security-policy-report-only"` → all four headers present.
3. Stop the dev server when done (repo lesson: leaving listeners running breaks the user's next `bun run dev`). Confirm with `lsof -iTCP:3000 -sTCP:LISTEN` → no output.

**Verify**: the curl output shows all four headers; port 3000 is free afterwards.

### Step 4: Manual smoke of Clerk sign-in under Report-Only

With the dev server running, load `http://localhost:3000/sign-in` in a browser (or note for the reviewer to do so) and check the console for CSP report-only violations from Clerk domains. Report-Only never blocks, so this is informational: list any violating origins in your final report so the enforced policy can include them later.

## Test plan

No unit tests: Next.js `headers()` is configuration, and asserting it via a spawned server is brittle in this repo's Vitest setup. The verification gates are the build in step 3 plus the curl checks. Run `bun run test` once at the end to confirm nothing regressed → exit 0.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun run check` exits 0
- [ ] `bun run build` exits 0
- [ ] curl against the running dev app shows `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Content-Security-Policy-Report-Only`
- [ ] No `middleware.ts` file was created (`git status`)
- [ ] No dev servers left running (`lsof -iTCP:3000-3003 -sTCP:LISTEN` returns nothing)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Any app's `next.config.ts` no longer matches the "import shared config and wrap" shape in Current state.
- `bun run build` fails citing `headers` incompatibility with a wrapper (`withLogging`, `withSentry`); report the error rather than reordering wrappers by trial.
- Clerk sign-in visibly breaks in step 4 (Report-Only must not block; if it does, the header was set as enforcing by mistake).
- You are tempted to add the CSP to `apps/api` or `apps/web`; that is out of scope.

## Maintenance notes

- Follow-up (deferred): after collecting report-only data in production, move `apps/app` to an enforced `Content-Security-Policy`, ideally nonce-based to drop `'unsafe-inline'`.
- Anyone adding a third-party script to `apps/app` must extend `contentSecurityPolicy` in the same change; reviewers should watch for console CSP reports in PR previews.
- If an embed/iframe use case ever appears (e.g. embedding the calendar), relax `X-Frame-Options` per-route rather than globally.
