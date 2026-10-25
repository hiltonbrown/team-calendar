import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),

  listAccountMembers: vi.fn(),
  updateAccountMemberRole: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getSession: mocks.getSession,
}));

const { updateMemberRole } = await import("./update-member-role");

const validInput = {
  membershipId: "user_1",
  role: "admin",
} as const;

describe("updateMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "viewer",
    });

    mocks.listAccountMembers.mockResolvedValue({
      data: [{ id: "membership_1", role: "viewer" }],
    });
    mocks.updateAccountMemberRole.mockResolvedValue({});
  });

  it("rejects viewers before mutating Clerk memberships", async () => {
    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(false);

    expect(mocks.updateAccountMemberRole).not.toHaveBeenCalled();
  });

  it("allows admins to update non-owner member roles", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
    });

    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.listAccountMembers).toHaveBeenCalledWith({
      accountId: "org_1",
      userIds: ["user_1"],
    });
    expect(mocks.updateAccountMemberRole).toHaveBeenCalledWith({
      accountId: "org_1",
      role: "admin",
      userId: "user_1",
    });
  });

  it("forbids admins from assigning the owner role", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
    });

    const result = await updateMemberRole({
      membershipId: "user_1",
      role: "owner",
    });

    expect(result.ok).toBe(false);

    expect(mocks.updateAccountMemberRole).not.toHaveBeenCalled();
  });

  it("allows owners to assign the owner role", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "owner",
    });

    const result = await updateMemberRole({
      membershipId: "user_1",
      role: "owner",
    });

    expect(result.ok).toBe(true);
    expect(mocks.updateAccountMemberRole).toHaveBeenCalledWith({
      accountId: "org_1",
      role: "owner",
      userId: "user_1",
    });
  });

  it("forbids admins from demoting owners", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
    });
    mocks.listAccountMembers.mockResolvedValue({
      data: [{ id: "membership_1", role: "owner" }],
    });

    const result = await updateMemberRole(validInput);

    expect(result).toEqual({
      error: "Only owners can change another owner's role",
      ok: false,
    });
    expect(mocks.updateAccountMemberRole).not.toHaveBeenCalled();
  });

  it("allows owners to demote another owner", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "owner",
    });
    mocks.listAccountMembers.mockResolvedValue({
      data: [{ id: "membership_1", role: "owner" }],
    });

    const result = await updateMemberRole(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.updateAccountMemberRole).toHaveBeenCalledWith({
      accountId: "org_1",
      role: "admin",
      userId: "user_1",
    });
  });

  it.each(["admin", "owner"])(
    "rejects an unknown target role for %s",
    async (role) => {
      mocks.getSession.mockResolvedValue({ accountId: "org_1", role });
      mocks.listAccountMembers.mockResolvedValue({
        data: [{ id: "membership_1", role: null }],
      });
      expect(await updateMemberRole(validInput)).toEqual({
        error: "Member role could not be verified",
        ok: false,
      });
      expect(mocks.updateAccountMemberRole).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["missing", []],
    [
      "ambiguous",
      [
        { id: "membership_1", role: "viewer" },
        { id: "membership_2", role: "viewer" },
      ],
    ],
  ])("rejects a %s target before updating a role", async (_case, data) => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "owner",
    });
    mocks.listAccountMembers.mockResolvedValue({ data });

    const result = await updateMemberRole(validInput);

    expect(result).toEqual({ error: "Member not found", ok: false });
    expect(mocks.updateAccountMemberRole).not.toHaveBeenCalled();
  });
});

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
  listAccountMembers: mocks.listAccountMembers,
  updateAccountMemberRole: mocks.updateAccountMemberRole,
}));
