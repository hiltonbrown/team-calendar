import type { EmployeeDashboardView } from "@repo/availability";

export const DEFAULT_DASHBOARD_TIMEZONE = "Australia/Brisbane";

/**
 * Balances show once Xero is connected, or to report a loading failure.
 * Connection state itself belongs to onboarding and Settings.
 */
export function showBalances(
  state: EmployeeDashboardView["balances"]
): boolean {
  return (
    state.status === "error" || state.data.xeroConnectionState === "connected"
  );
}
