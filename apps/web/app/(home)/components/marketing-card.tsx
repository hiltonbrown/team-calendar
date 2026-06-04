import type { ReactNode } from "react";

export const MarketingCard = ({
  children,
  tier = "container",
}: {
  children: ReactNode;
  tier?: "container" | "low";
}) => (
  <div className={`marketing-card marketing-card--${tier}`}>{children}</div>
);
