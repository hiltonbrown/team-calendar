import type { CSSProperties } from "react";
import { Fragment } from "react";

// An abstract, ambient depiction of the product: a team week of availability.
// Sage = in office / Xero-synced, lavender = manual (WFH), hollow = away. One
// cell quietly switches status on a loop so the panel feels alive. Purely
// decorative, so the whole block is aria-hidden.

type Status = "in" | "wfh" | "off" | "live";

const DAYS = [
  { id: "mon", label: "M" },
  { id: "tue", label: "T" },
  { id: "wed", label: "W" },
  { id: "thu", label: "T" },
  { id: "fri", label: "F" },
] as const;

const PEOPLE: ReadonlyArray<{
  readonly id: string;
  readonly nameWidth: string;
  readonly week: readonly [Status, Status, Status, Status, Status];
}> = [
  { id: "p1", nameWidth: "68%", week: ["in", "in", "wfh", "in", "off"] },
  { id: "p2", nameWidth: "52%", week: ["in", "wfh", "in", "in", "in"] },
  { id: "p3", nameWidth: "60%", week: ["off", "in", "in", "wfh", "in"] },
  { id: "p4", nameWidth: "46%", week: ["in", "in", "live", "off", "wfh"] },
  { id: "p5", nameWidth: "58%", week: ["wfh", "in", "in", "in", "in"] },
];

const FILL: Record<Exclude<Status, "live">, string> = {
  in: "var(--auth-in)",
  wfh: "var(--auth-wfh)",
  off: "transparent",
};

const StatusDot = ({
  status,
  delay,
}: {
  readonly status: Status;
  readonly delay: number;
}) => {
  if (status === "live") {
    return (
      <span className="relative inline-flex size-2.5">
        <span
          className="auth-cell absolute inset-0 rounded-full"
          style={{
            animationDelay: `${delay}ms`,
            backgroundColor: "var(--auth-in)",
          }}
        />
        <span
          className="auth-live absolute inset-0 rounded-full"
          style={{ backgroundColor: "var(--auth-wfh)" }}
        />
      </span>
    );
  }

  const style: CSSProperties = {
    animationDelay: `${delay}ms`,
    backgroundColor: FILL[status],
  };
  if (status === "off") {
    style.boxShadow = "inset 0 0 0 1.5px var(--auth-off)";
  }

  return <span className="auth-cell size-2.5 rounded-full" style={style} />;
};

export const AvailabilityGrid = () => (
  <div
    aria-hidden="true"
    className="grid w-full max-w-[340px] grid-cols-[84px_repeat(5,1fr)] items-center gap-x-3 gap-y-4"
  >
    <span />
    {DAYS.map((day) => (
      <span
        className="text-center font-medium text-label-sm"
        key={day.id}
        style={{ color: "var(--auth-ink-soft)" }}
      >
        {day.label}
      </span>
    ))}

    {PEOPLE.map((person, rowIndex) => (
      <Fragment key={person.id}>
        <div className="flex items-center gap-2">
          <span
            className="auth-cell size-4 shrink-0 rounded-full"
            style={{
              animationDelay: `${rowIndex * 50 + 250}ms`,
              backgroundColor: "var(--auth-ink-faint)",
            }}
          />
          <span
            className="auth-glyph-bar h-1.5 rounded-full"
            style={{
              animationDelay: `${rowIndex * 50 + 300}ms`,
              backgroundColor: "var(--auth-ink-faint)",
              width: person.nameWidth,
            }}
          />
        </div>
        {person.week.map((status, colIndex) => (
          <span
            className="flex justify-center"
            key={`${person.id}-${DAYS[colIndex].id}`}
          >
            <StatusDot
              delay={(rowIndex + colIndex) * 45 + 350}
              status={status}
            />
          </span>
        ))}
      </Fragment>
    ))}
  </div>
);
