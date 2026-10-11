import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/design-system";

export const Default = () => (
  <Card className="w-[380px]">
    <CardHeader>
      <div>
        <CardTitle>Upcoming leave</CardTitle>
        <CardDescription>Approved leave in the next 14 days</CardDescription>
      </div>
      <CardAction>
        <Button size="sm" variant="ghost">
          View all
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Priya Shah</span>
        <span className="text-muted-foreground">Annual leave, 14 to 18 Oct</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Tom Nguyen</span>
        <span className="text-muted-foreground">Personal leave, 21 Oct</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Grace Walker</span>
        <span className="text-muted-foreground">Long service, 23 Oct to 3 Nov</span>
      </div>
    </CardContent>
  </Card>
);

export const WithFooter = () => (
  <Card className="w-[380px]">
    <CardHeader>
      <CardTitle>Annual leave balance</CardTitle>
      <CardDescription>Synced from Xero Payroll this morning</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-headline-md font-semibold">
        112.4 <span className="text-body-md text-muted-foreground font-normal">hours</span>
      </p>
    </CardContent>
    <CardFooter className="gap-2">
      <Button>Request leave</Button>
      <Button variant="outline">History</Button>
    </CardFooter>
  </Card>
);

export const Plain = () => (
  <div className="bg-surface-container-high w-[380px] rounded-xl p-4">
    <Card variant="plain">
      <CardHeader>
        <div>
          <CardTitle>Sync health</CardTitle>
          <CardDescription>Last full reconciliation 2 hours ago</CardDescription>
        </div>
        <CardAction>
          <Badge variant="secondary">Healthy</Badge>
        </CardAction>
      </CardHeader>
    </Card>
  </div>
);
