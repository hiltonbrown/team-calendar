import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccount,
  inviteAccountMember,
  inviteAccountMembers,
  listAccountInvitations,
  listAccountMembers,
  removeAccountMember,
  updateAccount,
  updateAccountMemberRole,
} from "../accounts";

const api = vi.hoisted(() => ({
  createOrganizationInvitation: vi.fn(),
  createOrganizationInvitationBulk: vi.fn(),
  deleteOrganizationMembership: vi.fn(),
  getOrganization: vi.fn(),
  getOrganizationInvitationList: vi.fn(),
  getOrganizationMembershipList: vi.fn(),
  updateOrganization: vi.fn(),
  updateOrganizationMembership: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ organizations: api }),
}));

describe("account directory adapter", () => {
  beforeEach(() => vi.resetAllMocks());
  const invitation = {
    createdAt: 123,
    emailAddress: "alex@example.com",
    id: "invite",
    privateMetadata: { secret: true },
    role: "org:viewer",
    status: "pending",
  };
  it("projects account metadata without provider fields", async () => {
    const source = {
      id: "account",
      imageUrl: "image",
      name: "Account",
      privateMetadata: { secret: true },
      publicMetadata: { country: "AU" },
      slug: "account",
    };
    api.getOrganization.mockResolvedValue(source);
    api.updateOrganization.mockResolvedValue(source);
    const expected = {
      id: "account",
      image: "image",
      name: "Account",
      publicMetadata: { country: "AU" },
      slug: "account",
    };
    expect(await getAccount("account")).toEqual(expected);
    expect(await updateAccount("account", { name: "Account" })).toEqual(
      expected
    );
  });
  it("projects paginated members and denies unknown role mappings", async () => {
    api.getOrganizationMembershipList.mockResolvedValue({
      data: [
        {
          id: "member",
          publicUserData: {
            firstName: "Alex",
            identifier: "alex@example.com",
            imageUrl: "image",
            lastName: "Smith",
            userId: "user",
          },
          role: "org:admin",
        },
        { id: "unknown", publicUserData: null, role: "org:new" },
      ],
      totalCount: 2,
    });
    expect(
      await listAccountMembers({
        accountId: "account",
        limit: 2,
        offset: 2,
        userIds: ["user"],
      })
    ).toEqual({
      data: [
        {
          accountId: "account",
          email: "alex@example.com",
          id: "member",
          image: "image",
          name: "Alex Smith",
          role: "admin",
          userId: "user",
        },
        {
          accountId: "account",
          email: null,
          id: "unknown",
          image: null,
          name: null,
          role: null,
          userId: "",
        },
      ],
      totalCount: 2,
    });
    expect(api.getOrganizationMembershipList).toHaveBeenCalledWith({
      limit: 2,
      offset: 2,
      organizationId: "account",
      userId: ["user"],
    });
  });
  it("preserves invitation timestamp and translates only outbound roles", async () => {
    api.getOrganizationInvitationList.mockResolvedValue({
      data: [invitation],
      totalCount: 1,
    });
    api.createOrganizationInvitation.mockResolvedValue(invitation);
    api.createOrganizationInvitationBulk.mockResolvedValue({
      data: [invitation],
      totalCount: 1,
    });
    const expected = {
      createdAt: 123,
      email: "alex@example.com",
      id: "invite",
      role: "viewer",
      status: "pending",
    };
    expect(
      await listAccountInvitations({
        accountId: "account",
        status: ["pending"],
      })
    ).toEqual({ data: [expected], totalCount: 1 });
    expect(
      await inviteAccountMember({
        accountId: "account",
        email: "alex@example.com",
        role: "viewer",
      })
    ).toEqual(expected);
    expect(api.createOrganizationInvitation).toHaveBeenCalledWith({
      emailAddress: "alex@example.com",
      inviterUserId: undefined,
      organizationId: "account",
      role: "org:viewer",
    });
    expect(
      await inviteAccountMembers({
        accountId: "account",
        invitations: [{ email: "alex@example.com", role: "viewer" }],
      })
    ).toEqual({ data: [expected], totalCount: 1 });
  });
  it("maps membership updates and propagates native operation failures", async () => {
    api.updateOrganizationMembership.mockResolvedValue({});
    await updateAccountMemberRole({
      accountId: "account",
      role: "manager",
      userId: "user",
    });
    expect(api.updateOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "account",
      role: "org:manager",
      userId: "user",
    });
    const failure = new Error("provider operation failure");
    api.deleteOrganizationMembership.mockRejectedValue(failure);
    await expect(
      removeAccountMember({ accountId: "account", userId: "user" })
    ).rejects.toBe(failure);
  });
});
