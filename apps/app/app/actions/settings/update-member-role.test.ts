import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  updateOrganizationMembership: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

const { updateMemberRole } = await import("./update-member-role");

const validInput = {
  membershipId: "user_1",
  role: "org:owner",
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
        updateOrganizationMembership: mocks.updateOrganizationMembership,
      },
    });
    mocks.updateOrganizationMembership.mockResolvedValue({});
  });

  it("rejects viewers before mutating Clerk memberships", async () => {
    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.updateOrganizationMembership).not.toHaveBeenCalled();
  });

  it("allows admins to update member roles", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
    });

    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.updateOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      role: "org:owner",
      userId: "user_1",
    });
  });
});
