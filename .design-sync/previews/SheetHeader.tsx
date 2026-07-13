import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";

export const Default = () => (
  <Sheet defaultOpen>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Calendar filters</SheetTitle>
      </SheetHeader>
    </SheetContent>
  </Sheet>
);
