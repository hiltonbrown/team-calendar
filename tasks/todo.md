# Plan 004: Add security response headers (frame, sniff, referrer) to all apps, with CSP report-only on the product app

## Plan
- [x] Step 1: Add shared baseline headers in `packages/next-config`
  - [x] Add `securityHeaders` export in `packages/next-config/index.ts`
  - [x] Add `headers()` async function in `config` in `packages/next-config/index.ts`
  - [x] Verify `bun run typecheck` and `bun run check`
- [x] Step 2: Add a report-only CSP to `apps/app` only
  - [x] Import `securityHeaders` in `apps/app/next.config.ts`
  - [x] Override `headers()` in `nextConfig` in `apps/app/next.config.ts` to append baseline headers and `Content-Security-Policy-Report-Only`
  - [x] Verify `bun run typecheck`
- [x] Step 3: Verify headers are actually served
  - [x] Run `bun run build` to prove `headers()` is valid config in all three apps
  - [x] Start product app with `cd apps/app && bun run dev` (on port 3000)
  - [x] Perform `curl` checks on `http://localhost:3000/sign-in` for the presence of headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Content-Security-Policy-Report-Only`
  - [x] Stop the dev server and verify port 3000 is free with `lsof -iTCP:3000 -sTCP:LISTEN`
- [x] Step 4: Manual smoke of Clerk sign-in under Report-Only
  - [x] Load sign-in page (informational only since Report-Only does not block)
- [x] Step 5: Git commit and document results
  - [x] Verify `git status` shows only expected files modified
  - [x] Commit with message: `feat(security): add hardening response headers and report-only CSP`
  - [x] Skip `plans/README.md` status row update (as per executor override)

## Review
- Added shared baseline security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`) to `packages/next-config/index.ts`.
- Configured report-only Content Security Policy (CSP) for the product app (`apps/app`) in `apps/app/next.config.ts`, appending it to the baseline headers.
- Successfully built all packages (`app`, `api`, `web`, and shared packages) using `bun run build`.
- Started the `apps/app` dev server and ran `curl -sI http://localhost:3000/sign-in` to verify headers are served correctly:
  - `X-Content-Type-Options: nosniff` (verified)
  - `X-Frame-Options: DENY` (verified)
  - `Referrer-Policy: strict-origin-when-cross-origin` (verified)
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()` (verified)
  - `Content-Security-Policy-Report-Only` (verified)
- Stopped the dev server and verified the environment is clean.
