import "server-only";

import { systemDatabase } from "@repo/database/system";
import { assertNoTenantTransaction } from "@repo/database/tenant-guard";
import { z } from "zod";
import { ensureUserAccountsReady } from "./adapters/better-auth-server";
import { emitAuthLifecycleEvent } from "./lifecycle-events";
import { reconcileAccountPeople } from "./membership-reconciliation";
import { isAuthRole } from "./permissions";

const bootstrapMetadata = z.object({ bootstrapUserId: z.string() });

interface LifecycleMembership {
  account: {
    id: string;
    logo: string | null;
    metadata: string | null;
    name: string;
  };
  account_id: string;
  role: string;
}

async function emitBootstrapAccountEvents(
  userId: string,
  memberships: readonly LifecycleMembership[]
): Promise<void> {
  const ownedAccounts = memberships
    .filter((member) => member.role === "owner")
    .map((member) => member.account_id);
  if (ownedAccounts.length > 0) {
    const accountAudits = await systemDatabase.authAuditEvent.findMany({
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      where: {
        account_id: { in: ownedAccounts },
        event_type: "account.created",
      },
    });
    for (const audit of accountAudits) {
      const account = memberships.find(
        (member) => member.account_id === audit.account_id
      )?.account;
      if (!account) {
        continue;
      }
      let metadata: unknown;
      try {
        metadata = JSON.parse(account.metadata ?? "{}");
      } catch {
        continue;
      }
      const bootstrap = bootstrapMetadata.safeParse(metadata);
      if (bootstrap.success && bootstrap.data.bootstrapUserId === userId) {
        await emitAuthLifecycleEvent({
          account: { image: account.logo, name: account.name },
          accountId: account.id,
          auditId: audit.id,
          createdBy: userId,
          kind: "account.created",
          occurredAt: audit.created_at,
        });
      }
    }
  }
}

/** Retryable post-commit phase; audit identities remain stable across retries. */
export async function completeAuthUserLifecycle(
  userId: string,
  kind: "user.created" | "user.updated"
): Promise<void> {
  assertNoTenantTransaction("completeAuthUserLifecycle");
  await ensureUserAccountsReady(userId);
  const user = await systemDatabase.authUser.findUnique({
    include: { memberships: { include: { account: true } } },
    where: { id: userId },
  });
  if (!user) {
    return;
  }
  const accountIds = user.memberships.map((member) => member.account_id);
  if (user.email_verified) {
    await reconcileAccountPeople(
      { email: user.email, emailVerified: true, id: user.id },
      accountIds
    );
  }
  const profile = {
    createdAt: user.created_at,
    email: user.email,
    image: user.image,
    name: user.name,
  };
  if (kind === "user.updated") {
    const audit = await systemDatabase.authAuditEvent.findFirst({
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      where: { event_type: kind, target_user_id: userId },
    });
    if (audit) {
      await emitAuthLifecycleEvent({
        auditId: audit.id,
        kind,
        occurredAt: audit.created_at,
        user: profile,
        userId,
      });
    }
    return;
  }
  const audits = await systemDatabase.authAuditEvent.findMany({
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    where: {
      event_type: { in: ["user.created", "membership.created"] },
      target_user_id: userId,
    },
  });
  const created = audits.find((audit) => audit.event_type === "user.created");
  if (created) {
    await emitBootstrapAccountEvents(userId, user.memberships);
  }
  for (const audit of audits) {
    if (audit.event_type === "user.created") {
      await emitAuthLifecycleEvent({
        auditId: audit.id,
        kind: "user.created",
        occurredAt: audit.created_at,
        user: profile,
        userId,
      });
    } else if (audit.event_type === "membership.created" && audit.account_id) {
      const member = user.memberships.find(
        (candidate) => candidate.account_id === audit.account_id
      );
      const snapshot = audit.after_value;
      const role =
        snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
          ? snapshot.role
          : undefined;
      if (member && isAuthRole(role)) {
        await emitAuthLifecycleEvent({
          accountId: member.account_id,
          auditId: audit.id,
          kind: "membership.created",
          occurredAt: audit.created_at,
          role,
          userId,
        });
      }
    }
  }
}
