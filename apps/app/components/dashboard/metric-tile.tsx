import type { ReactNode } from "react";

/**
 * Semantic tone for a dashboard metric, per DESIGN.md's "colour carries meaning":
 * sage for available/healthy, lavender for manual/informational, red for failures.
 * Neutral is the default; reserve a tone for values that genuinely signal something.
 */
export type MetricTone = "danger" | "info" | "neutral" | "positive";

const surfaceToneClassName: Record<MetricTone, string> = {
  danger: "bg-error-container text-on-error-container",
  info: "bg-accent-container text-on-accent-container",
  neutral: "bg-muted text-foreground",
  positive: "bg-secondary text-secondary-foreground",
};

const labelToneClassName: Record<MetricTone, string> = {
  danger: "text-on-error-container/80",
  info: "text-on-accent-container/80",
  neutral: "text-muted-foreground",
  positive: "text-secondary-foreground/80",
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
    <div className={`rounded-xl p-3 ${surfaceToneClassName[tone]}`}>
      <p className={`font-medium text-label-lg ${labelToneClassName[tone]}`}>
        {label}
      </p>
      <p className="font-semibold text-body-lg">{value}</p>
    </div>
  );
}
