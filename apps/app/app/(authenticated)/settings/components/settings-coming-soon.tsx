import { Card, CardContent } from "@repo/design-system/components/ui/card";
import { LockIcon } from "lucide-react";

interface SettingsComingSoonProps {
  feature: string;
}

export const SettingsComingSoon = ({ feature }: SettingsComingSoonProps) => (
  <Card className="rounded-2xl border-dashed bg-muted/40">
    <CardContent className="flex items-center gap-3 p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <LockIcon
          className="h-4 w-4 text-muted-foreground"
          strokeWidth={1.75}
        />
      </div>
      <div>
        <p className="font-medium text-body-sm">{feature}</p>
        <p className="text-label-md text-muted-foreground">
          Not available in the manual MVP
        </p>
      </div>
    </CardContent>
  </Card>
);
