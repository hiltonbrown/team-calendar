import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent } from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { formatFullDate } from "./dashboard-format";
import { DashboardHeader } from "./dashboard-header";
import { DEFAULT_DASHBOARD_TIMEZONE } from "./dashboard-view-state";

interface ViewerViewProps {
  now: Date;
  orgQueryValue: string | null;
}

export function ViewerView({ now, orgQueryValue }: ViewerViewProps) {
  return (
    <div className="space-y-6">
      <DashboardHeader
        dateLabel={formatFullDate(now, DEFAULT_DASHBOARD_TIMEZONE)}
        locationLabel={null}
        orgQueryValue={orgQueryValue}
        scopeLine="Your account does not have a person profile in this organisation yet. Contact the account owner if this looks wrong."
      />
      <Card className="rounded-xl">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold">What you can do</h3>
          <ul className="list-inside list-disc space-y-1 text-label-lg text-muted-foreground">
            <li>Ask an admin to create your person profile in People</li>
            <li>Or ask to be invited to a different organisation</li>
          </ul>
          <div className="flex gap-2 pt-2">
            <Button asChild size="sm" variant="secondary">
              <Link href={withOrg("/settings", orgQueryValue)}>
                Organisation settings
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={withOrg("/people", orgQueryValue)}>View people</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
