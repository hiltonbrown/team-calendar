import { Calendar, Card, CardContent } from "@repo/design-system";

const october = new Date(2026, 9, 1);

export const Single = () => (
  <Calendar
    className="rounded-lg border"
    defaultMonth={october}
    mode="single"
    selected={new Date(2026, 9, 14)}
  />
);

export const Range = () => (
  <Calendar
    className="rounded-lg border"
    defaultMonth={october}
    mode="range"
    selected={{ from: new Date(2026, 9, 12), to: new Date(2026, 9, 16) }}
  />
);

export const PublicHolidaysDisabled = () => (
  <Calendar
    className="rounded-lg border"
    defaultMonth={october}
    disabled={[{ dayOfWeek: [0, 6] }, new Date(2026, 9, 5)]}
    mode="single"
    selected={new Date(2026, 9, 7)}
  />
);

export const InCard = () => (
  <Card className="w-fit">
    <CardContent>
      <Calendar
        defaultMonth={october}
        mode="range"
        selected={{ from: new Date(2026, 9, 26), to: new Date(2026, 9, 30) }}
      />
    </CardContent>
  </Card>
);
