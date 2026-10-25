# Self-hosted Better Auth design

Status: proposed, awaiting approval. Checked 25 October 2026 against [the dependency inventory](01-inventory.md), current repository behaviour, live official Better Auth documentation and identified upstream source. This is a design, not authorisation to install dependencies, edit source/schema, reset a database or deploy.

## Decisions and boundaries

- Run the `better-auth` server inside `apps/app`, on the existing Vercel app deployment, using the Prisma adapter and the existing Neon Postgres database. Keep the repository's Prisma 7/Neon driver; auth storage is a separate client and database role.
- Clean reset. Discard existing Clerk users, organisations and memberships. No identity remapping, imported passwords or customer notification. Existing Clerk-scoped development fixtures and dependent domain records must be reset together, rather than attached to new identities by email or old ID.
- Support verified email/password, magic links, Google, built-in Microsoft multi-tenant Entra and Xero through `genericOAuth`.
- Product **Account** means Better Auth's logical `organization`. Payroll **Organisation** remains the existing company entity. Better Auth's logical `account` is an authentication-method identity, not a customer Account.
- Four static roles: `owner`, `admin`, `manager`, `viewer`. Account creator is owner. Better Auth teams and dynamic roles are disabled; existing business Teams and manager relationships remain.
- Plan Infrastructure Starter for launch, conditional on the residency/security review. `BETTER_AUTH_INFRA_ENABLED` defaults to false and omits the plugin entirely while blockers remain. Core authentication must work without Infrastructure.
- Retain invite-only admission. A sign-in method proves identity, not entitlement to create an Account. Ordinary invitees join the addressed Account; they do not receive an unrelated owner Account.

**Recommendation:** use online cookie-session validation for `apps/api`. Production app/API are sibling subdomains, immediate revocation matters, and native SSE already uses cookies. Use an app-origin proxy on unrelated Preview hosts. JWT/JWKS is evaluated below but is not the proposed launch transport.

The live docs identify **1.7.12**. Context7 was consulted, but indexed older examples were not used where they conflict with live documentation. A `main` source link is explicitly source evidence, not proof of a published package's behaviour. Pin Better Auth, adapter and plugin versions together during implementation, verify their exports, and stop on any mismatch with this design. No package was installed or runtime API exercised here. [Current Next.js integration](https://better-auth.com/docs/integrations/next), [Prisma adapter](https://better-auth.com/docs/adapters/prisma).

## 1. Neutral naming and migration surface

| Current | Proposed |
|---|---|
| Clerk Organisation / Clerk account | Account |
| `clerk_org_id` | `account_id` |
| `clerk_user_id` | `user_id` |
| `resolved_clerk_user_id` | `resolved_user_id` |
| `app.clerk_org_id` | `app.account_id` |
| `clerkOrgId`, `ClerkOrgId`, `clerkUserId` | `accountId`, `AccountId`, `userId` |
| `resolvedClerkUserId`, `ownedClerkOrgIds` | `resolvedUserId`, `ownedAccountIds` |
| `ClerkOrgSubscription`, `clerk_org_subscriptions` | `AccountSubscription`, `account_subscriptions` |
| `requireOrg`, `requireOrgResult`, `getOrgId`, `currentUser` | `requireAccount`, `requireAccountResult`, `getAccountId`, `getCurrentUser` |
| Clerk membership resources, invitation IDs and `org:*` roles | local member/invitation IDs and unprefixed fixed roles |

`organisationId` continues to mean a payroll company. `session.activeOrganizationId` is the documented Better Auth property and remains so inside the adapter boundary; repository DTOs expose `activeAccountId`. Similarly, Better Auth identity `accountId` is a provider subject, mapped to `provider_subject` in storage so it cannot be mistaken for a tenant FK.

Apply the rename to columns, table/constraint/index names, five composite tenant relations, all 29 RLS policies, the manager-account SQL function, transaction context, query filters, branded IDs, events, fixtures, cleanup manifests, seed variables, API validation, support output, UI and current guidance. The inventory's 32 explicit Clerk columns and 17 additional user-identity columns are the baseline. Generic actor/recipient columns already named `*_user_id` keep their names but gain local-user relations. Replace user/member recipient discovery with local membership queries, including pagination.

Clean reset permits UUID `account_id` and `user_id` values, rather than preserving Clerk text IDs. Company IDs retain their independent UUID type. Reset dependent test/business data before adding FKs; do not invent a backfill. Historical audit documents and migration history remain historical evidence. Prefer new generated Prisma migrations, with a documented reset procedure; do not hand-edit generated historical migrations. The reset's treatment of existing development Xero grants, provider links and Stripe fixtures is an explicit pre-cutover question below.

## 2. Runtime, storage and schema contract

### Runtime placement and database access

`packages/auth` owns the Better Auth configuration, safe server/client wrappers, fixed roles and plugin setup. `apps/app/app/api/auth/[...all]/route.ts` only mounts a handler exported by that package. Internally use `betterAuth`, `prismaAdapter` from `better-auth/adapters/prisma`, `provider: "postgresql"`, and `toNextJsHandler` from `better-auth/next-js`. The Prisma guide currently also names the split `@better-auth/prisma-adapter` package; verify the selected release's compatibility export before changing dependency manifests. Enable the adapter's documented `transaction: true`; prove behaviour with the installed PrismaNeon adapter. [Prisma adapter guide](https://better-auth.com/docs/adapters/prisma), [adapter transaction implementation](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/prisma-adapter/src/prisma-adapter.ts).

| Database connection | Access |
|---|---|
| Migration owner, `DATABASE_URL` | Creates tables, migrations, constraints, grants and invariant functions. Existing allowlisted system operations remain separately reviewed. |
| `team_calendar_auth`, `DATABASE_AUTH_URL` | Auth server and narrow background identity service only. CRUD on the explicit auth/control table allowlist, including rate counters; SELECT/INSERT only on local auth audit. Reads identity before account selection. No payroll/domain-table access, schema ownership, DDL, superuser or `BYPASSRLS`. |
| `team_calendar_app`, `DATABASE_APP_URL` | Tenant domain services only, with explicit `account_id` filters and transaction-local `app.account_id`. No auth-user, credential, session, verification, member or invitation-table grants. |

`apps/api` does not receive `DATABASE_AUTH_URL` or `BETTER_AUTH_SECRET`: it validates through the app auth boundary described in section 5. Background membership/recipient queries use a narrow server-only repository service over the auth role, not `TenantDb`. Do not hand callers an unrestricted auth Prisma client. Admin/read surfaces return projected user/member fields, never credentials or session tokens. Auth tables intentionally do not use the account RLS policy, since session resolution precedes account selection. Grants must also inspect inherited/PUBLIC privileges. [PostgreSQL grants](https://www.postgresql.org/docs/current/sql-grant.html), [RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### Prisma models and physical names

This is the schema to represent in `packages/database/prisma/schema.prisma` during the later implementation, not a schema edit in this task. Models use UUID primary keys; physical tables/columns use plural snake_case names. Core timestamps are required and supplied by the adapter/defaults. Plugin entities that do not supply `updatedAt` receive a database default/trigger where needed for the repository's timestamp convention, rather than an unwritten required field.

| Better Auth logical entity | Prisma model / delegate | SQL table |
|---|---|---|
| `user` | `AuthUser` / `authUser` | `auth_users` |
| `session` | `AuthSession` / `authSession` | `auth_sessions` |
| `account` (credential/provider identity) | `AuthIdentity` / `authIdentity` | `auth_identities` |
| `verification` | `AuthVerification` / `authVerification` | `auth_verifications` |
| `organization` (customer Account) | `AuthOrganization` / `authOrganization` | `accounts` |
| `member` | `AuthMember` / `authMember` | `account_members` |
| `invitation` | `AuthInvitation` / `authInvitation` | `account_invitations` |
| `rateLimit` | `AuthRateLimit` / `authRateLimit` | `auth_rate_limits` |
| Repository-owned auth lifecycle audit | `AuthAuditEvent` / `authAuditEvent` | `auth_audit_events` |
| `jwks` | Not installed in the recommended cookie design | Add only if the JWT alternative is approved |

Use core `modelName`/`fields` and organisation plugin `schema` mappings to target these Prisma delegates and scalar properties, with `@@map` for physical table names. Prisma `fields` must name Prisma properties, not independently renamed SQL columns. Keep existing snake_case scalar properties: map, for example, Better Auth `emailVerified` to `email_verified`, `createdAt` to `created_at`, and `organizationId` to `account_id`. Core provider-identity `accountId` maps to `provider_subject`. UUID generation uses `advanced.database.generateId: "uuid"`; verify generated UUID defaults for every mapped plugin model. [Mapping/ID documentation](https://better-auth.com/docs/concepts/database), [Prisma mapping](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/database-mapping).

### Required columns and constraints

All `id` columns below are UUID PKs. All user/customer-Account FKs are UUID. A `?` denotes nullable. Provider subjects, emails and tokens remain text.

| Table | Columns beyond `id` | Relations, indexes and constraints |
|---|---|---|
| `auth_users` | `name`, `email`, `email_verified Boolean default false`, `image?`, `created_at`, `updated_at` | Unique normalised email. User profile is not a Person/payroll employee. Every committed user must have a membership, enforced by bootstrap/invariants below. |
| `auth_sessions` | `user_id`, `token`, `expires_at`, `ip_address?`, `user_agent?`, `created_at`, `updated_at`, `active_account_id?` | Unique token; indexed user and active Account; user FK cascade; active Account FK set null. No `active_team_id`, because auth teams are disabled. |
| `auth_identities` | `user_id`, `provider_id`, `provider_subject`, `password?`, `access_token?`, `refresh_token?`, `id_token?`, `access_token_expires_at?`, `refresh_token_expires_at?`, `scope?`, `created_at`, `updated_at` | User FK cascade/index. Unique `(provider_id, provider_subject)`. Credential identity has provider `credential`; the password hash lives here. Unknown provider expiries remain null. |
| `auth_verifications` | `identifier`, `value`, `expires_at`, `created_at`, `updated_at` | Index identifier; no invented user FK. Used for bounded verification/reset/magic-link/OAuth-state records. |
| `accounts` | `name`, `slug`, `logo?`, `metadata?`, `created_at`, `updated_at`, `country_code`, `provisioning_status` | Unique slug; country validated against supported country policy and immutable once companies exist. `provisioning_status` is our `pending/ready` field, not a Better Auth built-in. Metadata is plugin string storage, validated at our boundary if used. |
| `account_members` | `account_id`, `user_id`, `role`, `created_at`, `updated_at` | FKs to accounts/users; unique `(account_id,user_id)`; indexes both; CHECK one of the four roles, no comma-separated or dynamic roles. Account and user deletion are controlled operations, not arbitrary cascades. |
| `account_invitations` | `account_id`, `inviter_id`, `email`, `role`, `status`, `expires_at`, `created_at`, `updated_at` | Account/user FKs and indexes; inviter references auth user. Validate role/status at boundary. Do not impose one invitation per email globally; expired/cancelled history is valid. |
| `auth_rate_limits` | `key`, `count Int`, `last_request BigInt` | Unique key. `last_request` is epoch milliseconds, not a timestamp. Add repository `created_at`/`updated_at` with database defaults/update trigger. These are our additions; the limiter only writes its documented fields and must not be required to supply the timestamps. |
| `auth_audit_events` | `account_id?`, `actor_user_id?`, `target_user_id?`, `event_type`, `before_value?`, `after_value?`, `request_id?`, `created_at`, `updated_at` | Our immutable audit ledger; nullable account for pre-account failures. UUID FKs use restrict/retention policy, with safe snapshots where needed. Auth role can insert, not update/delete audit entries. Do not store passwords, reset links, session tokens or provider tokens. |

Core fields were checked against the separate upstream [user](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/core/src/db/schema/user.ts), [session](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/core/src/db/schema/session.ts), [identity](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/core/src/db/schema/account.ts), [verification](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/core/src/db/schema/verification.ts) and [table metadata](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/core/src/db/get-tables.ts) definitions. Plugin fields and mapping are checked against the [organisation schema/types](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/plugins/organization/types.ts). `updated_at` on organisation/member/invitation and our Account fields are explicit project additions. Reconcile nullability/defaults with the pinned release's generated Prisma schema before migration; do not copy old generated examples.

Add `account_id -> accounts.id` to every formerly Clerk-scoped tenant table, including subscriptions, usage and optional Stripe routing context. Payroll `organisations.account_id` remains indexed; preserve `(id,account_id)` keys and company-aware composite relations. Domain `people.user_id` and `xero_person_matches.resolved_user_id` reference `auth_users.id`, retain nullability and per-company uniqueness. Every generic actor, recipient, preference and triggering-user column identified in the inventory also references the auth user. Nullable historical actors may use `SET NULL`; required recipients/actors use `RESTRICT` until explicit retention/deletion handling exists. Do not cascade-delete payroll history when an auth user is removed. Disable ordinary user/Account deletion at launch; removal of a membership does not delete its Person or audit history.

Keep domain tables under RLS. Replace every `current_setting('app.clerk_org_id', true)` and transaction setter with `app.account_id`, validating non-empty UUID context. Update the manager-account function and grants consistently. A missing context continues to fail closed. Cross-account company FKs and service filters remain mandatory, even with an auth Account FK.

## 3. Public `packages/auth` contract

Apps and domain packages never import `better-auth`, `@better-auth/*` or provider-specific types directly. Route/client adapters and any test-only helpers are exported through `@repo/auth` subpaths. Remove wildcard SDK re-exports. Keep database-backed `withinLimit`/`hasFeature` semantics distinct from membership permissions.

`AuthRole` is the exact union `owner | admin | manager | viewer`. `AccountId` and `UserId` are neutral branded UUIDs. A safe user DTO contains `id`, `email`, `emailVerified`, `name`, `image`; do not invent Clerk's `primaryEmailAddress`, `has`, `getToken` or first/last-name properties. These helpers are **our API**, implemented over documented Better Auth operations:

| Helper | Contract and current semantics retained |
|---|---|
| `getSession()` | Safe session/user DTO or null for an invalid/missing session. Internally `auth.api.getSession({ headers, query: { disableCookieCache: true } })` on the auth host; API callers use the app resolver. Operational failures propagate rather than masquerade as signed-out state. No token returned to components. |
| `requireAccount()` | Returns validated active `AccountId`; throws for missing session, account selection or membership, matching today's page/layout `requireOrg` contract. This does not imply every company exists or onboarding is complete. |
| `requireAccountResult()` | `Promise<Result<AccountId>>`; expected missing/invalid account context gives `unauthorised` AppError. No throw for expected denial. |
| `getAccountId()` | Validated active `AccountId` or null; an active ID without current membership is not returned. |
| `requireRole(role)` | `Promise<boolean>`; exact-role equality, false for unauthenticated/no-account/unknown role. Preserve today's boolean `requireRole`, despite older prose describing a Result. Owner does not automatically satisfy exact `admin`. |
| `hasPermission(permissions)` | `Promise<boolean>`; validates account/membership and fixed statement, then checks native `auth.api.hasPermission({ headers, body: { organizationId, permissions } })`. Deny unless its documented object has `success === true`. Also enforce domain scope. |
| `hasRoleResult(role)` | `Promise<Result<boolean>>`; unauthenticated/no valid account produces `unauthorised`; valid membership returns `ok:true,value:true/false` for exact equality. Retain Result shape, not Clerk error types. |
| `getCurrentUser()` | Safe user DTO or null, resolved from the verified session. It is an application helper, not a Better Auth `currentUser()` API. |

Pages needing minimum-role access keep an explicit owner > admin > manager > viewer guard, implemented using permissions or the stated hierarchy. Do not change exact-role helpers into hierarchical ones. Route boundaries map missing identity to 401, forbidden actions to 403, and operational failures to existing error handling. Request-local deduplication is allowed; no cross-request membership cache.

The native session API is documented separately from these wrappers. `auth.api.revokeSessions({ headers })` revokes the caller's sessions, not an arbitrary target user. Target-user administrative revocation uses our auth-storage service in the controlled membership transaction; it is not a fictitious `revokeSessions({ userId })`. The current internal adapter has `deleteUserSessions(userId)` but the design does not require apps to call this internal API. [Session APIs/source](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/api/routes/session.ts), [internal adapter](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/db/internal-adapter.ts).

### HTTP response and endpoint boundary

SDK import wrappers do not secure the native HTTP handler by themselves. The mounted repository handler must preserve protocol redirects, status and Set-Cookie while projecting JSON responses through an explicit endpoint/field allowlist. Native `/get-session` returns a projected safe user and session ID/user/expiry/active Account fields; it must omit `session.token`. Password sign-in/signup and other session-creating JSON responses must omit their token fields too. Internal server `auth.api` calls can retain the full internal shape; it must not be serialised into a component or resolver response. Pin and test this response contract with the wrapped client.

Set native HTTP `disabledPaths` for `/get-access-token`, `/refresh-token`, `/account-info`, `/list-sessions` and `/revoke-session`. These provider-token and token-addressed session-management endpoints are unnecessary for the product sign-in flow. Provide repository-owned session listing/revocation by opaque session row ID, checked against the current user, instead of sending session bearer values to a browser. Also disable user/Account deletion paths until their controlled lifecycle is approved. Do not disable OAuth protocol callbacks or internal provider exchanges. Inventory every registered plugin endpoint after schema/plugin changes; Infrastructure adds a separately gated administrative surface. This is our handler policy, not a claim that native Better Auth responses already hide credentials. [Native account/token routes](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/api/routes/account.ts), [native session routes](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/api/routes/session.ts), [HTTP disabled paths](https://better-auth.com/docs/reference/options#disabledpaths).

## 4. Sign-in, linking and Account selection

### Verified native APIs

The following identifiers are internal implementation targets for `packages/auth`, not direct app imports. Server writes take `body`; authenticated calls also take current request `headers`. Browser calls return data/error envelopes, not our Result type.

| Method | Internal configuration/API | Verification source |
|---|---|---|
| Email/password | `emailAndPassword.enabled`, `requireEmailVerification`; client `signUp.email`, `signIn.email`; server `signUpEmail`, `signInEmail` | [Email/password](https://better-auth.com/docs/authentication/email-password) |
| Email verification | `emailVerification.sendVerificationEmail`, `sendOnSignUp`, `sendOnSignIn`, `expiresIn`, `autoSignInAfterVerification`; client/server `sendVerificationEmail` | [Options](https://better-auth.com/docs/reference/options) |
| Password recovery/change | `requestPasswordReset`, `resetPassword`, `changePassword`; `revokeOtherSessions: true` on change; `revokeSessionsOnPasswordReset` in config | [Email/password](https://better-auth.com/docs/authentication/email-password) |
| Magic link | Server `magicLink` from `better-auth/plugins`; client `magicLinkClient` from `better-auth/client/plugins`; client `signIn.magicLink`, server `signInMagicLink` and `magicLinkVerify` | [Magic link](https://better-auth.com/docs/plugins/magic-link) |
| Google | `socialProviders.google.{clientId,clientSecret}`; `signIn.social({ provider: "google" })` | [Google](https://better-auth.com/docs/authentication/google) |
| Microsoft | `socialProviders.microsoft.{clientId,clientSecret,tenantId}`; `signIn.social({ provider: "microsoft" })` | [Microsoft](https://better-auth.com/docs/authentication/microsoft) |
| Xero | `genericOAuth({ config: [...] })` from `better-auth/plugins`; current client `signIn.social({ provider: "xero-auth" })` | [Generic OAuth](https://better-auth.com/docs/plugins/generic-oauth) |
| Next.js | `toNextJsHandler`, `createAuthClient` from `better-auth/react`; `nextCookies()` last if server actions perform auth writes | [Next.js](https://better-auth.com/docs/integrations/next) |

Use custom repository UI rather than assuming Better Auth supplies Clerk `SignIn`, `UserButton`, `Protect`, invitation widgets or a choose-organisation task. UI wrappers provide sign-in, verification/recovery, account picker, profile/sign-out, member/invitation management and account settings. Styling follows the existing design system. Send auth mail through existing Resend infrastructure using the callback's supplied URL; no Infrastructure managed-mail dependency.

### Microsoft and verified-email linking

Set `MICROSOFT_TENANT_ID=organizations` for Entra work/school accounts across tenants, with the Entra application registration configured accordingly. `common` also permits personal Microsoft accounts and is not the proposed default. Keep the built-in provider and standard authority `https://login.microsoftonline.com`. The live Microsoft guide identifies verified `oid` as the provider subject; do not substitute email or trust a tenant-supplied email for authorisation. Microsoft may omit email, and its email claim is tenant-mutable. Missing usable email requires explicit mailbox verification, not synthesising a verified address from a username. [Microsoft provider](https://better-auth.com/docs/authentication/microsoft), [Microsoft email-claim guidance](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference), [Microsoft tenant modes](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc).

Proposed linking policy: `account.accountLinking.enabled: true`, `disableImplicitLinking: true`, `trustedProviders: []`, `allowDifferentEmails: false`, `allowUnlinkingAll: false`. Explicit linking from an existing verified, freshly authenticated local user is allowed only when the incoming same email is also verified. Never add Microsoft or Xero to `trustedProviders` to bypass this condition. A signature proves a claim's issuer, not mailbox ownership. Require app email verification when provider verification is missing. If the pinned provider/link flow cannot require both sides' verified email, reject the link until that flow is proven; do not silently relax it. Provider `sub`/`oid` remains the stable sign-in identity. [Linking options](https://better-auth.com/docs/concepts/users-accounts), [account-not-linked contract](https://better-auth.com/docs/reference/errors/account_not_linked).

### Independent Xero sign-in

Use a **new Xero OAuth app**, provider ID `xero-auth`, with only `openid profile email`. Configure `clientId=XERO_AUTH_CLIENT_ID`, `clientSecret=XERO_AUTH_CLIENT_SECRET`, `discoveryUrl=https://identity.xero.com/.well-known/openid-configuration`, `requireIdTokenVerification: true`, `pkce: true`, `tokenEndpointAuth: { method: "client_secret_basic" }` and `disableProviderLogout: true`. Discovery currently advertises S256 PKCE, RS256, issuer `https://identity.xero.com`, token endpoint `https://identity.xero.com/connect/token`, and userinfo endpoint `https://identity.xero.com/connect/userinfo`. Use verified OIDC `sub` as subject; reject invalid signature/issuer/audience/nonce. Do not decode an unverified ID token in a custom profile mapper. [Xero discovery](https://identity.xero.com/.well-known/openid-configuration), [Xero sign-in guide](https://developer.xero.com/documentation/xero-app-store/app-partner-guides/sign-in), [generic provider verification/configuration](https://better-auth.com/docs/plugins/generic-oauth).

Callback is `/api/auth/callback/xero-auth` on the app origin. No `offline_access`, accounting or payroll scope, no `/connections` lookup, and no token refresh job for this login grant. Any tokens Better Auth retains are restricted to `auth_identities`, encrypted using `account.encryptOAuthTokens: true` where verified by the selected release. Never use the payroll `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, canonical `xero_authorisations`, OAuth sessions or Xero token encryption envelopes for sign-in. Signing in with Xero neither connects payroll nor grants leave-management permission. Payroll OAuth retains its distinct credentials, scopes and `packages/xero` logic. Local sign-out does not log the user out of Xero or disconnect payroll.

### Active Account and mandatory membership

The session's `activeOrganizationId` maps to `active_account_id`. The picker lists only the current user's Accounts using `listOrganizations`, switches with `setActiveOrganization({ body: { organizationId }, headers })`, and revalidates current membership. One valid Account can be selected automatically; multiple Accounts with none active lead to `/select-account`. Stale selection is cleared; membership and company ownership are checked on every entry point. `getOrganization`, `listMembers`, `createInvitation`, `acceptInvitation`, `updateMemberRole`, `removeMember` and their field differences are documented in the [native endpoint definitions](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/plugins/organization/organization.ts). A member row ID is not a user ID.

Every committed auth user must have at least one Account. Stock sign-up followed by an after hook does not meet that invariant. Require a small auth provisioning decorator around the Prisma adapter's create/transaction boundary: atomically create a new user and either the membership authorised by their addressed invitation or a creator-owner Account authorised by approved owner admission. First-invite handling must consume/accept that invitation consistently, so the later native accept flow cannot duplicate the membership. Verification may still be pending, but no product access is issued until email, membership and Account readiness checks pass. No persistent membership-less user or unrelated owner Account is an accepted fallback.

The adapter transaction foundation is documented; the repository-specific composition is a **blocking implementation proof**, not a claimed built-in helper. Deferred database constraints cover user/member creation and removal, with account/user locks and final-owner checks. Raw auth endpoints, native leave, server-only additions and cascades must share the same protections. If this cannot be proven with the pinned Prisma adapter, return for a design decision before implementation continues; do not weaken the invariant to a page redirect. [Custom adapter transactions](https://better-auth.com/docs/guides/create-a-db-adapter#transaction), [Prisma transaction implementation](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/prisma-adapter/src/prisma-adapter.ts).

## 5. `apps/api` authentication and environment domains

### Options

| Approach | Advantages | Costs and limits |
|---|---|---|
| Cross-subdomain session cookie with online validation, recommended | Fresh session and membership checks; next-request revocation; current native SSE and browser OAuth flows fit production sibling hosts; no JWT signing keys/JWKS table or auth secret in API | Requires credentialed CORS/CSRF controls, an app auth resolver and Preview same-origin routing; production parent cookie also reaches the marketing host |
| JWT plugin with JWKS verification | API verifies signatures with public keys; bearer calls work across unrelated Preview hosts; reduces shared-cookie scope | New token acquisition/renewal and SSE transport, top-level OAuth navigation still needs a broker; an issued JWT survives session/role revocation until expiry unless state is checked online; claims are not current membership authority |

JWT is not the opaque session cookie. Verified APIs are server `jwt` from `better-auth/plugins`, client `jwtClient` and `authClient.token()`, `/api/auth/token`, `/api/auth/jwks`; verification with `jose` checks issuer, audience, expiry, allowed algorithm and key ID. Proposed alternative lifetime is five minutes, issuer the exact app auth origin and audience the exact paired API origin. Payload minimisation is mandatory; default user payloads must not be accepted unchanged. Role/account claims alone cannot authorise a write after membership removal. [JWT plugin](https://better-auth.com/docs/plugins/jwt).

If JWT is selected later, add logical `jwks` storage with `id`, `public_key`, `private_key`, `created_at`, optional `expires_at`, UUID defaults and plugin schema mappings, plus repository timestamp handling. Keep private-key encryption enabled, define rotation/grace periods, and verify the published algorithm/key schema. Do not install the bearer plugin under the assumption it makes an arbitrary JWT a Better Auth session. The recommended design installs neither JWT nor bearer plugins.

### Concrete domains and cookie scope

| Environment | App/auth origin | API origin | Session policy |
|---|---|---|---|
| Local | `http://localhost:3000` | `http://localhost:3002` | Host-only localhost cookie, non-Secure only for HTTP development, distinct development prefix; cookies are not isolated by port. Exact local trusted origins. |
| Production | `https://app.teamcalendar.online` | `https://api.teamcalendar.online` | `advanced.crossSubDomainCookies: { enabled: true, domain: "teamcalendar.online" }`, Secure, HttpOnly, SameSite=Lax, Path=/; exact origins, no wildcard CORS. |
| Recorded Preview pair | `https://teamcalendar-bunuguuqw-hiltonb.vercel.app` | `https://teamcalendar-dc53hdt7e-hiltonb.vercel.app` | Host-only app cookie. API browser paths are proxied through the paired app origin. Do not set Domain=vercel.app or rely on third-party cookies. |
| Future Preview | Explicit paired `TC_APP_CANDIDATE_URL` / `TC_API_CANDIDATE_URL` | Exact per-candidate host | Recompute auth base URL, trusted origins, proxy destination and provider callbacks from that pair. Reject a missing/mismatched pair. |

The Preview URLs are the inventory's dated records, not current deployment observations. Production marketing is `https://teamcalendar.online`; local web is port 3001. Marketing retains auth links and receives no auth APIs. Parent-domain cookies necessarily reach the root marketing origin, so all parent-domain hosts must be controlled and cannot host untrusted applications. No concrete web Preview hostname was established by the inventory. [Inventory deployment evidence](01-inventory.md#10-deployment-and-domains), [cookie configuration](https://better-auth.com/docs/concepts/cookies).

### Request flows

1. `apps/app` validates directly through its server-only auth instance. `apps/api` uses a repository-owned, narrowly projected app auth-context resolver over HTTPS, forwarding only allowlisted auth cookies to the fixed paired app URL. The resolver uses native `getSession`, fresh membership and, when requested, native `hasPermission`; it returns safe IDs/role/session expiry, never token material. This resolver is our endpoint, not a Better Auth built-in. API does not decode cookies or instantiate another Better Auth server.
2. Validate auth and account before opening `withTenantDb(accountId, ...)`. Close tenant scopes before auth-network calls. Fail closed on resolver errors, preserve operational error reporting, use request-local deduplication only. Forward session refresh cookies through the correct response path; Server Components alone cannot refresh browser cookies.
3. Replace manual-sync Clerk bearer forwarding with the allowlisted cookie transport. Production/local browser fetches use `credentials: include`; API CORS permits only the paired app origin with credentials, never `*`. Validate Origin on state-changing API requests, including those outside Better Auth's own handler. Do not treat CORS as authentication.
4. Production/local SSE keeps credentialed EventSource. Preview SSE is app-origin proxied. Each connection/poll checks session expiry and current Account membership; membership removal or downgrade closes the stream and prevents replay of now-inaccessible notifications.
5. Payroll OAuth start/callback stay in `packages/xero`/API. Production uses its API origin and receives the shared cookie. Preview uses app-origin proxy routes for both browser start and registered callback, preserving the API nonce cookie/state through that app host. Register the matching Preview `XERO_REDIRECT_URI` in the **payroll** Xero app; it is separate from the new sign-in callback. If that redirect cannot be registered for a candidate, that Preview payroll journey is blocked, not authorised by query-string user/account IDs.
6. Proxy targets are fixed server configuration, with explicit path/header/Set-Cookie rules and streaming duration checks. They are not a general URL forwarding service. Preserve auth response cookie attributes; do not trust arbitrary `x-forwarded-host` values to select the auth instance.

All sign-in callbacks are on `BETTER_AUTH_URL`: append `/api/auth/callback/google`, `/microsoft` or `/xero-auth`. For local and the recorded Preview, this means port 3000 and the recorded **app** host respectively, never the API host. Register exact callbacks per environment; avoid wildcard OAuth redirects and wildcard `*.vercel.app` trusted origins. Secure cookies are enforced on HTTPS Preview as well as Production. [Better Auth cookie/proxy guidance](https://better-auth.com/docs/concepts/cookies), [base URL/trusted-origin options](https://better-auth.com/docs/reference/options).

### Inngest and background context

Every tenant job/event carries explicit `account_id` and the relevant `organisation_id`; typed internal service context uses `accountId`/`organisationId`. Preserve `connection_id`, `run_id`, request watermark and optional `triggered_by_user_id` where needed. These are event provenance, not session credentials. Jobs never read a browser session or call `getSession`, `getCurrentUser` or an auth cookie endpoint. Inngest event/signing keys authenticate delivery; each job independently re-resolves Account/company/connection ownership before work.

| Job area | Required context and identity source |
|---|---|
| People/leave/balance sync, initial import, approval reconciliation | Account/company/connection, run/request context, optional triggering local user. No session. Owner/admin completion recipients come from current local account_members, paginated, through the narrow auth identity service. |
| Feed rebuild/publication reconciliation | Account plus feed/company scope; account-wide feed company may be null. Public-token discovery still resolves a validated account before tenant reads. |
| Usage recount | Explicit account, validated company/event scope and account-wide counts. |
| Notification mail drain | System discovery of queued account IDs, then account-scoped processing using stored user/recipient data. |
| Scheduler/recovery/cancellation | Discover or receive account/company explicitly, retain current connection binding, and reject obsolete identity-generation events before DB/provider effects. |

At cutover, cancel old pending/running/retry executions, quarantine their event/function registration, and obtain provider-backed evidence of closure, including resumable cached steps. Start a new release generation for jobs/events with the new IDs. Missing-generation/legacy Clerk payloads are terminally discarded without tenant access, provider calls or retry loops. Cached steps never authorise resuming an old generation. A rollback uses another fresh consumer generation after restore; it never resumes quarantined queues. If old execution closure cannot be proved with the existing protected release controls, cutover stops. Pausing consumers alone is insufficient. These are transition requirements; no queue operation is authorised or performed by this document.

## 6. Organisation permissions and current behaviour

Use `organization` from `better-auth/plugins`, `createAccessControl` from `better-auth/plugins/access`, and `defaultStatements`, `ownerAc`, `adminAc` from `better-auth/plugins/organization/access`. Extend `defaultStatements`, build `ac.newRole(...)`, and merge owner/admin default statements explicitly. Configure `creatorRole: "owner"`, the four fixed `roles`, `teams: { enabled: false }`, and `dynamicAccessControl: { enabled: false }`. Register `organizationClient` inside the repository client wrapper using the same static definitions. Do not expose a dynamic role editor or inherit the default `member` role. [Organisation configuration](https://better-auth.com/docs/plugins/organization), [default access statements](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/plugins/organization/access/statement.ts).

The resources/actions below are **our permission statements**, not assumed Better Auth built-ins. Scope is enforced by the existing domain services after the role grant. All means within the current Account's owned payroll companies. Preserve source/state, privacy, billing and Xero capability checks.

| Statement | Owner | Admin | Manager | Viewer |
|---|---|---|---|---|
| `calendar:read`, `people:read` | Account | Account | Existing visible scope | Existing visible scope |
| `people:manage,readArchived` | Yes | Yes | No | No |
| `plans:readOwn,submitOwn,withdrawOwn` | Own Person | Own Person | Own Person | Own Person |
| `plans:manageAll` | Yes | Yes | No | No |
| `plans:manageReports` | Yes | Yes | Permitted reports | No |
| `manualAvailability:manageOwn` | Yes | Yes | Own Person | Own Person |
| `manualAvailability:manageDirectReports` | Yes | Yes | Actual direct reports | Actual direct reports, if linked as manager today |
| `manualAvailability:manageAll` | Yes | Yes | No | No |
| `approvals:review,approve,decline,requestInfo` | Account | Account | Permitted reports, existing self exclusions | No |
| `approvals:recoverProviderOutcome` | Yes | Yes | No | No |
| `feeds:read,subscribe` | Eligible feeds | Eligible feeds | Eligible feeds | Eligible feeds |
| `feeds:manageOwn` | Existing eligibility | Existing eligibility | Existing eligibility | Existing eligibility |
| `feeds:manageAll` | Yes | Yes | No | No |
| `reports:read` | Account | Account | Existing report scope | No |
| `settings:update`, `audit:read` | Yes | Yes | No | No |
| `xero:connect,sync,manage` | Yes | Yes | No | No |
| `xero:removeCompany` | Yes | No | No | No |
| `billing:read,checkout,portal` | Yes | Yes | No | No |
| Native `invitation:create,cancel`, `member:create,update,delete` | Yes | Yes, excluding owner targets/assignment | No | No |
| Native `organization:update` | Yes | Yes | No | No |
| Native `organization:delete` | Disabled at launch | No | No | No |
| `ownership:manage` | Yes | No | No | No |

Explicitly omit `organization:delete` from even the custom owner role while Account deletion is disabled; merging `ownerAc.statements` alone would otherwise grant it. Strip unused team/dynamic-ACL permissions. Owners can grant owner; admins cannot invite, promote, demote or remove owners. Membership mutation checks target and actor, not just the `member:update` permission. Unknown/multiple roles fail closed.

This preserves actual source nuances: viewer is not globally read-only because self-service writes exist; manual availability currently authorises a linked direct manager without requiring the manager role; manager scope may vary by action and `all_team_leave` setting. The migration does not silently tighten or expand those rules. Billing checkout/portal admit owner/admin and retain early-access disabling, as shown in [billing actions](../../apps/app/app/(authenticated)/settings/billing/actions.ts). See [inventory role catalogue](01-inventory.md#3-roles-and-auth-helpers), [manual availability authorisation](../../packages/availability/src/records/manual-records-service.ts), and [manager scope](../../packages/availability/src/settings/manager-scope.ts).

## 7. Hooks, invariants, provisioning and our audit trail

### Hook contract and limits

Use core `databaseHooks.user.create/update/delete` and `session.create` for user/session lifecycle validation and post-commit notifications. Organisation lifecycle uses `organizationHooks`, not fictitious `databaseHooks.member`. Hooks such as `afterCreateOrganization`, `afterAcceptInvitation`, `afterAddMember`, `beforeRemoveMember`/`afterRemoveMember`, and `beforeUpdateMemberRole`/`afterUpdateMemberRole` are verified in the [hook types](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/plugins/organization/types.ts).

Member-removal hooks receive `{ member, user, organization }` with the **target** user. Role hooks add new/previous role fields; they do not supply a trusted actor argument. Capture actor/request identity from our authenticated request context. Core database after hooks run after commit when transactions are enabled. Current native `leaveOrganization` bypasses member-removal hooks; the built-in final-owner checks are read-then-write checks outside a blanket mutation transaction. Therefore hooks alone cannot prove invariants or complete audits. [Database hook timing](https://better-auth.com/docs/concepts/database), [member/leave routes](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/plugins/organization/routes/crud-members.ts), [organisation creation](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/better-auth/src/plugins/organization/routes/crud-org.ts).

### Controlled operations

- Atomic auth bootstrap creates user plus authorised Account/member and local auth audit in one transaction, with invitation claims and creator-role handling as applicable. The decorator must cover standalone adapter calls and transaction callbacks; no hidden non-transactional fallback. Use deferred constraints to reject an orphaned user at commit.
- Membership/role mutations lock the Account and affected user in a fixed order, re-read owner/membership state, protect the final owner and user's final Account, write our audit and revoke affected user's sessions before commit. Database enforcement covers native remove/leave/role update, server-only changes and direct endpoint access. Disable uncoordinated user/Account deletion; audit cleanup is a separate maintenance operation.
- Role downgrades/removal revoke **all** target-user sessions, including those active in other Accounts. This deliberate policy avoids stale active-account sessions. Delete session rows through the auth-storage service in the same transaction; do not call caller-scoped `revokeSessions` using an admin's cookie. Password reset and explicit security sign-out also revoke according to section 8.
- An Account's `country_code` is mandatory and determines all its payroll companies' country. AU-only onboarding remains the release rule; NZ/UK sign-in identities do not enable NZ/UK payroll. Account creation validates admitted owner, country and browser IANA timezone. A later company must match that country and entitlement limits. Enforce country ownership at the database/service boundary, not a profile metadata convention.
- After the auth transaction, provision exactly one default payroll Organisation and Account settings through `withTenantResult(accountId, ...)`, using idempotent account/bootstrap identity and company lock. Mark the Account `ready` only after durable domain provisioning. A post-commit failure leaves it pending and retryable, with no product access; it does not remove its owner's membership. Invitation acceptance never creates a default Account/company. Creator, accepted invite and server-added membership all link existing People across active companies idempotently.

Auth/control data and domain data use different restricted roles, so this design does **not** claim a stock after hook atomically commits both. The pending/ready gate and idempotent domain provisioning are the explicit failure model. Domain queries remain unavailable until readiness. The bootstrap transaction composition, native endpoint enforcement, deferred invariant behaviour and retry path must be proven before cutover; these are mandatory gates, not work executed here.

### Replacing the seven webhook effects

| Existing webhook effect | Replacement |
|---|---|
| User create/update analytics identity | Core user create/update post-commit callbacks emit safe local analytics with neutral user ID/name/email; do not guess Clerk first/last-name shape. |
| User deletion analytics marker | Controlled deletion/deactivation emits local audit and analytics; no general delete endpoint at launch. |
| Account create/update analytics group and provisioning activation | Organisation callbacks plus durable Account audit/provisioning state; retain Account-ID-based activation deduplication. |
| Membership created and owner-admission activation | Creator, accepted invitation and explicit add-member paths all write local lifecycle audit, reconcile Person links, then emit deduplicated analytics after commit. Retain trusted event time/request identity. |
| Membership deleted clears Person link | Controlled membership removal retains People/history, clears `people.user_id` in every company for that Account, revokes sessions and terminates SSE. Native leave must use the same path. |
| No previous membership-role-update webhook handler | Local role change now has authoritative audit, revocation and fresh permission checks. Do not rely on an external callback. |
| Ignored remote events / Svix delivery mechanics | No Clerk webhook, Svix secret or external membership mirror is needed after cutover. Our mutation outcome is authoritative; retries follow explicit database/provisioning state. |

`auth_audit_events` stores account-level auth changes even before a company exists. Existing `audit_events` remains the company-domain audit trail; its actual current schema requires a payroll Organisation, so do not invent a nullable company field or fabricate one for failed sign-in. A safe tenant-scoped projection combines the two for authorised account audit readers through an explicit service, not auth-table grants to the RLS role. Auth lifecycle writes are insert-only and retained under our own approved retention policy. Infrastructure's one-day Starter audit history cannot replace them. Analytics and email occur after commit and cannot be the sole evidence of an admin action.

## 8. Security controls

| Area | Proposed policy and verified mechanism |
|---|---|
| Rate limiting | `rateLimit.enabled: true`, `storage: "database"`, mapped `modelName`, shared across workers. Baseline 100 requests/60 seconds; sign-in/password reset/verification/magic-link requests 5/60 seconds per trusted client source, with account/email abuse controls where appropriate. No process-local fallback. Test atomic contention and store failure. |
| Bypass avoidance | Direct `auth.api` calls bypass Better Auth's HTTP limiter. Public auth forms use its HTTP handler through our wrappers; custom admissions/resolver endpoints need explicit limits. The selected version's custom limiter API is atomic `consume`, not older get/set examples. |
| Cookies/CSRF | HTTP-only, Secure on HTTPS, SameSite=Lax, explicit environment cookie prefix, controlled domain/path, exact trusted origins. Do not enable CSRF/origin bypass flags. Our non-auth API mutations validate Origin too. |
| Passwords | Minimum 12, maximum 128 characters via `minPasswordLength`/`maxPasswordLength`; allow spaces, no arbitrary composition rules. Use Better Auth's default scrypt password implementation. Never import Clerk hashes. |
| Verification/recovery | `requireEmailVerification: true`; email verification and reset expire after one hour; use supplied callback URLs. `revokeSessionsOnPasswordReset: true`; password change requests `revokeOtherSessions: true`. Generic responses avoid email enumeration. |
| Magic link | `expiresIn: 300`, `storeToken: "hashed"`; single-use redemption. Current `allowedAttempts` is deprecated/ignored, so do not promise it as a control. Owner/invitation admission still applies to first signup. Link request/redemption limits and scanner behaviour need tests. |
| Linking | Both local and incoming email verified; implicit linking disabled; no trusted-provider bypass; same email required. Provider subjects remain immutable identifiers. |
| Sessions | Seven-day rolling expiry, daily update, documented one-day freshness baseline. Disable cookie cache and secondary auth-session caching at launch; re-read current membership/role. Handle renewal through route/client requests that can set cookies. |
| Revocation | Delete target-user sessions transactionally on removal/downgrade; next request must fail. Recheck existing SSE connections/polls and stop replay. No stale role/token fallback during an auth-store outage. |
| Tokens and secrets | `account.encryptOAuthTokens: true`; state stored in the database, no provider-account cookie. Do not log session/reset/magic/provider tokens. Keep payroll and sign-in token storage, secrets and scopes independent. |
| Audit | Own insert-only local audit records, with trusted actor, target, account, prior/new role, request ID and timestamp. Retention must be decided before launch; no dependency on a hosted one-day log. |

These are project policy values using verified controls, not claimed defaults. [Rate limiting](https://better-auth.com/docs/concepts/rate-limit), [session management](https://better-auth.com/docs/concepts/session-management), [magic links](https://better-auth.com/docs/plugins/magic-link), [options including token encryption](https://better-auth.com/docs/reference/options), [token encryption option type](https://raw.githubusercontent.com/better-auth/better-auth/main/packages/core/src/types/init-options.ts), [security and trusted proxy/IP controls](https://better-auth.com/docs/reference/security).

## 9. Better Auth Infrastructure and residency gate

### Configuration and launch state

The documented server import is `dash` from `@better-auth/infra`. It uses `apiKey`, falling back to `BETTER_AUTH_API_KEY`. Default services are `https://dash.better-auth.com` and `https://kv.better-auth.com`. Our flag is **not** a `dash({ enabled: false })` API: when false, omit the plugin and associated client/admin endpoints, with no key required. When enabled after review, provide the key and explicitly disable unused activity tracking and managed-directory-sync options. Do not add Sentinel/browser fingerprinting, managed email, SMS, SSO or SCIM for this task. Disabling last-active tracking does not disable audit events. [Infrastructure setup](https://better-auth.com/docs/infrastructure/getting-started), [Dashboard options](https://better-auth.com/docs/infrastructure/plugins/dashboard).

Starter currently advertises one dashboard seat, 10,000 audit events/month and one-day audit retention. This establishes the short audit window, not a deletion guarantee for other data. Feature availability must be confirmed at purchase; pricing and the getting-started guide differ on some security-feature entitlements. [Pricing](https://better-auth.com/pricing).

### What leaves our service

Docs alone do not enumerate the complete data boundary. To narrow that gap, the published `@better-auth/infra@0.4.22` archive was inspected during research; shasum `89b37d654548b57ccb3b3f8dfa680ac5899656d3`. This is source observation, not a vendor storage or compliance guarantee. [Published metadata](https://registry.npmjs.org/@better-auth/infra/latest), [versioned archive](https://registry.npmjs.org/@better-auth/infra/-/infra-0.4.22.tgz).

| Channel | Observed/documented data | Remaining uncertainty |
|---|---|---|
| Audit POST to `/events/track` | Envelope `eventType`, `eventData`, `eventKey`, `eventDisplayName`, client IP, city, country and countryCode; Infrastructure API key in `x-api-key`. Event-specific data includes user IDs/names/emails, session ID/user agent/login method, provider identity IDs, Account name/slug, member roles, invitation/actor metadata and auth-failure attempted email. | Exact configured-event payloads must be checked again for the pinned release, including custom fields. These are identifiable data. |
| Attribution at KV service | Request identification through `/identify/{requestId}`, including identification derived from `X-Request-Id`/`__infra-rid` when present | Vendor derivation, persistence and subprocessor use of attribution/location data. |
| Dashboard management | Authenticated user/session/Account administration, aggregate data, exports and adapter queries | `/dash/user` joins provider identity rows without comprehensive credential projection; `/dash/execute-adapter` returns adapter results. Session handlers strip the direct token property, but that is not comprehensive redaction. What the hosted dashboard requests, caches and stores requires confirmation. |
| Core framework/CLI telemetry | Separate optional reduced environment/configuration telemetry | Explicitly keep `telemetry.enabled: false` / `BETTER_AUTH_TELEMETRY=0`; its anonymous-data claims do not describe Dash audits. |

The inspected event-data key set is: `acceptedByEmail`, `acceptedById`, `acceptedByName`, `accountId`, `banExpires`, `banReason`, `banned`, `cancelledByEmail`, `cancelledById`, `cancelledByName`, `impersonatedBy`, `impersonatedById`, `inviteeEmail`, `inviteeId`, `inviteeRole`, `inviteeTeamId`, `inviterEmail`, `inviterId`, `inviterName`, `loginMethod`, `memberEmail`, `memberId`, `memberName`, `memberRole`, `newRole`, `oldRole`, `organizationId`, `organizationName`, `organizationSlug`, `providerId`, `rejectedByEmail`, `rejectedById`, `rejectedByName`, `role`, `sessionId`, `teamId`, `teamName`, `triggerContext`, `triggeredBy`, `triggeredByName`, `triggeredByEmail`, `updatedFields`, `userAgent`, `userEmail`, `userId`, `userName`, `userid`. Events use subsets; team fields are not activated by our disabled auth teams. This is version-specific observation, not an exhaustive promise about remote management responses.

Ordinary audit event constructors inspected do not include password values/hashes or OAuth/session token values. The administrative response paths mean we **cannot claim** credentials or sensitive account fields never leave the database. They demonstrate possible disclosure, not proof the vendor persistently stores every returned field. No general browser replay collector was established for ordinary Dash, and no exhaustive exclusion of all error/metrics payloads is justified. Treat credential projection, custom fields and remote admin access as an additional blocking security review. [Dashboard](https://better-auth.com/docs/infrastructure/plugins/dashboard), [audit logs](https://better-auth.com/docs/infrastructure/plugins/audit-logs), [separate core telemetry](https://better-auth.com/docs/reference/telemetry).

### Where data is held, retention and legal assessment

Public policy permits international transfers, including the US, but does not specify API/KV/audit hosting regions, a selectable AU/NZ/UK residency boundary, backups/support locations or named subprocessors. The DPA supplies processor commitments, EU SCCs and a UK Addendum; the subprocessor list is available on request. Full per-data-class retention, deletion completion, backup purge and dashboard-response storage are not established. Neither the one-day audit limit nor a configurable API URL proves regional residency. [Privacy Policy](https://better-auth.com/legal/privacy), [DPA](https://better-auth.com/legal/dpa).

| Market | Required determination before enabling Dash |
|---|---|
| AU | Determine APP applicability and whether offshore use is disclosure or sufficiently controlled processing; document APP 8 reasonable steps, accountability, destinations and contract/security safeguards. [OAIC APP 8](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information). |
| NZ | Determine agent-only processing versus a disclosure covered by IPP 12, vendor's own uses and comparable safeguards/another lawful basis where applicable. [NZ Privacy Commissioner guidance](https://www.privacy.org.nz/responsibilities/disclosing-personal-information-outside-new-zealand/decision-tree-page/). |
| UK | Identify restricted transfers and actual onward destinations; complete the appropriate IDTA/Addendum and transfer assessment/data protection test, with supplementary safeguards as required. A mention of SCCs is not the completed assessment. [ICO transfer guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/appropriate-safeguards/what-are-standard-data-protection-clauses-the-uk-idta-and-the-addendum/). |

**Conclusion: residency and privacy suitability are NOT ESTABLISHED. Plugin enablement is blocked.** Obtain vendor answers on all storage/backup/support countries and subprocessors, regional controls, payload minimisation, credential-field access, encryption/key management, retention/deletion SLAs, DPA completion and transfer safeguards. Record the market-specific assessment and approved notices/contracts before setting the flag true. Core self-hosted auth remains independent; do not silently enable Dash to satisfy the launch intention.

## 10. Environment configuration

| Variable | Placement / requirement |
|---|---|
| `AUTH_PROVIDER` | Shared deployment selection, exact `clerk` or `better-auth`; initially `clerk`. App/API/jobs/client build settings must agree. No per-request/user provider fallback. |
| `BETTER_AUTH_SECRET` | App auth runtime only; strong random secret, at least the documented 32-character minimum. Separate per environment, retained securely with rotation/recovery plan. |
| `BETTER_AUTH_URL` | Exact app/auth origin, no API origin and no guessed host inference. Local `http://localhost:3000`; Production `https://app.teamcalendar.online`; Preview exact paired app URL. Base path `/api/auth`. |
| `DATABASE_AUTH_URL` | Dedicated auth-role connection to the same environment's Neon database; app auth and narrowly allowlisted background identity service only. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | App-only OAuth credentials and exact per-environment callbacks. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | App-only Entra registration credentials. |
| `MICROSOFT_TENANT_ID` | `organizations` for multi-tenant work/school Entra; validate configured choice and registration. |
| `XERO_AUTH_CLIENT_ID`, `XERO_AUTH_CLIENT_SECRET` | New identity-only Xero app; no payroll credential reuse. |
| `BETTER_AUTH_INFRA_ENABLED` | Strict boolean, default false. True is rejected until explicit residency/security approval and required key/config are present. |
| `BETTER_AUTH_API_KEY` | Server-only Infrastructure key, required only when plugin enabled; never a public env variable. |
| `BETTER_AUTH_TELEMETRY` | Explicit `0` to keep framework/CLI telemetry disabled independently of Dash. |
| Existing public origin/candidate variables | Exact app/API/web pair for trusted origins, CORS, proxy destinations and callback registration. Never expose secrets through `NEXT_PUBLIC_*`. |
| `RESEND_TOKEN`, `RESEND_FROM` | Existing mail transport for verification, recovery, magic links and invites. |

Keep Clerk keys only during pre-cutover rollback eligibility. At final removal delete Clerk keys, webhook secret, component URL vars, SDK/test packages and `__clerk`/CSP allowances from each inventory area. Update Turbo env/cache declarations and production preflight for the chosen provider; disabled optional settings are absent, not empty strings. The `AUTH_PROVIDER` gate cannot make a schema-incompatible Clerk build safe after reset.

## 11. Transition flag, reset and rollback

These are transition design boundaries, not execution instructions for this session.

1. **Preparation:** keep Clerk production path and its schema/data intact. Isolate Better Auth rehearsal using the same database technology on the authorised non-production target. No mixed identity writes or automatic linking to old accounts. Preserve the current inventory as the baseline and produce release-specific migration evidence later.
2. **Dual implementation before cutover:** `packages/auth` selects one provider per deployment. Safe DTOs and Result semantics are shared; provider-specific components/endpoints stay behind the same selection. App/API/jobs must match. Distinct cookie names, OAuth clients/callbacks and session stores prevent accidental cross-provider acceptance. Default remains `clerk` while validation is incomplete.
3. **Rehearsal:** prove sign-in/verification/recovery, all four roles, admission/bootstrap invariants, Account selection, cookie/API/SSE/payroll OAuth, RLS/grants, audit, email, reset replay and Infrastructure-off network behaviour on the actual paired environments. Replace Clerk fakes and release-browser setup through repository test wrappers; test-only auth factories never ship as production bypasses. Reconcile all inventory areas.
4. **Cutover boundary:** pause writes/jobs, cancel and quarantine old queued/retry/cached-step work with closure evidence as specified above, preserve a verified restorable database/configuration snapshot, confirm the dependent-data reset and provider-link cleanup scope, apply owner migrations/reset, create fresh Better Auth admission/accounts, and deploy a coordinated `AUTH_PROVIDER=better-auth` app/API/job set. Resume only after scoped smoke checks. No existing ID maps, password imports or user notification.
5. **Rollback before reset/cutover:** redeploy the coherent Clerk set with its untouched data/config. Revoke/discard rehearsal Better Auth sessions. This is the flag's simple rollback window.
6. **After reset:** changing only the flag is unsafe. Rollback requires a coordinated restore of the exact pre-cutover database and configuration plus the compatible Clerk deployment, while jobs/writes are paused, with a fresh consumer generation and all pre-restore work quarantined. Better Auth-era writes are discarded or require a separately approved reconciliation. Do not promise lossless rollback once new writes resume. Since there are no live customers, set an explicit fresh-test-data cutoff; never quietly restore over later valid data.
7. **After cutover acceptance:** remove the Clerk branch, dependencies, secrets and webhook deployment. `AUTH_PROVIDER` is temporary transition machinery. Later problems use forward fixes or the documented restore procedure; never add a permanent dual-auth fallback.

## 12. Open questions and approval gates

| Question | Consequence / stopping rule |
|---|---|
| **Blocking Infrastructure:** what are all API/KV/audit/dashboard/support/backup countries and named subprocessors, retention/deletion SLAs and regional controls? Can administrative credential/custom-field exposure be restricted? | Vendor evidence and security/market-specific transfer review required; Dash remains omitted and flag false. If residency cannot meet the approved policy, core auth launches without Dash only with explicit launch approval. |
| **Blocking atomic membership:** can the pinned Prisma adapter decorator atomically bootstrap users/invite memberships, enforce deferred no-orphan/final-owner constraints, and cover every raw endpoint/transaction? | Prove before cutover; no pending-user exception or hook-only guarantee. A failed proof returns the design for decision. |
| **Blocking version contract:** which exact Better Auth/adapter/Infrastructure package versions and exports are accepted? | Pin and compile generated schema/API types; live `main` source findings must match that release. Resolve the adapter guide's split-package/compatibility-import detail. |
| **Blocking first owner admission:** what replaces the missing tracked early-access owner-admission runbook, and how is its email/country/invitation proof bound across every login method? | Preserve invite-only policy; cannot admit arbitrary OAuth users as owners or create invitation-bypass Accounts. |
| **Blocking verified-email flows:** how does the selected Microsoft/Xero flow complete mailbox verification before first access and before explicit linking when provider evidence is insufficient? | Prove with actual callbacks and mismatched-email cases; fail closed until demonstrated. |
| **Blocking reset scope:** which existing non-customer domain fixtures, Xero links/grants and Stripe test objects are discarded, retained disconnected or cleaned remotely? | Scope and snapshot must be agreed before destructive reset; clean identity reset does not itself authorise deleting provider resources. No remapping or credential sharing. |
| **Preview setup:** which stable paired hosts and exact Google/Microsoft/Xero identity/payroll callback registrations are available for release validation? | Recorded URLs are not current hosting proof. If paired proxy/callback configuration is unavailable, affected Preview journeys remain blocked. |
| **Own audit retention:** what auth/audit retention, access and deletion policy is approved for AU/NZ/UK? | Required before launch; neither arbitrary indefinite PII retention nor Starter's one day is assumed. |
| **Cookie tradeoff:** is controlled parent-domain session exposure, including the marketing host, accepted? | Approve the cookie recommendation or select JWT plus its broker/SSE/revocation design before implementation. |

The data reset, dedicated Xero sign-in app, sign-in-method set, fixed roles, disabled auth teams and conditional Starter intent are already decided. These questions concern missing evidence or implementation contracts and do not reopen those decisions.

## Review and stopping condition

The design maps the inventory's imports/API calls, role guards, persistence/RLS, keys, webhook effects, bearer/background flows, tests/copy and deployment boundaries. Official documentation/source research is evidence of API contracts; no browser, provider, database, generated-schema or concurrency behaviour has been verified. Implementation acceptance must include the repository's four gates plus the named auth/role/RLS/browser flows, raw HTTP secret-projection tests and stale queued/cached-step rejection, using existing protected database/release safeguards.

Stop after static review of this document. Await approval of the design and resolution/acceptance of its listed gates before an implementation plan or any code, schema, dependency, reset or deployment work.
