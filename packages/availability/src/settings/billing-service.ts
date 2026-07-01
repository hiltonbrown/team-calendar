import "server-only";

import { type PlanKey, planKeys, type Result } from "@repo/core";
import {
  database,
  getPlanDefinition,
  getPlanLimits,
  getSubscriptionForOrg,
  limitTypes,
} from "@repo/database";
import { z } from "zod";

export interface BillingSummary {
  hasContactFlow: boolean;
  hasUpgradeFlow: boolean;
  isOverLimit: boolean;
  plan: {
    currentPeriodEnd: Date | null;
    key: string;
    label: string;
    seatsPurchased: number;
    status: string;
  };
  usage: Array<{
    currentValue: number;
    label: string;
    limit: number | null;
    metricKey: string;
    unit: string;
  }>;
}

export interface DashboardBillingSummary extends BillingSummary {
  visibleToAdmin: boolean;
}

interface BillingSummaryCore {
  isOverLimit: boolean;
  plan: BillingSummary["plan"];
  usage: BillingSummary["usage"];
}

export type BillingServiceError =
  | { code: "cross_org_leak"; message: string }
  | { code: "not_authorised"; message: string }
  | { code: "subscription_not_found"; message: string }
  | { code: "unknown_error"; message: string };

const SummarySchema = z.object({
  actingRole: z.enum(["admin", "manager", "owner", "viewer"]),
  actingUserId: z.string().min(1),
  clerkOrgId: z.string().min(1),
  organisationId: z.string().uuid(),
});

export async function getBillingSummary(
  input: z.input<typeof SummarySchema>
): Promise<Result<BillingSummary, BillingServiceError>> {
  const parsed = SummarySchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Failed to load billing summary.");
  }
  if (
    parsed.data.actingRole !== "owner" &&
    parsed.data.actingRole !== "admin"
  ) {
    return {
      ok: false,
      error: {
        code: "not_authorised",
        message: "Billing is managed by the account owner.",
      },
    };
  }

  const summaryResult = await loadBillingSummary(parsed.data);
  if (!summaryResult.ok) {
    return summaryResult;
  }

  return {
    ok: true,
    value: {
      ...summaryResult.value,
      hasContactFlow: true,
      hasUpgradeFlow: true,
    },
  };
}

export async function getBillingSummaryForDashboard(
  input: z.input<typeof SummarySchema>
): Promise<Result<DashboardBillingSummary, BillingServiceError>> {
  const parsed = SummarySchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Failed to load billing summary.");
  }
  if (
    parsed.data.actingRole !== "owner" &&
    parsed.data.actingRole !== "admin"
  ) {
    return {
      ok: false,
      error: {
        code: "not_authorised",
        message: "Billing is managed by the account owner.",
      },
    };
  }

  const summaryResult = await loadBillingSummary(parsed.data);
  if (!summaryResult.ok) {
    return summaryResult;
  }

  return {
    ok: true,
    value: {
      ...summaryResult.value,
      hasContactFlow: false,
      hasUpgradeFlow: parsed.data.actingRole === "owner",
      visibleToAdmin: parsed.data.actingRole === "owner",
    },
  };
}

async function loadBillingSummary(
  input: z.infer<typeof SummarySchema>
): Promise<Result<BillingSummaryCore, BillingServiceError>> {
  try {
    const [subscription, usage] = await Promise.all([
      getSubscriptionForOrg(input.clerkOrgId),
      database.$queryRaw<
        Array<{ metric_key: string; current_value: number }>
      >`SELECT DISTINCT ON (metric_key) metric_key, current_value FROM usage_counters WHERE clerk_org_id = ${input.clerkOrgId} AND metric_key IN ('payroll_entities', 'seats', 'feeds') ORDER BY metric_key ASC, period_start DESC`,
    ]);

    const planKey =
      planKeys.find((key) => key === subscription?.plan_key) ?? "basic";
    const planLimits = await getPlanLimits(planKey);
    const usageByMetric = new Map(
      usage.map((item) => [item.metric_key, item.current_value])
    );
    const usageItems = limitTypes.map((limitType) => ({
      currentValue: usageByMetric.get(limitType) ?? 0,
      label: labelForMetric(limitType),
      limit: planLimits[limitType] === -1 ? null : planLimits[limitType],
      metricKey: limitType,
      unit: labelForMetric(limitType).toLowerCase(),
    }));

    return {
      ok: true,
      value: {
        isOverLimit: usageItems.some(
          (item) => item.limit !== null && item.currentValue > item.limit
        ),
        plan: {
          currentPeriodEnd: subscription?.current_period_end ?? null,
          key: planKey,
          label: labelForPlan(planKey),
          seatsPurchased: 0,
          status: subscription?.status ?? "active",
        },
        usage: usageItems,
      },
    };
  } catch {
    return unknownError("Failed to load billing summary.");
  }
}

function labelForPlan(value: PlanKey): string {
  return getPlanDefinition(value).name;
}

function labelForMetric(value: string): string {
  if (value === "payroll_entities") {
    return "Payroll entities";
  }
  if (value === "seats") {
    return "Seats";
  }
  if (value === "feeds") {
    return "Feeds";
  }
  return value.replaceAll("_", " ");
}

function unknownError(message: string): Result<never, BillingServiceError> {
  return { ok: false, error: { code: "unknown_error", message } };
}
