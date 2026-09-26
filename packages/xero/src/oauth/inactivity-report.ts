import type { Result } from "@repo/core";
import {
  listXeroInactivitySignals,
  recordXeroInactivityClassification,
} from "@repo/database/queries/xero-inactivity-signals";
import {
  classifyXeroInactivity,
  XERO_INACTIVITY_POLICY_VERSION,
} from "./inactivity-policy";
export async function buildXeroInactivityReport(input: {
  clerkOrgId: string;
  organisationId: string;
  now: Date;
}): Promise<
  Result<
    Record<"active" | "unknown" | "candidate", number>,
    { code: "inactivity_report_failed"; message: string }
  >
> {
  try {
    const signals = await listXeroInactivitySignals(input);
    const counts = { active: 0, candidate: 0, unknown: 0 };
    for (const signal of signals) {
      const classification = classifyXeroInactivity({
        ...signal,
        now: input.now,
      });
      await recordXeroInactivityClassification({
        ...input,
        policyVersion: XERO_INACTIVITY_POLICY_VERSION,
        xeroTenantId: signal.xeroTenantId,
        ...classification,
      });
      counts[classification.kind] += 1;
    }
    return { ok: true, value: counts };
  } catch {
    return {
      error: {
        code: "inactivity_report_failed",
        message: "Xero inactivity report could not be recorded.",
      },
      ok: false,
    };
  }
}
