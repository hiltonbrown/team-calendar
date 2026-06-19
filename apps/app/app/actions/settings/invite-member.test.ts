import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
  createOrganizationInvitation: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  auth: mocks.auth,
  clerkClient: mocks.clerkClient,
}));

const { inviteMember } = await import("./invite-member");

const validInput = {
  emailAddress: "new.member@example.com",
  role: "org:viewer",
} as const;

describe("inviteMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:viewer",
      userId: "user_1",
    });
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        createOrganizationInvitation: mocks.createOrganizationInvitation,
      },
    });
    mocks.createOrganizationInvitation.mockResolvedValue({});
  });

  it("rejects viewers before creating Clerk invitations", async () => {
    const result = await inviteMember(validInput);

    expect(result.ok).toBe(false);
    expect(mocks.clerkClient).not.toHaveBeenCalled();
    expect(mocks.createOrganizationInvitation).not.toHaveBeenCalled();
  });

  it("allows admins to invite members", async () => {
    mocks.auth.mockResolvedValue({
      orgId: "org_1",
      orgRole: "org:admin",
      userId: "user_1",
    });

    const result = await inviteMember(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.createOrganizationInvitation).toHaveBeenCalledWith({
      organizationId: "org_1",
      inviterUserId: "user_1",
      emailAddress: "new.member@example.com",
      role: "org:viewer",
    });
  });
});
