# Plan 147: Verify Clerk webhook raw bodies with Svix 2

## Status

- Priority: P1
- Effort: S
- Risk: MED, webhook verification and event parsing are security-sensitive
- Confidence: HIGH
- Category: correctness, security, dependency migration
- Depends on: dependency overlay commit
- Planned at: `1000053`, 2026-09-18
- Status: DONE

Implemented in `6baf5a7` and locally integrated as `2b475df`. Reviewer reruns
against the installed Svix 2.5.0 and Vitest 5 candidate passed all nine webhook
tests and the API TypeScript gate.

## Why this matters

Svix 2.5 verifies a webhook body for side effect and returns `undefined`.
`apps/api/app/webhooks/auth/route.ts` casts that value to Clerk's
`WebhookEvent` and then reads `event.type`. A valid signed delivery therefore
reaches a runtime dereference of `undefined`. Existing tests mock `verify()` to
return the event and cannot detect the installed contract.

## Scope

- `apps/api/app/webhooks/auth/route.ts`
- `apps/api/app/webhooks/auth/route.test.ts`
- A co-located validation helper only if it materially simplifies the route

No Clerk membership-policy change, database migration, webhook retry redesign,
or new dependency.

## Implementation

1. Capture the request body once with `request.text()`. Pass those exact bytes
   to `Webhook.verify(rawBody, headers)` and treat a thrown verification error
   as HTTP 400. Do not parse and re-serialise before signature verification.
2. After successful verification, parse the same raw body as JSON and validate
   it as unknown with Zod. Validate the minimal envelope and each event shape
   consumed by this handler. Remove the cast and return 400 for malformed JSON
   or unsupported malformed shapes without mutating state.
3. Update tests so `verify()` returns `undefined`, assert the exact raw string
   including whitespace is verified, and cover a valid consumed event,
   malformed JSON/envelope, malformed consumed event and bad signature.

## Verification

- `bun run --cwd apps/api test app/webhooks/auth/route.test.ts`
- `bun run --cwd apps/api typecheck`
- Final candidate check, build, typecheck, unit and integration gates

## STOP conditions

Stop if the installed Svix types or runtime do not match the audited contract,
or if Clerk's current webhook event shapes cannot be validated without a wider
contract change. Never bypass signature verification or trust headers/body data
before verification.
