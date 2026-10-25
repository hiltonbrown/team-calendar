// Register functions individually. Other exports in the same module can use TenantDb.
export const PHASED_TENANT_EXPORTS = [
  {
    exports: ["seedAuthDevelopmentFixtures"],
    path: "packages/database/src/seed/auth-fixtures.ts",
    reason:
      "Development-only native auth commits precede restricted tenant fixture creation and owner readiness updates",
  },
  {
    exports: ["completeAuthUserLifecycle"],
    path: "packages/auth/user-lifecycle.ts",
    reason:
      "Committed auth identity and durable audit discovery surround tenant-scoped provisioning and verified Person reconciliation; analytics follows closed database scopes",
  },
  {
    exports: ["ensureUserAccountsReady"],
    path: "packages/auth/adapters/better-auth-server.ts",
    reason:
      "Auth Account discovery precedes scoped default-company provisioning and readiness follows durable commit",
  },
  {
    exports: ["reconcileAccountPeople", "clearAccountPeople"],
    path: "packages/auth/membership-reconciliation.ts",
    reason:
      "Verified membership identity precedes scoped existing-Person reconciliation; auth tables never use the tenant client",
  },
  {
    exports: ["resolveWriteEmployeeId", "resolveWriteLeaveTypeId"],
    path: "packages/xero/src/adapter/xero-write-adapter.ts",
    reason:
      "C1: database mapping resolution closes before outbound Xero writes",
  },
  {
    exports: ["resolveXeroAccess"],
    path: "packages/xero/src/oauth/authorisation.ts",
    reason:
      "C6: scoped connection snapshots close before and after provider credential refresh",
  },
  {
    exports: ["verifyXeroProviderConnection"],
    path: "packages/xero/src/oauth/provider-connection.ts",
    reason:
      "C6: scoped connection lookup closes before provider inventory requests",
  },
  {
    exports: ["dispatchInitialXeroSync"],
    path: "packages/jobs/src/events.ts",
    reason:
      "C2: initial sync request persistence closes before Inngest dispatch",
  },
  {
    exports: [
      "markAsReadAction",
      "markAllAsReadAction",
      "refreshUnreadCountAction",
      "listRecentUnreadAction",
      "updatePreferenceAction",
    ],
    path: "apps/app/app/(authenticated)/notifications/_actions.ts",
    reason:
      "C6: Account identity and role precede one account Result scope; preference ownership and writes share a company-scoped request",
  },
  {
    exports: ["POST"],
    path: "apps/api/app/api/notifications/[notificationId]/mark-read/route.ts",
    reason:
      "C6: Account authenticationentication and notification id validation precede one account Result write scope",
  },
  {
    exports: ["Header"],
    path: "apps/app/app/(authenticated)/components/header.tsx",
    reason:
      "C7: independent header scope groups company selector data and account-wide notification snapshots after Account authenticationentication",
  },
  {
    exports: ["drainNotificationEmailQueue"],
    path: "packages/jobs/src/handlers/send-notification-emails.ts",
    reason:
      "C2: owner account discovery and per-account preparation precede external sends",
  },
  {
    exports: ["scheduleXeroSyncsPage"],
    path: "packages/jobs/src/handlers/schedule-xero-syncs.ts",
    reason:
      "C2: owner account discovery and per-account preparation precede external sends",
  },
  {
    exports: ["resolveSyncTenant"],
    path: "packages/jobs/src/handlers/xero-sync-access.ts",
    reason:
      "C2: connection snapshot closes before credential/provider resolution",
  },
  {
    exports: ["completeTenantSelectionAction"],
    path: "apps/app/app/(authenticated)/settings/integrations/xero/connect/_actions.ts",
    reason:
      "C6: authenticated session snapshot closes before provider selection; each durable outcome audits and dispatches separately",
  },
  {
    exports: ["rebuildFeedCache"],
    path: "packages/jobs/src/handlers/rebuild-feed-cache.ts",
    reason:
      "C5: cache invalidation/render/KV writes surround short feed snapshots and persistence",
  },
  {
    exports: ["recoverXeroImportDispatch"],
    path: "packages/jobs/src/handlers/recover-xero-import-dispatch.ts",
    reason:
      "C2: owner discovery and per-account run snapshots precede dispatch sends",
  },
  {
    exports: ["captureInitialSyncCompleted"],
    path: "packages/jobs/src/activation.ts",
    reason: "C6: activation snapshot closes before analytics capture and flush",
  },
  {
    exports: ["POST"],
    path: "apps/api/app/api/support/github-issue/route.ts",
    reason:
      "C6: webhook/auth/provider work remains outside tenant persistence phases",
  },
  {
    exports: ["POST"],
    path: "apps/api/app/webhooks/payments/route.ts",
    reason:
      "C6: webhook/auth/provider work remains outside tenant persistence phases",
  },
  {
    exports: ["createCheckoutSession", "createPortalSession"],
    path: "packages/billing/src/stripe.ts",
    reason:
      "C6: webhook/auth/provider work remains outside tenant persistence phases",
  },
  {
    exports: ["GET"],
    path: "apps/api/app/api/xero/oauth/start/route.ts",
    reason:
      "C6: Account authenticationentication and OAuth provider work run outside SQL persistence phases",
  },
  {
    exports: ["GET"],
    path: "apps/api/app/api/xero/oauth/callback/route.ts",
    reason:
      "C6: Account authenticationentication and OAuth provider work run outside SQL persistence phases",
  },
  {
    exports: [
      "connectXeroAction",
      "disconnectXeroAction",
      "pauseTenantSyncAction",
      "resumeTenantSyncAction",
      "removeCompanyAction",
    ],
    path: "apps/app/app/(authenticated)/settings/integrations/xero/_actions.ts",
    reason:
      "C6: Account authenticationentication and headers precede SQL preparation; disconnect and removal providers run outside SQL",
  },
  {
    exports: [
      "dispatchManualSyncAction",
      "cancelRunAction",
      "exportFailedRecordsCsvAction",
      "loadFailedRecordsPageAction",
      "loadTimelinePageAction",
      "loadRedactedFailurePayloadAction",
    ],
    path: "apps/app/app/(authenticated)/sync/_actions.ts",
    reason:
      "C6: Account identity precedes owned-company scopes; cancellation and HTTP dispatch sends run between SQL phases",
  },
  {
    exports: ["captureXeroConnected"],
    path: "packages/xero/src/oauth/activation.ts",
    reason:
      "C6: durable connection snapshot closes before analytics capture and flush",
  },
  {
    exports: ["inviteMember"],
    path: "apps/app/app/actions/settings/invite-member.ts",
    reason:
      "C6: Account authenticationentication and SDK calls remain outside tenant SQL",
  },
  {
    exports: ["removeMember"],
    path: "apps/app/app/actions/settings/remove-member.ts",
    reason:
      "C6: Account authenticationentication and SDK calls remain outside tenant SQL",
  },
  {
    exports: ["updateMemberRole"],
    path: "apps/app/app/actions/settings/update-member-role.ts",
    reason:
      "C6: Account authenticationentication and SDK calls remain outside tenant SQL",
  },
  {
    exports: ["revokeAllTokens"],
    path: "apps/app/app/actions/settings/revoke-tokens.ts",
    reason:
      "C6: Account authenticationentication and SDK calls remain outside tenant SQL",
  },
  {
    exports: ["updateOrganisationAction"],
    path: "apps/app/app/(authenticated)/settings/general/_actions.ts",
    reason:
      "C6: Account identity and request headers precede one company/settings/audit Result scope",
  },
  {
    exports: ["startCheckout", "startPortal"],
    path: "apps/app/app/(authenticated)/settings/billing/actions.ts",
    reason:
      "C6: Account authenticationentication and company preparation precede Stripe calls outside SQL",
  },
  {
    exports: ["updateFeedDefaultsAction"],
    path: "apps/app/app/(authenticated)/settings/feeds/_actions.ts",
    reason:
      "C6: Account identity precedes one owned-company Result write scope and post-commit invalidation",
  },
  {
    exports: [
      "saveDetailsAction",
      "startXeroFromOnboardingAction",
      "skipXeroAction",
      "advanceStepAction",
      "linkSelfAction",
      "createSelfAction",
      "addPersonAction",
      "sendInvitesAction",
      "finishAction",
    ],
    path: "apps/app/app/(setup)/onboarding/_actions.ts",
    reason:
      "C6: Account authentication/providers and analytics remain outside Result write scopes; per-invite outcomes stay independent",
  },
  {
    exports: ["completeWelcomeAction"],
    path: "apps/app/app/(setup)/welcome/_actions.ts",
    reason:
      "C6: Account authentication precedes one Result welcome write; analytics follows commit",
  },
  {
    exports: ["createOrganisationAction"],
    path: "apps/app/app/(authenticated)/setup/_actions.ts",
    reason:
      "C6: Account authentication precedes atomic company/default feed/person setup; redirect follows commit",
  },
  {
    exports: ["POST"],
    path: "apps/api/app/api/availability/route.ts",
    reason:
      "C6: Account authentication and body validation precede one Result scope; HTTP response follows rollback/commit",
  },
  {
    exports: ["PATCH", "DELETE"],
    path: "apps/api/app/api/availability/[recordId]/route.ts",
    reason:
      "C6: Account authentication and body validation precede one Result scope; HTTP response follows rollback/commit",
  },
  {
    exports: [
      "createManualAvailabilityAction",
      "updateManualAvailabilityAction",
      "archiveManualAvailabilityAction",
    ],
    path: "apps/app/app/actions/availability/manual.ts",
    reason:
      "C6: Account authentication precedes one Result mutation scope and deferred revalidation",
  },
  {
    exports: ["exportLeaveReportsCsvAction"],
    path: "apps/app/app/(authenticated)/analytics/leave-reports/_actions.ts",
    reason:
      "C6: Account authentication precedes one scope for owned company and paginated export",
  },
  {
    exports: ["getActiveOrgContext"],
    path: "apps/app/lib/server/get-active-org-context.ts",
    reason:
      "C6: Account discovery precedes one owned-company scope; scoped callers use pure resolvers",
  },
  {
    exports: ["ensureDefaultOrganisation"],
    path: "apps/app/lib/server/ensure-default-organisation.ts",
    reason:
      "C6: Account name lookup precedes one default-company and feed scope",
  },
  {
    exports: ["materialisePublication"],
    path: "packages/availability/src/records/manual-records-service.ts",
    reason:
      "C5: manual record commit precedes independent best-effort projection and cache effects",
  },
  {
    exports: ["loadNewHolidayFormData"],
    path: "apps/app/app/(authenticated)/public-holidays/holidays/new/form-data.ts",
    reason:
      "C6: Account identity and role discovery precedes one form-data read scope",
  },
  {
    exports: [
      "addCustomHolidayAction",
      "deleteCustomHolidayAction",
      "hideHolidayAction",
      "restoreHolidayAction",
      "setHolidayClassificationAction",
      "setLocalHolidayEnabledAction",
    ],
    path: "apps/app/app/(authenticated)/public-holidays/_actions.ts",
    reason:
      "C6: Account identity and role discovery precedes one Result scope for holiday ownership and mutation",
  },
  {
    exports: ["updateTeamCoverageMinimumAction"],
    path: "apps/app/app/(authenticated)/settings/coverage/_actions.ts",
    reason:
      "C6: Account authenticationentication precedes one Result scope for coverage ownership and mutation",
  },
  {
    exports: ["exportAuditLogCsvAction"],
    path: "apps/app/app/(authenticated)/settings/audit-log/_actions.ts",
    reason:
      "C6: Account authenticationentication precedes one Result scope for audit export and audit write",
  },
  {
    exports: ["loadPlanFormData"],
    path: "apps/app/app/(authenticated)/plans/record-form-data.ts",
    reason:
      "C6: Account authenticationentication precedes one owned person/record-derived form read scope",
  },
  {
    exports: [
      "createRecordAction",
      "updateRecordAction",
      "deleteDraftAction",
      "archiveRecordAction",
      "restoreRecordAction",
      "attachSubmitRecoveryCandidateAction",
      "listSubmitRecoveryCandidatesAction",
      "resolveSubmitAsNotCreatedAction",
      "submitForApprovalAction",
      "withdrawSubmissionAction",
      "retrySubmissionAction",
      "revertToDraftAction",
    ],
    path: "apps/app/app/(authenticated)/plans/_actions.ts",
    reason:
      "Account authentication precedes Result mutations or short record-derived preparation before durable provider phases",
  },
  {
    exports: ["materialisePlanPublication"],
    path: "packages/availability/src/plans/plan-service.ts",
    reason:
      "C5: record mutations commit before independent best-effort projection and cache effects",
  },
  {
    exports: [
      "approveAction",
      "declineAction",
      "requestMoreInfoAction",
      "retryApprovalAction",
      "retryDeclineAction",
      "revertApprovalAttemptAction",
      "dispatchApprovalReconciliationAction",
      "dispatchXeroLeaveSyncAction",
    ],
    path: "apps/app/app/(authenticated)/leave-approvals/_actions.ts",
    reason:
      "Account authentication and record-derived company preparation precede phased provider writes or one Result scope",
  },
  {
    exports: ["createManualPersonAction"],
    path: "apps/app/app/(authenticated)/people/new/_actions.ts",
    reason:
      "C6: Account authenticationentication precedes one Result write scope; redirect follows commit",
  },
  {
    exports: [
      "addAlternativeContactAction",
      "updateAlternativeContactAction",
      "deleteAlternativeContactAction",
      "reorderAlternativeContactsAction",
      "setManualBalanceAction",
      "setPersonManagerAction",
    ],
    path: "apps/app/app/(authenticated)/people/_actions.ts",
    reason:
      "C6: authenticate before one Result scope for actor, ownership and mutation",
  },
  {
    exports: [
      "createFeedAction",
      "updateFeedAction",
      "pauseFeedAction",
      "resumeFeedAction",
      "archiveFeedAction",
      "restoreFeedAction",
      "createOwnFeedAction",
      "issueTokenAction",
      "rotateTokenAction",
      "revokeTokenAction",
    ],
    path: "apps/app/app/(authenticated)/feeds/_actions.ts",
    reason:
      "Account authenticationentication precedes feed database preparation; analytics and notification publication follow commit",
  },
  {
    exports: ["requireActiveOrgPageContext"],
    path: "apps/app/lib/server/require-active-org-page-context.ts",
    reason:
      "Account discovery and a separately scoped company lookup; scoped callers use resolveActiveOrgPageContext",
  },

  {
    exports: [
      "approve",
      "retryApproval",
      "decline",
      "retryDecline",
      "revertApprovalAttempt",
      "dispatchApprovalReconciliation",
      "dispatchXeroLeaveSync",
      "sendPreparedApprovalSync",
    ],
    path: "packages/availability/src/approvals/approval-service.ts",
    reason:
      "C1: durable outbound claims and separately committed provider outcomes",
  },
  {
    exports: [
      "submitDraftRecord",
      "retrySubmission",
      "createLeaveOnApproval",
      "withdrawSubmission",
      "revertToDraft",
    ],
    path: "packages/availability/src/plans/submit-service.ts",
    reason: "C1: outbound writes and recovery must commit in phases",
  },
  {
    exports: [
      "listSubmitRecoveryCandidates",
      "attachSubmitRecoveryCandidate",
      "resolveSubmitAsNotCreated",
    ],
    path: "packages/availability/src/plans/submit-recovery-service.ts",
    reason: "C1: provider recovery commits independently",
  },
  {
    exports: [
      "prepareXeroWrite",
      "recordXeroWriteOutcome",
      "completeXeroWriteSideEffects",
    ],
    path: "packages/availability/src/plans/write-operation.ts",
    reason:
      "C1: claims and provider outcomes must be durable before the next phase",
  },
  {
    exports: ["syncXeroLeaveRecords"],
    path: "packages/jobs/src/handlers/sync-xero-leave-records.ts",
    reason:
      "C2: provider calls between independently committed persistence batches",
  },
  {
    exports: ["syncXeroPeople"],
    path: "packages/jobs/src/handlers/sync-xero-people.ts",
    reason:
      "C2: provider calls between independently committed persistence batches",
  },
  {
    exports: ["syncXeroLeaveBalances"],
    path: "packages/jobs/src/handlers/sync-xero-leave-balances.ts",
    reason:
      "C2: provider calls between independently committed persistence batches",
  },
  {
    exports: ["reconcileXeroApprovalState"],
    path: "packages/jobs/src/handlers/reconcile-xero-approval-state.ts",
    reason:
      "C2: provider calls between independently committed persistence batches",
  },
  {
    exports: [
      "initialXeroSync",
      "executeInitialSync",
      "completeInitialSyncPhase",
    ],
    path: "packages/jobs/src/handlers/initial-xero-sync.ts",
    reason:
      "C2: each resumed initial-import phase runs outside request transactions",
  },
  {
    exports: ["executeLocalSyncFallback"],
    path: "apps/api/lib/sync/execute-local-sync-fallback.ts",
    reason: "C2: local provider fallback keeps independently committed batches",
  },
  {
    exports: ["GET"],
    path: "apps/api/app/api/notifications/stream/route.ts",
    reason: "C3: a tenant transaction cannot span the open SSE stream",
  },
  {
    exports: [
      "pollNotificationStream",
      "publishNotificationEvent",
      "publishOrganisationNotificationEvent",
    ],
    path: "packages/notifications/src/sse/broker.ts",
    reason: "C3: Redis stream operations run outside tenant transactions",
  },
  {
    exports: ["renderFeedForToken", "cachedEtagForToken", "renderFeedBody"],
    path: "packages/feeds/src/render/render-feed.ts",
    reason:
      "C4: public token discovery and cache access surround tenant persistence",
  },
  {
    exports: ["establishFeedRepresentation"],
    path: "packages/feeds/src/publication/feed-representation.ts",
    reason:
      "C5: feed representations require their own Serializable transaction",
  },
  {
    exports: ["updateAccountNameAction"],
    path: "apps/app/app/(authenticated)/settings/general/_actions.ts",
    reason: "C6: Account update precedes local audit persistence",
  },
  {
    exports: ["updateOrg"],
    path: "apps/app/app/actions/settings/update-org.ts",
    reason:
      "C6: local company Result persistence closes before the Account update",
  },
  {
    exports: [
      "loadAccountAccessCandidates",
      "inviteAccountAccessCandidates",
      "refreshBalancesAction",
    ],
    path: "apps/app/app/(authenticated)/people/_actions.ts",
    reason:
      "C6: Account membership and invitation calls surround tenant queries",
  },
  {
    exports: ["resolveXeroPersonMatchAction"],
    path: "apps/app/app/(authenticated)/settings/integrations/xero/matches/_actions.ts",
    reason: "C6: Account access discovery and person matching run in phases",
  },
  {
    exports: [
      "fetchAllAccountMembers",
      "fetchAllPendingAccountInvitations",
      "loadAccountAccessReview",
      "reconcileAccountAccessLinks",
      "inviteAccountAccessCandidates",
    ],
    path: "packages/availability/src/people/account-access-service.ts",
    reason:
      "C6: Account directory calls cannot run inside a tenant transaction",
  },

  {
    exports: [
      "getPendingXeroOAuthSession",
      "buildXeroOAuthStartUrl",
      "completeXeroOAuth",
      "cancelXeroOAuth",
      "purgeClosedXeroOAuthSessions",
      "completeXeroTenantSelection",
    ],
    path: "packages/xero/src/oauth/service.ts",
    reason:
      "C6: canonical OAuth coordination and provider calls have independent phases",
  },
  {
    exports: [
      "disconnectXeroOAuthConnection",
      "removeXeroCompany",
      "disconnectAllXeroConnections",
    ],
    path: "packages/xero/src/oauth/disconnect.ts",
    reason: "C6: remote connection deletion precedes local teardown",
  },
  {
    exports: ["processStripeEvent", "deliverStripeEvent"],
    path: "apps/api/lib/stripe-event-delivery.ts",
    reason:
      "C6: Stripe retrieval, local event persistence and dispatch run in phases",
  },
  {
    exports: [
      "dispatchManualSync",
      "sendPreparedManualSync",
      "cancelRun",
      "sendPreparedSyncCancellation",
    ],
    path: "packages/availability/src/sync/sync-monitor-service.ts",
    reason:
      "persists state on failure: cancellation commits before dispatch; successful sends have a separate audit phase",
  },
  {
    exports: ["dispatchSyncEvent", "dispatchCancelSyncRun"],
    path: "packages/availability/src/sync/sync-events.ts",
    reason:
      "result-bearing Inngest sends run after database preparation commits",
  },
  {
    exports: ["dispatchBalanceRefresh", "sendPreparedBalanceRefresh"],
    path: "packages/availability/src/people/balance-refresh.ts",
    reason:
      "persists state on failure: failed queue sends retain the non-fatal receipt and separate audit phase",
  },
  {
    exports: ["completeSubmitSideEffects"],
    path: "packages/availability/src/plans/submit-side-effects.ts",
    reason:
      "persists state on failure: publication and notification checkpoints survive realtime delivery failure",
  },
  {
    exports: [
      "publishPersistedNotification",
      "sendPreparedNotificationPublication",
    ],
    path: "packages/notifications/src/dispatch.ts",
    reason:
      "result-bearing realtime delivery runs outside the committed notification preparation phase",
  },
  {
    exports: ["sendQueuedNotificationEmails"],
    path: "packages/notifications/src/email-queue-service.ts",
    reason:
      "persists state on failure: each email attempt and terminal failure status commits independently",
  },
  {
    exports: [
      "reconcileFeedPublications",
      "reconcileOne",
      "sendPreparedFeedRebuilds",
    ],
    path: "packages/jobs/src/handlers/reconcile-feed-publications.ts",
    reason:
      "persists state on failure: per-record materialisation commits before result-bearing rebuild dispatch",
  },
  {
    exports: ["prepareAndClaimSubmitOperation"],
    path: "packages/database/src/queries/outbound-operations.ts",
    reason:
      "Atomic claim conflicts must be translated to null only after the claim transaction rolls back",
  },
  {
    exports: ["markScopedXeroConnectionReconnectRequired"],
    path: "packages/database/src/queries/xero-connections.ts",
    reason:
      "C6: captured credential state changes commit through the owner coordinator after tenant discovery",
  },
] as const;
