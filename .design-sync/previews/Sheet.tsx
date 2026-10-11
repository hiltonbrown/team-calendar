import {
  Badge,
  Button,
  Checkbox,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system";

const rows: [string, string][] = [
  ["Leave type", "Annual leave"],
  ["Dates", "Mon 14 Oct to Fri 18 Oct"],
  ["Hours", "38.0"],
  ["Balance after", "74.4 hours"],
  ["Submitted", "Tue 1 Oct, 9:12 am"],
];

export const RequestDetail = () => (
  <Sheet open>
    <SheetTrigger asChild>
      <Button variant="outline">View request</Button>
    </SheetTrigger>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Priya Shah</SheetTitle>
        <SheetDescription>Kitchen team, Acme Restaurants</SheetDescription>
        <div>
          <Badge variant="secondary">Awaiting approval</Badge>
        </div>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 text-sm">
        {rows.map(([label, value]) => (
          <div className="flex items-center justify-between" key={label}>
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>
      <SheetFooter>
        <Button>Approve</Button>
        <SheetClose asChild>
          <Button variant="outline">Decline</Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

const teams: [string, boolean][] = [
  ["Kitchen", true],
  ["Front of house", true],
  ["Head office", false],
  ["Events", false],
];

export const FromLeft = () => (
  <Sheet open>
    <SheetTrigger asChild>
      <Button variant="outline">Filters</Button>
    </SheetTrigger>
    <SheetContent side="left">
      <SheetHeader>
        <SheetTitle>Filter calendar</SheetTitle>
        <SheetDescription>Show availability for selected teams only.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4">
        {teams.map(([team, checked]) => (
          <div className="flex items-center gap-3" key={team}>
            <Checkbox defaultChecked={checked} id={`team-${team}`} />
            <Label htmlFor={`team-${team}`}>{team}</Label>
          </div>
        ))}
      </div>
      <SheetFooter>
        <Button>Apply filters</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
