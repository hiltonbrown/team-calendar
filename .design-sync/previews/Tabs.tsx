import {
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system";
import { CalendarDays, Inbox, List } from "lucide-react";

const upcoming = [
  { name: "Priya Shah", detail: "Annual leave, 14 to 18 Oct" },
  { name: "Tom Nguyen", detail: "Personal leave, 21 Oct" },
  { name: "Grace Walker", detail: "Long service, 23 Oct to 3 Nov" },
];

export const Default = () => (
  <Tabs style={{ width: 440 }} defaultValue="list">
    <TabsList>
      <TabsTrigger value="calendar">Calendar</TabsTrigger>
      <TabsTrigger value="list">List</TabsTrigger>
      <TabsTrigger value="requests">Requests</TabsTrigger>
    </TabsList>
    <TabsContent className="mt-2 flex flex-col gap-3" value="list">
      {upcoming.map((row) => (
        <div
          className="flex items-center justify-between text-sm"
          key={row.name}
        >
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground">{row.detail}</span>
        </div>
      ))}
    </TabsContent>
  </Tabs>
);

export const WithIcons = () => (
  <Tabs style={{ width: 440 }} defaultValue="requests">
    <TabsList>
      <TabsTrigger value="calendar">
        <CalendarDays />
        Calendar
      </TabsTrigger>
      <TabsTrigger value="list">
        <List />
        List
      </TabsTrigger>
      <TabsTrigger value="requests">
        <Inbox />
        Requests
        <Badge variant="secondary">3</Badge>
      </TabsTrigger>
    </TabsList>
    <TabsContent className="mt-2" value="requests">
      <p className="text-muted-foreground text-sm">
        3 leave requests from the Sydney team are waiting for your approval.
      </p>
    </TabsContent>
  </Tabs>
);

export const PrivacyModes = () => (
  <Tabs style={{ width: 440 }} defaultValue="named">
    <TabsList>
      <TabsTrigger value="named">Named</TabsTrigger>
      <TabsTrigger value="masked">Masked</TabsTrigger>
      <TabsTrigger disabled value="private">
        Private
      </TabsTrigger>
    </TabsList>
    <TabsContent className="mt-2" value="named">
      <p className="text-muted-foreground text-sm">
        Events show the person and leave type, for example "Priya Shah, Annual
        leave".
      </p>
    </TabsContent>
  </Tabs>
);
