import type { Prisma } from "../../generated/client";
import { database } from "../client";
export interface XeroInactivityScope {
  clerkOrgId: string;
  client?: Prisma.TransactionClient;
  organisationId: string;
}
const scoped = (input: XeroInactivityScope) => ({
  clerk_org_id: input.clerkOrgId,
  organisation_id: input.organisationId,
});
export async function listXeroInactivitySignals(
  input: XeroInactivityScope & { now: Date }
) {
  const client = input.client ?? database;
  const where = scoped(input);
  const bindings = await client.xeroTenant.findMany({
    select: {
      clerk_org_id: true,
      id: true,
      organisation: { select: { archived_at: true } },
      organisation_id: true,
      sync_paused_at: true,
    },
    where: {
      ...where,
      active_slot: 1,
      organisation: {
        clerk_org_id: input.clerkOrgId,
        id: input.organisationId,
      },
      retired_at: null,
    },
  });
  if (!bindings.length) {
    return [];
  }
  const [subscription, feeds, activity] = await Promise.all([
    client.clerkOrgSubscription
      .findUnique({
        select: { status: true },
        where: { clerk_org_id: input.clerkOrgId },
      })
      .catch(() => null),
    client.feed
      .findMany({
        select: {
          tokens: {
            select: {
              expires_at: true,
              last_used_at: true,
              revoked_at: true,
              status: true,
            },
            where,
          },
        },
        where: { ...where, archived_at: null, status: "active" },
      })
      .catch(() => null),
    client.auditEvent
      .findFirst({
        orderBy: { created_at: "desc" },
        select: { created_at: true },
        where: { ...where, actor_user_id: { not: null } },
      })
      .catch(() => null),
  ]);
  let subscriptionActive: boolean | "unknown" = "unknown";
  if (
    subscription?.status === "active" ||
    subscription?.status === "trialing" ||
    subscription?.status === "trialling"
  ) {
    subscriptionActive = true;
  } else if (subscription?.status === "canceled") {
    subscriptionActive = false;
  }
  const tokens = (feeds ?? []).flatMap((feed) => feed.tokens);
  const used = tokens.flatMap((token) =>
    token.last_used_at ? [token.last_used_at] : []
  );
  const activeTokens = tokens.filter(
    (token) =>
      token.status === "active" &&
      token.revoked_at === null &&
      (token.expires_at === null || token.expires_at > input.now)
  );
  // Rotation/revocation cannot erase known recent consumption of an active feed.
  const lastUse = used.length
    ? new Date(Math.max(...used.map((date) => date.getTime())))
    : null;
  let feedLastUsedAt: Date | null | "unknown" = "unknown";
  if (lastUse && input.now.getTime() - lastUse.getTime() <= 30 * 86_400_000) {
    feedLastUsedAt = lastUse;
  } else if (activeTokens.length) {
    feedLastUsedAt = lastUse;
  }
  return bindings.map((binding) => ({
    bindingReserved: true,
    clerkOrgId: binding.clerk_org_id,
    feedLastUsedAt,
    lastHumanActivityAt: activity?.created_at ?? ("unknown" as const),
    onboardingComplete: "unknown" as const,
    organisationArchived: binding.organisation.archived_at !== null,
    organisationId: binding.organisation_id,
    subscriptionActive,
    syncPaused: binding.sync_paused_at !== null,
    xeroTenantId: binding.id,
  }));
}
export async function recordXeroInactivityClassification(
  input: XeroInactivityScope & {
    xeroTenantId: string;
    policyVersion: number;
    kind: "active" | "unknown" | "candidate";
    reason: string;
    now: Date;
  }
) {
  const client = input.client ?? database;
  const where = scoped(input);
  const binding = await client.xeroTenant.findFirst({
    select: { id: true },
    where: { ...where, id: input.xeroTenantId },
  });
  if (!binding) {
    throw new Error(
      "Inactivity classification requires an owned tenant binding"
    );
  }
  return client.xeroInactivityClassification.create({
    data: {
      ...where,
      classified_at: input.now,
      kind: input.kind,
      policy_version: input.policyVersion,
      reason: input.reason,
      xero_tenant_id: binding.id,
    },
  });
}
