import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@repo/design-system/components/ui/carousel";

interface Announcement {
  id: string;
  title: string;
  detail: string;
  tag: string;
}

const upcomingHolidays: Announcement[] = [
  {
    id: "1",
    title: "Australia Day",
    detail: "Monday 26 January 2026. Applies to all Sydney and Melbourne staff.",
    tag: "AU",
  },
  {
    id: "2",
    title: "Waitangi Day",
    detail: "Friday 6 February 2026. Applies to all Auckland and Wellington staff.",
    tag: "NZ",
  },
  {
    id: "3",
    title: "Early May Bank Holiday",
    detail: "Monday 4 May 2026. Applies to all London staff.",
    tag: "UK",
  },
];

export const Default = () => (
  <Carousel className="w-full max-w-sm">
    <CarouselContent>
      {upcomingHolidays.map((holiday) => (
        <CarouselItem key={holiday.id}>
          <div className="flex h-40 flex-col justify-between rounded-2xl border bg-background p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{holiday.title}</h3>
              <Badge variant="secondary">{holiday.tag}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">{holiday.detail}</p>
          </div>
        </CarouselItem>
      ))}
    </CarouselContent>
    <CarouselPrevious />
    <CarouselNext />
  </Carousel>
);

export const MultiSlideVisible = () => (
  <Carousel className="w-full max-w-lg" opts={{ align: "start" }}>
    <CarouselContent>
      {upcomingHolidays.map((holiday) => (
        <CarouselItem className="basis-1/2" key={holiday.id}>
          <div className="flex h-32 flex-col justify-between rounded-2xl border bg-background p-4">
            <h3 className="font-medium text-sm">{holiday.title}</h3>
            <p className="text-muted-foreground text-xs">{holiday.detail}</p>
            <Badge className="w-fit" variant="outline">
              {holiday.tag}
            </Badge>
          </div>
        </CarouselItem>
      ))}
    </CarouselContent>
    <CarouselPrevious />
    <CarouselNext />
  </Carousel>
);
