import type { ReactNode } from "react";

/**
 * Semantic tone for a dashboard metric, per DESIGN.md's "colour carries meaning":
 * sage for available/healthy, lavender for manual/informational, red for failures.
 * Neutral is the default; reserve a tone for values that genuinely signal something.
 *
 * A metric is a stat, not a card. DESIGN.md prohibits nested cards and
 * hero-metric card grids, so tone reads through the value's colour and a
 * labelled status dot rather than a filled panel inside the parent card.
 */
export type MetricTone = "danger" | "info" | "neutral" | "positive";

const valueToneClassName: Record<MetricTone, string> = {
  danger: "text-destructive",
  info: "text-editorial-accent",
  neutral: "text-foreground",
  positive: "text-primary",
};

const dotToneClassName: Record<MetricTone, string> = {
  danger: "bg-destructive",
  info: "bg-editorial-accent",
  neutral: "",
  positive: "bg-primary",
};

interface MetricTileProps {
  label: string;
  tone?: MetricTone;
  value: ReactNode;
}

export function MetricTile({
  label,
  value,
  tone = "neutral",
}: MetricTileProps) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 font-medium text-label-md text-muted-foreground">
        {tone === "neutral" ? null : (
          <span
            aria-hidden="true"
            className={`size-1.5 shrink-0 rounded-full ${dotToneClassName[tone]}`}
          />
        )}
        <span className="truncate">{label}</span>
      </p>
      <p className={`font-semibold text-body-lg ${valueToneClassName[tone]}`}>
        {value}
      </p>
    </div>
  );
}
