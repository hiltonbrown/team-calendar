export const XERO_INACTIVITY_POLICY_VERSION = 1;
export interface XeroInactivityInputs {
  bindingReserved: boolean;
  feedLastUsedAt: Date | null | "unknown";
  lastHumanActivityAt: Date | null | "unknown";
  now: Date;
  onboardingComplete: boolean | "unknown";
  organisationArchived: boolean;
  subscriptionActive: boolean | "unknown";
  syncPaused: boolean;
}
export interface XeroInactivityClassification {
  kind: "active" | "unknown" | "candidate";
  reason: string;
}
const DAY_MS = 86_400_000;
function validActivity(value: Date | null | "unknown", now: number): boolean {
  return (
    value === null ||
    value === "unknown" ||
    (Number.isFinite(value.getTime()) && value.getTime() <= now)
  );
}
export function classifyXeroInactivity(
  inputs: XeroInactivityInputs
): XeroInactivityClassification {
  const now = inputs.now.getTime();
  const context = `; onboarding ${String(inputs.onboardingComplete)}`;
  const result = (
    kind: XeroInactivityClassification["kind"],
    reason: string
  ) => ({ kind, reason: reason + context });
  if (
    !(
      Number.isFinite(now) &&
      validActivity(inputs.feedLastUsedAt, now) &&
      validActivity(inputs.lastHumanActivityAt, now)
    )
  ) {
    return result("unknown", "invalid activity date");
  }
  // Thirty days exceeds the roughly two-hour origin/cache lag in feed last_used_at.
  if (
    inputs.feedLastUsedAt instanceof Date &&
    now - inputs.feedLastUsedAt.getTime() <= 30 * DAY_MS
  ) {
    return result("active", "calendar feed recently used");
  }
  if (inputs.syncPaused) {
    return result("active", "sync intentionally paused");
  }
  if (inputs.subscriptionActive === true) {
    return result("active", "active subscription");
  }
  if (
    inputs.lastHumanActivityAt instanceof Date &&
    now - inputs.lastHumanActivityAt.getTime() <= 90 * DAY_MS
  ) {
    return result("active", "recent human activity");
  }
  if (!inputs.bindingReserved) {
    return result("unknown", "binding not reserved");
  }
  if (inputs.feedLastUsedAt === "unknown") {
    return result("unknown", "feed use unknown");
  }
  if (
    inputs.subscriptionActive === "unknown" ||
    inputs.lastHumanActivityAt === "unknown"
  ) {
    return result("unknown", "subscription or human activity unknown");
  }
  if (inputs.organisationArchived) {
    return result("candidate", "organisation archived");
  }
  return result(
    "candidate",
    "known inactive subscription, feed and human activity"
  );
}
