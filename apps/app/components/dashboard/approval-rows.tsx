import type {
  DashboardApprovalQueue,
  DashboardApprovalRow,
  DashboardSection,
} from "@repo/availability";
import { getAvailabilityRecordLabel } from "@repo/core";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { ProvenanceChip } from "./dashboard-chips";
import { formatRecordDates, formatWorkingDays } from "./dashboard-format";

const APPROVALS_HREF = "/leave-approvals?status=submitted";
const DAY_MS = 86_400_000;

interface ApprovalRowsProps {
  now: Date;
  orgQueryValue: string | null;
  state: DashboardSection<DashboardApprovalQueue>;
  timezone: string;
  /** "Waiting for your approval" or "Waiting for approval". */
  title: string;
}

export function ApprovalRows({
  now,
  orgQueryValue,
  state,
  timezone,
  title,
}: ApprovalRowsProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell orgQueryValue={orgQueryValue} title={title}>
        <DashboardCardError entityName="approvals" />
      </DashboardCardShell>
    );
  }
  const { count, rows } = state.data;
  if (rows.length === 0) {
    return (
      <DashboardCardShell
        ctaHref={APPROVALS_HREF}
        ctaLabel="Open approvals"
        orgQueryValue={orgQueryValue}
        title={title}
      >
        <p className="text-body-sm text-on-surface-variant">
          No requests are waiting.
        </p>
      </DashboardCardShell>
    );
  }
  return (
    <DashboardCardShell
      ctaHref={APPROVALS_HREF}
      ctaLabel="View all"
      orgQueryValue={orgQueryValue}
      title={`${title} (${count})`}
    >
      <ul className="space-y-2">
        {rows.map((row) => (
          <ApprovalRowItem
            key={row.recordId}
            now={now}
            orgQueryValue={orgQueryValue}
            row={row}
            timezone={timezone}
          />
        ))}
      </ul>
    </DashboardCardShell>
  );
}

function ApprovalRowItem({
  now,
  orgQueryValue,
  row,
  timezone,
}: {
  now: Date;
  orgQueryValue: string | null;
  row: DashboardApprovalRow;
  timezone: string;
}) {
  const name = `${row.personFirstName} ${row.personLastName}`;
  const label = getAvailabilityRecordLabel(row.recordType);
  const meta = [
    label,
    formatRecordDates(row, timezone),
    row.durationWorkingDays === null
      ? null
      : formatWorkingDays(row.durationWorkingDays),
  ].filter((part): part is string => Boolean(part));
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-surface-container-low px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium text-on-surface text-title-sm">
          {name}
        </p>
        <p className="text-body-sm text-on-surface-variant">
          {meta.join(" · ")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceChip sourceType={row.sourceType} />
          <span className="text-label-md text-on-surface-variant">
            {waitingLabel(row.submittedAt, now)}
          </span>
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link
          aria-label={`Review ${name}'s ${label.toLowerCase()} request`}
          href={withOrg(APPROVALS_HREF, orgQueryValue)}
        >
          Review
        </Link>
      </Button>
    </li>
  );
}

/** "Submitted today", "Waiting 1 day" or "Waiting 3 days". */
export function waitingLabel(submittedAt: Date | null, now: Date): string {
  if (!submittedAt) {
    return "Waiting";
  }
  const days = Math.max(
    0,
    Math.floor((now.getTime() - submittedAt.getTime()) / DAY_MS)
  );
  if (days === 0) {
    return "Submitted today";
  }
  return days === 1 ? "Waiting 1 day" : `Waiting ${days} days`;
}
