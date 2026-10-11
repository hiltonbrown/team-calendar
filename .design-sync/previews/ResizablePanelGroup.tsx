import {
  Badge,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@repo/design-system";

const requests = [
  { name: "Grace Walker", type: "Long service", dates: "23 Oct to 3 Nov", active: true },
  { name: "Liam O'Connor", type: "Personal leave", dates: "16 Oct" },
  { name: "Ava Thompson", type: "Annual leave", dates: "2 to 6 Nov" },
];

export const Horizontal = () => (
  <ResizablePanelGroup
    className="overflow-hidden rounded-xl bg-surface-container-low"
    orientation="horizontal"
    style={{ height: 280, width: 640 }}
  >
    <ResizablePanel defaultSize="38%" minSize="25%">
      <div className="flex h-full flex-col gap-1 p-3">
        <p className="px-2 pb-1 font-medium text-label-sm text-muted-foreground uppercase tracking-wide">
          Pending approval
        </p>
        {requests.map((request) => (
          <div
            className={
              request.active
                ? "rounded-lg bg-secondary px-3 py-2 text-secondary-foreground"
                : "rounded-lg px-3 py-2"
            }
            key={request.name}
          >
            <p className="font-medium text-sm">{request.name}</p>
            <p className="text-muted-foreground text-xs">
              {request.type}, {request.dates}
            </p>
          </div>
        ))}
      </div>
    </ResizablePanel>
    <ResizableHandle className="bg-outline-variant" withHandle />
    <ResizablePanel defaultSize="62%">
      <div className="flex h-full flex-col gap-3 bg-surface-container-lowest p-5">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-title-md">Grace Walker</p>
          <Badge variant="outline">Submitted</Badge>
        </div>
        <p className="text-sm">Long service leave, Fri 23 Oct to Tue 3 Nov 2026</p>
        <p className="text-muted-foreground text-sm">
          8 working days. Available balance 312.0 hours, synced from Xero this morning.
        </p>
        <p className="text-muted-foreground text-sm">
          No other Finance team members are away during this period.
        </p>
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
);

export const Vertical = () => (
  <ResizablePanelGroup
    className="overflow-hidden rounded-xl bg-surface-container-low"
    orientation="vertical"
    style={{ height: 320, width: 480 }}
  >
    <ResizablePanel defaultSize="55%">
      <div className="flex h-full flex-col gap-2 bg-surface-container-lowest p-5">
        <p className="font-semibold text-title-md">Calendar feed preview</p>
        <p className="text-muted-foreground text-sm">Head Office, details masked</p>
        <p className="text-sm">Mon 5 Oct · Away (all day)</p>
        <p className="text-sm">Tue 6 Oct · Busy, 9:00 am to 12:30 pm</p>
      </div>
    </ResizablePanel>
    {/* The handle's built-in vertical styles key off a v3 data attribute, so size it for the vertical orientation here. */}
    <ResizableHandle className="h-px w-full bg-outline-variant" withHandle />
    <ResizablePanel defaultSize="45%">
      <div className="flex h-full flex-col gap-2 p-5">
        <p className="font-medium text-label-sm text-muted-foreground uppercase tracking-wide">
          Sync log
        </p>
        <p className="text-sm">09:02 · Leave records refreshed, 4 changed</p>
        <p className="text-sm">09:01 · Employees refreshed, no changes</p>
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
);
