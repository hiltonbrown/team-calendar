import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";

export const Default = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Parental leave</CardTitle>
      <CardAction>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </CardAction>
    </CardHeader>
  </Card>
);
