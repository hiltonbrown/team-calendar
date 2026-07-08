import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";

export const Default = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Long service leave</CardTitle>
    </CardHeader>
    <CardFooter className="gap-2">
      <Button size="sm">Approve</Button>
      <Button size="sm" variant="outline">
        Decline
      </Button>
    </CardFooter>
  </Card>
);
