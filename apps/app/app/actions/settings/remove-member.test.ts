import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listAccountMembers: vi.fn(),

  removeAccountMember: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getSession: mocks.getSession,
}));

const { removeMember } = await import("./remove-member");

const validInput = {
  userId: "user_2",
} as const;

describe("removeMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "viewer",
    });

    mocks.removeAccountMember.mockResolvedValue({});
    mocks.listAccountMembers.mockResolvedValue({
      data: [{ id: "membership_2", role: "viewer" }],
    });
  });

  it("rejects viewers before deleting Account memberships", async () => {
    const result = await removeMember(validInput);

    expect(result.ok).toBe(false);

    expect(mocks.removeAccountMember).not.toHaveBeenCalled();
  });

  it("allows admins to remove members", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
    });

    const result = await removeMember(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.listAccountMembers).toHaveBeenCalledWith({
      accountId: "org_1",
      userIds: ["user_2"],
    });
    expect(mocks.removeAccountMember).toHaveBeenCalledWith({
      accountId: "org_1",
      userId: "user_2",
    });
  });

  it("forbids admins from removing owners", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
    });
    mocks.listAccountMembers.mockResolvedValue({
      data: [{ id: "membership_2", role: "owner" }],
    });

    const result = await removeMember(validInput);

    expect(result).toEqual({
      error: "Only owners can remove another owner",
      ok: false,
    });
    expect(mocks.removeAccountMember).not.toHaveBeenCalled();
  });

  it("allows owners to remove another owner", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "owner",
    });
    mocks.listAccountMembers.mockResolvedValue({
      data: [{ id: "membership_2", role: "owner" }],
    });

    const result = await removeMember(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.removeAccountMember).toHaveBeenCalledWith({
      accountId: "org_1",
      userId: "user_2",
    });
  });

  it.each(["admin", "owner"])(
    "rejects an unknown target role for %s",
    async (role) => {
      mocks.getSession.mockResolvedValue({ accountId: "org_1", role });
      mocks.listAccountMembers.mockResolvedValue({
        data: [{ id: "membership_1", role: null }],
      });
      expect(await removeMember(validInput)).toEqual({
        error: "Member role could not be verified",
        ok: false,
      });
      expect(mocks.removeAccountMember).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["missing", []],
    [
      "ambiguous",
      [
        { id: "membership_2", role: "viewer" },
        { id: "membership_3", role: "viewer" },
      ],
    ],
  ])(
    "rejects a %s target before removing a membership",
    async (_case, data) => {
      mocks.getSession.mockResolvedValue({
        accountId: "org_1",
        role: "owner",
      });
      mocks.listAccountMembers.mockResolvedValue({ data });

      const result = await removeMember(validInput);

      expect(result).toEqual({ error: "Member not found", ok: false });
      expect(mocks.removeAccountMember).not.toHaveBeenCalled();
    }
  );
});

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
  listAccountMembers: mocks.listAccountMembers,
  removeAccountMember: mocks.removeAccountMember,
}));
