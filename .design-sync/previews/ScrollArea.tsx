import { ScrollArea, ScrollBar, Separator } from "@repo/design-system";

const people = [
  "Priya Shah",
  "Tom Nguyen",
  "Grace Walker",
  "Liam O'Brien",
  "Mei Chen",
  "Jack Thompson",
  "Aisha Rahman",
  "Oliver Smith",
  "Chloe Martin",
  "Noah Williams",
  "Ruby Jones",
  "Ethan Brown",
];

export const Vertical = () => (
  <ScrollArea className="h-56 rounded-md border" style={{ width: 224 }} type="always">
    <div className="p-4">
      <h4 className="mb-3 font-medium text-sm">Sydney team</h4>
      {people.map((name) => (
        <div key={name}>
          <div className="text-sm">{name}</div>
          <Separator style={{ marginTop: 8, marginBottom: 8 }} />
        </div>
      ))}
    </div>
  </ScrollArea>
);

const days = ["Mon 13", "Tue 14", "Wed 15", "Thu 16", "Fri 17", "Mon 20", "Tue 21", "Wed 22"];

export const Horizontal = () => (
  <ScrollArea className="w-[420px] whitespace-nowrap rounded-md border" type="always">
    <div className="flex w-max gap-3 p-4">
      {days.map((day) => (
        <div
          className="flex w-24 shrink-0 flex-col gap-1 rounded-md bg-surface-container p-3"
          key={day}
        >
          <span className="font-medium text-sm">{day}</span>
          <span className="text-muted-foreground text-xs">3 away</span>
        </div>
      ))}
    </div>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
);
