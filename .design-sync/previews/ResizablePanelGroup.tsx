import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@repo/design-system/components/ui/resizable";

export const Default = () => (
  <ResizablePanelGroup
    className="min-h-[280px] max-w-2xl rounded-2xl border"
    direction="horizontal"
  >
    <ResizablePanel defaultSize={35}>
      <div className="flex h-full flex-col gap-2 p-4">
        <h3 className="font-medium text-sm">Team calendar</h3>
        <p className="text-muted-foreground text-xs">
          Auckland Support &middot; 8 people
        </p>
        <p className="text-muted-foreground text-xs">
          2 on annual leave this week
        </p>
      </div>
    </ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel defaultSize={65}>
      <div className="flex h-full flex-col gap-2 p-4">
        <h3 className="font-medium text-sm">Leave request detail</h3>
        <p className="text-muted-foreground text-xs">
          Aroha Ngata &middot; Annual leave &middot; 12 Jan &ndash; 16 Jan 2026
        </p>
        <p className="text-muted-foreground text-xs">
          Awaiting manager approval. 5 working days requested.
        </p>
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
);

export const WithVerticalStack = () => (
  <ResizablePanelGroup
    className="min-h-[320px] max-w-md rounded-2xl border"
    direction="vertical"
  >
    <ResizablePanel defaultSize={40}>
      <div className="flex h-full items-center justify-center p-4 text-sm">
        Upcoming public holidays
      </div>
    </ResizablePanel>
    <ResizableHandle withHandle />
    <ResizablePanel defaultSize={60}>
      <div className="flex h-full items-center justify-center p-4 text-muted-foreground text-sm">
        Australia Day &middot; 26 Jan 2026
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
);
