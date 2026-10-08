import { log } from "@repo/observability/log";
import type { RateLimitDeniedReason } from "./rate-limit/limiter";
import type { XeroRateClass } from "./rate-limit/shared-store";
import type { XeroRecoveryReason } from "./write/types";
export type XeroMetricName =
  | "xero.binding.permission_required"
  | "xero.admission.denied"
  | "xero.store.unavailable"
  | "xero.fetch.deadline_exceeded";
export type XeroMetricLabels = Partial<{
  reason: XeroRecoveryReason | RateLimitDeniedReason;
  class: XeroRateClass["kind"];
}>;
const names = new Set<string>([
  "xero.binding.permission_required",
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
  "reauthorise",
  "update_permissions",
  "retry_later",
  "access_denied",
  "operational_incident",
  "not_connected",
  "outcome_unknown",
]);
const classes = new Set<string>(["tenant", "token", "user_inventory"]);
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
  try {
    log.info("Xero lifecycle metric", { metric: name, value, ...safe });
  } catch {
    /* Observability must not change a lifecycle outcome. */
  }
}
