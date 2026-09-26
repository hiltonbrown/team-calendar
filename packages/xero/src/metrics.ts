import { log } from "@repo/observability/log";
import type { RateLimitDeniedReason } from "./rate-limit/limiter";
import type { XeroRateClass } from "./rate-limit/shared-store";
import type { XeroRecoveryReason } from "./write/types";
export type XeroMetricName =
  | "xero.refresh.conflict"
  | "xero.refresh.failed"
  | "xero.binding.permission_required"
  | "xero.cleanup.unknown_oldest_age_hours"
  | "xero.admission.denied"
  | "xero.store.unavailable"
  | "xero.fetch.deadline_exceeded";
export type XeroMetricLabels = Partial<{
  reason: XeroRecoveryReason | RateLimitDeniedReason;
  class: XeroRateClass["kind"];
  outcome: "committed" | "superseded" | "lost_response" | "failed";
}>;
const names = new Set<string>([
  "xero.refresh.conflict",
  "xero.refresh.failed",
  "xero.binding.permission_required",
  "xero.cleanup.unknown_oldest_age_hours",
  "xero.admission.denied",
  "xero.store.unavailable",
  "xero.fetch.deadline_exceeded",
]);
const reasons = new Set<string>([
  "minute",
  "daily",
  "concurrency",
  "cooldown",
  "infrastructure",
  "credential_domain_mismatch",
  "reauthorise",
  "update_permissions",
  "retry_later",
  "access_denied",
  "operational_incident",
  "not_connected",
  "outcome_unknown",
]);
const classes = new Set<string>([
  "tenant",
  "token",
  "user_inventory",
  "app_management",
]);
const outcomes = new Set<string>([
  "committed",
  "superseded",
  "lost_response",
  "failed",
]);
export function emitXeroMetric(
  name: XeroMetricName,
  value: number,
  labels: XeroMetricLabels = {}
): void {
  if (!(names.has(name) && Number.isFinite(value)) || value < 0) {
    return;
  }
  const safe: XeroMetricLabels = {};
  if (labels.reason && reasons.has(labels.reason)) {
    safe.reason = labels.reason;
  }
  if (labels.class && classes.has(labels.class)) {
    safe.class = labels.class;
  }
  if (labels.outcome && outcomes.has(labels.outcome)) {
    safe.outcome = labels.outcome;
  }
  try {
    log.info("Xero lifecycle metric", { metric: name, value, ...safe });
  } catch {
    /* Observability must not change a lifecycle outcome. */
  }
}
