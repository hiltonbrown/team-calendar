import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";

export const Default = () => (
  <Card className="w-96">
    <CardHeader>
      <CardTitle>Annual leave</CardTitle>
      <CardDescription>
        12 Jan 2026 &ndash; 16 Jan 2026 &middot; 5 days
      </CardDescription>
      <CardAction>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground text-sm">
        Requested by Priya Nair. Awaiting approval from your manager.
      </p>
    </CardContent>
    <CardFooter className="gap-2">
      <Button size="sm">Approve</Button>
      <Button size="sm" variant="outline">
        Decline
      </Button>
    </CardFooter>
  </Card>
);

export const WithoutFooter = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Public holiday</CardTitle>
      <CardDescription>Australia Day &middot; 26 Jan 2026</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground text-sm">
        Automatically applied to all Sydney-based staff.
      </p>
    </CardContent>
  </Card>
);
