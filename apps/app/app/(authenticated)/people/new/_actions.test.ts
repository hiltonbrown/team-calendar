import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  database: {
    $transaction: vi.fn(),
    person: { create: vi.fn() },
  },
  getActiveOrgContext: vi.fn(),
  lockPlanLimitMutations: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
  withinLimit: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  withinLimit: mocks.withinLimit,
}));
vi.mock("@repo/database", () => ({
  database: mocks.database,
  lockPlanLimitMutations: mocks.lockPlanLimitMutations,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { createManualPersonAction } = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const clerkOrgId = "org_123";

describe("people/new manual person creation action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.database.person.create.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000002",
    });
    mocks.database.$transaction.mockImplementation(
      (callback: (tx: typeof mocks.database) => unknown) =>
        callback(mocks.database)
    );
    mocks.withinLimit.mockResolvedValue({
      ok: true,
      value: { allowed: true, current: 1, limit: 9 },
    });
  });

  describe("baseline authorization and scoping tests", () => {
    it("rejects unauthenticated or non-admin callers", async () => {
      mocks.auth.mockResolvedValue({ orgRole: "org:manager" });

      const result = await createManualPersonAction({
        email: "john@example.com",
        employmentType: "employee",
        firstName: "John",
        lastName: "Doe",
        organisationId,
      });

      expect(result).toEqual({
        error: {
          code: "not_authorised",
          message: "You do not have permission to add people.",
        },
        ok: false,
      });
      expect(mocks.database.person.create).not.toHaveBeenCalled();
    });

    it("rejects malformed inputs", async () => {
      const result = await createManualPersonAction({
        email: "not-an-email",
        employmentType: "employee",
        firstName: "",
        lastName: "Doe",
        organisationId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation_error");
      }
      expect(mocks.database.person.create).not.toHaveBeenCalled();
    });

    it("scopes person creation to clerk_org_id and organisation_id", async () => {
      await createManualPersonAction({
        email: "JANE@EXAMPLE.COM",
        employmentType: "contractor",
        firstName: "Jane",
        jobTitle: "Consultant",
        lastName: "Smith",
        organisationId,
      });

      expect(mocks.database.person.create).toHaveBeenCalledWith({
        data: {
          clerk_org_id: clerkOrgId,
          email: "jane@example.com",
          employment_type: "contractor",
          first_name: "Jane",
          job_title: "Consultant",
          last_name: "Smith",
          organisation_id: organisationId,
          source_system: "MANUAL",
        },
        select: { id: true },
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/people");
      expect(mocks.redirect).toHaveBeenCalledWith("/people");
    });

    it("rejects creation at the active people limit", async () => {
      mocks.withinLimit.mockResolvedValue({
        ok: true,
        value: { allowed: false, current: 9, limit: 9 },
      });

      const result = await createManualPersonAction({
        email: "jane@example.com",
        employmentType: "employee",
        firstName: "Jane",
        lastName: "Smith",
        organisationId,
      });

      expect(result).toEqual({
        error: {
          code: "validation_error",
          message: "Your current plan has reached its active people limit.",
        },
        ok: false,
      });
      expect(mocks.lockPlanLimitMutations).toHaveBeenCalledWith(
        mocks.database,
        clerkOrgId
      );
      expect(mocks.withinLimit).toHaveBeenCalledWith(
        clerkOrgId,
        organisationId,
        "seats",
        mocks.database
      );
      expect(mocks.database.person.create).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    });

    it("fails closed when authoritative usage cannot be read", async () => {
      mocks.withinLimit.mockResolvedValue({
        error: { code: "internal", message: "Failed to check billing limits." },
        ok: false,
      });

      const result = await createManualPersonAction({
        email: "jane@example.com",
        employmentType: "employee",
        firstName: "Jane",
        lastName: "Smith",
        organisationId,
      });

      expect(result).toEqual({
        error: {
          code: "unknown_error",
          message: "Failed to check billing limits.",
        },
        ok: false,
      });
      expect(mocks.database.person.create).not.toHaveBeenCalled();
    });
  });
});
