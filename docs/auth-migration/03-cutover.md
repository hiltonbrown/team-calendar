# Clerk to Better Auth cutover

25 October 2026. This is a clean pre-launch reset. There are no live customers. Discard Clerk users, Accounts and memberships and create fresh Better Auth fixtures. Do not remap identifiers, import password hashes or send migration notifications.

This runbook follows [the approved design](02-design.md) and [the implementation review](07-ui-and-organisations-review.md). It describes operator actions; writing the scripts or passing source tests does not execute a cutover, register an OAuth client or prove a deployed provider flow.

## 1. Record the environment and recovery point

Record the Neon project ID, exact target branch name/ID, endpoint, database, current compatible deployment SHAs and secret/configuration versions. Keep credentials and dumps outside tracked files. Use a dedicated child branch for rehearsal; the reset tool verifies the explicitly named branch and does not infer production status from a branch name or default flag. A protected branch is refused.

Before reset, pause writes and scheduled consumers for that environment. Cancel and quarantine its old Inngest pending/running/retry work, including resumable cached steps. Record provider read-back showing closure. Use fresh consumer registrations/generations after cutover and after any rollback; never resume the quarantined queue with new identities. A database reset alone does not remove Inngest events, browser storage, KV entries, cached feeds, delivered email or remote provider objects.

Create and retain a restorable Neon recovery point before any reset. Record its exact branch and UTC timestamp, verify it is inside the project's actual restore window and test restoration on another branch. Retain a private database backup as an additional recovery artifact. For a rehearsal, create a named child from the chosen source in the Neon Console, then obtain **that branch's** owner and restricted-role connection URLs. The `team_calendar_app` login/grants must exist on the selected branch. Apply committed migrations before using the scripts (`bun --env-file="$AUTH_CUTOVER_ENV_FILE" run migrate:deploy` after selecting the branch environment); do not use `db push`. [Neon branching](https://neon.com/docs/manage/branches), [branch restore](https://neon.com/docs/introduction/branch-restore).

Save branch-specific variables in a private environment file, represented below by `AUTH_CUTOVER_ENV_FILE`. Both database URLs must identify the same branch/database, with distinct owner and restricted roles. Do not reuse the source branch's URL for a child branch.

| Variable | Operation | Requirement |
|---|---|---|
| `DATABASE_URL` | Reset, seed and migrations | Owner connection to the explicitly selected Neon branch |
| `DATABASE_APP_URL` | Seed/domain smoke tests | Same branch/database, `team_calendar_app`, without owner/BYPASSRLS privileges |
| `NEON_API_KEY` | Reset branch verification | Server/operator secret authorised to read the connected project/branch; never logged |
| `SEED_AUTH_PASSWORD` | Fixture seed | Explicit test password satisfying the seed validator; never print it or commit it |
| `AUTH_CONTEXT_MODE` | Runtime auth mode | `local` for apps/app; `remote` for apps/api. Note: obsolete `AUTH_PROVIDER` variable is retired. |

## 2. Rehearse the reset and seed

All example commands run from the repository root. Set `AUTH_REHEARSAL_BRANCH` to the exact existing branch name and `AUTH_CUTOVER_ENV_FILE` to its private configuration file.

```bash
bun --env-file="$AUTH_CUTOVER_ENV_FILE" packages/database/scripts/reset-auth-data.ts \
  --branch "$AUTH_REHEARSAL_BRANCH"
```

This defaults to `--dry-run`. Review the per-table counts and verified Neon identity. Omitting the branch refuses to run. The tool binds PostgreSQL's Neon project/branch/endpoint metadata to authenticated Neon API responses and the exact requested branch name. `--confirm` alone does not execute deletion.

When the dry-run scope matches the intended Clerk test data, execute explicitly:

```bash
bun --env-file="$AUTH_CUTOVER_ENV_FILE" packages/database/scripts/reset-auth-data.ts \
  --branch "$AUTH_REHEARSAL_BRANCH" --execute --confirm
```

The reset deletes local tenant rows tied to Clerk `org_` Account IDs in dependency order, transactionally. It preserves Better Auth UUID Accounts and unrelated/global data. Canonical Xero authorisations are deleted only when owned solely by the selected old tenant connections; shared retained grants remain. It does not call Clerk, Xero, Stripe, Resend, KV or Inngest. Resolve remote test connections/grants and Stripe test objects explicitly before discarding their local routing state; deleting a local token does not revoke a remote grant.

Run the dry-run again and require zero remaining Clerk tenant rows. The reset has no ID conversion step. Run the development seed using the selected branch's two database roles and the supplied fixture password:

```bash
NODE_ENV=development bun --conditions=react-server --env-file="$AUTH_CUTOVER_ENV_FILE" packages/auth/scripts/seed-development.ts
```

The seed creates fresh Better Auth identities through native server APIs: three separate Accounts, one each for AU, NZ and UK, with an owner, admin, manager and viewer in each. It also creates country-matching payroll Organisations, People and domain teams. Native auth teams remain disabled. Fixture identities use reserved test addresses; they do not send real verification/invitation mail or exercise OAuth. The seed reuses its owned fixtures on repeat with the same password and refuses unrelated existing identities or password mismatches. Repeating it does not rotate passwords.

NZ/UK Accounts are development fixtures, not permission to enable NZ/UK payroll or public signup. Public signup still creates an AU Account. Use real controlled test inboxes separately for delivery and OAuth smoke tests. Do not reuse the seed password in production identities.

## 3. Register OAuth callbacks

Callbacks belong to **apps/app**, where Better Auth runs. They do not use the API or marketing origin. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the exact app origin, and register these full strings with the corresponding provider. The repository is pinned to Better Auth 1.7.12: generic OAuth uses `/api/auth/callback/:provider`, including Xero. Do not register the pre-1.7 `/api/auth/oauth2/callback/...` form. [Better Auth OAuth](https://better-auth.com/docs/concepts/oauth), [1.7 upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide).

| Environment | Google | Microsoft | Separate Xero sign-in app |
|---|---|---|---|
| Local | `http://localhost:3000/api/auth/callback/google` | `http://localhost:3000/api/auth/callback/microsoft` | `http://localhost:3000/api/auth/callback/xero-auth` |
| Production | `https://app.teamcalendar.online/api/auth/callback/google` | `https://app.teamcalendar.online/api/auth/callback/microsoft` | `https://app.teamcalendar.online/api/auth/callback/xero-auth` |
| Preview/rehearsal | `${TC_APP_CANDIDATE_URL}/api/auth/callback/google` | `${TC_APP_CANDIDATE_URL}/api/auth/callback/microsoft` | `${TC_APP_CANDIDATE_URL}/api/auth/callback/xero-auth` |

The Preview row is a template: substitute the exact HTTPS app origin before registration. For example, the historical app preview in the inventory was `https://teamcalendar-bunuguuqw-hiltonb.vercel.app`, yielding `https://teamcalendar-bunuguuqw-hiltonb.vercel.app/api/auth/callback/google` and the corresponding `/microsoft` and `/xero-auth` URLs. That host is a dated record, not evidence of a current deployment. Select the real paired candidate first, then register all three exact URLs; update them if the app host changes. No wildcard `*.vercel.app` redirects or trusted origins.

- **Google:** create a Web application OAuth client for the environment, configure its consent screen/test users as applicable and register the exact Google callback. Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the app. Google requires exact redirect matching and permits localhost HTTP for development. [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).
- **Microsoft:** register a confidential Web application with Accounts in any organisational directory (multi-tenant Entra, work/school accounts). Register the Microsoft callback under the **Web** platform, not SPA. Set `MICROSOFT_CLIENT_ID`, the secret **value** in `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID=organizations`. Do not switch to `common` or enable personal Microsoft accounts as part of this cutover. [Microsoft redirect registration](https://learn.microsoft.com/entra/identity-platform/reply-url).
- **Xero sign-in:** create a new OAuth Web app, separate from payroll. Register the Xero sign-in callbacks from the table and set only its credentials in `XERO_AUTH_CLIENT_ID`/`XERO_AUTH_CLIENT_SECRET`. The configured sign-in scopes are exactly `openid profile email`; retain PKCE and ID-token verification. It must not request payroll/accounting/offline scopes, use payroll `XERO_CLIENT_*`, or write payroll integration token tables. Xero does not support wildcard redirects. [Xero sign-in](https://developer.xero.com/documentation/xero-app-store/app-partner-guides/sign-in/), [Xero OAuth FAQs](https://developer.xero.com/faq/oauth2).

Payroll OAuth remains separate: its `XERO_REDIRECT_URI` belongs to the existing payroll app and API/proxy flow. The current Preview payroll restriction is not lifted by registering the sign-in app. Verify any intended payroll Preview journey independently with its registered callback; never silently route a rehearsal into production payroll.

## 4. Configure the paired app/API deployment

Apply migrations and run preflight against the branch before deployment. Configure the app with its own strong `BETTER_AUTH_SECRET`, exact `BETTER_AUTH_URL`, email transport and the provider variables above. Configure the API to resolve sessions through that fixed app origin (`AUTH_CONTEXT_MODE=remote`); the app uses local auth context (`AUTH_CONTEXT_MODE=local`). Do not place `BETTER_AUTH_SECRET` or OAuth client secrets in public environment variables.

Local origins are app `http://localhost:3000`, API `http://localhost:3002`, web `http://localhost:3001`. Production uses `https://app.teamcalendar.online`, `https://api.teamcalendar.online` and `https://teamcalendar.online`. Preview requires matching exact `TC_APP_CANDIDATE_URL`, `TC_API_CANDIDATE_URL`, `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_API_URL`; browser API/SSE calls use the app proxy when hosts cannot share cookies. Production cookies use the approved `teamcalendar.online` domain; Preview cookies stay host-only. Never set a cookie domain of `vercel.app`.

```bash
bun run check
bun run typecheck
bun run test --concurrency=1
bun run preflight app
bun run preflight api
```

Run database integration/RLS verification through the existing guarded remote-development runner, binding the new branch, owned fixtures, paused/isolated consumers, verified restore evidence and cleanup receipt. Do not use the localhost-only opt-in to bypass the remote guard. Record tested source/deployment IDs and actual browser/provider evidence separately from unit tests.

### Job queue closure and identity generation quarantine

Before executing a clean reset or cutover deployment:

1. **Pause function execution:** In the Inngest dashboard, pause all function runs for the environment.
2. **Cancel/quarantine pending work:** Cancel all currently running, queued, retry and cached executions. Note that stopping workers is an operational provider gate; local code cannot guarantee running cloud executions have terminated.
3. **Advance identity generation:** Bump `JOB_IDENTITY_GENERATION` to the coordinated release value (e.g. `JOB_IDENTITY_GENERATION="gen_v2"`). Every new event carries this generation in its payload, and scheduled sync event IDs incorporate the generation to prevent deduplication against quarantined runs.
4. **Enforce generation fencing:** Any obsolete event from a previous generation that arrives at a deployed handler is rejected immediately outside resumable steps by `readJobEventData()` and `assertJobIdentityGeneration()`, throwing `NonRetriableError` without retrying or opening tenant databases.
5. **Rollback quarantine:** If cutover is rolled back to a database restore point, bump `JOB_IDENTITY_GENERATION` again (e.g. `gen_v3`) to quarantine all candidate execution residue and prevent deduplication against prior generation event IDs.

## 5. Better Auth Infrastructure, conditional

**Residency/security approval remains unresolved. Keep `BETTER_AUTH_INFRA_ENABLED=false` and omit the plugin.** The setup and dashboard documentation reviewed on 25 October 2026 do not establish the required API/KV/audit/dashboard storage, backup/support countries or complete processor boundary. Core self-hosted auth must work without Infrastructure. Follow the open vendor/market-specific assessment in design section 9; a cloud hostname or DPA alone is not a completed residency assessment. [Infrastructure setup](https://better-auth.com/docs/infrastructure/getting-started), [dashboard options](https://better-auth.com/docs/infrastructure/plugins/dashboard).

Only if that review is resolved and recorded:

1. Create an Infrastructure project for the environment and select the planned Starter tier. Obtain its server-only `BETTER_AUTH_API_KEY` from the vendor dashboard; keep environments separate.
2. Recheck the pinned `@better-auth/infra` payloads, administrative credential-field projections and permitted endpoints against the approved processor/security scope. The current HTTP allowlist keeps Dash administrative endpoints closed; do not add blanket adapter/admin access to make the dashboard work.
3. Set `BETTER_AUTH_INFRA_ENABLED=true` and the key only on the app, then redeploy and verify approved outbound destinations and fields. The existing server configuration supplies `dash()` conditionally, keeps activity tracking and managed directory sync disabled, and leaves `nextCookies()` last. Do not add Sentinel, managed email, SCIM or SSO here.
4. Confirm self-hosted auth still works when Infrastructure is unavailable and that local `auth_audit_events` remains complete. Starter advertises one-day audit retention; our audit trail stays in our database. [Infrastructure pricing](https://better-auth.com/pricing).

If approval is absent, record Infrastructure as disabled rather than claiming its setup is complete. Do not silently enable it to satisfy the launch plan.

## 6. Smoke tests and acceptance record

Use separate browser profiles for roles and at least two Accounts for cross-account denial. Record PASS/FAIL/NOT VERIFIED per environment, method and role. Synthetic seed verification is not real email delivery or OAuth acceptance.

| Role | Positive smoke | Required denial/protection |
|---|---|---|
| owner | Manage Account name/members, invite all four roles, switch owned Accounts, manage AU Xero setup where a controlled demo is linked | Cannot remove, demote or leave as final owner; cannot access another Account's company/person/feed; a user cannot lose their final membership |
| admin | Update Account details; invite/update/remove non-owner members; manage scoped People and permitted Xero operations | Cannot promote self to owner, invite an owner, change/demote/remove an owner or remove a payroll company through an owner-only action |
| manager | Read permitted team/direct-report data and use permitted review/approval actions | Cannot invite an owner or any member, administer membership, edit Account settings or gain another Account's data |
| viewer | Read privacy-filtered calendar, own records, permitted self-service and usable feed URL | Cannot administer members, approve another person's leave, connect Xero or read another person's private details |

For each role, verify server actions and API calls enforce the same denials as the UI. Call protected routes directly, not only hidden navigation. Confirm expected failures have no database or provider side effects.

Also verify:

- Email/password signup creates one AU Account, owner and default payroll Organisation; verify email before product access. Multiple Accounts require selection; selecting one updates `session.activeOrganizationId`, server renders, API context and SSE. A foreign Account cannot be selected.
- Google, multi-tenant Microsoft and Xero sign-in each complete through the registered callback. Verify returned identity/email handling and deny unverified account linking; linking requires the documented verified/fresh local session. Xero sign-in must not create or alter payroll grants.
- Real verification, invitation, magic-link and password-reset mail arrives in controlled inboxes. Tokens expire and cannot be replayed; mismatched invitation email is denied. Test new-user invitation signup and existing-user acceptance, with no unrelated Account created. A failed invitation delivery can retry the same unexpired invitation without extending expiry or changing role.
- Password reset/session sign-out revoke sessions as specified. Membership removal and role changes revoke all target-user sessions; an existing SSE connection closes on revalidation and no longer delivers notifications. A stale cookie does not grant API access.
- Owner/admin/manager/viewer identities are correctly linked to their scoped People. Removing membership clears links but retains People/history. Country-matching fixture Companies and teams exist in all three seed Accounts, while AU-only public onboarding/payroll gates remain enforced.
- RLS denies missing/legacy tenant context, cross-Account/company access and tenant-role auth-table reads. Context clears after commit/rollback. Local audits contain member/role/invitation/Account changes without tokens/passwords.
- Old Clerk sessions, stale browser state and old-generation job payloads grant no Better Auth access. Exercise registered jobs with explicit new Account/company context; do not replay quarantined old work.

When acceptance passes, record the exact tested paired deployments, branch/restore point, migrations, reset counts, fixture summary, provider callback registrations, email proof, per-role results, queue closure/cleanup evidence and remaining disabled features. Then remove the retained Clerk adapter/dependencies/secrets in the separately reviewed final removal step. A passing test suite alone is not cutover acceptance.

## 7. Cut over and roll back

Repeat the rehearsed procedure on the explicitly selected target branch, with fresh backup/restore and queue-closure evidence. Deploy the coordinated Better Auth app/API/job set while writes remain paused. Run role/provider smoke tests against the real target, then resume only fresh-generation consumers and writes. There is no customer migration or notification phase.

If acceptance fails before resuming writes:

1. Keep writes/jobs paused and quarantine all failed-candidate executions/cached steps. Record the failed candidate and preserve its logs without credentials.
2. Restore the target Neon branch to the exact pre-reset recovery point. Preserve the failed state under a distinct branch name, and verify schema/data/roles against the recovery record. For a restore point still inside the actual Neon restore window, the current CLI form is:

   ```bash
   neon branches restore "$AUTH_TARGET_BRANCH" "^self@$AUTH_RESTORE_POINT" \
     --preserve-under-name "$AUTH_FAILED_STATE_BRANCH" \
     --project-id "$NEON_PROJECT_ID"
   ```

   `AUTH_RESTORE_POINT` is the recorded UTC timestamp; `AUTH_FAILED_STATE_BRANCH` is a new backup name. Alternatively restore from the verified private backup/recovery branch if that timestamp is outside retention. Recheck connection URLs if the recovery uses a different branch. [Neon restore command](https://neon.com/docs/guides/branching-neon-cli).
3. Redeploy the coherent previous Clerk app/API/job build and restore its matching secrets/configuration and database snapshot. Reverting only `AUTH_PROVIDER` in the new build is insufficient: its Clerk UI/middleware are removed, and the reset discarded old tenant data.
4. Revoke/discard failed Better Auth sessions, clear candidate-specific browser/cache/feed state and restore compatible provider registrations if they changed. Verify old-stack role/tenant access, API/SSE and audit behaviour before resuming writes under a fresh consumer generation. Do not resume old quarantined work.

If fresh test writes resumed, restoring the branch discards those writes. Record the test-data cutoff and this intentional loss before restore; do not promise a lossless rollback or invent ID mapping/reconciliation. Never restore over subsequently valid data without a new explicit decision. Neon restores do not undo provider-side grants, Stripe objects, sent mail or remote Xero writes; reconcile the specifically recorded test side effects separately.

## Tool verification record

The tooling was verified on 25 October 2026 without resetting the configured branch. PASS: lint, typecheck, 4,499 unit tests and a disposable restored-database proof using real PostgreSQL/PrismaNeon and the restricted tenant role. That proof checked dry-run non-mutation, dependency-safe Clerk deletion, Better Auth data preservation, shared/null-linked grant retention, sole-Clerk grant deletion and cross-scope dependency refusal. Seeding twice produced stable three-country/twelve-user fixtures and no session residue. The original database's 94 rows and 45 migration checksums were unchanged and the scratch database was removed.

The Neon metadata HTTP response was mocked for the disposable SQL proof; exact-name/project/branch/protection guards have separate unit coverage. This is not evidence of a real named-Neon-branch rehearsal. OAuth registration, real provider callbacks, mail delivery, Infrastructure approval and deployment/rollback rehearsal remain operator acceptance work.
