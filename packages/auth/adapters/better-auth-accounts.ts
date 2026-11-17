import "server-only";

import { getCurrentDBAdapterAsyncLocalStorage } from "@better-auth/core/context";
import type { AuthAuditEvent, AuthOrganization, Prisma } from "@repo/database";
import { systemDatabase } from "@repo/database/system";
import { log } from "@repo/observability/log";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { headers } from "next/headers";
import { z } from "zod";
import type {
  Account,
  AccountInvitation,
  AccountMember,
  InvitationInput,
  InviteMembersInput,
  ListInvitationsInput,
  ListMembersInput,
  Page,
} from "../account-types";
import { sendAccountInvitationEmail } from "../invitation-email";
import { emitAuthLifecycleEvent } from "../lifecycle-events";
import {
  clearAccountPeople,
  reconcileAccountPeople,
} from "../membership-reconciliation";
import { collectInvitationEmails } from "../native-mutation-context";
import {
  type AuthRole,
  hasPermission,
  isAuthRole,
  type PermissionRequest,
} from "../permissions";
import { ensureUserAccountsReady, getBetterAuth } from "./better-auth-server";

const id = z.uuid();
const pagination = z.object({
  limit: z.number().int().min(1).max(100).default(100),
  offset: z.number().int().min(0).default(0),
});
const role = z.enum(["owner", "admin", "manager", "viewer"]);
const invitationInput = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  inviterUserId: id.optional(),
  role,
});
type Transaction = Prisma.TransactionClient;
type NativeAuth = ReturnType<typeof getBetterAuth>;
type Identity = NonNullable<
  Awaited<ReturnType<NativeAuth["api"]["getSession"]>>
>;

type DirectoryStatus = 400 | 401 | 403 | 404 | 409;
export class AccountDirectoryError extends Error {
  readonly status: DirectoryStatus;
  constructor(status: DirectoryStatus, message: string) {
    super(message);
    this.status = status;
  }
}
const denied = () =>
  new AccountDirectoryError(403, "This Account operation is not permitted");
const metadata = (value: string | null): Record<string, unknown> => {
  if (!value) {
    return {};
  }
  const parsed: unknown = JSON.parse(value);
  return z.record(z.string(), z.unknown()).parse(parsed);
};
const mapAccount = (source: AuthOrganization): Account => {
  const { publicMetadata } = metadata(source.metadata);
  return {
    id: source.id,
    image: source.logo,
    name: source.name,
    publicMetadata: {
      ...(publicMetadata &&
      typeof publicMetadata === "object" &&
      !Array.isArray(publicMetadata)
        ? publicMetadata
        : {}),
      countryCode: source.country_code,
    },
    slug: source.slug,
  };
};

async function getStoredAccount(accountId: string): Promise<Account> {
  const account = await systemDatabase.authOrganization.findUnique({
    where: { id: id.parse(accountId) },
  });
  if (!account) {
    throw new AccountDirectoryError(404, "Account not found");
  }
  return mapAccount(account);
}
export async function listAccountMembersForJob(
  input: ListMembersInput
): Promise<Page<AccountMember>> {
  const accountId = id.parse(input.accountId);
  const { limit, offset } = pagination.parse(input);
  const where = {
    account_id: accountId,
    ...(input.userIds
      ? { user_id: { in: z.array(id).parse(input.userIds) } }
      : {}),
  };
  const [members, totalCount] = await Promise.all([
    systemDatabase.authMember.findMany({
      include: { user: true },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit,
      where,
    }),
    systemDatabase.authMember.count({ where }),
  ]);
  return {
    data: members.map((member) => ({
      accountId,
      email: member.user.email,
      id: member.id,
      image: member.user.image,
      name: member.user.name,
      role: isAuthRole(member.role) ? member.role : null,
      userId: member.user_id,
    })),
    totalCount,
  };
}
/** User-driven directory reads retain native membership validation. */
export async function getAccount(accountId: string): Promise<Account> {
  const requestHeaders = await headers();
  await authenticated(requestHeaders);
  const account = await getBetterAuth().api.getOrganization({
    headers: requestHeaders,
    query: { organizationId: id.parse(accountId) },
  });
  if (!account) {
    throw new AccountDirectoryError(404, "Account not found");
  }
  const publicMetadata =
    z
      .object({ publicMetadata: z.record(z.string(), z.unknown()).optional() })
      .parse(
        typeof account.metadata === "string"
          ? metadata(account.metadata)
          : (account.metadata ?? {})
      ).publicMetadata ?? {};
  return {
    id: account.id,
    image: account.logo ?? null,
    name: account.name,
    publicMetadata: { ...publicMetadata, countryCode: account.countryCode },
    slug: account.slug,
  };
}

export async function listAccountMembers(
  input: ListMembersInput
): Promise<Page<AccountMember>> {
  const requestHeaders = await headers();
  await authenticated(requestHeaders);
  const accountId = id.parse(input.accountId);
  const { limit, offset } = pagination.parse(input);
  const userIds = z.array(id).optional().parse(input.userIds);
  if (userIds?.length === 0) {
    return { data: [], totalCount: 0 };
  }
  const result = await getBetterAuth().api.listMembers({
    headers: requestHeaders,
    query: {
      limit,
      offset,
      organizationId: accountId,
      sortBy: "createdAt",
      sortDirection: "asc",
      ...(userIds
        ? { filterField: "userId", filterOperator: "in", filterValue: userIds }
        : {}),
    },
  });
  return {
    data: result.members.map((member) => ({
      accountId,
      email: member.user.email,
      id: member.id,
      image: member.user.image ?? null,
      name: member.user.name,
      role: isAuthRole(member.role) ? member.role : null,
      userId: member.userId,
    })),
    totalCount: result.total,
  };
}

export async function listAccountInvitations(
  input: ListInvitationsInput
): Promise<Page<AccountInvitation>> {
  const requestHeaders = await headers();
  await authenticated(requestHeaders);
  const accountId = id.parse(input.accountId);
  const { limit, offset } = pagination.parse(input);
  const statuses = z
    .array(z.enum(["pending", "accepted", "revoked", "expired"]))
    .optional()
    .parse(input.status);
  const source = await getBetterAuth().api.listInvitations({
    headers: requestHeaders,
    query: { organizationId: accountId },
  });
  const invitations = source
    .map((invitation) => {
      let status: string = invitation.status;
      if (status === "pending" && invitation.expiresAt <= new Date()) {
        status = "expired";
      }
      if (["canceled", "rejected"].includes(status)) {
        status = "revoked";
      }
      return {
        createdAt: invitation.createdAt.getTime(),
        email: invitation.email,
        id: invitation.id,
        role: isAuthRole(invitation.role) ? invitation.role : null,
        status,
      };
    })
    .filter(
      (invitation) =>
        !statuses || statuses.some((status) => status === invitation.status)
    );
  // The pinned native invitation API has no pagination parameters.
  return {
    data: invitations.slice(offset, offset + limit),
    totalCount: invitations.length,
  };
}

async function authenticated(requestHeaders: Headers): Promise<Identity> {
  const source = await getBetterAuth().api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });
  if (!source || source.session.expiresAt <= new Date()) {
    throw new AccountDirectoryError(401, "Sign in to continue");
  }
  if (!source.user.emailVerified) {
    throw denied();
  }
  return source;
}

async function lockIdentity(
  tx: Transaction,
  accountId: string,
  source: Identity,
  targets: string[] = []
) {
  await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
  for (const userId of [...new Set([source.user.id, ...targets])].sort()) {
    await tx.$queryRaw`SELECT id FROM auth_users WHERE id = ${userId}::uuid FOR UPDATE`;
  }
  const current = await tx.authSession.findFirst({
    where: {
      expires_at: { gt: new Date() },
      id: source.session.id,
      user: { email_verified: true },
      user_id: source.user.id,
    },
  });
  if (!current) {
    throw new AccountDirectoryError(401, "Sign in to continue");
  }
  await tx.$queryRaw`SELECT set_config('app.auth_actor_user_id', ${source.user.id}, true)`;
  return current;
}

function transactionAudits(
  tx: Transaction,
  accountId: string
): Promise<AuthAuditEvent[]> {
  // xmin selects only trigger records written by this transaction, avoiding
  // wall-clock races and snapshots from another request by the same actor.
  return tx.$queryRaw<
    AuthAuditEvent[]
  >`SELECT * FROM auth_audit_events WHERE account_id = ${accountId}::uuid AND xmin = pg_current_xact_id()::xid`;
}

async function publishCommittedAudits(
  events: AuthAuditEvent[],
  accountId: string,
  actorId: string
): Promise<void> {
  for (const event of events) {
    const identity = { auditId: event.id, occurredAt: event.created_at };
    if (event.event_type === "account.updated") {
      try {
        const account = await getStoredAccount(accountId);
        await emitAuthLifecycleEvent({
          ...identity,
          account,
          accountId,
          createdBy: actorId,
          kind: "account.updated",
        });
      } catch {
        log.error("Committed Account analytics snapshot could not be read", {
          auditId: event.id,
        });
      }
    }
    if (event.event_type === "membership.created" && event.target_user_id) {
      const next = z.object({ role }).safeParse(event.after_value);
      if (next.success) {
        await emitAuthLifecycleEvent({
          ...identity,
          accountId,
          kind: "membership.created",
          role: next.data.role,
          userId: event.target_user_id,
        });
      }
    }
    if (event.event_type === "membership.removed" && event.target_user_id) {
      const previous = z.object({ role }).safeParse(event.before_value);
      if (previous.success) {
        await emitAuthLifecycleEvent({
          ...identity,
          accountId,
          kind: "membership.deleted",
          role: previous.data.role,
          userId: event.target_user_id,
        });
      }
    }
  }
}

async function flushCommittedHooks(
  pending: Array<() => Promise<void>>
): Promise<void> {
  for (const hook of pending) {
    try {
      await hook();
    } catch {
      log.error("Committed auth operation side effect could not be delivered");
    }
  }
}

async function mutation<T>(
  accountId: string,
  permission: PermissionRequest | null,
  targetUsers: string[],
  operation: (
    tx: Transaction,
    native: NativeAuth,
    requestHeaders: Headers,
    actorRole: AuthRole,
    identity: Identity
  ) => Promise<T>
): Promise<T> {
  id.parse(accountId);
  const requestHeaders = await headers();
  const source = await authenticated(requestHeaders);
  if (source.session.activeOrganizationId !== accountId) {
    throw denied();
  }
  const pending: Array<() => Promise<void>> = [];
  const result = await systemDatabase.$transaction(async (tx) => {
    const currentSession = await lockIdentity(
      tx,
      accountId,
      source,
      targetUsers
    );
    if (currentSession.active_account_id !== accountId) {
      throw denied();
    }
    const actor = await tx.authMember.findUnique({
      where: {
        account_id_user_id: { account_id: accountId, user_id: source.user.id },
      },
    });
    const account = await tx.authOrganization.findUnique({
      where: { id: accountId },
    });
    if (
      !(
        actor &&
        account?.provisioning_status === "ready" &&
        isAuthRole(actor.role) &&
        (permission === null || hasPermission(actor.role, permission))
      )
    ) {
      throw denied();
    }
    const native = getBetterAuth();
    const txAdapter = prismaAdapter(tx, {
      provider: "postgresql",
      transaction: false,
    })(native.options);
    const storage = await getCurrentDBAdapterAsyncLocalStorage();
    // The pinned accept endpoint starts its own transaction unless the current
    // adapter scope is marked active. Bind it to the already locked owner tx.
    const value = await collectInvitationEmails(pending, () =>
      storage.run(
        {
          adapter: txAdapter,
          isTransactionActive: true,
          pendingHooks: pending,
        },
        () => operation(tx, native, requestHeaders, actor.role, source)
      )
    );
    return { audits: await transactionAudits(tx, accountId), value };
  });
  await flushCommittedHooks(pending);
  await publishCommittedAudits(result.audits, accountId, source.user.id);
  return result.value;
}

export async function updateAccount(
  accountId: string,
  input: { name?: string; publicMetadata?: Record<string, unknown> }
): Promise<Account> {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      publicMetadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict()
    .parse(input);
  if (JSON.stringify(parsed.publicMetadata ?? {}).length > 4096) {
    throw new AccountDirectoryError(400, "Account details are too long");
  }
  await mutation(
    accountId,
    { organization: ["update"] },
    [],
    async (tx, native, requestHeaders) => {
      const account = await tx.authOrganization.findUniqueOrThrow({
        where: { id: accountId },
      });
      const existing = metadata(account.metadata);
      if (
        parsed.publicMetadata?.countryCode &&
        parsed.publicMetadata.countryCode !== account.country_code
      ) {
        throw denied();
      }
      await native.api.updateOrganization({
        body: {
          data: {
            ...(parsed.name ? { name: parsed.name } : {}),
            ...(parsed.publicMetadata
              ? {
                  metadata: {
                    ...existing,
                    publicMetadata: {
                      ...mapAccount(account).publicMetadata,
                      ...parsed.publicMetadata,
                    },
                  },
                }
              : {}),
          },
          organizationId: accountId,
        },
        headers: requestHeaders,
      });
    }
  );
  return getAccount(accountId);
}

async function resendPendingInvitation(
  tx: Transaction,
  native: NativeAuth,
  context: {
    accountId: string;
    actorId: string;
    actorRole: AuthRole;
    invitation: InvitationInput;
  }
): Promise<AccountInvitation | null> {
  const { accountId, actorId, actorRole, invitation } = context;
  const pending = await tx.authInvitation.findFirst({
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    where: {
      account_id: accountId,
      email: { equals: invitation.email, mode: "insensitive" },
      expires_at: { gt: new Date() },
      status: "pending",
    },
  });
  if (!pending) {
    return null;
  }
  if (pending.role === "owner" && actorRole !== "owner") {
    throw denied();
  }
  if (pending.role !== invitation.role) {
    throw new AccountDirectoryError(
      409,
      "A pending invitation already uses a different role"
    );
  }
  const account = await tx.authOrganization.findUniqueOrThrow({
    where: { id: accountId },
  });
  const origin = native.options.baseURL;
  if (typeof origin !== "string") {
    throw new Error("A fixed auth origin is required");
  }
  // Native resend writes through its root adapter. Reissue the same admitted
  // invitation after commit, without extending its expiry.
  await sendAccountInvitationEmail(
    { accountName: account.name, email: pending.email, id: pending.id },
    origin
  );
  await tx.authAuditEvent.create({
    data: {
      account_id: accountId,
      actor_user_id: actorId,
      after_value: {
        invitationId: pending.id,
        role: pending.role,
        status: pending.status,
      },
      event_type: "invitation.resent",
    },
  });
  return {
    createdAt: pending.created_at.getTime(),
    email: pending.email,
    id: pending.id,
    role: pending.role,
    status: pending.status,
  };
}

export async function inviteAccountMembers(
  input: InviteMembersInput
): Promise<Page<AccountInvitation>> {
  const invitations = z
    .array(invitationInput)
    .min(1)
    .max(100)
    .parse(input.invitations);
  const created = await mutation(
    input.accountId,
    { invitation: ["create"] },
    [],
    async (tx, native, requestHeaders, actorRole, source) => {
      const results: AccountInvitation[] = [];
      for (const invitation of invitations) {
        if (
          (invitation.role === "owner" && actorRole !== "owner") ||
          (invitation.inviterUserId &&
            invitation.inviterUserId !== source.user.id)
        ) {
          throw denied();
        }
        const pending = await resendPendingInvitation(tx, native, {
          accountId: input.accountId,
          actorId: source.user.id,
          actorRole,
          invitation,
        });
        if (pending) {
          results.push(pending);
          continue;
        }
        const result = await native.api.createInvitation({
          body: {
            email: invitation.email,
            organizationId: input.accountId,
            role: invitation.role,
          },
          headers: requestHeaders,
        });
        results.push({
          createdAt: result.createdAt.getTime(),
          email: result.email,
          id: result.id,
          role: isAuthRole(result.role) ? result.role : null,
          status: result.status,
        });
      }
      return results;
    }
  );
  return { data: created, totalCount: created.length };
}

export async function inviteAccountMember(
  input: InvitationInput & { accountId: string }
): Promise<AccountInvitation> {
  const result = await inviteAccountMembers({
    accountId: input.accountId,
    invitations: [input],
  });
  const [invitation] = result.data;
  if (!invitation) {
    throw new Error("Invitation could not be created");
  }
  return invitation;
}
export async function updateAccountMemberRole(input: {
  accountId: string;
  userId: string;
  role: AuthRole;
}): Promise<void> {
  id.parse(input.userId);
  role.parse(input.role);
  await mutation(
    input.accountId,
    { member: ["update"] },
    [input.userId],
    async (tx, native, requestHeaders, actorRole) => {
      const target = await tx.authMember.findUnique({
        where: {
          account_id_user_id: {
            account_id: input.accountId,
            user_id: input.userId,
          },
        },
      });
      if (!target) {
        throw new AccountDirectoryError(404, "Account member not found");
      }
      if (
        (target.role === "owner" || input.role === "owner") &&
        actorRole !== "owner"
      ) {
        throw denied();
      }
      await native.api.updateMemberRole({
        body: {
          memberId: target.id,
          organizationId: input.accountId,
          role: input.role,
        },
        headers: requestHeaders,
      });
    }
  );
}
export async function removeAccountMember(input: {
  accountId: string;
  userId: string;
}): Promise<void> {
  id.parse(input.userId);
  await mutation(
    input.accountId,
    { member: ["delete"] },
    [input.userId],
    async (tx, native, requestHeaders, actorRole) => {
      const target = await tx.authMember.findUnique({
        where: {
          account_id_user_id: {
            account_id: input.accountId,
            user_id: input.userId,
          },
        },
      });
      if (!target) {
        return;
      }
      if (target.role === "owner" && actorRole !== "owner") {
        throw denied();
      }
      await native.api.removeMember({
        body: { memberIdOrEmail: target.id, organizationId: input.accountId },
        headers: requestHeaders,
      });
    }
  );
  await clearAccountPeople(input.accountId, input.userId);
}

export async function leaveAccount(accountId: string): Promise<void> {
  const source = await authenticated(await headers());
  await mutation(
    accountId,
    null,
    [source.user.id],
    async (_tx, native, requestHeaders) => {
      await native.api.leaveOrganization({
        body: { organizationId: accountId },
        headers: requestHeaders,
      });
    }
  );
  await clearAccountPeople(accountId, source.user.id);
}

export async function acceptAccountInvitation(
  invitationId: string,
  requestHeaders: Headers
): Promise<{ accountId: string; responseHeaders: Headers }> {
  id.parse(invitationId);
  const source = await authenticated(requestHeaders);
  const invitation = await systemDatabase.authInvitation.findUnique({
    where: { id: invitationId },
  });
  if (
    !invitation ||
    invitation.email.toLowerCase() !== source.user.email.toLowerCase()
  ) {
    throw denied();
  }
  const pending: Array<() => Promise<void>> = [];
  const audits = await systemDatabase.$transaction(async (tx) => {
    await lockIdentity(tx, invitation.account_id, source);
    const current = await tx.authInvitation.findUnique({
      where: { id: invitationId },
    });
    if (
      !current ||
      current.email.toLowerCase() !== source.user.email.toLowerCase() ||
      !isAuthRole(current.role)
    ) {
      throw denied();
    }
    const existing = await tx.authMember.findUnique({
      where: {
        account_id_user_id: {
          account_id: current.account_id,
          user_id: source.user.id,
        },
      },
    });
    // Signup already consumes its addressed invitation atomically.
    if (current.status === "accepted" && existing?.role === current.role) {
      const audit = await tx.authAuditEvent.findFirst({
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        where: {
          account_id: current.account_id,
          event_type: "membership.created",
          target_user_id: source.user.id,
        },
      });
      return audit ? [audit] : [];
    }
    if (
      current.status !== "pending" ||
      current.expires_at <= new Date() ||
      existing
    ) {
      throw new AccountDirectoryError(
        409,
        "This invitation is no longer available"
      );
    }
    const native = getBetterAuth();
    const adapter = prismaAdapter(tx, {
      provider: "postgresql",
      transaction: false,
    })(native.options);
    const storage = await getCurrentDBAdapterAsyncLocalStorage();
    await collectInvitationEmails(pending, () =>
      storage.run(
        { adapter, isTransactionActive: true, pendingHooks: pending },
        () =>
          native.api.acceptInvitation({
            body: { invitationId },
            headers: requestHeaders,
          })
      )
    );
    return transactionAudits(tx, current.account_id);
  });
  await flushCommittedHooks(pending);
  await ensureUserAccountsReady(source.user.id);
  await reconcileAccountPeople(source.user, [invitation.account_id]);
  await publishCommittedAudits(audits, invitation.account_id, source.user.id);
  const active = await getBetterAuth().api.setActiveOrganization({
    body: { organizationId: invitation.account_id },
    headers: requestHeaders,
    returnHeaders: true,
  });
  return { accountId: invitation.account_id, responseHeaders: active.headers };
}
