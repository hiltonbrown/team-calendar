import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),

  inviteAccountMember: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getSession: mocks.getSession,
}));

const { inviteMember } = await import("./invite-member");

const validInput = {
  emailAddress: "new.member@example.com",
  role: "viewer",
} as const;

describe("inviteMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "viewer",
      userId: "user_1",
    });

    mocks.inviteAccountMember.mockResolvedValue({});
  });

  it("rejects viewers before creating Clerk invitations", async () => {
    const result = await inviteMember(validInput);

    expect(result.ok).toBe(false);

    expect(mocks.inviteAccountMember).not.toHaveBeenCalled();
  });

  it("allows admins to invite members", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
      userId: "user_1",
    });

    const result = await inviteMember(validInput);

    expect(result.ok).toBe(true);
    expect(mocks.inviteAccountMember).toHaveBeenCalledWith({
      accountId: "org_1",
      email: "new.member@example.com",
      inviterUserId: "user_1",
      role: "viewer",
    });
  });

  it("allows only owners to invite another owner", async () => {
    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "admin",
      userId: "user_1",
    });

    const denied = await inviteMember({
      emailAddress: "owner@example.com",
      role: "owner",
    });

    expect(denied).toEqual({
      error: "Only owners can invite another owner",
      ok: false,
    });
    expect(mocks.inviteAccountMember).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({
      accountId: "org_1",
      role: "owner",
      userId: "user_1",
    });
    const allowed = await inviteMember({
      emailAddress: "owner@example.com",
      role: "owner",
    });

    expect(allowed.ok).toBe(true);
  });
});

vi.mock("@repo/auth/accounts", () => ({
  accountDirectory: {
    inviteMembers: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
  },
  inviteAccountMember: mocks.inviteAccountMember,
}));
