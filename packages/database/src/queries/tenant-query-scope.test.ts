import type {
  AvailabilityRecordId,
  ClerkOrgId,
  FeedId,
  OrganisationId,
  PersonId,
} from "@repo/core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Prisma } from "../../generated/client";
import type { TenantDb } from "../tenant-db";

const state = vi.hoisted(() => ({
  context: vi.fn(),
  queries: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../xero-locks", () => ({
  lockActiveScopedXeroConnection: async () => true,
}));
vi.mock("../tenant-client", () => ({
  referenceDatabase: { $transaction: state.transaction },
}));
vi.mock("./billing", () => ({
  getUnresolvedStripeEventsForOrg: async () => [],
}));
vi.mock("../system-client", () => ({
  systemDatabase: { xeroAuthorisation: { findUnique: async () => null } },
}));

import {
  getOrCreateForOrganisation as settingsGetOrCreateForOrganisation,
  updateForOrganisation as settingsUpdateForOrganisation,
} from "../organisation-settings/repository";
import { TenantMismatchError, withTenantDb } from "../tenant-db";
import { resolveAccountCompanies } from "./account-companies";
import { getActivationDashboardSummary } from "./activation-dashboard";
import {
  getAvailabilityRecordById as availabilityGetAvailabilityRecordById,
  listAvailabilityForCalendar as availabilityListAvailabilityForCalendar,
  listAvailabilityForPerson as availabilityListAvailabilityForPerson,
  listManualAvailability as availabilityListManualAvailability,
  listPendingApprovalRecords as availabilityListPendingApprovalRecords,
} from "./availability-records";
import {
  getFeedDetail as feedsGetFeedDetail,
  listFeedPublications as feedsListFeedPublications,
  listFeedsForOrganisation as feedsListFeedsForOrganisation,
} from "./feeds";
import {
  listLeaveBalancesForOrganisation as balancesListLeaveBalancesForOrganisation,
  listLeaveBalancesForPerson as balancesListLeaveBalancesForPerson,
} from "./leave-balances";
import {
  countUnreadNotifications as notificationsCountUnreadNotifications,
  listNotificationPreferencesForUser as notificationsListNotificationPreferencesForUser,
  listNotificationsForUser as notificationsListNotificationsForUser,
  markAllNotificationsRead as notificationsMarkAllNotificationsRead,
  markNotificationRead as notificationsMarkNotificationRead,
  upsertNotificationPreference as notificationsUpsertNotificationPreference,
} from "./notifications";
import {
  advanceOnboardingStep as onboardingAdvanceOnboardingStep,
  completeOnboarding as onboardingCompleteOnboarding,
  completeWelcome as onboardingCompleteWelcome,
  getOnboardingRecord as onboardingGetOnboardingRecord,
  getWelcomeState as onboardingGetWelcomeState,
  setXeroSetupSkipped as onboardingSetXeroSetupSkipped,
} from "./onboarding";
import {
  getOrganisationById as organisationsGetOrganisationById,
  hasXeroConnection as organisationsHasXeroConnection,
  listOrganisationsByClerkOrg as organisationsListOrganisationsByClerkOrg,
} from "./organisations";
import {
  acquireSubmitRecoverySideEffects as operationsAcquireSubmitRecoverySideEffects,
  claimSubmitOperation as operationsClaimSubmitOperation,
  fenceSubmitRecoverySideEffectClaim as operationsFenceSubmitRecoverySideEffectClaim,
  getSubmitOperation as operationsGetSubmitOperation,
  hasUnresolvedSubmitOperation as operationsHasUnresolvedSubmitOperation,
  markSubmitCompleted as operationsMarkSubmitCompleted,
  markSubmitDefinitiveFailure as operationsMarkSubmitDefinitiveFailure,
  markSubmitDispatchStarted as operationsMarkSubmitDispatchStarted,
  markSubmitOutcomeUnknown as operationsMarkSubmitOutcomeUnknown,
  markSubmitProviderAccepted as operationsMarkSubmitProviderAccepted,
  persistSubmitRecoveryMerge as operationsPersistSubmitRecoveryMerge,
  type PrepareSubmitOperationInput as operationsPrepareSubmitOperationInput,
  releaseSubmitRecoverySideEffects as operationsReleaseSubmitRecoverySideEffects,
} from "./outbound-operations";
import {
  getPersonProfile as peopleGetPersonProfile,
  listPeopleForOrganisation as peopleListPeopleForOrganisation,
} from "./people";
import { loadHolidayResolutionData } from "./public-holiday-resolution";
import { listRecentSupportSubmissionAudits } from "./support-submissions";
import {
  getLatestSyncRunSummary as syncGetLatestSyncRunSummary,
  listFailedRecordsForSyncRun as syncListFailedRecordsForSyncRun,
  listRecentAuditEvents as syncListRecentAuditEvents,
  listRecentSyncRuns as syncListRecentSyncRuns,
} from "./sync-runs";
import {
  countAwayPeopleByTeamAndDay as teamsCountAwayPeopleByTeamAndDay,
  listTeamsWithCoverageMinimum as teamsListTeamsWithCoverageMinimum,
  setTeamCoverageMinimum as teamsSetTeamCoverageMinimum,
} from "./teams";
import { getXeroConnectionState } from "./xero-connection-state";
import {
  getScopedXeroAuthorisationMetadata as xeroGetScopedXeroAuthorisationMetadata,
  getScopedXeroConnection as xeroGetScopedXeroConnection,
  hasScopedXeroReconnectTarget as xeroHasScopedXeroReconnectTarget,
} from "./xero-connections";
import {
  advanceXeroSyncCursor as cursorsAdvanceXeroSyncCursor,
  completeXeroInitialSync as cursorsCompleteXeroInitialSync,
  ensureXeroInitialSyncRequested as cursorsEnsureXeroInitialSyncRequested,
} from "./xero-sync-cursors";

// These brands model validated identifiers at the server entry point.
const account = "account-A" as ClerkOrgId;
const organisation = "11111111-1111-4111-8111-111111111111" as OrganisationId;
const person = "22222222-2222-4222-8222-222222222222" as PersonId;
const feed = "33333333-3333-4333-8333-333333333333" as FeedId;
const record = "44444444-4444-4444-8444-444444444444" as AvailabilityRecordId;
const scope = { clerkOrgId: account, organisationId: organisation };
const operation = {
  ...scope,
  action: "approve" as const,
  availabilityRecordId: record,
};
const attempt = { ...operation, attemptGeneration: 1 };
const range = {
  endDate: new Date("2026-10-31"),
  startDate: new Date("2026-10-01"),
};

const cases: { name: string; run: (db: TenantDb) => Promise<unknown> }[] = [
  {
    name: "list organisations",
    run: (db) => organisationsListOrganisationsByClerkOrg(account, db),
  },
  {
    name: "get organisation",
    run: (db) => organisationsGetOrganisationById(account, organisation, db),
  },
  {
    name: "check connection",
    run: (db) => organisationsHasXeroConnection(account, organisation, db),
  },
  {
    name: "list people",
    run: (db) =>
      peopleListPeopleForOrganisation(account, organisation, undefined, db),
  },
  {
    name: "person profile",
    run: (db) => peopleGetPersonProfile(account, organisation, person, db),
  },
  {
    name: "calendar availability",
    run: (db) =>
      availabilityListAvailabilityForCalendar(
        account,
        organisation,
        range,
        undefined,
        db
      ),
  },
  {
    name: "person availability",
    run: (db) =>
      availabilityListAvailabilityForPerson(
        account,
        organisation,
        person,
        range,
        db
      ),
  },
  {
    name: "approval records",
    run: (db) =>
      availabilityListPendingApprovalRecords(
        account,
        organisation,
        undefined,
        db
      ),
  },
  {
    name: "manual availability",
    run: (db) =>
      availabilityListManualAvailability(account, organisation, undefined, db),
  },
  {
    name: "availability detail",
    run: (db) =>
      availabilityGetAvailabilityRecordById(account, organisation, record, db),
  },
  {
    name: "list feeds",
    run: (db) => feedsListFeedsForOrganisation(account, organisation, db),
  },
  {
    name: "feed detail",
    run: (db) => feedsGetFeedDetail(account, organisation, feed, db),
  },
  {
    name: "feed publications",
    run: (db) =>
      feedsListFeedPublications(account, organisation, undefined, db),
  },
  {
    name: "latest sync",
    run: (db) => syncGetLatestSyncRunSummary(account, organisation, db),
  },
  {
    name: "recent syncs",
    run: (db) => syncListRecentSyncRuns(account, organisation, undefined, db),
  },
  {
    name: "failed sync records",
    run: (db) =>
      syncListFailedRecordsForSyncRun(account, organisation, "run-1", db),
  },
  {
    name: "audit events",
    run: (db) =>
      syncListRecentAuditEvents(account, organisation, undefined, db),
  },
  {
    name: "person balances",
    run: (db) =>
      balancesListLeaveBalancesForPerson(account, organisation, person, db),
  },
  {
    name: "organisation balances",
    run: (db) =>
      balancesListLeaveBalancesForOrganisation(
        account,
        organisation,
        undefined,
        db
      ),
  },
  {
    name: "onboarding record",
    run: (db) => onboardingGetOnboardingRecord(account, organisation, db),
  },
  {
    name: "advance onboarding",
    run: (db) =>
      onboardingAdvanceOnboardingStep(
        account,
        organisation,
        "details",
        "xero",
        db
      ),
  },
  {
    name: "skip Xero",
    run: (db) => onboardingSetXeroSetupSkipped(account, organisation, true, db),
  },
  {
    name: "complete onboarding",
    run: (db) => onboardingCompleteOnboarding(account, organisation, db),
  },
  {
    name: "welcome state",
    run: (db) => onboardingGetWelcomeState(account, organisation, "user-1", db),
  },
  {
    name: "complete welcome",
    run: (db) =>
      onboardingCompleteWelcome(account, organisation, person, "user-1", db),
  },
  {
    name: "list notifications",
    run: (db) =>
      notificationsListNotificationsForUser(
        account,
        organisation,
        "user-1",
        undefined,
        db
      ),
  },
  {
    name: "unread count",
    run: (db) =>
      notificationsCountUnreadNotifications(
        account,
        organisation,
        "user-1",
        db
      ),
  },
  {
    name: "mark notification",
    run: (db) =>
      notificationsMarkNotificationRead(
        account,
        organisation,
        "user-1",
        "notification-1",
        db
      ),
  },
  {
    name: "mark all notifications",
    run: (db) =>
      notificationsMarkAllNotificationsRead(
        account,
        organisation,
        "user-1",
        db
      ),
  },
  {
    name: "notification preferences",
    run: (db) =>
      notificationsListNotificationPreferencesForUser(
        account,
        organisation,
        "user-1",
        db
      ),
  },
  {
    name: "support audit",
    run: (db) =>
      listRecentSupportSubmissionAudits(account, organisation, undefined, db),
  },
  {
    name: "save preference",
    run: (db) =>
      notificationsUpsertNotificationPreference(
        account,
        organisation,
        "user-1",
        {
          emailEnabled: true,
          inAppEnabled: true,
          notificationType: "leave_submitted",
        },
        db
      ),
  },
  {
    name: "team minimums",
    run: (db) => teamsListTeamsWithCoverageMinimum(scope, db),
  },
  {
    name: "save team minimum",
    run: (db) =>
      teamsSetTeamCoverageMinimum(
        { ...scope, minimum: 2, teamId: "team-1" },
        db
      ),
  },
  {
    name: "team away counts",
    run: (db) =>
      teamsCountAwayPeopleByTeamAndDay(
        {
          ...scope,
          awayRecordTypes: ["annual_leave"],
          from: "2026-10-01",
          teamIds: ["team-1"],
          timezone: "Australia/Brisbane",
          to: "2026-10-02",
        },
        db
      ),
  },
  {
    name: "activation summary",
    run: (db) => getActivationDashboardSummary(scope, db),
  },
  {
    name: "account companies",
    run: (db) => resolveAccountCompanies(account, db),
  },
  {
    name: "holiday inputs",
    run: (db) =>
      loadHolidayResolutionData(
        { ...scope, from: "2026-10-01", to: "2026-10-31" },
        db
      ),
  },
  {
    name: "scoped Xero connection",
    run: (db) => xeroGetScopedXeroConnection(scope, db),
  },
  {
    name: "scoped grant metadata",
    run: (db) => xeroGetScopedXeroAuthorisationMetadata(scope, db),
  },
  {
    name: "Xero state",
    run: (db) => getXeroConnectionState(scope, db),
  },
  {
    name: "advance cursor",
    run: (db) =>
      cursorsAdvanceXeroSyncCursor(
        {
          connectionId: "connection-1",
          entityType: "people",
          expectedModifiedSince: null,
          nextModifiedSince: new Date("2026-10-01"),
          scope,
        },
        db
      ),
  },
  {
    name: "request initial sync",
    run: (db) =>
      cursorsEnsureXeroInitialSyncRequested(
        { ...scope, connectionId: "connection-1" },
        db
      ),
  },
  {
    name: "complete initial sync",
    run: (db) =>
      cursorsCompleteXeroInitialSync(
        {
          ...scope,
          connectionId: "connection-1",
          requestedAt: "2026-10-01T00:00:00.000Z",
        },
        db
      ),
  },
  {
    name: "submit operation",
    run: (db) => operationsGetSubmitOperation(operation, db),
  },
  {
    name: "unresolved submit operation",
    run: (db) => operationsHasUnresolvedSubmitOperation(operation, db),
  },
  {
    name: "dispatch started",
    run: (db) => operationsMarkSubmitDispatchStarted(attempt, undefined, db),
  },
  {
    name: "definitive failure",
    run: (db) => operationsMarkSubmitDefinitiveFailure(attempt, "failed", db),
  },
  {
    name: "outcome unknown",
    run: (db) => operationsMarkSubmitOutcomeUnknown(attempt, "unknown", db),
  },
  {
    name: "provider accepted",
    run: (db) => operationsMarkSubmitProviderAccepted(attempt, "remote-1", db),
  },
  {
    name: "submit completed",
    run: (db) => operationsMarkSubmitCompleted(attempt, db),
  },
  {
    name: "claim side effects",
    run: (db) =>
      operationsAcquireSubmitRecoverySideEffects(
        attempt,
        new Date("2026-10-01"),
        db
      ),
  },
  {
    name: "release side effects",
    run: (db) =>
      operationsReleaseSubmitRecoverySideEffects(
        attempt,
        new Date("2026-10-01"),
        db
      ),
  },
  {
    name: "fence side effects",
    run: (db) =>
      operationsFenceSubmitRecoverySideEffectClaim(
        attempt,
        new Date("2026-10-01"),
        db
      ),
  },
  {
    name: "organisation settings",
    run: (db) => settingsGetOrCreateForOrganisation(scope, db),
  },
  {
    name: "update organisation settings",
    run: (db) => settingsUpdateForOrganisation({ ...scope, patch: {} }, db),
  },
  {
    name: "merge recovery",
    run: (db) => operationsPersistSubmitRecoveryMerge(attempt, record, db),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00.000Z"));
  state.context.mockImplementation(async (strings: TemplateStringsArray) => {
    if (strings[0]?.includes("set_config")) {
      return await [];
    }
    state.queries();
    return await [
      {
        feed_accessed: false,
        first_leave_approved: false,
        first_leave_submitted: false,
        initial_sync_completed: false,
        stripe_delivery_failures: 0n,
        sync_failures: 0n,
        xero_connected: false,
        xero_write_failures: 0n,
      },
    ];
  });
  state.transaction.mockImplementation(
    async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const model = {
        count: async () => {
          state.queries();
          return await 0;
        },
        create: async () => {
          state.queries();
          return await { id: "operation-1" };
        },
        createMany: async () => {
          state.queries();
          return await { count: 1 };
        },
        findFirst: async () => {
          state.queries();
          return await null;
        },
        findFirstOrThrow: async () => {
          state.queries();
          return await {
            clerk_org_id: account,
            id: "settings-1",
            organisation_id: organisation,
          };
        },
        findMany: async () => {
          state.queries();
          return await [];
        },
        updateMany: async () => {
          state.queries();
          return await { count: 1 };
        },
        upsert: async () => {
          state.queries();
          return await {
            clerk_org_id: account,
            created_at: new Date(),
            email_enabled: true,
            id: "preference-1",
            in_app_enabled: true,
            notification_type: "leave_submitted",
            organisation_id: organisation,
            updated_at: new Date(),
            user_id: "user-1",
          };
        },
      };
      // The pool double exposes only the delegates exercised by this scope contract.
      const tx = {
        $queryRaw: state.context,
        auditEvent: model,
        availabilityPublication: model,
        availabilityRecord: model,
        failedRecord: model,
        feed: model,
        leaveBalance: model,
        notification: model,
        notificationPreference: model,
        organisation: model,
        organisationSettings: model,
        outboundOperation: model,
        person: model,
        syncRun: model,
        team: model,
        xeroConnection: model,
        xeroSyncCursor: model,
      } as unknown as Prisma.TransactionClient;
      return await callback(tx);
    }
  );
});

afterEach(() => {
  vi.useRealTimers();
});

test.each(cases)("$name reuses the entry-point scope", async ({ run }) => {
  const independent = await withTenantDb(account, (db) => run(db));
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(
    state.context.mock.calls.filter(([strings]) =>
      strings[0]?.includes("set_config")
    )
  ).toHaveLength(1);
  expect(state.queries).toHaveBeenCalled();
  vi.clearAllMocks();
  const shared = await withTenantDb(account, async (db) => {
    const value = await run(db);
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(
      state.context.mock.calls.filter(([strings]) =>
        strings[0]?.includes("set_config")
      )
    ).toHaveLength(1);
    return value;
  });
  expect(shared).toEqual(independent);
});

test.each(cases)(
  "$name rejects another account's client before accessing data",
  async ({ run }) => {
    await withTenantDb("account-B", async (db) => {
      const queriesBefore = state.queries.mock.calls.length;
      await expect(
        Promise.resolve().then(() => run(db))
      ).rejects.toBeInstanceOf(TenantMismatchError);
      expect(state.queries).toHaveBeenCalledTimes(queriesBefore);
    });
  }
);

test("the database-only claim helper reuses its phase and rejects another account", async () => {
  const input: operationsPrepareSubmitOperationInput = {
    ...operation,
    actorUserId: "user-1",
    claimableBefore: new Date("2026-10-01"),
    expectedFailedAction: null,
    expectedSequence: 1,
    expectedStatus: "draft",
    request: {
      body: "[]",
      method: "POST",
      url: "https://api.xeroCom/payroll.xro/1.0/LeaveApplications",
      xeroTenantId: "tenant-1",
    },
    requestEmployeeId: "employee-1",
    requestEndsAt: new Date("2026-10-02"),
    requestFingerprint: "fingerprint",
    requestLeaveTypeId: "leave-type-1",
    requestStartsAt: new Date("2026-10-01"),
    requestTitle: "Annual leave",
    requestUnits: 1,
  };
  await withTenantDb(account, async (db) => {
    await expect(
      operationsClaimSubmitOperation(input, db)
    ).resolves.toMatchObject({ attemptGeneration: 1 });
    expect(state.transaction).toHaveBeenCalledTimes(1);
  });
  await withTenantDb("account-B", async (db) => {
    await expect(
      operationsClaimSubmitOperation(input, db)
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });
});

test("the reconnect discovery helper reuses its phase and rejects another account", async () => {
  const input = {
    ...scope,
    authorisationId: "grant-1",
    authorisationUpdatedAt: new Date("2026-10-01"),
    connectionId: "connection-1",
    lastConnectedAt: null,
    remoteConnectionId: "remote-1",
    xeroTenantId: "tenant-1",
  };
  await withTenantDb(account, async (db) => {
    await expect(xeroHasScopedXeroReconnectTarget(input, db)).resolves.toBe(
      false
    );
    expect(state.transaction).toHaveBeenCalledTimes(1);
  });
  await withTenantDb("account-B", async (db) => {
    await expect(
      xeroHasScopedXeroReconnectTarget(input, db)
    ).rejects.toBeInstanceOf(TenantMismatchError);
  });
});
