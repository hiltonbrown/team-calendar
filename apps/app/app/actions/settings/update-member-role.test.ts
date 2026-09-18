import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  getOrganizationMembershipList: vi.fn(),
  updateOrganizationMembership: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

const { updateMemberRole } = await import("./update-member-role");

const validInput = {
  membershipId: "user_1",
  role: "org:admin",
} as const;

describe("updateMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:viewer",
    });
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        getOrganizationMembershipList: mocks.getOrganizationMembershipList,
        updateOrganizationMembership: mocks.updateOrganizationMembership,
      },
    });
    mocks.getOrganizationMembershipList.mockResolvedValue({
      data: [{ id: "membership_1", role: "org:viewer" }],
    });
    mocks.updateOrganizationMembership.mockResolvedValue({});
  });

  it("rejects viewers before mutating Clerk memberships", async () => {
    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.updateOrganizationMembership).not.toHaveBeenCalled();
  });

  it("allows admins to update non-owner member roles", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });

    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.getOrganizationMembershipList).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: ["user_1"],
    });
    expect(mocks.updateOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      role: "org:admin",
      userId: "user_1",
    });
  });

  it("forbids admins from assigning the owner role", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });

    const result = await updateMemberRole({
      membershipId: "user_1",
      role: "org:owner",
    });

    expect(result.ok).toBe(false);
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.updateOrganizationMembership).not.toHaveBeenCalled();
  });

  it("allows owners to assign the owner role", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:owner",
    });

    const result = await updateMemberRole({
      membershipId: "user_1",
      role: "org:owner",
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      role: "org:owner",
      userId: "user_1",
    });
  });

  it("forbids admins from demoting owners", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });
    mocks.getOrganizationMembershipList.mockResolvedValue({
      data: [{ id: "membership_1", role: "org:owner" }],
    });

    const result = await updateMemberRole(validInput);

    expect(result).toEqual({
      error: "Only owners can change another owner's role",
      ok: false,
    });
    expect(mocks.updateOrganizationMembership).not.toHaveBeenCalled();
  });

  it("allows owners to demote another owner", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:owner",
    });
    mocks.getOrganizationMembershipList.mockResolvedValue({
      data: [{ id: "membership_1", role: "org:owner" }],
    });

    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.updateOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      role: "org:admin",
      userId: "user_1",
    });
  });

  it.each([
    ["missing", []],
    [
      "ambiguous",
      [
        { id: "membership_1", role: "org:viewer" },
        { id: "membership_2", role: "org:viewer" },
      ],
    ],
  ])("rejects a %s target before updating a role", async (_case, data) => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:owner",
    });
    mocks.getOrganizationMembershipList.mockResolvedValue({ data });

    const result = await updateMemberRole(validInput);

    expect(result).toEqual({ error: "Member not found", ok: false });
    expect(mocks.updateOrganizationMembership).not.toHaveBeenCalled();
  });
});
