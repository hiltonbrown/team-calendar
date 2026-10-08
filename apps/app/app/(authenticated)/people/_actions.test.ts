import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addAlternativeContact: vi.fn(),
  auth: vi.fn(),
  clerkClient: vi.fn(),
  currentUser: vi.fn(),
  database: {
    alternativeContact: { findFirst: vi.fn() },
    auditEvent: { create: vi.fn() },
    person: { findFirst: vi.fn() },
    xeroConnection: { findFirst: vi.fn() },
  },
  deleteAlternativeContact: vi.fn(),
  dispatchBalanceRefresh: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getXeroConnectionStateForScope: vi.fn(),
  inviteClerkAccessCandidates: vi.fn(),
  loadClerkAccessReview: vi.fn(),
  reorderAlternativeContacts: vi.fn(),
  revalidatePath: vi.fn(),
  setManualLeaveBalance: vi.fn(),
  syncXeroLeaveBalances: vi.fn(),
  updateAlternativeContact: vi.fn(),
}));
vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/jobs", () => ({
  syncXeroLeaveBalances: mocks.syncXeroLeaveBalances,
}));
vi.mock("@repo/availability", () => ({
  addAlternativeContact: mocks.addAlternativeContact,
  deleteAlternativeContact: mocks.deleteAlternativeContact,
  dispatchBalanceRefresh: mocks.dispatchBalanceRefresh,
  getXeroConnectionStateForScope: mocks.getXeroConnectionStateForScope,
  inviteClerkAccessCandidates: mocks.inviteClerkAccessCandidates,
  loadClerkAccessReview: mocks.loadClerkAccessReview,
  reorderAlternativeContacts: mocks.reorderAlternativeContacts,
  setManualLeaveBalance: mocks.setManualLeaveBalance,
  updateAlternativeContact: mocks.updateAlternativeContact,
}));
vi.mock("@repo/database", () => ({
  database: mocks.database,
  scopedQuery: (cOrgId: string, orgId: string) => ({
    clerk_org_id: cOrgId,
    organisation_id: orgId,
  }),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
const {
  addAlternativeContactAction,
  deleteAlternativeContactAction,
  inviteClerkAccessCandidates,
  loadClerkAccessCandidates,
  refreshBalancesAction,
  reorderAlternativeContactsAction,
  setManualBalanceAction,
  updateAlternativeContactAction,
} = await import("./_actions");
const organisationId = "00000000-0000-4000-8000-000000000001";
const personId = "00000000-0000-4000-8000-000000000002";
const contactId = "00000000-0000-4000-8000-000000000003";
const clerkOrgId = "org_123";
const userId = "user_456";
describe("people server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getXeroConnectionStateForScope.mockResolvedValue({
      ok: true,
      value: { state: "connected" },
    });
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
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
      mocks.currentUser.mockResolvedValue(null);
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
      mocks.auth.mockResolvedValue({ orgRole: null });
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
    it("scopes person lookup to clerk_org_id and organisation_id", async () => {
      await addAlternativeContactAction({
        email: "contact@example.com",
        name: "Emergency Contact",
        organisationId,
        personId,
      });
      expect(mocks.database.person.findFirst).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          archived_at: null,
          clerk_org_id: clerkOrgId,
          clerk_user_id: userId,
          organisation_id: organisationId,
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
          actingPersonId: personId,
          actingRole: "admin",
          actingUserId: userId,
          clerkOrgId,
          email: "contact@example.com",
          name: "Emergency Contact",
          organisationId,
          personId,
        })
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
          clerk_org_id: clerkOrgId,
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
        clerkOrgId,
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
          actingRole: "admin",
          actingUserId: userId,
          balance: 40,
          clerkOrgId,
          leaveTypeXeroId: "xero-leave-1",
          organisationId,
          personId,
        })
      );
    });
    it("loadClerkAccessCandidates requires owner or admin role", async () => {
      mocks.auth.mockResolvedValue({
        has: vi.fn().mockReturnValue(false),
        orgRole: "org:viewer",
      });
      const resWrongRole = await loadClerkAccessCandidates({ organisationId });
      expect(resWrongRole).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to manage people.",
        },
        ok: false,
      });
    });
    it("loadClerkAccessCandidates calls service and records audit event", async () => {
      const mockOrganizations = {
        createOrganizationInvitationBulk: vi.fn(),
        getOrganizationInvitationList: vi.fn(),
        getOrganizationMembershipList: vi.fn(),
      };
      mocks.auth.mockResolvedValue({
        has: vi.fn().mockReturnValue(true),
        orgRole: "org:admin",
      });
      mocks.clerkClient.mockResolvedValue({ organizations: mockOrganizations });
      mocks.loadClerkAccessReview.mockResolvedValue({
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
      const result = await loadClerkAccessCandidates({ organisationId });
      expect(result.ok).toBe(true);
      expect(mocks.loadClerkAccessReview).toHaveBeenCalledWith({
        clerkOrganizations: mockOrganizations,
        clerkOrgId,
        organisationId,
      });
      expect(mocks.database.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "people.clerk_access_reviewed",
          actor_user_id: userId,
          clerk_org_id: clerkOrgId,
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
    it("inviteClerkAccessCandidates validates auth, calls service, records audit event, and revalidates", async () => {
      const mockOrganizations = {
        createOrganizationInvitationBulk: vi.fn(),
        getOrganizationInvitationList: vi.fn(),
        getOrganizationMembershipList: vi.fn(),
      };
      mocks.auth.mockResolvedValue({
        has: vi.fn().mockReturnValue(true),
        orgRole: "org:owner",
      });
      mocks.clerkClient.mockResolvedValue({ organizations: mockOrganizations });
      mocks.inviteClerkAccessCandidates.mockResolvedValue({
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
      const result = await inviteClerkAccessCandidates({ organisationId });
      expect(result.ok).toBe(true);
      expect(mocks.inviteClerkAccessCandidates).toHaveBeenCalledWith({
        candidatePersonIds: undefined,
        clerkOrganizations: mockOrganizations,
        clerkOrgId,
        inviterUserId: userId,
        organisationId,
      });
      expect(mocks.database.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "people.clerk_invitations_sent",
          actor_user_id: userId,
          clerk_org_id: clerkOrgId,
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
