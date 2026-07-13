import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";

export const Default = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Leave balance</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground text-sm">
        14.5 days annual leave remaining, accrued to 30 Jun 2026.
      </p>
    </CardContent>
  </Card>
);
