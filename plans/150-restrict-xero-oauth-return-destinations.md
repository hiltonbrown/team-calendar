# Plan 150: Restrict Xero OAuth return destinations

## Status

- Priority: P1
- Effort: S
- Risk: LOW
- Confidence: HIGH
- Category: security, OAuth
- Depends on: none
- Planned at: `4849878`, 2026-09-18
- Status: DONE

Implemented in `de81dc9` and locally integrated as `9fb08c1`. The isolated
executor passed 79 focused Xero/API tests and both package typechecks; the
integrated candidate passed the combined owner/OAuth regression run.

## Why this matters

The authenticated Xero OAuth start route accepts an arbitrary `returnTo` value
and signs it into state. The callback later resolves it with `new URL(value,
appBaseUrl)`, which permits an absolute or scheme-relative external URL to
replace the application origin. A legitimate Xero authorisation can therefore
end with a redirect to an attacker-controlled site.

## Scope

- `packages/xero/src/oauth/service.ts`
- Co-located OAuth service tests
- `apps/api/app/api/xero/oauth/callback/route.ts`
- Co-located callback/start route tests where needed

Do not change Xero scopes, callback registration, token exchange, preview
restrictions, or the normal settings return path.

## Implementation

1. Define one small validator for a local application path. Accept paths that
   start with one `/`, reject absolute URLs, scheme-relative values, control
   characters and backslash-based authority confusion. Preserve query strings
   and fragments on valid local paths.
2. Validate before signing OAuth state. Return the existing validated-error
   channel for an invalid caller-supplied destination.
3. Revalidate the verified return value at callback redirect time as defence in
   depth, falling back to `/settings/integrations/xero` if legacy or malformed
   signed state reaches that boundary. Resolve the final redirect only against
   `NEXT_PUBLIC_APP_URL` or its existing safe fallback.
4. Add tests for the default path, valid local path, absolute HTTP(S),
   scheme-relative, backslash and control-character inputs, plus callback
   defence in depth.

## Verification

- Focused Xero OAuth service tests
- Focused API OAuth start and callback route tests
- `bun run --cwd packages/xero typecheck`
- `bun run --cwd apps/api typecheck`
- Final candidate check, build, typecheck, unit and integration gates

## STOP conditions

Stop if any approved flow intentionally returns to a different origin. In that
case, require an explicit origin allowlist and tests rather than retaining an
arbitrary redirect.
