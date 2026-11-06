# Better Auth UI and organisation operations review

25 October 2026. This implements the approved design and the user's public-signup decision. No provider cutover, clean reset, deployment, commit or merge was performed.

## Implemented behaviour

- Next.js 16 `proxy.ts` checks cookie presence for optimistic routing. Server components, actions and API handlers validate the real session, verified email, active Account, current membership and permission through `packages/auth`.
- Sign-in, signup, email verification, password recovery/reset and magic-link pages use the existing design system. Google, Microsoft and independent Xero OIDC buttons use wrapped Better Auth clients. The Account picker calls native `organization.setActive`; multiple memberships require selection. Embedded Clerk components and appearance configuration are removed.
- Public signup creates an AU Account and owner membership in the same owner-database transaction as the user. Signed setup context binds timezone and optional invitation. OAuth carries it in server OAuth state; magic links carry email-bound signed context. Addressed invitations join the existing Account, without creating another owner Account.
- Default payroll Organisation and Account settings are provisioned through the restricted tenant client. Failed domain provisioning leaves the auth Account pending and retryable; product access requires readiness. Auth tables never use the RLS tenant client.
- Server organisation reads and mutations use native `auth.api.*` behind the checked directory. Mutations revalidate verified identity, session, active Account and current role under Account/user locks. Native organisation hooks require the private controlled-operation scope. HTTP organisation mutations stay closed.
- Invitation email and native after hooks run after the owner transaction commits. Rollback discards queued delivery. Committed email delivery failure is logged without claiming the database transaction rolled back. Retrying the same pending, unexpired email/role reuses its invitation ID and expiry, records `invitation.resent` and queues delivery after commit. It does not use the pinned native resend branch, which bypasses the scoped adapter.
- `/accept-invitation/[invitationId]` and its checked API route validate the addressed verified mailbox, pending status and expiry, then atomically consume the invitation and create membership. Bootstrap-accepted invitations have a matching-membership idempotent path. Successful acceptance sets the active Account.
- Owner, admin, manager and viewer permissions retain the approved statements. Admins cannot invite, promote, demote or remove owners; managers/viewers cannot perform membership administration. Database constraints protect the final owner and every user's final membership, including native leave. Role changes/removal revoke all target-user sessions before commit. SSE revalidates current identity.
- Inngest events carry `account_id` and `organisation_id` explicitly; handlers use scoped tenant clients and never read sessions. Existing preview payroll OAuth restrictions remain until its registered callback configuration is verified.

## Scheduled member discovery exception

Pinned Better Auth 1.7.12 `listMembers` requires headers, organisation-session middleware and current user membership (`plugins/organization/routes/crud-members.mjs`). It has no documented session-free privileged equivalent. `listAccountMembersForJob(accountId)` therefore reads the auth directory through the allowlisted owner connection. This is the explicit storage exception in the approved design, not an invented SDK method or a fabricated job session. The reconciliation job uses that method solely for owner/admin notification recipients. Authenticated request reads use native APIs.

## Replacement of the Clerk webhook

The Clerk webhook route and its tests were deleted after the equivalent lifecycle, native membership, Person-link and database invariant checks passed. Svix and webhook-secret configuration were then removed. The Clerk server adapter remains for the cutover boundary.

- User create/update callbacks reconcile verified identity and emit analytics using committed local audit identities and timestamps. Account creation/update and membership creation/removal retain deterministic analytics and owner-admission activation identities.
- Auth creation and membership changes have atomic audit entries in `auth_audit_events`. Profile, Account and invitation changes are audited by database triggers; internal membership-lock counter writes are excluded. Analytics is best effort after commit and is never the audit trail.
- Creator and accepted-invitation memberships link existing People idempotently. Removal clears user links across that Account while retaining People/history. A post-link membership recheck compensates for concurrent removal. As explicitly specified in design section 7, this links existing People; unlike the old webhook, it does not create new manual seats.
- AU country, immutable Account country and matching payroll-company country are enforced. Deferred constraints prevent orphaned users and ownerless Accounts. Parent revision writes prevent concurrent membership write skew.
- General user/Account deletion remains disabled at launch. Its former analytics marker is implemented but is not exposed as a new deletion feature.

## Verification

- PASS: guarded full integration run `a91561b7-c6a4-4102-bafb-9db0dc8c3929`, all 383 tests across 39 files/six packages, including 17 RLS checks. Cleanup passed and its fence was released.
- PASS: development migrations `20261025150000_auth_membership_invariants` and `20261025160000_auth_lifecycle_audit`, applied after fresh backup restore tests. All 42 application-table hashes and 94 original rows were preserved; nine auth tables remain inaccessible to the tenant role. Rollback-only checks prove orphan/final-membership/final-owner rejection, country guards, session revocation and lifecycle audits.
- PASS: native Better Auth through PrismaNeon on a disposable restored database proves signup, atomic user/Account/owner creation, verification, cookie sessions, active Account, organisation reads, native batch rollback, Account-update audit and last-owner leave protection. The same-ID invitation retry, unchanged expiry, subsequent acceptance and active-Account switch also pass. External email and OAuth were disabled for this proof.
- PASS: real native API role/action matrix, escalation and transaction tests; controlled invitation route tests; lifecycle, provisioning, Account picker, routing, API cookie transport, SSE revocation and explicit job-context tests. Final forced source sweep: 4,462 unit tests across 452 files and 18 tasks PASS; lint (1,415 files), typecheck (19 tasks), release-tool types, release tests (248 passed, five existing skips) and diff checks PASS. Post-migration RLS run `0c5e2d70-2d1c-4c48-a97e-2f394aee66f2` passed all 17 tests, cleanup and fence release. Final read-only catalogue verifies all 45 checksums, safe restricted role, denied auth tables, unchanged original data and zero temporary databases/roles/tables.

Private evidence is under `.cache/better-auth-membership-verification` and `.cache/better-auth-server-verification`; it is ignored and must not be published with credentials or database backups.

## Release boundaries

Live Google/Microsoft/Xero callback flows, actual mail delivery and an authenticated browser journey remain NOT VERIFIED. Anonymous browser render evidence was lost during disconnection; component tests are not browser proof. Better Auth Infrastructure remains disabled by default pending its residency decision.

The new UI requires a coordinated `AUTH_PROVIDER=better-auth` app/API pair for rehearsal. The retained Clerk adapter does not restore Clerk's deleted UI or middleware in this build. Until cutover, rollback means restoring the coherent previous Clerk build and its configuration/database snapshot, as specified in the design. No environment provider flag was changed here.

Remaining Clerk SDK references are confined to the retained auth adapter/testing boundary. Historical migration documents intentionally retain the inventory. Payroll OAuth also deliberately retains the short-lived legacy `clerkOrgId` signed-wire field for compatibility; internal domain identifiers use `accountId`. This exception is not Better Auth identity sharing and does not reuse payroll OAuth credentials for Xero sign-in.
