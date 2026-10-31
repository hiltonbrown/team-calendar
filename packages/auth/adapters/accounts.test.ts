import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountDirectory,
  getAccount,
  inviteAccountMember,
  inviteAccountMembers,
  listAccountInvitations,
  listAccountMembers,
  removeAccountMember,
  updateAccount,
  updateAccountMemberRole,
} from "../accounts";

const mocks = vi.hoisted(() => ({
  api: {
    createInvitation: vi.fn(),
    getOrganization: vi.fn(),
    getSession: vi.fn(),
    listInvitations: vi.fn(),
    listMembers: vi.fn(),
    removeMember: vi.fn(),
    updateMemberRole: vi.fn(),
    updateOrganization: vi.fn(),
  },
  clear: vi.fn(),
  transaction: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    authInvitation: { findFirst: vi.fn() },
    authMember: { findUnique: vi.fn() },
    authOrganization: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    authSession: { findFirst: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "session=fixture" }),
}));
vi.mock("@repo/database/system", () => ({
  systemDatabase: { $transaction: mocks.transaction },
}));
vi.mock("./better-auth-server", () => ({
  ensureUserAccountsReady: vi.fn(),
  getBetterAuth: () => ({ api: mocks.api, options: {} }),
}));
vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: () => () => ({}),
}));
vi.mock("@better-auth/core/context", () => ({
  getCurrentDBAdapterAsyncLocalStorage: async () => ({
    run: (_scope: unknown, operation: () => unknown) => operation(),
  }),
}));
vi.mock("../membership-reconciliation", () => ({
  clearAccountPeople: mocks.clear,
  reconcileAccountPeople: vi.fn(),
}));
vi.mock("../invitation-email", () => ({ sendAccountInvitationEmail: vi.fn() }));
vi.mock("../lifecycle-events", () => ({ emitAuthLifecycleEvent: vi.fn() }));
vi.mock("@repo/observability/log", () => ({ log: { error: vi.fn() } }));

const ids = {
  account: "10000000-0000-4000-8000-000000000001",
  actor: "10000000-0000-4000-8000-000000000003",
  member: "10000000-0000-4000-8000-000000000005",
  session: "10000000-0000-4000-8000-000000000002",
  target: "10000000-0000-4000-8000-000000000004",
};
const invitation = () => ({
  createdAt: new Date(123),
  email: "alex@example.com",
  expiresAt: new Date(Date.now() + 60_000),
  id: "invite",
  privateMetadata: { secret: true },
  role: "viewer",
  status: "pending",
});
const account = () => ({
  countryCode: "AU",
  id: ids.account,
  logo: "image",
  metadata: { private: "secret", publicMetadata: { country: "AU" } },
  name: "Account",
  slug: "account",
});

describe("Better Auth account directory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.api.getSession.mockResolvedValue({
      session: {
        activeOrganizationId: ids.account,
        expiresAt: new Date(Date.now() + 60_000),
        id: ids.session,
      },
      user: { email: "actor@example.com", emailVerified: true, id: ids.actor },
    });
    mocks.transaction.mockImplementation(
      async (operation: (tx: typeof mocks.tx) => unknown) => operation(mocks.tx)
    );
    mocks.tx.$queryRaw.mockResolvedValue([]);
    mocks.tx.authSession.findFirst.mockResolvedValue({
      active_account_id: ids.account,
    });
    mocks.tx.authMember.findUnique.mockImplementation(async ({ where }) => ({
      id: ids.member,
      role: where.account_id_user_id.user_id === ids.actor ? "owner" : "viewer",
    }));
    mocks.tx.authOrganization.findUnique.mockResolvedValue({
      provisioning_status: "ready",
    });
    mocks.tx.authOrganization.findUniqueOrThrow.mockResolvedValue({
      country_code: "AU",
      metadata: null,
    });
  });

  it("projects account metadata without private provider fields on reads and updates", async () => {
    mocks.api.getOrganization.mockResolvedValue(account());
    const expected = {
      id: ids.account,
      image: "image",
      name: "Account",
      publicMetadata: { country: "AU", countryCode: "AU" },
      slug: "account",
    };
    expect(await getAccount(ids.account)).toEqual(expected);
    expect(await updateAccount(ids.account, { name: " Account " })).toEqual(
      expected
    );
    expect(mocks.api.getOrganization).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { organizationId: ids.account },
    });
    expect(mocks.api.updateOrganization).toHaveBeenCalledWith({
      body: { data: { name: "Account" }, organizationId: ids.account },
      headers: expect.any(Headers),
    });
    expect(mocks.api.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
    });
  });

  it("projects paginated members and denies unknown role mappings", async () => {
    mocks.api.listMembers.mockResolvedValue({
      members: [
        {
          id: ids.member,
          role: "admin",
          user: {
            email: "alex@example.com",
            image: "image",
            name: "Alex Smith",
            password: "secret",
          },
          userId: ids.target,
        },
        {
          id: "unknown",
          role: "legacy_role",
          user: { email: null, name: null },
          userId: ids.target,
        },
      ],
      total: 2,
    });
    expect(
      await accountDirectory.listMembers({
        accountId: ids.account,
        limit: 2,
        offset: 2,
        userIds: [ids.target],
      })
    ).toEqual({
      data: [
        {
          accountId: ids.account,
          email: "alex@example.com",
          id: ids.member,
          image: "image",
          name: "Alex Smith",
          role: "admin",
          userId: ids.target,
        },
        {
          accountId: ids.account,
          email: null,
          id: "unknown",
          image: null,
          name: null,
          role: null,
          userId: ids.target,
        },
      ],
      totalCount: 2,
    });
    expect(mocks.api.listMembers).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: {
        filterField: "userId",
        filterOperator: "in",
        filterValue: [ids.target],
        limit: 2,
        offset: 2,
        organizationId: ids.account,
        sortBy: "createdAt",
        sortDirection: "asc",
      },
    });
  });

  it("does not expand an empty member selection to all account members", async () => {
    expect(
      await listAccountMembers({ accountId: ids.account, userIds: [] })
    ).toEqual({ data: [], totalCount: 0 });
    expect(mocks.api.listMembers).not.toHaveBeenCalled();
  });

  it("preserves invitation timestamps and uses neutral outbound roles", async () => {
    mocks.api.listInvitations.mockResolvedValue([invitation()]);
    mocks.api.createInvitation.mockResolvedValue(invitation());
    const expected = {
      createdAt: 123,
      email: "alex@example.com",
      id: "invite",
      role: "viewer",
      status: "pending",
    };
    expect(
      await accountDirectory.listInvitations({
        accountId: ids.account,
        status: ["pending"],
      })
    ).toEqual({ data: [expected], totalCount: 1 });
    expect(
      await inviteAccountMember({
        accountId: ids.account,
        email: "ALEX@example.com",
        role: "viewer",
      })
    ).toEqual(expected);
    expect(mocks.api.createInvitation).toHaveBeenCalledWith({
      body: {
        email: "alex@example.com",
        organizationId: ids.account,
        role: "viewer",
      },
      headers: expect.any(Headers),
    });
    expect(
      await accountDirectory.inviteMembers({
        accountId: ids.account,
        invitations: [{ email: "alex@example.com", role: "viewer" }],
      })
    ).toEqual({ data: [expected], totalCount: 1 });
  });

  it("normalises invitation expiry and revocation before filtering and pagination", async () => {
    mocks.api.listInvitations.mockResolvedValue([
      { ...invitation(), expiresAt: new Date(0), id: "expired" },
      { ...invitation(), id: "revoked", role: "unknown", status: "canceled" },
      invitation(),
    ]);
    expect(
      await listAccountInvitations({
        accountId: ids.account,
        limit: 1,
        offset: 1,
        status: ["expired", "revoked"],
      })
    ).toEqual({
      data: [
        {
          createdAt: 123,
          email: "alex@example.com",
          id: "revoked",
          role: null,
          status: "revoked",
        },
      ],
      totalCount: 2,
    });
  });

  it("passes exact membership identities and neutral roles to native mutations", async () => {
    await updateAccountMemberRole({
      accountId: ids.account,
      role: "manager",
      userId: ids.target,
    });
    expect(mocks.api.updateMemberRole).toHaveBeenCalledWith({
      body: {
        memberId: ids.member,
        organizationId: ids.account,
        role: "manager",
      },
      headers: expect.any(Headers),
    });
    await removeAccountMember({ accountId: ids.account, userId: ids.target });
    expect(mocks.api.removeMember).toHaveBeenCalledWith({
      body: { memberIdOrEmail: ids.member, organizationId: ids.account },
      headers: expect.any(Headers),
    });
    expect(mocks.clear).toHaveBeenCalledWith(ids.account, ids.target);
  });

  it("propagates native failures without running post-commit removal effects", async () => {
    const failure = new Error("native operation failure");
    mocks.api.removeMember.mockRejectedValue(failure);
    await expect(
      removeAccountMember({ accountId: ids.account, userId: ids.target })
    ).rejects.toBe(failure);
    expect(mocks.clear).not.toHaveBeenCalled();
    mocks.api.getOrganization.mockRejectedValue(failure);
    await expect(getAccount(ids.account)).rejects.toBe(failure);
  });

  it("denies absent, expired and unverified identities before directory reads", async () => {
    for (const source of [
      null,
      { session: { expiresAt: new Date(0) }, user: { emailVerified: true } },
      {
        session: { expiresAt: new Date(Date.now() + 60_000) },
        user: { emailVerified: false },
      },
    ]) {
      mocks.api.getSession.mockResolvedValue(source);
      await expect(
        listAccountMembers({ accountId: ids.account })
      ).rejects.toMatchObject({
        status: source?.user.emailVerified === false ? 403 : 401,
      });
    }
    expect(mocks.api.listMembers).not.toHaveBeenCalled();
  });

  it("denies mismatched active accounts and insufficient membership permissions", async () => {
    await expect(
      inviteAccountMembers({
        accountId: ids.target,
        invitations: [{ email: "alex@example.com", role: "viewer" }],
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.tx.authMember.findUnique.mockResolvedValue({ role: "viewer" });
    await expect(
      updateAccountMemberRole({
        accountId: ids.account,
        role: "manager",
        userId: ids.target,
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("validates member and invitation inputs before mutation", async () => {
    await expect(
      updateAccountMemberRole({
        accountId: ids.account,
        role: "manager",
        userId: "not-a-uuid",
      })
    ).rejects.toThrow();
    await expect(
      inviteAccountMembers({
        accountId: ids.account,
        invitations: [{ email: "not-an-email", role: "viewer" }],
      })
    ).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.api.createInvitation).not.toHaveBeenCalled();
  });
});
