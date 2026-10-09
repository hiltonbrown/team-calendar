import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getActiveOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
  updateTeamCoverageMinimum: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));
vi.mock("@repo/availability", () => ({
  updateTeamCoverageMinimum: mocks.updateTeamCoverageMinimum,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/server/get-active-org-context", () => ({
  getActiveOrgContext: mocks.getActiveOrgContext,
}));

const { updateTeamCoverageMinimumAction } = await import("./_actions");

const organisationId = "00000000-0000-4000-8000-000000000001";
const teamId = "00000000-0000-4000-8000-000000000002";
const clerkOrgId = "org_123";
const userId = "user_456";
const notAuthorised = {
  error: {
    code: "not_authorised",
    message: "You do not have permission to manage coverage.",
  },
  ok: false,
};

describe("settings/coverage server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgRole: "org:admin" });
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getActiveOrgContext.mockResolvedValue({
      ok: true,
      value: { clerkOrgId, organisationId },
    });
    mocks.updateTeamCoverageMinimum.mockResolvedValue({
      ok: true,
      value: { minimum: 2, teamName: "Customer support" },
    });
  });

  it("rejects unauthenticated callers", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const result = await updateTeamCoverageMinimumAction({
      minimum: 2,
      organisationId,
      teamId,
    });

    expect(result).toEqual(notAuthorised);
    expect(mocks.updateTeamCoverageMinimum).not.toHaveBeenCalled();
  });

  it.each(["org:manager", "org:viewer"])("rejects %s", async (orgRole) => {
    mocks.auth.mockResolvedValue({ orgRole });

    const result = await updateTeamCoverageMinimumAction({
      minimum: 2,
      organisationId,
      teamId,
    });

    expect(result).toEqual(notAuthorised);
    expect(mocks.updateTeamCoverageMinimum).not.toHaveBeenCalled();
  });

  it("rejects an organisation outside the caller's active context", async () => {
    mocks.getActiveOrgContext.mockResolvedValue({
      error: { code: "forbidden", message: "Forbidden" },
      ok: false,
    });

    const result = await updateTeamCoverageMinimumAction({
      minimum: 2,
      organisationId,
      teamId,
    });

    expect(result).toEqual(notAuthorised);
    expect(mocks.getActiveOrgContext).toHaveBeenCalledWith(organisationId);
  });

  it("rejects malformed input before resolving context", async () => {
    const result = await updateTeamCoverageMinimumAction({
      minimum: 2,
      organisationId,
      teamId: "not-a-uuid",
    });

    expect(result).toMatchObject({
      error: { code: "validation_error" },
      ok: false,
    });
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("passes both tenancy keys and the owner role to the service", async () => {
    mocks.auth.mockResolvedValue({ orgRole: "org:owner" });

    await updateTeamCoverageMinimumAction({
      minimum: 2,
      organisationId,
      teamId,
    });

    expect(mocks.updateTeamCoverageMinimum).toHaveBeenCalledWith({
      actingRole: "owner",
      actingUserId: userId,
      clerkOrgId,
      minimum: 2,
      organisationId,
      teamId,
    });
  });

  it("returns the set receipt and revalidates coverage and the dashboard", async () => {
    const result = await updateTeamCoverageMinimumAction({
      minimum: 2,
      organisationId,
      teamId,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        message: "Customer support minimum set to 2 people.",
        minimum: 2,
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/coverage");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("uses the singular for one person and a cleared receipt for null", async () => {
    mocks.updateTeamCoverageMinimum.mockResolvedValueOnce({
      ok: true,
      value: { minimum: 1, teamName: "Operations" },
    });
    mocks.updateTeamCoverageMinimum.mockResolvedValueOnce({
      ok: true,
      value: { minimum: null, teamName: "Operations" },
    });

    const one = await updateTeamCoverageMinimumAction({
      minimum: 1,
      organisationId,
      teamId,
    });
    const cleared = await updateTeamCoverageMinimumAction({
      minimum: null,
      organisationId,
      teamId,
    });

    expect(one).toMatchObject({
      value: { message: "Operations minimum set to 1 person." },
    });
    expect(cleared).toMatchObject({
      value: { message: "Operations minimum cleared.", minimum: null },
    });
  });

  it("returns the service error without revalidating", async () => {
    mocks.updateTeamCoverageMinimum.mockResolvedValue({
      error: {
        code: "validation_error",
        message: "Minimum must be between 0 and 7 people.",
      },
      ok: false,
    });

    const result = await updateTeamCoverageMinimumAction({
      minimum: 9,
      organisationId,
      teamId,
    });

    expect(result).toEqual({
      error: {
        code: "validation_error",
        message: "Minimum must be between 0 and 7 people.",
      },
      ok: false,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
