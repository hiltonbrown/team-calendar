import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  advanceWizard: vi.fn(),
  captureOnboardingEvent: vi.fn(),
  connectXeroAction: vi.fn(),
  createManualPerson: vi.fn(),
  database: {
    auditEvent: { create: vi.fn() },
    organisation: { findFirst: vi.fn() },
    person: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  ensureCurrentUserPerson: vi.fn(),
  finishWizard: vi.fn(),
  getActiveOrgContext: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  inviteMember: vi.fn(),
  lockPlanLimitMutations: vi.fn(() => Promise.resolve()),
  revalidatePath: vi.fn(),
  setXeroSetupSkipped: vi.fn(),
  updateOrganisationAction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({
  getCurrentUser: mocks.getCurrentUser,
  getSession: mocks.getSession,
}));
vi.mock("@repo/availability", () => ({
  advanceWizard: mocks.advanceWizard,
  ensureCurrentUserPerson: mocks.ensureCurrentUserPerson,
  finishWizard: mocks.finishWizard,
  isOnboardingAdmin: (role: string | null) =>
    role === "admin" || role === "owner",
}));
vi.mock("@repo/database/queries/onboarding", () => ({
  setXeroSetupSkipped: mocks.setXeroSetupSkipped,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@repo/database/tenant-client", () => ({
  referenceDatabase: {
    $transaction: async (
      executeTransaction: (client: unknown) => Promise<unknown>
    ) =>
      executeTransaction({
        $executeRaw: vi.fn(async () => 1),
        $queryRaw: vi.fn(async () => []),
        ...buildTenantTestDatabase(),
      }),
  },
}));
vi.mock("@repo/database", async () => ({
  lockPlanLimitMutations: mocks.lockPlanLimitMutations,
  ...(await vi.importActual<typeof import("@repo/database/tenant-db")>(
    "@repo/database/tenant-db"
  )),
}));
function buildTenantTestDatabase() {
  return mocks.database;
}
vi.mock("@/app/actions/settings/invite-member", () => ({
  inviteMember: mocks.inviteMember,
}));
vi.mock("@/lib/server/create-manual-person", () => ({
  createManualPerson: mocks.createManualPerson,
}));
vi.mock("@/app/(authenticated)/settings/general/_actions", () => ({
  updateOrganisationAction: mocks.updateOrganisationAction,
}));
vi.mock("@/app/(authenticated)/settings/integrations/xero/_actions", () => ({
  connectXeroAction: mocks.connectXeroAction,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));
vi.mock("@/lib/server/onboarding-analytics", () => ({
  captureOnboardingEvent: mocks.captureOnboardingEvent,
}));

const {
  addPersonAction,
  advanceStepAction,
  createSelfAction,
  finishAction,
  linkSelfAction,
  sendInvitesAction,
  saveDetailsAction,
  skipXeroAction,
  startXeroFromOnboardingAction,
} = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const snapshot = { mode: "undecided", step: "xero" };
const actor = {
  accountId: "org_1",
  actingRole: "admin",
  organisationId,
  userId: "user_admin",
};

describe("onboarding actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ accountId: "org_1", role: "admin" });
    mocks.database.organisation.findFirst.mockResolvedValue({
      country_code: "AU",
      id: organisationId,
      name: "Company A",
    });
    mocks.getCurrentUser.mockResolvedValue({ id: "user_admin" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { accountId: "org_1", organisationId },
    });
    mocks.updateOrganisationAction.mockResolvedValue({ ok: true, value: {} });
    mocks.advanceWizard.mockResolvedValue({ ok: true, value: snapshot });
    mocks.setXeroSetupSkipped.mockResolvedValue({ ok: true, value: undefined });
  });

  it.each([
    [
      { name: "", timezone: "Australia/Sydney" },
      "Enter your organisation name.",
    ],
    [{ name: "Acme", timezone: "UTC" }, "Choose an Australian timezone."],
  ])("rejects invalid details %j", async (details, message) => {
    expect(
      await saveDetailsAction({ ...details, organisationId } as never)
    ).toEqual({ error: { code: "validation_error", message }, ok: false });
    expect(mocks.updateOrganisationAction).not.toHaveBeenCalled();
  });

  it.each(["viewer", "manager", null])("refuses %s", async (role) => {
    mocks.getSession.mockResolvedValue({ role });
    expect(
      await saveDetailsAction({
        name: "Acme",
        organisationId,
        timezone: "Australia/Brisbane",
      })
    ).toMatchObject({ error: { code: "not_authorised" }, ok: false });
    expect(mocks.updateOrganisationAction).not.toHaveBeenCalled();
  });

  it("saves details through General settings and advances", async () => {
    const result = await saveDetailsAction({
      name: " Acme Pty Ltd ",
      organisationId,
      timezone: "Australia/Brisbane",
    });
    expect(mocks.updateOrganisationAction).toHaveBeenCalledWith({
      name: "Acme Pty Ltd",
      organisationId,
      timezone: "Australia/Brisbane",
    });
    expect(mocks.advanceWizard).toHaveBeenCalledWith(
      actor,
      "details",
      expect.any(Object)
    );
    expect(mocks.captureOnboardingEvent).toHaveBeenCalledWith({
      distinctId: "user_admin",
      event: "Onboarding Step Completed",
      properties: { mode: "undecided", step: "details" },
    });
    expect(result).toEqual({ ok: true, value: snapshot });
  });

  it("does not advance when saving the details fails", async () => {
    mocks.updateOrganisationAction.mockResolvedValue({
      error: { code: "unknown_error", message: "Failed to update." },
      ok: false,
    });
    expect(
      await saveDetailsAction({
        name: "Acme",
        organisationId,
        timezone: "Australia/Sydney",
      })
    ).toMatchObject({ ok: false });
    expect(mocks.advanceWizard).not.toHaveBeenCalled();
  });

  it("starts Xero OAuth that returns to the wizard", async () => {
    mocks.connectXeroAction.mockResolvedValue({
      ok: true,
      value: { redirectUrl: "https://api.test/start" },
    });
    expect(await startXeroFromOnboardingAction({ organisationId })).toEqual({
      ok: true,
      value: { redirectUrl: "https://api.test/start" },
    });
    expect(mocks.connectXeroAction).toHaveBeenCalledWith({
      organisationId,
      returnTo: "/onboarding",
    });
  });

  it("records the manual choice and advances past Xero", async () => {
    await skipXeroAction({ organisationId });
    expect(mocks.setXeroSetupSkipped).toHaveBeenCalledWith(
      "org_1",
      organisationId,
      true,
      expect.any(Object)
    );
    expect(mocks.advanceWizard).toHaveBeenCalledWith(
      actor,
      "xero",
      expect.any(Object)
    );
  });

  it("passes service refusals through without recording a step", async () => {
    mocks.advanceWizard.mockResolvedValue({
      error: { code: "step_incomplete", message: "Not yet." },
      ok: false,
    });
    expect(await advanceStepAction({ from: "people", organisationId })).toEqual(
      {
        error: { code: "step_incomplete", message: "Not yet." },
        ok: false,
      }
    );
    expect(mocks.captureOnboardingEvent).not.toHaveBeenCalled();
  });

  it("finishes into the calendar and records completion", async () => {
    mocks.finishWizard.mockResolvedValue({
      ok: true,
      value: { redirectTo: "/calendar", snapshot: { mode: "xero" } },
    });
    expect(await finishAction({ force: true, organisationId })).toEqual({
      ok: true,
      value: { redirectTo: "/calendar" },
    });
    expect(mocks.finishWizard).toHaveBeenCalledWith(
      actor,
      { force: true },
      expect.any(Object)
    );
    expect(mocks.captureOnboardingEvent).toHaveBeenCalledWith({
      distinctId: "user_admin",
      event: "Onboarding Completed",
      properties: { forced: true, mode: "xero" },
    });
  });

  describe("people and invites", () => {
    const personId = "00000000-0000-4000-8000-000000000201";

    it("links the admin to an unlinked person in the tenant and audits it", async () => {
      mocks.database.person.findFirst.mockResolvedValue(null);
      mocks.database.person.updateMany.mockResolvedValue({ count: 1 });
      expect(await linkSelfAction({ organisationId, personId })).toEqual({
        ok: true,
        value: { personId },
      });
      expect(mocks.database.person.updateMany).toHaveBeenCalledWith({
        data: { user_id: "user_admin" },
        where: {
          account_id: "org_1",
          archived_at: null,
          id: personId,
          organisation_id: organisationId,
          user_id: null,
        },
      });
      expect(mocks.database.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          account_id: "org_1",
          action: "person.linked_to_user",
          organisation_id: organisationId,
          resource_id: personId,
        }),
      });
    });

    it("refuses a person already linked to another account", async () => {
      mocks.database.person.findFirst.mockResolvedValue(null);
      mocks.database.person.updateMany.mockResolvedValue({ count: 0 });
      expect(await linkSelfAction({ organisationId, personId })).toMatchObject({
        error: { code: "validation_error" },
        ok: false,
      });
      expect(mocks.database.auditEvent.create).not.toHaveBeenCalled();
    });

    it("refuses linking when the admin is already linked", async () => {
      mocks.database.person.findFirst.mockResolvedValue({ id: "p0" });
      expect(await linkSelfAction({ organisationId, personId })).toMatchObject({
        ok: false,
      });
      expect(mocks.database.person.updateMany).not.toHaveBeenCalled();
    });

    it("creates or links the admin's own record from their account", async () => {
      mocks.getCurrentUser.mockResolvedValue({
        email: "ava@example.test",
        id: "user_admin",
        image: "https://img.test/a.png",
        name: "Ava Lee",
      });
      mocks.ensureCurrentUserPerson.mockResolvedValue({
        ok: true,
        value: { id: personId },
      });
      expect(await createSelfAction({ organisationId })).toEqual({
        ok: true,
        value: { personId },
      });
      expect(mocks.ensureCurrentUserPerson).toHaveBeenCalledWith(
        { accountId: "org_1", organisationId },
        expect.objectContaining({
          displayName: "Ava Lee",
          email: "ava@example.test",
          userId: "user_admin",
        }),
        expect.any(Object)
      );
    });

    it("adds a manual person within the plan's people limit", async () => {
      mocks.createManualPerson.mockResolvedValue({
        ok: true,
        value: { personId },
      });
      await addPersonAction({
        email: "ben@example.test",
        firstName: "Ben",
        lastName: "Ng",
        organisationId,
      });
      expect(mocks.createManualPerson).toHaveBeenCalledWith(
        {
          accountId: "org_1",
          email: "ben@example.test",
          employmentType: "employee",
          firstName: "Ben",
          lastName: "Ng",
          organisationId,
        },
        expect.any(Object)
      );
      expect(
        await addPersonAction({
          email: "not-an-email",
          firstName: "Ben",
          lastName: "Ng",
          organisationId,
        })
      ).toMatchObject({ error: { code: "validation_error" }, ok: false });
    });

    it("sends each invitation independently with plain failure reasons", async () => {
      mocks.inviteMember
        .mockResolvedValueOnce({ ok: true, value: undefined })
        .mockResolvedValueOnce({
          error: "That email address is already a member of this organisation",
          ok: false,
        })
        .mockResolvedValueOnce({
          error: "Account API 500 internal",
          ok: false,
        });
      const result = await sendInvitesAction({
        organisationId,
        rows: [
          { email: "a@example.test", role: "manager" },
          { email: "b@example.test", role: "viewer" },
          { email: "c@example.test", role: "admin" },
        ],
      });
      expect(result).toEqual({
        ok: true,
        value: {
          results: [
            { email: "a@example.test", ok: true },
            {
              email: "b@example.test",
              ok: false,
              reason: "Already invited or already a member.",
            },
            {
              email: "c@example.test",
              ok: false,
              reason: "This invitation could not be sent. Try again later.",
            },
          ],
        },
      });
      expect(mocks.inviteMember).toHaveBeenNthCalledWith(1, {
        emailAddress: "a@example.test",
        role: "manager",
      });
    });

    it("never invites an owner", async () => {
      expect(
        await sendInvitesAction({
          organisationId,
          rows: [{ email: "a@example.test", role: "owner" as "admin" }],
        })
      ).toMatchObject({ error: { code: "validation_error" }, ok: false });
      expect(mocks.inviteMember).not.toHaveBeenCalled();
    });
  });
});
