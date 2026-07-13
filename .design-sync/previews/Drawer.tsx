import { Button } from "@repo/design-system/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@repo/design-system/components/ui/drawer";

export const LeaveRequestDetails = () => (
  <Drawer defaultOpen>
    <DrawerTrigger asChild>
      <Button variant="secondary">View request</Button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Annual leave</DrawerTitle>
        <DrawerDescription>
          12&ndash;16 January 2026 &middot; 5 working days
        </DrawerDescription>
      </DrawerHeader>
      <div className="px-4 pb-2">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Status
            </dt>
            <dd className="mt-0.5 text-foreground">Pending approval</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Balance impact
            </dt>
            <dd className="mt-0.5 text-foreground">9 days remaining after approval</dd>
          </div>
        </dl>
      </div>
      <DrawerFooter>
        <Button>Approve</Button>
        <DrawerClose asChild>
          <Button variant="outline">Close</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
);

export const DeclineWithReason = () => (
  <Drawer defaultOpen>
    <DrawerTrigger asChild>
      <Button variant="destructive">Decline</Button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Decline leave request</DrawerTitle>
        <DrawerDescription>
          Tell Marcus Lee why this request is being declined.
        </DrawerDescription>
      </DrawerHeader>
      <DrawerFooter>
        <Button variant="destructive">Decline request</Button>
        <DrawerClose asChild>
          <Button variant="outline">Cancel</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
);
