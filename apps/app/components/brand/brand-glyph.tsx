import type { CSSProperties } from "react";

interface BrandGlyphProps {
  // Stagger the three bars in on first paint.
  readonly animated?: boolean;
  readonly className?: string;
  // Render for the deep brand panel: drop the light tile, use light sage bars.
  readonly onDark?: boolean;
}

const DARK_BARS = [
  "var(--auth-glyph-1)",
  "var(--auth-glyph-2)",
  "var(--auth-glyph-3)",
] as const;

// Mirrors apps/app/app/icon.svg: brand artwork with fixed tones on a light tile.
const LIGHT_TILE = "#f6f1ff";
const LIGHT_BARS = ["#57624f", "#cae8bc", "#6da671"] as const;

export const BrandGlyph = ({
  className,
  onDark = false,
  animated = false,
}: BrandGlyphProps) => {
  const bars = onDark ? DARK_BARS : LIGHT_BARS;
  const barClass = animated ? "auth-glyph-bar" : undefined;
  const barDelay = (index: number): CSSProperties | undefined =>
    animated ? { animationDelay: `${index * 110 + 150}ms` } : undefined;

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 48 48"
    >
      {onDark ? null : (
        <rect fill={LIGHT_TILE} height="48" rx="11" width="48" />
      )}
      <rect
        className={barClass}
        fill={bars[0]}
        height="9"
        rx="4.5"
        style={barDelay(0)}
        width="28"
        x="8"
        y="8"
      />
      <rect
        className={barClass}
        fill={bars[1]}
        height="9"
        rx="4.5"
        style={barDelay(1)}
        width="28"
        x="14"
        y="20"
      />
      <rect
        className={barClass}
        fill={bars[2]}
        height="9"
        rx="4.5"
        style={barDelay(2)}
        width="25"
        x="6"
        y="32"
      />
    </svg>
  );
};
