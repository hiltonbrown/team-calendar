import { randomUUID } from "node:crypto";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessControl, organizationRoles } from "../better-auth-permissions";
import { coreSchemaOptions, organizationSchema } from "../better-auth-schema";
import {
  deliverInvitationEmail,
  isControlledAccountMutation,
} from "../native-mutation-context";
import type { AuthRole } from "../permissions";
import {
  acceptAccountInvitation,
  getAccount,
  inviteAccountMember,
  leaveAccount,
  listAccountInvitations,
  listAccountMembers,
  listAccountMembersForJob,
  removeAccountMember,
  updateAccount,
  updateAccountMemberRole,
} from "./better-auth-accounts";

const mocks = vi.hoisted(() => ({
  clear: vi.fn(),
  database: {
    $transaction: vi.fn(),
    authInvitation: { findMany: vi.fn(), findUnique: vi.fn() },
    authMember: { count: vi.fn(), findMany: vi.fn() },
    authOrganization: { findUnique: vi.fn() },
  },
  emit: vi.fn(),
  ensureReady: vi.fn(),
  getBetterAuth: vi.fn(),
  headers: vi.fn(),
  log: vi.fn(),
  prismaAdapter: vi.fn(),
  reconcile: vi.fn(),
  send: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    authAuditEvent: { create: vi.fn(), findFirst: vi.fn() },
    authInvitation: { findFirst: vi.fn(), findUnique: vi.fn() },
    authMember: { findUnique: vi.fn() },
    authOrganization: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    authSession: { findFirst: vi.fn() },
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@repo/email", () => ({ sendAuthEmail: mocks.send }));
vi.mock("@repo/database/system", () => ({ systemDatabase: mocks.database }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: mocks.prismaAdapter,
}));
vi.mock("./better-auth-server", () => ({
  ensureUserAccountsReady: mocks.ensureReady,
  getBetterAuth: mocks.getBetterAuth,
}));
vi.mock("../membership-reconciliation", () => ({
  clearAccountPeople: mocks.clear,
  reconcileAccountPeople: mocks.reconcile,
}));
vi.mock("../lifecycle-events", () => ({ emitAuthLifecycleEvent: mocks.emit }));
vi.mock("@repo/observability/log", () => ({ log: { error: mocks.log } }));

const origin = "http://localhost:3000";
const password = "a sufficiently long fixture password";
const roles: AuthRole[] = ["owner", "admin", "manager", "viewer"];
function controlled(): Promise<void> {
  if (!isControlledAccountMutation()) {
    throw new APIError("FORBIDDEN", {
      message: "Use the checked Account operation",
    });
  }
  return Promise.resolve();
}

async function fixture(actorRole: AuthRole) {
  const storage: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    [
      "AuthUser",
      "AuthSession",
      "AuthIdentity",
      "AuthVerification",
      "AuthOrganization",
      "AuthMember",
      "AuthInvitation",
    ].map((name) => [name, []])
  );
  const events: string[] = [];
  const accountId = randomUUID();
  const actorId = randomUUID();
  const targetId = randomUUID();
  const native = betterAuth({
    ...coreSchemaOptions,
    advanced: { database: { generateId: "uuid" } },
    baseURL: origin,
    database: memoryAdapter(storage),
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    plugins: [
      organization({
        ac: accessControl,
        creatorRole: "owner",
        organizationHooks: {
          beforeAcceptInvitation: controlled,
          beforeCreateInvitation: controlled,
          beforeRemoveMember: controlled,
          beforeUpdateMemberRole: controlled,
          beforeUpdateOrganization: controlled,
        },
        roles: organizationRoles,
        schema: organizationSchema,
        sendInvitationEmail: async () =>
          deliverInvitationEmail(async () => {
            events.push("email");
            await mocks.send();
          }),
        teams: { enabled: false },
      }),
    ],
    secret: "native-membership-test-secret-at-least-32-characters",
    telemetry: { enabled: false },
  });
  const context = await native.$context;
  const raw = memoryAdapter(storage)(native.options);
  const now = new Date();
  for (const [userId, name] of [
    [actorId, "Actor"],
    [targetId, "Target"],
    [randomUUID(), "Other owner"],
  ]) {
    await raw.create({
      data: {
        createdAt: now,
        email: `${userId}@example.test`,
        emailVerified: true,
        id: userId,
        name,
        updatedAt: now,
      },
      forceAllowId: true,
      model: "user",
    });
    await raw.create({
      data: {
        createdAt: now,
        id: randomUUID(),
        organizationId: accountId,
        role:
          userId === actorId
            ? actorRole
            : ({ [targetId]: "viewer" }[userId] ?? "owner"),
        userId,
      },
      forceAllowId: true,
      model: "member",
    });
  }
  await raw.create({
    data: {
      countryCode: "AU",
      createdAt: now,
      id: accountId,
      metadata: JSON.stringify({ bootstrapTimeZone: "Australia/Brisbane" }),
      name: "Example",
      provisioningStatus: "ready",
      slug: `example-${accountId}`,
    },
    forceAllowId: true,
    model: "organization",
  });
  await raw.create({
    data: {
      accountId: actorId,
      createdAt: now,
      password: await context.password.hash(password),
      providerId: "credential",
      updatedAt: now,
      userId: actorId,
    },
    model: "account",
  });
  const signIn = await native.api.signInEmail({
    asResponse: true,
    body: { email: `${actorId}@example.test`, password },
  });
  expect(signIn.status).toBe(200);
  const requestHeaders = new Headers({
    cookie: signIn.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; "),
    origin,
  });
  await native.api.setActiveOrganization({
    body: { organizationId: accountId },
    headers: requestHeaders,
  });
  mocks.headers.mockResolvedValue(requestHeaders);
  mocks.getBetterAuth.mockReturnValue(native);
  let transactionStorage: typeof storage | undefined;
  const current = () => transactionStorage ?? storage;
  mocks.prismaAdapter.mockImplementation(() => (options: BetterAuthOptions) => {
    if (!transactionStorage) {
      throw new Error("Adapter constructed outside owner transaction");
    }
    return memoryAdapter(transactionStorage)(options);
  });
  mocks.tx.$queryRaw.mockResolvedValue([]);
  mocks.tx.authAuditEvent.findFirst.mockResolvedValue(null);
  mocks.tx.authMember.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(
      current().AuthMember.find(
        (member) =>
          member.account_id === where.account_id_user_id.account_id &&
          member.user_id === where.account_id_user_id.user_id
      ) ?? null
    )
  );
  mocks.tx.authInvitation.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(
      current().AuthInvitation.find(
        (invitation) =>
          invitation.account_id === where.account_id &&
          String(invitation.email).toLowerCase() === where.email.equals &&
          invitation.status === "pending" &&
          invitation.expires_at instanceof Date &&
          invitation.expires_at > where.expires_at.gt
      ) ?? null
    )
  );
  mocks.tx.authAuditEvent.create.mockResolvedValue({});
  mocks.tx.authSession.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(
      current().AuthSession.find(
        (session) =>
          session.id === where.id && session.user_id === where.user_id
      ) ?? null
    )
  );
  mocks.tx.authOrganization.findUnique.mockImplementation(() =>
    Promise.resolve(current().AuthOrganization[0])
  );
  mocks.tx.authOrganization.findUniqueOrThrow.mockImplementation(
    mocks.tx.authOrganization.findUnique
  );
  mocks.database.authOrganization.findUnique.mockImplementation(() =>
    Promise.resolve(storage.AuthOrganization[0])
  );
  mocks.database.authInvitation.findMany.mockImplementation(({ where }) =>
    Promise.resolve(
      storage.AuthInvitation.filter((invitation) =>
        where.id.in.includes(invitation.id)
      )
    )
  );
  mocks.database.authInvitation.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(
      storage.AuthInvitation.find((invitation) => invitation.id === where.id) ??
        null
    )
  );
  mocks.tx.authInvitation.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(
      current().AuthInvitation.find(
        (invitation) => invitation.id === where.id
      ) ?? null
    )
  );
  mocks.database.$transaction.mockImplementation(async (operation) => {
    const before = structuredClone(storage);
    transactionStorage = structuredClone(storage);
    events.push("begin");
    try {
      const value = await operation(mocks.tx);
      // Real native writes must use the isolated tx adapter, never root storage.
      expect(storage).toEqual(before);
      for (const key of Object.keys(storage)) {
        storage[key] = transactionStorage[key];
      }
      events.push("commit");
      return value;
    } catch (error) {
      expect(storage).toEqual(before);
      events.push("rollback");
      throw error;
    } finally {
      transactionStorage = undefined;
    }
  });
  return {
    accountId,
    actorId,
    events,
    native,
    raw,
    requestHeaders,
    storage,
    targetId,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.send.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("native organisation API behind guarded Account facade", () => {
  it("keeps direct native mutations behind the checked facade", async () => {
    const { native, accountId, requestHeaders } = await fixture("owner");
    await expect(
      native.api.updateOrganization({
        body: { data: { name: "Bypass" }, organizationId: accountId },
        headers: requestHeaders,
      })
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await updateAccount(accountId, { name: "Checked" })).toMatchObject({
      name: "Checked",
    });
  });
  it("scheduled identity reads use explicit Account IDs without a session", async () => {
    const { accountId, actorId } = await fixture("owner");
    mocks.headers.mockRejectedValue(new Error("No request context in job"));
    mocks.database.authMember.findMany.mockResolvedValue([
      {
        account_id: accountId,
        id: randomUUID(),
        role: "owner",
        user: { email: "owner@example.test", image: null, name: "Owner" },
        user_id: actorId,
      },
    ]);
    mocks.database.authMember.count.mockResolvedValue(1);
    expect(
      await listAccountMembersForJob({ accountId, userIds: [actorId] })
    ).toMatchObject({
      data: [{ accountId, role: "owner", userId: actorId }],
      totalCount: 1,
    });
    expect(mocks.database.authMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { account_id: accountId, user_id: { in: [actorId] } },
      })
    );
    expect(mocks.headers).not.toHaveBeenCalled();
  });
  it.each(roles)(
    "%s follows the complete membership mutation matrix",
    async (actorRole) => {
      const { accountId, targetId, storage, events } = await fixture(actorRole);
      const allowed = actorRole === "owner" || actorRole === "admin";
      const invite = inviteAccountMember({
        accountId,
        email: "invitee@example.test",
        role: "manager",
      });
      if (allowed) {
        expect(await invite).toMatchObject({
          email: "invitee@example.test",
          role: "manager",
        });
        expect(events.slice(-2)).toEqual(["commit", "email"]);
      } else {
        await expect(invite).rejects.toMatchObject({ status: 403 });
        expect(storage.AuthInvitation).toHaveLength(0);
      }
      const change = updateAccountMemberRole({
        accountId,
        role: "manager",
        userId: targetId,
      });
      if (allowed) {
        await change;
        expect(
          storage.AuthMember.find((member) => member.user_id === targetId)?.role
        ).toBe("manager");
      } else {
        await expect(change).rejects.toMatchObject({ status: 403 });
      }
      const update = updateAccount(accountId, {
        name: "Updated",
        publicMetadata: { timezone: "Australia/Sydney" },
      });
      if (allowed) {
        expect(await update).toMatchObject({ name: "Updated" });
        expect(
          JSON.parse(String(storage.AuthOrganization[0].metadata))
        ).toMatchObject({
          bootstrapTimeZone: "Australia/Brisbane",
          publicMetadata: { timezone: "Australia/Sydney" },
        });
      } else {
        await expect(update).rejects.toMatchObject({ status: 403 });
      }
      const remove = removeAccountMember({ accountId, userId: targetId });
      if (allowed) {
        await remove;
        expect(
          storage.AuthMember.some((member) => member.user_id === targetId)
        ).toBe(false);
        expect(mocks.clear).toHaveBeenCalledWith(accountId, targetId);
      } else {
        await expect(remove).rejects.toMatchObject({ status: 403 });
      }
    }
  );
  it.each(["admin", "manager", "viewer"] as const)(
    "%s cannot invite or promote an owner, including themselves",
    async (actorRole) => {
      const { accountId, actorId } = await fixture(actorRole);
      await expect(
        inviteAccountMember({
          accountId,
          email: "new-owner@example.test",
          role: "owner",
        })
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        updateAccountMemberRole({ accountId, role: "owner", userId: actorId })
      ).rejects.toMatchObject({ status: 403 });
    }
  );
  it("allows owner assignment and denies admin changes to owner targets", async () => {
    const owner = await fixture("owner");
    await updateAccountMemberRole({
      accountId: owner.accountId,
      role: "owner",
      userId: owner.targetId,
    });
    expect(
      owner.storage.AuthMember.find(
        (member) => member.user_id === owner.targetId
      )?.role
    ).toBe("owner");
    const admin = await fixture("admin");
    const target = admin.storage.AuthMember.find(
      (member) => member.user_id === admin.targetId
    );
    if (!target) {
      throw new Error("Missing target fixture");
    }
    target.role = "owner";
    await expect(
      updateAccountMemberRole({
        accountId: admin.accountId,
        role: "viewer",
        userId: admin.targetId,
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      removeAccountMember({
        accountId: admin.accountId,
        userId: admin.targetId,
      })
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects a revoked session again under the transaction lock", async () => {
    const { accountId, targetId } = await fixture("owner");
    mocks.tx.authSession.findFirst.mockResolvedValue(null);
    await expect(
      removeAccountMember({ accountId, userId: targetId })
    ).rejects.toMatchObject({ status: 401 });
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("rolls native writes back and discards email hooks when the outer commit fails", async () => {
    const { accountId, storage } = await fixture("owner");
    mocks.tx.$queryRaw.mockImplementation((query: TemplateStringsArray) => {
      if (query.join("").includes("SELECT * FROM auth_audit_events")) {
        throw new Error("commit failed");
      }
      return [];
    });
    await expect(
      inviteAccountMember({
        accountId,
        email: "rollback@example.test",
        role: "viewer",
      })
    ).rejects.toThrow("commit failed");
    expect(storage.AuthInvitation).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not report a committed invitation as failed when email delivery fails", async () => {
    const { accountId, storage } = await fixture("owner");
    mocks.send.mockRejectedValue(new Error("smtp private details"));
    expect(
      await inviteAccountMember({
        accountId,
        email: "delayed@example.test",
        role: "viewer",
      })
    ).toMatchObject({ role: "viewer" });
    expect(storage.AuthInvitation).toHaveLength(1);
    expect(mocks.log).toHaveBeenCalledWith(
      "Committed auth operation side effect could not be delivered"
    );
  });
  it("retries committed invitation mail with the original ID and expiry", async () => {
    const { accountId, storage } = await fixture("owner");
    mocks.send.mockRejectedValueOnce(new Error("mail unavailable"));
    const first = await inviteAccountMember({
      accountId,
      email: "retry@example.test",
      role: "viewer",
    });
    const expiresAt = storage.AuthInvitation[0].expires_at;
    const second = await inviteAccountMember({
      accountId,
      email: "retry@example.test",
      role: "viewer",
    });
    expect(second.id).toBe(first.id);
    expect(storage.AuthInvitation).toHaveLength(1);
    expect(storage.AuthInvitation[0].expires_at).toEqual(expiresAt);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]?.[0]).toMatchObject({
      actionUrl: `${origin}/accept-invitation/${first.id}`,
    });
    expect(mocks.tx.authAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        after_value: {
          invitationId: first.id,
          role: "viewer",
          status: "pending",
        },
        event_type: "invitation.resent",
      }),
    });
  });
  it("discards a queued resend when its owner transaction fails", async () => {
    const { accountId, storage } = await fixture("owner");
    await inviteAccountMember({
      accountId,
      email: "rollback-retry@example.test",
      role: "viewer",
    });
    const expiresAt = storage.AuthInvitation[0].expires_at;
    mocks.send.mockClear();
    mocks.tx.authAuditEvent.create.mockRejectedValueOnce(
      new Error("audit unavailable")
    );
    await expect(
      inviteAccountMember({
        accountId,
        email: "rollback-retry@example.test",
        role: "viewer",
      })
    ).rejects.toThrow("audit unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(storage.AuthInvitation[0].expires_at).toEqual(expiresAt);
    expect(storage.AuthInvitation).toHaveLength(1);
  });
  it("does not change a pending invitation role or let an admin resend an owner invite", async () => {
    const { accountId, raw, actorId } = await fixture("admin");
    for (const invitedRole of ["viewer", "owner"]) {
      await raw.create({
        data: {
          createdAt: new Date(),
          email: `${invitedRole}@example.test`,
          expiresAt: new Date(Date.now() + 60_000),
          inviterId: actorId,
          organizationId: accountId,
          role: invitedRole,
          status: "pending",
        },
        model: "invitation",
      });
    }
    await expect(
      inviteAccountMember({
        accountId,
        email: "viewer@example.test",
        role: "manager",
      })
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      inviteAccountMember({
        accountId,
        email: "owner@example.test",
        role: "viewer",
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(roles)(
    "%s can leave through the native API when database invariants permit it",
    async (actorRole) => {
      const { accountId, actorId, storage } = await fixture(actorRole);
      await leaveAccount(accountId);
      expect(
        storage.AuthMember.some((member) => member.user_id === actorId)
      ).toBe(false);
      expect(mocks.clear).toHaveBeenCalledWith(accountId, actorId);
    }
  );
  it("accepts the addressed verified email and retries consumed signup invitations without duplicate membership", async () => {
    const { accountId, actorId, raw, requestHeaders, storage } =
      await fixture("viewer");
    const invitedAccountId = randomUUID();
    const invitationId = randomUUID();
    await raw.create({
      data: {
        countryCode: "AU",
        createdAt: new Date(),
        id: invitedAccountId,
        name: "Invited",
        provisioningStatus: "ready",
        slug: `invited-${invitedAccountId}`,
      },
      forceAllowId: true,
      model: "organization",
    });
    await raw.create({
      data: {
        createdAt: new Date(),
        email: `${actorId}@example.test`,
        expiresAt: new Date(Date.now() + 60_000),
        id: invitationId,
        inviterId: actorId,
        organizationId: invitedAccountId,
        role: "manager",
        status: "pending",
      },
      forceAllowId: true,
      model: "invitation",
    });
    expect(
      (await acceptAccountInvitation(invitationId, requestHeaders)).accountId
    ).toBe(invitedAccountId);
    expect(
      storage.AuthMember.filter(
        (member) =>
          member.account_id === invitedAccountId && member.user_id === actorId
      )
    ).toHaveLength(1);
    expect(
      (await acceptAccountInvitation(invitationId, requestHeaders)).accountId
    ).toBe(invitedAccountId);
    expect(
      storage.AuthMember.filter(
        (member) =>
          member.account_id === invitedAccountId && member.user_id === actorId
      )
    ).toHaveLength(1);
    expect(accountId).not.toBe(invitedAccountId);
  });
  it("rejects native final-owner demotion and leave before any write", async () => {
    const { accountId, actorId, storage } = await fixture("owner");
    for (const member of storage.AuthMember) {
      if (member.user_id !== actorId) {
        member.role = "viewer";
      }
    }
    await expect(
      updateAccountMemberRole({ accountId, role: "admin", userId: actorId })
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    await expect(leaveAccount(accountId)).rejects.toMatchObject({
      status: "BAD_REQUEST",
    });
    expect(
      storage.AuthMember.find((member) => member.user_id === actorId)?.role
    ).toBe("owner");
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("rejects unverified identities and a switched account re-read under lock", async () => {
    const first = await fixture("owner");
    const actor = first.storage.AuthUser.find(
      (user) => user.id === first.actorId
    );
    if (!actor) {
      throw new Error("Missing actor fixture");
    }
    actor.email_verified = false;
    await expect(
      inviteAccountMember({
        accountId: first.accountId,
        email: "not-allowed@example.test",
        role: "viewer",
      })
    ).rejects.toMatchObject({ status: 403 });
    const second = await fixture("owner");
    mocks.tx.authSession.findFirst.mockResolvedValue({
      active_account_id: randomUUID(),
      id: randomUUID(),
    });
    await expect(
      updateAccountMemberRole({
        accountId: second.accountId,
        role: "manager",
        userId: second.targetId,
      })
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each(roles)(
    "%s reads the current Account through native organisation APIs",
    async (actorRole) => {
      const { accountId, actorId } = await fixture(actorRole);
      expect(await getAccount(accountId)).toMatchObject({
        id: accountId,
        name: "Example",
        publicMetadata: { countryCode: "AU" },
      });
      const page = await listAccountMembers({
        accountId,
        limit: 1,
        userIds: [actorId],
      });
      expect(page.totalCount).toBe(1);
      expect(page.data[0]).toMatchObject({ role: actorRole, userId: actorId });
      expect(
        await listAccountInvitations({ accountId, status: ["pending"] })
      ).toEqual({ data: [], totalCount: 0 });
    }
  );
  it("denies invitation email mismatch before changing any membership", async () => {
    const { accountId, actorId, raw, requestHeaders } = await fixture("viewer");
    const invitationId = randomUUID();
    await raw.create({
      data: {
        createdAt: new Date(),
        email: "different@example.test",
        expiresAt: new Date(Date.now() + 60_000),
        id: invitationId,
        inviterId: actorId,
        organizationId: accountId,
        role: "owner",
        status: "pending",
      },
      forceAllowId: true,
      model: "invitation",
    });
    await expect(
      acceptAccountInvitation(invitationId, requestHeaders)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
