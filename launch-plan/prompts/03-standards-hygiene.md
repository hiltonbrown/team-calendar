# Prompt 03: Coding-standards hygiene

## Role and context

You are a senior engineer on LeaveSync. This slice clears the small, well-bounded standards
violations found in the pre-launch audit: stray `console.*` calls, em dashes, US spelling in
copy, library default exports, a nested barrel file, a dead branded type, and one unvalidated
webhook payload. Each is a low-risk change with no behavioural impact except the webhook
validation, which hardens an external-input boundary. It runs early so later feature slices
build on a clean baseline.

## Hard rules

- Australian English. No em dashes anywhere (this slice removes the two that exist).
- Do not touch `schema.prisma`, migrations, tenancy or Clerk integration logic. You may edit
  the specific files listed below across several packages.
- Do not use `as any` or suppression. Use the `@repo/observability` logger in place of
  `console.*`.
- Preserve and update tests. The webhook change must keep the existing svix signature check.
- If Zod-validating the Clerk webhook payload reveals the handler depends on fields not in a
  stable Clerk schema, stop and record the shape question in `BLOCKED.md`.

## Authoritative references

- `CLAUDE.md` "Coding rules" and "Style".
- `launch-plan/REVIEW.md` "Standards violations".

## Phased steps

1. **Remove `console.*` from production code**, replacing with the observability logger:
   `apps/web/app/(home)/components/marketing-feed-copy.tsx:22`,
   `apps/api/app/api/availability/route.ts:153`,
   `apps/api/app/api/availability/[recordId]/route.ts:169` and `:292`.
2. **Remove em dashes:** `apps/app/app/(authenticated)/settings/members/page.tsx:7` (title
   copy; use a separator such as a vertical bar or "in"),
   `apps/app/app/(authenticated)/setup/_actions.ts:44` (comment).
3. **Fix US spelling in copy:** `apps/api/app/webhooks/auth/route.ts:91,96,112,117,130,136,143,157`
   change the user-facing/analytics strings "Organization ..." to "Organisation ...". Do not
   change Clerk event names (`organization.created`) or `data.organization` field accesses;
   those are external identifiers.
4. **Replace library default exports with named exports:**
   `packages/email/templates/contact.tsx:54` and
   `packages/email/templates/notification.tsx:71`. Update their import sites.
5. **Remove the nested barrel** `packages/database/src/queries/index.ts`; import the query
   helpers from their concrete modules (or re-export them from the package root
   `packages/database/index.ts` if that is the established pattern).
6. **Delete the dead `WorkspaceId` brand** at `packages/core/index.ts:26` (it is unused and
   contradicts the "workspace removed from code identifiers" decision).
7. **Zod-validate the Clerk webhook payload** in `apps/api/app/webhooks/auth/route.ts`: after
   the svix `webhook.verify` (around :235), parse the event with a Zod schema before
   consuming `event.data`, returning a 400 Result on parse failure. Keep the signature check.

## Verification gate

`bun install`, `bun run build`, `bun run check`, `bun run boundaries`, `bun run test` must
pass. Confirm no new `console.*`, em dash, or US-spelling copy violation remains in the
touched files.

## Commits and PR

Conventional commits, for example: `fix: use observability logger instead of console`,
`fix: remove em dashes from copy and comments`,
`fix: use Australian spelling in webhook responses`,
`refactor: named exports for email templates`,
`refactor: remove nested queries barrel and dead WorkspaceId brand`,
`fix: zod-validate clerk webhook payload`. Push and open a PR titled "Coding-standards
hygiene".

## Acceptance criteria

- [ ] No `console.*` in the four listed production files; observability logger used instead.
- [ ] Zero em dashes in the repo source.
- [ ] Webhook response/analytics copy uses "Organisation".
- [ ] `packages/email/templates/*` use named exports; import sites updated.
- [ ] Nested `queries/index.ts` barrel removed; `WorkspaceId` brand deleted.
- [ ] Clerk webhook payload Zod-validated after signature verification.
