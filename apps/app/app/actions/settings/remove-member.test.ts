import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  deleteOrganizationMembership: vi.fn(),
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
      },
    });
    mocks.deleteOrganizationMembership.mockResolvedValue({});
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
    expect(mocks.deleteOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_2",
    });
  });
});
