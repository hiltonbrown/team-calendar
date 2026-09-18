import "server-only";

import { type PlanKey, planKeys, type Result } from "@repo/core";
import {
  getAuthoritativeUsageCount,
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
      error: {
        code: "not_authorised",
        message: "Billing is managed by the account owner.",
      },
      ok: false,
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
      error: {
        code: "not_authorised",
        message: "Billing is managed by the account owner.",
      },
      ok: false,
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
      Promise.all(
        limitTypes.map(async (limitType) => ({
          currentValue: await getAuthoritativeUsageCount(
            input.clerkOrgId,
            limitType
          ),
          limitType,
        }))
      ),
    ]);

    const planKey =
      planKeys.find((key) => key === subscription?.plan_key) ?? "basic";
    const planLimits = await getPlanLimits(planKey);
    const usageItems = usage.map(({ currentValue, limitType }) => ({
      currentValue,
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
  return { error: { code: "unknown_error", message }, ok: false };
}
