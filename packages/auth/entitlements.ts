import "server-only";

import type {
  AppError,
  ClerkOrgId,
  FeatureKey,
  LimitType,
  OrganisationId,
  Result,
} from "@repo/core";
import { appError } from "@repo/core";
import {
  getPlanLimits,
  getSubscriptionForOrg,
  getUsageCounter,
  UNLIMITED,
} from "@repo/database";

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
}

/**
 * Generic boolean feature gate. Defers entirely to Clerk plan features, which
 * are the authority for analytics, priority_support, and any future boolean
 * feature. Adding a feature is a Clerk Dashboard change plus a call to this
 * helper at the gate; no new per-feature helper is needed.
 */
export async function hasFeature(feature: FeatureKey): Promise<boolean> {
  // Imported lazily so modules that only need withinLimit (feeds, availability)
  // do not pull the Clerk server runtime into their test loads.
  const { auth } = await import("@clerk/nextjs/server");
  const { has } = await auth();
  return has({ feature });
}

/**
 * Generic hard-limit gate. Reads the org's counted usage and the current plan's
 * limit for limitType, then reports whether one more unit may be created.
 *
 * A limit of -1 is unlimited. Adding a new hard limit is an enum value plus a
 * PLAN_CATALOGUE row plus a recount case; this logic does not change.
 *
 * Fails open (allowed) when no subscription or limit is configured so existing
 * flows are not blocked before billing is set up. Reads usage_counters, which
 * the recount-usage job keeps current; enforcement is therefore eventually
 * consistent with the live row count.
 */
export async function withinLimit(
  clerkOrgId: ClerkOrgId | string,
  organisationId: OrganisationId | string,
  limitType: LimitType
): Promise<Result<LimitCheck, AppError>> {
  if (!(clerkOrgId && organisationId)) {
    return {
      ok: false,
      error: appError("bad_request", "Tenant context is required."),
    };
  }

  try {
    const subscription = await getSubscriptionForOrg(clerkOrgId);
    if (!subscription) {
      // No plan assigned yet: do not block creation.
      const current = await getUsageCounter(clerkOrgId, limitType);
      return {
        ok: true,
        value: { allowed: true, current, limit: UNLIMITED },
      };
    }

    const clerkPlanKey = subscription.clerk_plan_key ?? subscription.plan_key;
    const [limits, current] = await Promise.all([
      getPlanLimits(clerkPlanKey),
      getUsageCounter(clerkOrgId, limitType),
    ]);

    const limit = limits[limitType];
    const allowed = limit === UNLIMITED || current < limit;
    return { ok: true, value: { allowed, current, limit } };
  } catch (error) {
    // Callers (for example createFeed) invoke withinLimit outside their own
    // try/catch, so a Prisma failure must not bubble. Surface an internal error
    // they can map; the gate treats a non-ok result as "do not block".
    return {
      ok: false,
      error: appError(
        "internal",
        error instanceof Error ? error.message : "Failed to read usage limit."
      ),
    };
  }
}
