import type { DashboardMyRequest, DashboardSection } from "@repo/availability";
import { getAvailabilityRecordLabel } from "@repo/core";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { StatusChip } from "./dashboard-chips";
import { formatRecordDates, formatWorkingDays } from "./dashboard-format";

const TITLE = "My requests";
const PLANS_HREF = "/plans?tab=my";

interface MyRequestsProps {
  orgQueryValue: string | null;
  state: DashboardSection<{ records: DashboardMyRequest[] }>;
  timezone: string;
}

/** The viewer's upcoming requests. Hidden when there are none. */
export function MyRequests({
  orgQueryValue,
  state,
  timezone,
}: MyRequestsProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell orgQueryValue={orgQueryValue} title={TITLE}>
        <DashboardCardError entityName="requests" />
      </DashboardCardShell>
    );
  }
  if (state.data.records.length === 0) {
    return null;
  }
  return (
    <DashboardCardShell
      ctaHref={PLANS_HREF}
      ctaLabel="View all"
      orgQueryValue={orgQueryValue}
      title={TITLE}
    >
      <ul className="space-y-2">
        {state.data.records.map((record) => (
          <MyRequestItem
            key={record.recordId}
            orgQueryValue={orgQueryValue}
            record={record}
            timezone={timezone}
          />
        ))}
      </ul>
    </DashboardCardShell>
  );
}

function MyRequestItem({
  orgQueryValue,
  record,
  timezone,
}: {
  orgQueryValue: string | null;
  record: DashboardMyRequest;
  timezone: string;
}) {
  const label = getAvailabilityRecordLabel(record.recordType);
  const meta = [
    formatRecordDates(record, timezone),
    record.dayCount === null ? null : formatWorkingDays(record.dayCount),
  ].filter((part): part is string => Boolean(part));
  const action = requestAction(record);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface-container-low px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-on-surface text-title-sm">
            {label}
          </span>
          <StatusChip status={record.approvalStatus} />
        </div>
        <p className="text-body-sm text-on-surface-variant">
          {meta.join(" · ")}
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link
          aria-label={`${action.label} ${label.toLowerCase()}, ${meta[0]}`}
          href={withOrg(action.href, orgQueryValue)}
        >
          {action.label}
        </Link>
      </Button>
    </li>
  );
}

/** Withdraw for submitted, Edit for approved manual records, else View. */
function requestAction(record: DashboardMyRequest): {
  href: string;
  label: string;
} {
  if (record.canWithdraw) {
    return { href: PLANS_HREF, label: "Withdraw" };
  }
  if (record.canEdit) {
    return {
      href: `/plans/${encodeURIComponent(record.recordId)}/edit`,
      label: "Edit",
    };
  }
  return { href: PLANS_HREF, label: "View" };
}
