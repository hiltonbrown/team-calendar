import type {
  CoverageCell,
  CoverageCellState,
  CoverageIssue,
  CoverageMap,
  CoverageRow,
  DashboardSection,
} from "@repo/availability";
import { cn } from "@repo/design-system/lib/utils";
import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardError, DashboardCardShell } from "./dashboard-card-shell";
import { dateKeyParts, formatLongDateKey } from "./dashboard-format";

interface CoverageMapCardProps {
  orgQueryValue: string | null;
  state: DashboardSection<CoverageMap>;
}

const TITLE = "Coverage";
const FOOTNOTE =
  "Counts approved leave and time away, such as training, travel, client sites and other offices. Working from home counts as in.";

const CELL_TONES: Record<CoverageCellState, string> = {
  at_minimum: "bg-chart-4 text-on-surface",
  covered: "bg-surface-container text-on-surface",
  holiday: "bg-surface-container-high text-on-surface-variant",
  peak: "bg-warning-container text-on-warning-container",
  short: "bg-warning-container text-on-warning-container",
};

const KEY_ITEMS: Array<{ label: string; state: CoverageCellState }> = [
  { label: "Short or peak", state: "short" },
  { label: "At minimum", state: "at_minimum" },
  { label: "Covered", state: "covered" },
  { label: "Holiday", state: "holiday" },
];

export function CoverageMapCard({
  orgQueryValue,
  state,
}: CoverageMapCardProps) {
  if (state.status === "error") {
    return (
      <DashboardCardShell orgQueryValue={orgQueryValue} title={TITLE}>
        <DashboardCardError entityName="coverage" />
      </DashboardCardShell>
    );
  }
  const { days, firstIssue, rows } = state.data;
  return (
    <DashboardCardShell orgQueryValue={orgQueryValue} title={TITLE}>
      <div className="space-y-4">
        <p className="text-body-sm text-on-surface">
          {coverageSummary(firstIssue)}
        </p>
        {rows.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">
            No teams are in your scope yet.
          </p>
        ) : (
          <div className="space-y-3">
            <div aria-hidden="true" className="grid grid-cols-5 gap-1.5">
              {days.map((day) => {
                const parts = dateKeyParts(day.dateKey);
                return (
                  <span
                    className={cn(
                      "text-center font-medium text-label-sm uppercase tracking-wide",
                      day.isToday ? "text-primary" : "text-on-surface-variant"
                    )}
                    key={day.dateKey}
                  >
                    {parts.weekdayShort} {parts.day}
                  </span>
                );
              })}
            </div>
            <ul className="space-y-3">
              {rows.map((row) => (
                <CoverageTeamRow
                  key={row.teamId ?? "no-team"}
                  orgQueryValue={orgQueryValue}
                  row={row}
                />
              ))}
            </ul>
          </div>
        )}
        <CoverageKey />
        <p className="text-label-md text-on-surface-variant">{FOOTNOTE}</p>
      </div>
    </DashboardCardShell>
  );
}

/** The first shortfall or peak, or confirmation that every team is covered. */
export function coverageSummary(issue: CoverageIssue | null): string {
  if (!issue) {
    return "Every team is covered for the next five working days.";
  }
  const where = `${issue.teamName}, ${formatLongDateKey(issue.dateKey)}, ${issue.inCount} of ${issue.teamSize} in`;
  if (issue.state === "short") {
    return `Next shortfall: ${where} (minimum ${issue.minimum ?? 0})`;
  }
  return `Next peak absence: ${where}`;
}

function CoverageTeamRow({
  orgQueryValue,
  row,
}: {
  orgQueryValue: string | null;
  row: CoverageRow;
}) {
  return (
    <li className="space-y-1.5">
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-on-surface text-title-sm">
          {row.teamName}
        </span>
        <span className="shrink-0 text-label-md text-on-surface-variant">
          {row.minimum === null
            ? `${row.teamSize} people`
            : `${row.teamSize} people, minimum ${row.minimum}`}
        </span>
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {row.cells.map((cell) => (
          <CoverageCellView
            cell={cell}
            key={cell.dateKey}
            orgQueryValue={orgQueryValue}
            row={row}
          />
        ))}
      </div>
    </li>
  );
}

function CoverageCellView({
  cell,
  orgQueryValue,
  row,
}: {
  cell: CoverageCell;
  orgQueryValue: string | null;
  row: CoverageRow;
}) {
  const label = cellStateLabel(cell);
  const className = cn(
    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-sm px-1 py-1.5 text-center",
    CELL_TONES[cell.state]
  );
  const content = (
    <>
      <span className="font-semibold text-label-lg">
        {cell.state === "holiday"
          ? "Holiday"
          : `${cell.inCount} of ${row.teamSize}`}
      </span>
      {label && cell.state !== "holiday" ? (
        <span className="inline-flex items-center gap-1 text-label-sm leading-tight">
          {cell.state === "short" || cell.state === "peak" ? (
            <TriangleAlertIcon aria-hidden="true" className="size-3 shrink-0" />
          ) : null}
          {label}
        </span>
      ) : null}
    </>
  );
  const ariaLabel = coverageCellAriaLabel(row, cell);
  if (!row.teamId) {
    return (
      <div aria-label={ariaLabel} className={className} role="img">
        {content}
      </div>
    );
  }
  return (
    <Link
      aria-label={ariaLabel}
      className={cn(
        className,
        "outline-hidden transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none"
      )}
      href={withOrg(
        `/calendar?scopeType=team&scopeValue=${encodeURIComponent(row.teamId)}&view=day&anchor=${cell.dateKey}`,
        orgQueryValue
      )}
    >
      {content}
    </Link>
  );
}

function cellStateLabel(cell: CoverageCell): string | null {
  switch (cell.state) {
    case "short":
      return `Short by ${cell.shortBy}`;
    case "at_minimum":
      return "At minimum";
    case "peak":
      return "Peak";
    case "holiday":
      return "Holiday";
    default:
      return null;
  }
}

/** "Monday 12 October, Customer support: 1 of 3 in, short by 1". */
export function coverageCellAriaLabel(
  row: CoverageRow,
  cell: CoverageCell
): string {
  const prefix = `${formatLongDateKey(cell.dateKey)}, ${row.teamName}`;
  if (cell.state === "holiday") {
    return `${prefix}: public holiday`;
  }
  const value = `${prefix}: ${cell.inCount} of ${row.teamSize} in`;
  const label = cellStateLabel(cell);
  return label ? `${value}, ${label.toLowerCase()}` : value;
}

function CoverageKey() {
  return (
    <ul
      aria-label="Coverage key"
      className="flex flex-wrap gap-x-4 gap-y-2 text-label-md text-on-surface-variant"
    >
      {KEY_ITEMS.map((item) => (
        <li className="inline-flex items-center gap-2" key={item.state}>
          <span
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 rounded-[4px]",
              CELL_TONES[item.state]
            )}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
