import { Button } from "@repo/design-system/components/ui/button";
import { Card, CardContent } from "@repo/design-system/components/ui/card";
import Link from "next/link";
import { DashboardHeader } from "./dashboard-header";

export function ViewerView() {
  return (
    <div className="space-y-6">
      <DashboardHeader
        name="Welcome"
        roleLabel="Viewer"
        subtitle="Your account does not have a person profile in this organisation yet. Contact the account owner if this looks wrong."
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
              <Link href="/settings">Organisation settings</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/people">View people</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
