import type { EmployeeDashboardView } from "@repo/availability";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/states/empty-state";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { formatDateTime } from "./dashboard-format";

interface BalancesCardProps {
  orgQueryValue: string | null;
  personId: string;
  state: EmployeeDashboardView["balances"];
}

export function BalancesCard({
  state,
  personId,
  orgQueryValue,
}: BalancesCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell
        ctaHref={`/people/${personId}`}
        ctaLabel="View profile"
        description="Current leave balances"
        orgQueryValue={orgQueryValue}
        title="Balances"
      >
        <DashboardCardError entityName="balances" />
      </DashboardCardShell>
    );
  }

  let content: ReactNode;

  if (!state.data.hasActiveXeroConnection) {
    content = (
      <EmptyState
        description="Balance syncing becomes available after Xero is connected."
        title="Balance unavailable"
      />
    );
  } else if (!state.data.isXeroLinked) {
    content = (
      <EmptyState
        description="This person is not linked to a Xero employee record."
        title="Balance unavailable"
      />
    );
  } else if (state.data.rows.length === 0) {
    content = (
      <EmptyState
        description="No balance rows are available yet."
        title="No balances"
      />
    );
  } else {
    content = (
      <div className="space-y-3 text-body-sm">
        {state.data.rows.map((row) => (
          <div className="flex items-center justify-between gap-4" key={row.id}>
            <span>{row.leaveTypeName ?? row.recordType ?? "Leave"}</span>
            <span className="font-medium">
              {row.balanceUnits} {row.unitType ?? ""}
            </span>
          </div>
        ))}
        {state.data.lastFetchedAt ? (
          <p className="text-label-md text-muted-foreground">
            Last updated {formatDateTime(state.data.lastFetchedAt)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <DashboardCardShell
      ctaHref={`/people/${personId}`}
      ctaLabel="View profile"
      description="Current leave balances"
      orgQueryValue={orgQueryValue}
      title="Balances"
    >
      {content}
    </DashboardCardShell>
  );
}
