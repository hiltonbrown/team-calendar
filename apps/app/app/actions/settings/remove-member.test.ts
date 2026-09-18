import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  deleteOrganizationMembership: vi.fn(),
  getOrganizationMembershipList: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

const { removeMember } = await import("./remove-member");

const validInput = {
  userId: "user_2",
} as const;

describe("removeMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:viewer",
    });
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        deleteOrganizationMembership: mocks.deleteOrganizationMembership,
        getOrganizationMembershipList: mocks.getOrganizationMembershipList,
      },
    });
    mocks.deleteOrganizationMembership.mockResolvedValue({});
    mocks.getOrganizationMembershipList.mockResolvedValue({
      data: [{ id: "membership_2", role: "org:viewer" }],
    });
  });

  it("rejects viewers before deleting Clerk memberships", async () => {
    const result = await removeMember(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.deleteOrganizationMembership).not.toHaveBeenCalled();
  });

  it("allows admins to remove members", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });

    const result = await removeMember(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.getOrganizationMembershipList).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: ["user_2"],
    });
    expect(mocks.deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_2",
    });
  });

  it("forbids admins from removing owners", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });
    mocks.getOrganizationMembershipList.mockResolvedValue({
      data: [{ id: "membership_2", role: "org:owner" }],
    });

    const result = await removeMember(validInput);

    expect(result).toEqual({
      error: "Only owners can remove another owner",
      ok: false,
    });
    expect(mocks.deleteOrganizationMembership).not.toHaveBeenCalled();
  });

  it("allows owners to remove another owner", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:owner",
    });
    mocks.getOrganizationMembershipList.mockResolvedValue({
      data: [{ id: "membership_2", role: "org:owner" }],
    });

    const result = await removeMember(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_2",
    });
  });

  it.each([
    ["missing", []],
    [
      "ambiguous",
      [
        { id: "membership_2", role: "org:viewer" },
        { id: "membership_3", role: "org:viewer" },
      ],
    ],
  ])(
    "rejects a %s target before removing a membership",
    async (_case, data) => {
      mocks.auth.mockResolvedValue({
        orgId: "org_1",
        orgRole: "org:owner",
      });
      mocks.getOrganizationMembershipList.mockResolvedValue({ data });

      const result = await removeMember(validInput);

      expect(result).toEqual({ error: "Member not found", ok: false });
      expect(mocks.deleteOrganizationMembership).not.toHaveBeenCalled();
    }
  );
});
