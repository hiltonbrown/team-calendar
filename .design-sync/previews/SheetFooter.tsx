import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";

export const Default = () => (
  <Sheet defaultOpen>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Calendar filters</SheetTitle>
      </SheetHeader>
      <SheetFooter>
        <Button>Apply filters</Button>
        <Button variant="ghost">Clear filters</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
