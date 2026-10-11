import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ThemeProvider,
} from "@repo/design-system";

const Sample = () => (
  <Card className="w-[380px]">
    <CardHeader>
      <div>
        <CardTitle>Tom Nguyen</CardTitle>
        <CardDescription>Personal leave, Tuesday 21 Oct</CardDescription>
      </div>
      <CardAction>
        <Badge variant="outline">Submitted</Badge>
      </CardAction>
    </CardHeader>
    <CardContent className="flex gap-2">
      <Button size="sm">Approve</Button>
      <Button size="sm" variant="outline">
        Decline
      </Button>
    </CardContent>
  </Card>
);

export const Light = () => (
  <ThemeProvider forcedTheme="light">
    <Sample />
  </ThemeProvider>
);

export const DarkScope = () => (
  <ThemeProvider forcedTheme="light">
    <div className="dark bg-background text-foreground w-fit rounded-[20px] p-4">
      <Sample />
    </div>
  </ThemeProvider>
);
