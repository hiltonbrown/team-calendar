import type { ReactNode } from "react";

interface SettingsSectionHeaderProps {
  action?: ReactNode;
  description: string;
  title: string;
}

export const SettingsSectionHeader = ({
  title,
  description,
  action,
}: SettingsSectionHeaderProps) => (
  <div className="flex items-start justify-between gap-4 pb-6">
    <div className="space-y-1">
      <p className="font-medium text-label-sm text-muted-foreground uppercase tracking-wider">
        Configuration
      </p>
      <h2 className="font-semibold text-title-lg tracking-tight">{title}</h2>
      <p className="text-body-sm text-muted-foreground">{description}</p>
    </div>
    {action ? <div className="shrink-0 pt-1">{action}</div> : null}
  </div>
);
