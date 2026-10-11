import { appError, planKeys, type Result } from "@repo/core";
import type { Prisma } from "../../generated/client";
import { getPlanDefinition } from "../seed/plans";
import { hasUnresolvedStripeEventForOrg } from "./billing";

interface PayrollEntitlementClient {
  $queryRaw: Prisma.TransactionClient["$queryRaw"];
  clerkOrgSubscription: Pick<
    Prisma.TransactionClient["clerkOrgSubscription"],
    "findFirst"
  >;
  organisation: Pick<Prisma.TransactionClient["organisation"], "count">;
  planLimit: Pick<Prisma.TransactionClient["planLimit"], "findFirst">;
}

/** The caller creates the company in this transaction while the lock is held. */
export const checkPayrollEntityEntitlement = async (
  clerkOrgId: string,
  tx: PayrollEntitlementClient
): Promise<Result<{ allowed: boolean; current: number; limit: number }>> => {
  try {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payroll-entities:${clerkOrgId}`}, 0))::text`;
    const subscription = await tx.clerkOrgSubscription.findFirst({
      where: { clerk_org_id: clerkOrgId },
    });
    const unhealthy =
      process.env.NEXT_PUBLIC_LAUNCH_MODE === "paid" &&
      (await hasUnresolvedStripeEventForOrg(
        clerkOrgId,
        subscription?.stripe_event_created_at ?? null
      ));
    const key =
      subscription &&
      ["active", "trialing"].includes(subscription.status) &&
      !unhealthy
        ? subscription.plan_key
        : "basic";
    const persisted = await tx.planLimit.findFirst({
      select: { limit_value: true },
      where: {
        limit_type: "payroll_entities",
        plan: { OR: [{ plan_key: key }, { key }] },
      },
    });
    const catalogueKey =
      planKeys.find((candidate) => candidate === key) ?? "basic";
    const limit =
      persisted?.limit_value ??
      getPlanDefinition(catalogueKey).limits.payroll_entities;
    const current = await tx.organisation.count({
      where: {
        archived_at: null,
        clerk_org_id: clerkOrgId,
        is_active: true,
        OR: [
          { xero_connection: null },
          { xero_connection: { released_at: null } },
        ],
      },
    });
    return {
      ok: true,
      value: { allowed: limit === -1 || current < limit, current, limit },
    };
  } catch {
    return {
      error: appError("internal", "Unable to verify payroll entity limits."),
      ok: false,
    };
  }
};
