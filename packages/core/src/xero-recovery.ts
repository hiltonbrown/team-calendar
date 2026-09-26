export type XeroConnectionState =
  | "connected"
  | "not_connected"
  | "disconnect_pending"
  | "reauthorisation_required";

export type XeroConnectionDisplayState = XeroConnectionState | "unavailable";

export type XeroRecoveryReason =
  | "update_permissions"
  | "reauthorise"
  | "access_denied"
  | "operational_incident"
  | "retry_later"
  | "outcome_unknown"
  | "not_connected";

export function xeroRecoveryMessage(
  reason: XeroRecoveryReason | XeroConnectionDisplayState,
  options: { retryAfterMs?: number; now?: Date } = {}
): string {
  switch (reason) {
    case "connected":
      return "Xero is connected.";
    case "update_permissions":
      return "Update Xero permissions to continue.";
    case "reauthorise":
    case "reauthorisation_required":
      return "Xero access needs to be renewed.";
    case "access_denied":
      return "Xero declined this request. Check that the person who connected Xero still has payroll access.";
    case "retry_later": {
      if (options.retryAfterMs === undefined) {
        return "Xero is temporarily unavailable. Try again later.";
      }
      const time = new Date(
        (options.now ?? new Date()).getTime() + options.retryAfterMs
      ).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
      return `Xero is temporarily unavailable. Try again after ${time}.`;
    }
    case "outcome_unknown":
      return "We could not confirm whether Xero received this change. Check Xero before trying again.";
    case "operational_incident":
    case "unavailable":
      return "We cannot reach Xero right now. Try again later or contact support.";
    case "disconnect_pending":
      return "Sync stopped. Xero disconnection is pending.";
    case "not_connected":
      return "Connect Xero to sync your payroll data.";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function toXeroConnectionDisplayState(
  result: { ok: true; value: { state: XeroConnectionState } } | { ok: false }
): XeroConnectionDisplayState {
  return result.ok ? result.value.state : "unavailable";
}

export function xeroRecoveryMessageFromCode(value: string): string;
export function xeroRecoveryMessageFromCode(
  value: string | null
): string | null;
export function xeroRecoveryMessageFromCode(
  value: string | null
): string | null {
  switch (value) {
    case "connected":
    case "not_connected":
    case "disconnect_pending":
    case "reauthorisation_required":
    case "update_permissions":
    case "reauthorise":
    case "access_denied":
    case "operational_incident":
    case "retry_later":
    case "outcome_unknown":
    case "unavailable":
      return xeroRecoveryMessage(value);
    case "state_unavailable":
      return xeroRecoveryMessage("unavailable");
    default:
      return value;
  }
}
