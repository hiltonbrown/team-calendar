# Tenant phase classification

This records the Stage 2 implementation of
`docs/superpowers/plans/2026-10-12-tenant-transaction-per-request.md`.
Verification is paused at the owner's request. The new regression tests and
boundary checks are written but have not been run against the final changes.

`PHASED_TENANT_EXPORTS` is the runtime classification register. Registration is
per exported function. Each registered function rejects an active request
transaction before beginning its work. Database-only exports in the same module
remain available for later `TenantDb` expansion.

## Result-bearing sends and durable failure state

| Flow | Database preparation | Send outside preparation | Failure contract |
| --- | --- | --- | --- |
| Approval reconciliation and inbound leave sync | `prepareApprovalSync(input, runType, db)` | `sendPreparedApprovalSync(payload)` | Preserve `dispatch_failed` as an error Result. |
| Manual sync | `prepareManualSync(input, db)` | `sendPreparedManualSync(prepared)` | Preserve the send error; record a successful dispatch in a separate database phase only after a successful send. The API retains its development fallback. |
| Cancellation | `prepareSyncCancellation(input, db)` | `sendPreparedSyncCancellation(input)` | Commit the cancellation flag first. A failed queue send returns `eventQueued: false`; a later audit failure leaves the flag committed. |
| Balance refresh | `prepareBalanceRefresh(input, db)` | `sendPreparedBalanceRefresh(prepared)` | Preserve the existing successful receipt with `queued: false` and `reason: dispatch_failed`. Audit the outcome in a separate phase. |
| Submit notification delivery | `prepareNotificationPublication(input, db)` | `sendPreparedNotificationPublication(prepared)` | Keep the committed notification and checkpoint for retry when realtime publication fails. |
| Feed publication reconciliation | `prepareFeedRebuilds(input, db)` | `sendPreparedFeedRebuilds(context, feeds)` | Keep independently materialised records when the rebuild send fails; return the existing error Result. |
| Email drain | Independent writes per queue item | Resend delivery between item phases | Keep attempt counters and terminal failure status; continue after an individual item fails. The orchestrator remains phased. |

The approval actions, manual-sync API route, cancellation action and balance
refresh action explicitly await `withTenantDb` before invoking their senders.
Compatibility service composers remain phased. The submit side-effect and feed
reconciliation orchestrators call their senders after their preparation scope
returns.

Two accidental partial-persistence paths were corrected during the inventory:

- Token rotation throws a private rollback sentinel when replacement insertion
  conflicts, so the old token's revocation does not commit.
- Default notification dispatch persists the in-app row and required email queue
  item in one transaction. An error Result aborts that transaction. Realtime
  delivery follows commit. Caller-owned notification persistence still leaves
  rollback responsibility with its caller and suppresses delivery on a required
  email persistence failure.

Best-effort feed-action and submit notifications retain their existing logging
and receipt contracts. They are not promoted to result-bearing critical sends.

## Measured fan-out

`TENANT_FAN_OUT_ENTRY_POINTS` is empty. The plan requires measured Stage 0
improvement before approving an independent read fan-out, and Neon measurements
are pending. `TENANT_FAN_OUT_CANDIDATES` records the loaders to measure; it does
not authorise new `withTenantReads` calls. Existing legacy parallel loaders have
not yet been converted.

## Decisions carried into Stage 3

- Only `mergeCandidateIntoXeroPerson` is phased in the person-reconciliation
  module. `reconcileXeroPerson` and `ignorePersonMatch` are database-only; the
  former must remain callable within a batch transaction.
- The guard-only database subpath shares the same async scope as `withTenantDb`
  without loading the database client.
- Feed rebuild preparation already threads a supplied `TenantDb` through
  `feedIdsForPeople` and `loadFeedScopeData`. Its scope reads are sequential. Their
  omitted-client paths now open owned scopes through `inTenant` (source unverified).
- Default notification persistence now uses `withTenantResult`, with supplied
  `TenantDb` reuse and post-commit publication (source unverified).
- The owner removed the temporary compatibility requirement for this pre-launch
  app. Expanded APIs replace ordinary client parameters with `TenantDb`; the
  additional compatibility bridge is deleted and internal callers are migrated.
- `renderFeedBody` is phased because its implementation coordinates independently
  committed representation snapshots around ICS generation. Database metadata and
  access writes use short branded phases.

These changes remain unverified as a Stage 2 whole. No disposable database was
created, and the earlier Stage 0/1 physical database and Neon evidence gaps remain.
