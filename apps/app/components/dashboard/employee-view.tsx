import type { EmployeeDashboardView } from "@repo/availability";
import { ActionItemsCard } from "./action-items-card";
import { buildPersonalCalendarTimeline } from "./ambient-calendar-data";
import { AmbientCalendarField } from "./ambient-calendar-field";
import { BalancesCard } from "./balances-card";
import {
  DashboardScaffold,
  toDashboardHeaderProps,
} from "./dashboard-scaffold";
import { NextPublicHolidayCard } from "./next-public-holiday-card";
import { QuickActionsCard } from "./quick-actions-card";
import { XeroDisconnectedBanner } from "./xero-disconnected-banner";

interface EmployeeViewProps {
  orgQueryValue: string | null;
  personId: string;
  view: EmployeeDashboardView;
}
export function EmployeeView({
  view,
  orgQueryValue,
  personId,
}: EmployeeViewProps) {
  const xero = view.header.xeroConnectionState === "connected";
  const timeline = buildPersonalCalendarTimeline(view, {
    now: new Date(),
    timezone: view.header.timezone ?? "Australia/Brisbane",
  });
  return (
    <DashboardScaffold
      banner={
        xero ? null : (
          <XeroDisconnectedBanner
            connectHref="/settings/integrations"
            orgQueryValue={orgQueryValue}
            xeroConnectionState={view.header.xeroConnectionState}
          />
        )
      }
      feature={
        <AmbientCalendarField model={timeline} orgQueryValue={orgQueryValue} />
      }
      header={toDashboardHeaderProps(view.header)}
      lead={
        <ActionItemsCard
          orgQueryValue={orgQueryValue}
          state={view.actionItems}
        />
      }
      rail={
        <>
          <QuickActionsCard orgQueryValue={orgQueryValue} />
          <NextPublicHolidayCard
            orgQueryValue={orgQueryValue}
            state={view.publicHolidays}
          />
          {xero ? (
            <BalancesCard
              orgQueryValue={orgQueryValue}
              personId={personId}
              state={view.balances}
            />
          ) : null}
        </>
      }
    />
  );
}
