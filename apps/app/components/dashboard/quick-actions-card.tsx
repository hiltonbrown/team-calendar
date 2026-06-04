import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { DashboardCardShell } from "./dashboard-card-shell";

interface QuickActionsCardProps {
  orgQueryValue: string | null;
}

export function QuickActionsCard({ orgQueryValue }: QuickActionsCardProps) {
  return (
    <DashboardCardShell
      description="Common dashboard shortcuts"
      orgQueryValue={orgQueryValue}
      title="Quick actions"
    >
      <div className="grid gap-3 text-sm">
        <Link
          className="rounded-xl bg-muted px-4 py-3 font-medium"
          href={withOrg("/plans/new", orgQueryValue)}
        >
          Create a new plan
        </Link>
        <Link
          className="rounded-xl bg-muted px-4 py-3 font-medium"
          href={withOrg("/calendar?scopeType=my_self", orgQueryValue)}
        >
          View my calendar
        </Link>
        <Link
          className="rounded-xl bg-muted px-4 py-3 font-medium"
          href={withOrg("/notifications", orgQueryValue)}
        >
          Open notifications
        </Link>
      </div>
    </DashboardCardShell>
  );
}
