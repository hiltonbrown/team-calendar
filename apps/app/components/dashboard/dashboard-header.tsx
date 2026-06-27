import { Badge } from "@repo/design-system/components/ui/badge";

interface DashboardHeaderProps {
  name: string;
  roleLabel: string;
  subtitle?: string;
}

export function DashboardHeader({
  name,
  roleLabel,
  subtitle,
}: DashboardHeaderProps) {
  return (
    <section className="-mx-6 bg-surface-container-low px-6 py-8">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-balance font-semibold text-display-sm leading-tight tracking-tight">
            {name}
          </h2>
          <Badge variant="outline">{roleLabel}</Badge>
        </div>
        {subtitle ? (
          <p className="text-body-lg text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </section>
  );
}
