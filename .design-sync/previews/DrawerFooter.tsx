import { Button } from "@repo/design-system/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@repo/design-system/components/ui/drawer";

export const Default = () => (
  <Drawer defaultOpen>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Annual leave</DrawerTitle>
      </DrawerHeader>
      <DrawerFooter>
        <Button>Approve</Button>
        <DrawerClose asChild>
          <Button variant="outline">Close</Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
);
