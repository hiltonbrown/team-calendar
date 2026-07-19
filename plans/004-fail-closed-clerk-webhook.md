# Plan 004: Fail closed when the Clerk webhook secret is missing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 960c07b..HEAD -- apps/api/app/webhooks/auth`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-restore-verification-baseline.md`
- **Category**: bug
- **Planned at**: commit `960c07b`, 2026-07-19

## Why this matters

When `CLERK_WEBHOOK_SECRET` is unset, the Clerk webhook route returns HTTP
**200** with `{ ok: false }`. A 200 tells Clerk the delivery succeeded, so Clerk
never retries and the event is discarded permanently.

The events lost this way are the ones that maintain the person directory.
`organizationMembership.created` is the only path that calls
`ensurePeopleForMembership`, which links a new Clerk member to a `person` row.
`organizationMembership.deleted` is what unlinks `clerk_user_id`. If the secret
is missing or misconfigured in an environment, every new org member silently
fails to get a person record — they are absent from the directory, the calendar
and every feed — and every departing member keeps their link. Because the
response is a success, nothing in monitoring surfaces it. The misconfiguration
stays invisible until a user complains, and by then the events are unrecoverable.

The Stripe webhook in the same app already gets this right, which makes the
inconsistency easy to see and easy to fix.

## Current state

### The failing-open branch

`apps/api/app/webhooks/auth/route.ts:278-281`:

```ts
export const POST = async (request: Request): Promise<Response> => {
  if (!env.CLERK_WEBHOOK_SECRET) {
    return NextResponse.json({ message: "Not configured", ok: false });
  }
```

`NextResponse.json(...)` with no `init` defaults to status **200**.

Signature verification happens correctly further down, and correctly returns
400 on failure — the problem is only this early return. For contrast, the
missing-header branch immediately below it does use an explicit status:

```ts
  // If there are no headers, error out
  if (!(svixId && svixTimestamp && svixSignature)) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }
```

### The precedent to match

`apps/api/app/webhooks/payments/route.ts:183-189` returns a non-2xx so Stripe
retries:

```ts
  if (!eventResult.ok) {
    return NextResponse.json(
      { error: eventResult.error.message },
      { status: 400 }
    );
  }
```

### The logger is already imported

`apps/api/app/webhooks/auth/route.ts:12`:

```ts
import { log } from "@repo/observability/log";
```

No new import is needed for logging.

### Why the env schema is not being changed here

`packages/auth/keys.ts:8` declares the variable optional:

```ts
CLERK_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
```

Making it required would be a stronger fix — the deployment would fail at boot
rather than at first webhook — but `keys()` is shared by `apps/app`,
`apps/api` and `apps/web`, and only `apps/api` serves this webhook. Requiring it
globally would break the other two apps' boot. That tradeoff needs a maintainer
decision, so this plan takes the narrow, safe fix and records the alternative in
"Maintenance notes".

### Existing test file

`apps/api/app/webhooks/auth/route.test.ts` covers membership handling and
payload validation (six tests). Note its module setup, which matters for Step 2:

```ts
vi.mock("@repo/observability/log", () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/env", () => ({
  env: { CLERK_WEBHOOK_SECRET: "secret" },
}));
```

and the module is imported once at the top level, after the mocks:

```ts
const {
  POST,
  handleOrganizationMembershipCreated,
  handleOrganizationMembershipDeleted,
} = await import("./route");
```

Because `@/env` is mocked statically with a present secret, testing the
**absent** secret requires resetting modules and re-importing inside the test —
see Step 2.

### Conventions that apply

- No `console.log` in production code; use the observability logger.
- Australian English in comments. No em dashes anywhere.
- Tests co-located; Vitest as the runner.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck --force` | exit 0, no `error TS` lines |
| Route test | `cd apps/api && bunx vitest run app/webhooks/auth/route.test.ts` | all pass |
| API suite | `cd apps/api && bun run test` | all pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `apps/api/app/webhooks/auth/route.ts`
- `apps/api/app/webhooks/auth/route.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `packages/auth/keys.ts` — do **not** make `CLERK_WEBHOOK_SECRET` required.
  `keys()` is shared across three apps and only one serves this webhook; see
  "Current state".
- `apps/api/app/webhooks/payments/route.ts` — the Stripe route is the model
  here, not a target.
- The signature-verification block and every event handler below it. They are
  correct.
- The `{ ok: false }` response body shape used elsewhere in the app.

## Git workflow

- Branch: `advisor/004-fail-closed-clerk-webhook`
- Conventional commits. Example from `git log`: `fix(ci): run the pipeline on preview`.
- Suggested commit: `fix(api): fail closed when the Clerk webhook secret is missing`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Return 500 and log the misconfiguration

In `apps/api/app/webhooks/auth/route.ts`, replace the early return at `:278-281`
with a logged 500:

```ts
  if (!env.CLERK_WEBHOOK_SECRET) {
    // Fail closed. A 2xx would tell Clerk the delivery succeeded and stop it
    // retrying, silently dropping membership events that link people to Clerk
    // users. A 5xx keeps the event in Clerk's retry queue until the secret is
    // configured.
    log.error("Clerk webhook secret is not configured; rejecting delivery");
    return NextResponse.json(
      { message: "Not configured", ok: false },
      { status: 500 }
    );
  }
```

Use 500 rather than 400: the request itself is well-formed, the *server* is
misconfigured, and 500 is the status that most clearly signals "retry later"
rather than "this request was bad".

Do not log any part of the request body or headers here — the payload contains
member PII and the point of this branch is that it has not been verified.

**Verify**: `bun run typecheck --force` → exit 0, no `error TS` lines.

### Step 2: Test the fail-closed branch

Add a test to `apps/api/app/webhooks/auth/route.test.ts`.

The existing static `vi.mock("@/env", ...)` supplies a present secret to every
test, so this case needs its own module registry. Inside the new test:

1. Call `vi.resetModules()`.
2. Call `vi.doMock("@/env", () => ({ env: { CLERK_WEBHOOK_SECRET: undefined } }))`.
3. `const { POST: PostWithoutSecret } = await import("./route");`
4. Invoke it with a minimal `Request` and assert `response.status === 500`.

Add it in its own `describe` block, for example
`describe("Clerk webhook configuration", ...)`, so it does not disturb the
module state of the existing suites. If `vi.resetModules()` inside one test
leaks into later tests, move the block to the end of the file and add
`afterEach(() => { vi.resetModules(); })`.

Assert two things:

- the status is `500` (the regression assertion for this plan)
- the response is **not** 200 — write this as an explicit
  `expect(response.status).not.toBe(200)` so the intent survives any future
  change of the exact error code

**Verify**: `cd apps/api && bunx vitest run app/webhooks/auth/route.test.ts`
→ all pass, including the new test and the six existing ones.

### Step 3: Confirm nothing else regressed

**Verify**: `cd apps/api && bun run test` → all pass.
**Verify**: `bun run test --force` → exit 0, no `Failed:` line.
**Verify**: `bun run check` → exit 0.

## Test plan

- New test in `apps/api/app/webhooks/auth/route.test.ts`: with
  `CLERK_WEBHOOK_SECRET` undefined, `POST` responds `500` and not `200`.
- Structural pattern: the existing `describe("Clerk webhook payload validation")`
  block in the same file.
- The six existing tests must continue to pass unchanged.
- Verification: `cd apps/api && bun run test` → all pass, one new test.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `bun run typecheck --force` exits 0
- [ ] `bun run check` exits 0
- [ ] `bun run test --force` exits 0 with no `Failed:` line
- [ ] `cd apps/api && bunx vitest run app/webhooks/auth/route.test.ts` passes
      with 7 tests
- [ ] `grep -n "status: 500" apps/api/app/webhooks/auth/route.ts` returns at
      least one match
- [ ] `git diff -- packages/auth/keys.ts` is empty
- [ ] `git status --porcelain` lists only `route.ts` and `route.test.ts`
      (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at `route.ts:278-281` does not match the excerpt above.
- `bun run test` was already failing before your change — that means
  `plans/001-restore-verification-baseline.md` has not landed. Stop and say so.
- `vi.resetModules()` in Step 2 destabilises the existing tests in the file and
  moving the block to the end does not fix it. Report the failure; do not
  restructure the existing tests to accommodate the new one.
- You conclude the secret should be a required env var. That is a reasonable
  position, but it changes boot behaviour for three apps — report it as a
  recommendation instead of implementing it.
- Deployment configuration turns out to set `CLERK_WEBHOOK_SECRET` to an empty
  string rather than leaving it absent. `CLAUDE.md` requires optional
  format-constrained variables to be absent, not `""`, and an empty string would
  fail the `startsWith("whsec_")` check differently. Report it.

## Maintenance notes

- **For the reviewer**: confirm the response is non-2xx and that nothing from
  the unverified request body is logged.
- **The stronger fix, deliberately deferred**: make `CLERK_WEBHOOK_SECRET`
  required for `apps/api` specifically, so a misconfigured deployment fails at
  boot instead of at first webhook. That needs either a per-app env schema or a
  startup assertion in `apps/api`, because `packages/auth/keys.ts` is shared
  with `apps/app` and `apps/web`, neither of which serves this webhook. Worth
  doing; out of scope here.
- Returning 500 means a genuinely misconfigured environment will accumulate
  retries in Clerk's queue rather than silently dropping them. That is the
  intent, but it does mean the misconfiguration becomes visible as retry volume
  and error logs — which is the point.
- **Related, not addressed here**: the same file's handlers are the only place
  `clerk_user_id` is linked and unlinked. If those events were dropped during a
  window when the secret was missing, this fix prevents future loss but does not
  repair past state. A reconciliation pass over Clerk memberships versus
  `person.clerk_user_id` would be needed for that, and no such job exists.
