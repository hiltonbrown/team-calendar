import type { EmployeeDashboardView } from "@repo/availability";
import type { ReactNode } from "react";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeader } from "./dashboard-header";

interface DashboardScaffoldProps {
  banner?: ReactNode;
  header: {
    name: string;
    roleLabel: string;
    subtitle: string;
  };
  lead: ReactNode;
  rail: ReactNode;
}

/**
 * Shared shell for every role dashboard: contextual header, optional banner, then
 * the asymmetric lead/rail grid. Each role composes its own lead and rail so the
 * primary content leads rather than every card sharing one uniform grid.
 */
export function DashboardScaffold({
  banner,
  header,
  lead,
  rail,
}: DashboardScaffoldProps) {
  return (
    <div className="space-y-6">
      <DashboardHeader
        name={header.name}
        roleLabel={header.roleLabel}
        subtitle={header.subtitle}
      />
      {banner}
      <DashboardGrid lead={lead} rail={rail} />
    </div>
  );
}

export function toDashboardHeaderProps(
  header: EmployeeDashboardView["header"]
) {
  return {
    name: `${header.firstName} ${header.lastName}`,
    roleLabel: header.roleLabel,
    subtitle: header.locationName
      ? `${header.locationName}${header.timezone ? `, ${header.timezone}` : ""}`
      : "Your dashboard summary",
  };
}
