import { referenceDatabase } from "@repo/database/tenant-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addAlternativeContact: vi.fn(),

  database: {
    alternativeContact: { findFirst: vi.fn() },
    auditEvent: { create: vi.fn() },
    organisation: { findFirst: vi.fn(), findMany: vi.fn() },
    person: { findFirst: vi.fn() },
    xeroConnection: { findFirst: vi.fn() },
  },
  deleteAlternativeContact: vi.fn(),
  dispatchBalanceRefresh: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  inviteAccountAccessCandidates: vi.fn(),
  loadAccountAccessReview: vi.fn(),
  reorderAlternativeContacts: vi.fn(),
  revalidatePath: vi.fn(),
  setManualLeaveBalance: vi.fn(),
  syncXeroLeaveBalances: vi.fn(),
  updateAlternativeContact: vi.fn(),
}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/jobs", () => ({
  syncXeroLeaveBalances: mocks.syncXeroLeaveBalances,
}));
vi.mock("@repo/availability", () => ({
  addAlternativeContact: mocks.addAlternativeContact,
  deleteAlternativeContact: mocks.deleteAlternativeContact,
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
  inviteAccountAccessCandidates: mocks.inviteAccountAccessCandidates,
  loadAccountAccessReview: mocks.loadAccountAccessReview,
  prepareBalanceRefresh: vi.fn(async (input: unknown) => ({
    ok: true,
    value: input,
  })),
  recordBalanceRefreshDispatch: vi.fn(async () => ({
    ok: true,
    value: undefined,
  })),
  reorderAlternativeContacts: mocks.reorderAlternativeContacts,
  sendPreparedBalanceRefresh: mocks.dispatchBalanceRefresh,
  setManualLeaveBalance: mocks.setManualLeaveBalance,
  updateAlternativeContact: mocks.updateAlternativeContact,
}));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: vi.fn(
      async (executeTransaction: (client: unknown) => Promise<unknown>) =>
        executeTransaction({
          $executeRaw: vi.fn(async () => 1),
          $queryRaw: vi.fn(async () => []),
          ...buildTenantTestDatabase(),
        })
    ),
  },
}));
vi.mock("@repo/database", async () => ({
  ...(await vi.importActual<
    typeof import("../../../../../packages/database/src/queries/account-companies")
  >("../../../../../packages/database/src/queries/account-companies")),
  scopedQuery: (cOrgId: string, scopedOrganisationId: string) => ({
    account_id: cOrgId,
    organisation_id: scopedOrganisationId,
  }),
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return mocks.database;
}
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
const {
  addAlternativeContactAction,
  deleteAlternativeContactAction,
  inviteAccountAccessCandidates,
  loadAccountAccessCandidates,
  refreshBalancesAction,
  reorderAlternativeContactsAction,
  setManualBalanceAction,
  updateAlternativeContactAction,
} = await import("./_actions");
const organisationId = "00000000-0000-4000-8000-000000000001";
const personId = "00000000-0000-4000-8000-000000000002";
const contactId = "00000000-0000-4000-8000-000000000003";
const accountId = "org_123";
const userId = "user_456";
describe("people server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.database.organisation.findFirst.mockResolvedValue({
      id: organisationId,
    });
    mocks.database.organisation.findMany.mockResolvedValue([
      { id: organisationId, name: "Company A" },
    ]);
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.getSession.mockResolvedValue({ accountId: "org_123", role: "admin" });
    mocks.getCurrentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId, organisationId },
    });
    mocks.database.person.findFirst.mockResolvedValue({ id: personId });
    mocks.database.alternativeContact.findFirst.mockResolvedValue({
      person_id: personId,
    });
    mocks.database.xeroConnection.findFirst.mockResolvedValue({
      id: "tenant_1",
    });
    mocks.addAlternativeContact.mockResolvedValue({
      ok: true,
      value: { id: contactId },
    });
    mocks.updateAlternativeContact.mockResolvedValue({
      ok: true,
      value: { id: contactId },
    });
    mocks.deleteAlternativeContact.mockResolvedValue({
      ok: true,
      value: { personId },
    });
    mocks.reorderAlternativeContacts.mockResolvedValue({
      ok: true,
      value: { personId },
    });
    mocks.dispatchBalanceRefresh.mockResolvedValue({
      ok: true,
      value: { queued: true },
    });
    mocks.setManualLeaveBalance.mockResolvedValue({
      ok: true,
      value: { id: "balance_1" },
    });
  });
  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated callers", async () => {
      mocks.getCurrentUser.mockResolvedValue(null);
      const resAdd = await addAlternativeContactAction({
        email: "contact@example.com",
        name: "Emergency Contact",
        organisationId,
        personId,
      });
      expect(resAdd).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage people.",
        },
        ok: false,
      });
      expect(mocks.addAlternativeContact).not.toHaveBeenCalled();
    });
    it("rejects unauthenticated or non-member roles without permission", async () => {
      mocks.getSession.mockResolvedValue({ accountId: "org_123", role: null });
      const resDelete = await deleteAlternativeContactAction({
        contactId,
        organisationId,
      });
      expect(resDelete.ok).toBe(false);
      expect(mocks.deleteAlternativeContact).not.toHaveBeenCalled();
    });
    it("rejects malformed input", async () => {
      const resAdd = await addAlternativeContactAction({
        email: "contact@example.com",
        name: "", // empty name violates min(1)
        organisationId,
        personId,
      });
      expect(resAdd.ok).toBe(false);
      if (!resAdd.ok) {
        expect(resAdd.error.code).toBe("validation_error");
      }
      expect(mocks.addAlternativeContact).not.toHaveBeenCalled();
    });
    it("scopes person lookup to account_id and organisation_id", async () => {
      await addAlternativeContactAction({
        email: "contact@example.com",
        name: "Emergency Contact",
        organisationId,
        personId,
      });
      expect(referenceDatabase.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Object)
      );
      expect(mocks.database.person.findFirst).toHaveBeenCalledWith({
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: { id: true },
        where: {
          account_id: accountId,
          archived_at: null,
          organisation_id: { in: [organisationId] },
          user_id: userId,
        },
      });
    });
  });
  describe("action specific functionality", () => {
    it("addAlternativeContactAction calls service and revalidates people path", async () => {
      const result = await addAlternativeContactAction({
        email: "contact@example.com",
        name: "Emergency Contact",
        organisationId,
        personId,
      });
      expect(result).toEqual({ ok: true, value: { id: contactId } });
      expect(mocks.addAlternativeContact).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          actingPersonId: personId,
          actingRole: "admin",
          actingUserId: userId,
          email: "contact@example.com",
          name: "Emergency Contact",
          organisationId,
          personId,
        }),
        expect.any(Object)
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/people");
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${personId}`);
    });
    it("updateAlternativeContactAction looks up contact person and revalidates", async () => {
      const result = await updateAlternativeContactAction({
        contactId,
        organisationId,
        patch: { name: "Updated Name" },
      });
      expect(result).toEqual({ ok: true, value: { id: contactId } });
      expect(mocks.database.alternativeContact.findFirst).toHaveBeenCalledWith({
        select: { person_id: true },
        where: {
          account_id: accountId,
          id: contactId,
          organisation_id: organisationId,
        },
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${personId}`);
    });
    it("reorderAlternativeContactsAction and refreshBalancesAction execute correctly", async () => {
      const resReorder = await reorderAlternativeContactsAction({
        orderedContactIds: [contactId],
        organisationId,
        personId,
      });
      expect(resReorder).toEqual({ ok: true, value: { personId } });
      expect(mocks.reorderAlternativeContacts).toHaveBeenCalled();
      const resRefresh = await refreshBalancesAction({
        organisationId,
        personId,
      });
      expect(resRefresh).toEqual({ ok: true, value: { queued: true } });
      expect(mocks.dispatchBalanceRefresh).toHaveBeenCalled();
      expect(mocks.syncXeroLeaveBalances).toHaveBeenCalledWith({
        accountId,
        connectionId: "tenant_1",
        organisationId,
        personId,
        triggeredByUserId: userId,
        triggerType: "manual",
      });
    });
    it("setManualBalanceAction validates balance and passes parameters to service", async () => {
      const result = await setManualBalanceAction({
        balance: 40,
        leaveTypeXeroId: "xero-leave-1",
        organisationId,
        personId,
      });
      expect(result).toEqual({ ok: true, value: { id: "balance_1" } });
      expect(mocks.setManualLeaveBalance).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          actingRole: "admin",
          actingUserId: userId,
          balance: 40,
          leaveTypeXeroId: "xero-leave-1",
          organisationId,
          personId,
        }),
        expect.any(Object)
      );
    });
    it("loadAccountAccessCandidates requires owner or admin role", async () => {
      mocks.getSession.mockResolvedValue({
        accountId: "org_123",
        role: "viewer",
      });
      const resWrongRole = await loadAccountAccessCandidates({
        organisationId,
      });
      expect(resWrongRole).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage people.",
        },
        ok: false,
      });
    });
    it("loadAccountAccessCandidates calls service and records audit event", async () => {
      mocks.getSession.mockResolvedValue({
        accountId: "org_123",
        role: "admin",
      });

      mocks.loadAccountAccessReview.mockResolvedValue({
        ok: true,
        value: {
          alreadyInvitedCount: 1,
          candidateCount: 5,
          candidates: [],
          conflictCount: 1,
          invitableCount: 2,
          linkableCount: 1,
          memberCount: 0,
        },
      });
      const result = await loadAccountAccessCandidates({ organisationId });
      expect(result.ok).toBe(true);
      expect(mocks.loadAccountAccessReview).toHaveBeenCalledWith({
        accountDirectory: expect.any(Object),
        accountId,
        organisationId,
      });
      expect(mocks.database.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          account_id: accountId,
          action: "people.clerk_access_reviewed",
          actor_user_id: userId,
          entity_id: organisationId,
          metadata: {
            alreadyInvitedCount: 1,
            candidateCount: 5,
            conflictCount: 1,
            invitableCount: 2,
            inviterId: userId,
            linkableCount: 1,
            memberCount: 0,
            organisationId,
          },
        }),
      });
    });
    it("inviteAccountAccessCandidates validates getSession, calls service, records audit event, and revalidates", async () => {
      mocks.getSession.mockResolvedValue({
        accountId: "org_123",
        role: "owner",
      });

      mocks.inviteAccountAccessCandidates.mockResolvedValue({
        ok: true,
        value: {
          alreadyInvitedCount: 0,
          candidateCount: 2,
          conflictCount: 0,
          failedCount: 0,
          linkedCount: 1,
          succeededCount: 1,
        },
      });
      const result = await inviteAccountAccessCandidates({ organisationId });
      expect(result.ok).toBe(true);
      expect(mocks.inviteAccountAccessCandidates).toHaveBeenCalledWith({
        accountDirectory: expect.any(Object),
        accountId,
        candidatePersonIds: undefined,
        inviterUserId: userId,
        organisationId,
      });
      expect(mocks.database.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          account_id: accountId,
          action: "people.clerk_invitations_sent",
          actor_user_id: userId,
          metadata: {
            candidateCount: 2,
            failedCount: 0,
            inviterId: userId,
            organisationId,
            succeededCount: 1,
          },
        }),
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/people");
    });
  });
});

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
}));
