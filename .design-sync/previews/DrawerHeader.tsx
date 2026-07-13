import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@repo/design-system/components/ui/drawer";

export const Default = () => (
  <Drawer defaultOpen>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Annual leave</DrawerTitle>
        <DrawerDescription>
          12&ndash;16 January 2026 &middot; 5 working days
        </DrawerDescription>
      </DrawerHeader>
    </DrawerContent>
  </Drawer>
);
