import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";

export const Default = () => (
  <Card className="w-96">
    <CardHeader>
      <CardTitle>Sick leave</CardTitle>
      <CardDescription>3 Mar 2026 &middot; 1 day</CardDescription>
      <CardAction>
        <Button size="sm" variant="ghost">
          Edit
        </Button>
      </CardAction>
    </CardHeader>
  </Card>
);
