import "server-only";

import type { LimitType, Result } from "@repo/core";
import { getBillingOverview, UNLIMITED } from "@repo/database";
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

// Display metadata only. Limit values and plan keys live solely in
// PLAN_CATALOGUE; this maps each hard-limit dimension to its human label and
// unit for the read-only usage view.
const LIMIT_DISPLAY: Record<LimitType, { label: string; unit: string }> = {
  feeds: { label: "Active feeds", unit: "feeds" },
  payroll_entities: { label: "Payroll entities", unit: "entities" },
  seats: { label: "People", unit: "people" },
};

export async function getBillingSummary(
  input: z.input<typeof SummarySchema>
): Promise<Result<BillingSummary, BillingServiceError>> {
  const parsed = SummarySchema.safeParse(input);
  if (!parsed.success) {
    return unknownError("Failed to load billing summary.");
  }
  if (parsed.data.actingRole !== "owner") {
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
      hasUpgradeFlow: false,
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
    const overview = await getBillingOverview(input.clerkOrgId);
    if (!overview.ok) {
      return {
        ok: false,
        error: {
          code: "subscription_not_found",
          message: "No billing subscription is configured for this account.",
        },
      };
    }

    const usageItems = overview.value.usage.map((item) => ({
      currentValue: item.current,
      label: LIMIT_DISPLAY[item.limitType].label,
      limit: item.limit === UNLIMITED ? null : item.limit,
      metricKey: item.limitType,
      unit: LIMIT_DISPLAY[item.limitType].unit,
    }));

    return {
      ok: true,
      value: {
        isOverLimit: usageItems.some(
          (item) => item.limit !== null && item.currentValue > item.limit
        ),
        plan: {
          currentPeriodEnd: overview.value.currentPeriodEnd,
          key: overview.value.clerkPlanKey ?? "",
          label: overview.value.planName,
          seatsPurchased: overview.value.seatsPurchased,
          status: overview.value.status,
        },
        usage: usageItems,
      },
    };
  } catch {
    return unknownError("Failed to load billing summary.");
  }
}

function unknownError(message: string): Result<never, BillingServiceError> {
  return { ok: false, error: { code: "unknown_error", message } };
}
