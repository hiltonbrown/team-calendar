import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyticsCapture: vi.fn(),
  analyticsFlush: vi.fn(),
  approve: vi.fn(),
  auth: vi.fn(),
  currentUser: vi.fn(),
  database: {
    availabilityRecord: { findFirst: vi.fn() },
    person: {
      findFirst: vi.fn(),
    },
  },
  decline: vi.fn(),
  dispatchApprovalReconciliation: vi.fn(),
  dispatchXeroLeaveSync: vi.fn(),
  getActiveOrgContext: vi.fn(),
  managerScopePersonIds: vi.fn(),
  prepareApprovalSync: vi.fn(),
  requestMoreInfo: vi.fn(),
  retryApproval: vi.fn(),
  retryDecline: vi.fn(),
  revalidatePath: vi.fn(),
  revertApprovalAttempt: vi.fn(),
  transactionOpen: false,
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/analytics/server", () => ({
  analytics: { capture: mocks.analyticsCapture, flush: mocks.analyticsFlush },
}));
vi.mock("@repo/availability", () => ({
  approve: mocks.approve,
  decline: mocks.decline,
  managerScopePersonIds: mocks.managerScopePersonIds,
  prepareApprovalSync: mocks.prepareApprovalSync,
  requestMoreInfo: mocks.requestMoreInfo,
  retryApproval: mocks.retryApproval,
  retryDecline: mocks.retryDecline,
  revertApprovalAttempt: mocks.revertApprovalAttempt,
  sendPreparedApprovalSync: vi.fn((payload: { runType: string }) => {
    if (mocks.transactionOpen) {
      throw new Error("Send ran before commit");
    }
    return payload.runType === "leave_records"
      ? mocks.dispatchXeroLeaveSync(payload)
      : mocks.dispatchApprovalReconciliation(payload);
  }),
}));
vi.mock("../../../../../packages/database/src/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) => {
      mocks.transactionOpen = true;
      try {
        return await executeTransaction({
          $executeRaw: vi.fn(() => Promise.resolve(1)),
          $queryRaw: vi.fn(() => Promise.resolve([])),
          ...buildTenantTestDatabase(),
        });
      } finally {
        mocks.transactionOpen = false;
      }
    },
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/account-companies")
  >("../../../../../packages/database/src/queries/account-companies")),
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/tenant-db")
  >("../../../../../packages/database/src/tenant-db")),
}));
function buildTenantTestDatabase() {
  return {
    ...mocks.database,
    organisation: {
      findMany: vi.fn(() =>
        Promise.resolve([{ id: organisationId, name: "Company A" }])
      ),
    },
    xeroConnection: {
      findMany: vi.fn(() =>
        Promise.resolve([{ organisation_id: organisationId }])
      ),
    },
  };
}
vi.mock("@repo/xero", () => ({
  XeroWriteAdapter: {},
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
const {
  approveAction,
  declineAction,
  dispatchApprovalReconciliationAction,
  dispatchXeroLeaveSyncAction,
  requestMoreInfoAction,
  retryApprovalAction,
  retryDeclineAction,
  revertApprovalAttemptAction,
} = await import("./_actions");
const organisationId = "00000000-0000-4000-8000-000000000001";
const recordId = "00000000-0000-4000-8000-000000000002";
const clerkOrgId = "org_123";
const userId = "user_456";
describe("leave approval server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareApprovalSync.mockImplementation((input, runType) =>
      Promise.resolve({
        ok: true,
        value: {
          clerkOrgId: input.clerkOrgId,
          connectionId: "00000000-0000-4000-8000-000000000003",
          organisationId: input.organisationId,
          runType,
          triggeredByUserId: input.actingUserId,
          triggerType: "manual",
        },
      })
    );
    mocks.analyticsFlush.mockResolvedValue(undefined);
    mocks.managerScopePersonIds.mockResolvedValue(["person_report"]);
    mocks.database.availabilityRecord.findFirst.mockResolvedValue({
      approved_at: new Date("2026-09-19T02:00:00.000Z"),
      organisation_id: organisationId,
      person_id: "person_report",
    });
    mocks.auth.mockResolvedValue({ orgId: "org_123", orgRole: "org:manager" });
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.database.person.findFirst.mockResolvedValue({ id: "person_789" });
    mocks.approve.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "approved",
        approvedAt: new Date("2026-09-19T02:00:00.000Z"),
        failedAction: null,
        id: recordId,
        xeroWriteError: null,
      },
    });
    mocks.dispatchXeroLeaveSync.mockResolvedValue({
      ok: true,
      value: { queued: true },
    });
    mocks.decline.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "declined",
        failedAction: null,
        id: recordId,
        xeroWriteError: null,
      },
    });
    mocks.requestMoreInfo.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "info_requested",
        failedAction: null,
        id: recordId,
        xeroWriteError: null,
      },
    });
    mocks.retryApproval.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "approved",
        failedAction: null,
        id: recordId,
        xeroWriteError: null,
      },
    });
    mocks.retryDecline.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "declined",
        failedAction: null,
        id: recordId,
        xeroWriteError: null,
      },
    });
    mocks.revertApprovalAttempt.mockResolvedValue({
      ok: true,
      value: {
        approvalStatus: "pending",
        failedAction: null,
        id: recordId,
        xeroWriteError: null,
      },
    });
    mocks.dispatchApprovalReconciliation.mockResolvedValue({
      ok: true,
      value: { queued: true },
    });
  });
  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers for all actions", async () => {
      mocks.currentUser.mockResolvedValue(null);
      const resApprove = await approveAction({ recordId });
      expect(resApprove).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage approvals.",
        },
        ok: false,
      });
      expect(mocks.approve).not.toHaveBeenCalled();
      const resDecline = await declineAction({
        reason: "Valid reason",
        recordId,
      });
      expect(resDecline.ok).toBe(false);
      expect(mocks.decline).not.toHaveBeenCalled();
      const resReq = await requestMoreInfoAction({
        question: "Valid question?",
        recordId,
      });
      expect(resReq.ok).toBe(false);
      expect(mocks.requestMoreInfo).not.toHaveBeenCalled();
    });
    it("rejects insufficient role for viewer and admin-only actions", async () => {
      mocks.auth.mockResolvedValue({ orgId: "org_123", orgRole: "org:viewer" });
      const resApprove = await approveAction({ recordId });
      expect(resApprove).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage approvals.",
        },
        ok: false,
      });
      expect(mocks.approve).not.toHaveBeenCalled();
      // For dispatchApprovalReconciliationAction, org:manager is insufficient (admin only)
      mocks.auth.mockResolvedValue({
        orgId: "org_123",
        orgRole: "org:manager",
      });
      const resReconcile = await dispatchApprovalReconciliationAction();
      expect(resReconcile).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage approvals.",
        },
        ok: false,
      });
      expect(mocks.dispatchApprovalReconciliation).not.toHaveBeenCalled();
    });
    it("rejects malformed inputs for actions", async () => {
      const resDecline = await declineAction({
        reason: "x".repeat(1001), // Exceeds the action schema limit.
        recordId,
      });
      expect(resDecline.ok).toBe(false);
      if (!resDecline.ok) {
        expect(resDecline.error.code).toBe("validation_error");
      }
      expect(mocks.decline).not.toHaveBeenCalled();
      const resApprove = await approveAction({ recordId: "not-a-uuid" });
      expect(resApprove.ok).toBe(false);
      if (!resApprove.ok) {
        expect(resApprove.error.code).toBe("validation_error");
      }
      expect(mocks.approve).not.toHaveBeenCalled();
    });
    it("scopes database queries to clerk_org_id and organisation_id", async () => {
      await approveAction({ recordId });
      expect(mocks.database.person.findFirst).toHaveBeenCalledWith({
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: { id: true },
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          clerk_user_id: userId,
          organisation_id: { in: [organisationId] },
        },
      });
    });
  });
  describe("action specific functionality", () => {
    it("declineAction requires a valid reason and passes it to the decline service", async () => {
      const result = await declineAction({
        reason: "Taking annual leave during critical project delivery window.",
        recordId,
      });
      expect(result.ok).toBe(true);
      expect(mocks.decline).toHaveBeenCalledWith(
        expect.objectContaining({
          actingPersonId: "person_789",
          actingUserId: userId,
          clerkOrgId,
          organisationId,
          reason:
            "Taking annual leave during critical project delivery window.",
          recordId,
        }),
        expect.anything()
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/leave-approvals");
    });
    it("surfaces Xero write failure to the caller inline", async () => {
      mocks.approve.mockResolvedValue({
        error: {
          code: "xero_write_failed",
          message: "Xero API returned 500 error",
        },
        ok: false,
      });
      const result = await approveAction({ recordId });
      expect(result).toEqual({
        error: {
          code: "xero_write_failed",
          message: "Xero API returned 500 error",
        },
        ok: false,
      });
    });
    it("revalidates approval write paths on successful approveAction", async () => {
      const result = await approveAction({ recordId });
      expect(result.ok).toBe(true);
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/leave-approvals");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/plans");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/notifications");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    });
    it("executes requestMoreInfoAction and revalidates leave-approvals and notifications", async () => {
      const result = await requestMoreInfoAction({
        question: "Can you provide coverage details for Thursday?",
        recordId,
      });
      expect(result.ok).toBe(true);
      expect(mocks.requestMoreInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          question: "Can you provide coverage details for Thursday?",
          recordId,
        }),
        expect.any(Object)
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/leave-approvals");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/notifications");
    });
    it("executes retryApprovalAction, retryDeclineAction, revertApprovalAttemptAction", async () => {
      await retryApprovalAction({ recordId });
      expect(mocks.retryApproval).toHaveBeenCalled();
      await retryDeclineAction({ recordId });
      expect(mocks.retryDecline).toHaveBeenCalled();
      await revertApprovalAttemptAction({ recordId });
      expect(mocks.revertApprovalAttempt).toHaveBeenCalled();
    });
    it("allows admin to dispatch approval reconciliation", async () => {
      mocks.auth.mockResolvedValue({ orgId: "org_123", orgRole: "org:admin" });
      const result = await dispatchApprovalReconciliationAction();
      expect(result).toEqual({
        ok: true,
        value: {
          companies: [
            {
              companyId: organisationId,
              companyName: "Company A",
              result: { ok: true, value: { queued: true } },
            },
          ],
        },
      });
      expect(mocks.dispatchApprovalReconciliation).toHaveBeenCalled();
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/leave-approvals");
    });
    it("allows admin to dispatch an inbound Xero leave sync", async () => {
      mocks.auth.mockResolvedValue({ orgId: "org_123", orgRole: "org:admin" });
      const result = await dispatchXeroLeaveSyncAction();
      expect(result).toEqual({
        ok: true,
        value: {
          companies: [
            {
              companyId: organisationId,
              companyName: "Company A",
              result: { ok: true, value: { queued: true } },
            },
          ],
        },
      });
      expect(mocks.dispatchXeroLeaveSync).toHaveBeenCalledWith(
        expect.objectContaining({ organisationId, triggeredByUserId: userId })
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/leave-approvals");
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    });
  });
});
