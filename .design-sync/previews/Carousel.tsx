import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@repo/design-system";

const policies = [
  {
    name: "Annual leave",
    detail: "4 weeks per year, accrued progressively",
    balance: "112.4 hours",
    source: "Synced from Xero",
  },
  {
    name: "Personal (sick and carer's) leave",
    detail: "10 days per year, accrued progressively",
    balance: "46.0 hours",
    source: "Synced from Xero",
  },
  {
    name: "Long service leave",
    detail: "Available after 7 years of continuous service",
    balance: "0.0 hours",
    source: "Synced from Xero",
  },
];

export const LeavePolicies = () => (
  <div style={{ paddingInline: 56 }}>
    <Carousel style={{ width: 360 }}>
      <CarouselContent>
        {policies.map((policy) => (
          <CarouselItem key={policy.name}>
            <Card>
              <CardHeader>
                <CardTitle>{policy.name}</CardTitle>
                <CardDescription>{policy.detail}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-end justify-between">
                <div>
                  <p className="text-muted-foreground text-xs">Available balance</p>
                  <p className="font-semibold text-headline-md">{policy.balance}</p>
                </div>
                <Badge variant="secondary">{policy.source}</Badge>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
);

const locations = [
  { city: "Sydney", office: "Head Office, Barangaroo", away: 3, total: 24, holiday: "Christmas Day, Fri 25 Dec" },
  { city: "Melbourne", office: "Collins Street", away: 1, total: 15, holiday: "Melbourne Cup, Tue 3 Nov" },
  { city: "Brisbane", office: "Fortitude Valley", away: 2, total: 11, holiday: "Christmas Day, Fri 25 Dec" },
  { city: "Adelaide", office: "Rundle Mall", away: 0, total: 8, holiday: "Christmas Day, Fri 25 Dec" },
  { city: "Hobart", office: "Salamanca Place", away: 1, total: 6, holiday: "Christmas Day, Fri 25 Dec" },
];

export const Locations = () => (
  <div style={{ paddingInline: 56 }}>
    <Carousel style={{ width: 620 }} opts={{ align: "start" }}>
      <CarouselContent>
        {locations.map((location) => (
          <CarouselItem style={{ flexBasis: "33.333%" }} key={location.city}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>{location.city}</CardTitle>
                <CardDescription>{location.office}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>
                  <span className="font-semibold">{location.away}</span>
                  <span className="text-muted-foreground"> of {location.total} away today</span>
                </p>
                <p className="text-muted-foreground text-xs">Next holiday: {location.holiday}</p>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  </div>
);
