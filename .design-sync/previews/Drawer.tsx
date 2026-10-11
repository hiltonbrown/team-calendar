import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@repo/design-system";

const options = ["Working from home", "Travelling", "Training", "Client site"];

export const AddAvailability = () => (
  <Drawer open>
    <DrawerTrigger asChild>
      <Button>Add availability</Button>
    </DrawerTrigger>
    <DrawerContent>
      <div className="mx-auto w-full max-w-sm">
        <DrawerHeader>
          <DrawerTitle>Add availability</DrawerTitle>
          <DrawerDescription>
            Thursday 17 October. Shown on the team calendar and your feed.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-4">
          {options.map((option, index) => (
            <Button key={option} variant={index === 0 ? "secondary" : "outline"}>
              {option}
            </Button>
          ))}
        </div>
        <DrawerFooter>
          <Button>Save entry</Button>
          <DrawerClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
);

export const ConfirmSubmit = () => (
  <Drawer open>
    <DrawerTrigger asChild>
      <Button>Submit request</Button>
    </DrawerTrigger>
    <DrawerContent>
      <div className="mx-auto w-full max-w-sm">
        <DrawerHeader>
          <DrawerTitle>Submit leave request?</DrawerTitle>
          <DrawerDescription>
            Annual leave, Mon 14 Oct to Fri 18 Oct, 38 hours. Your manager will
            be asked to approve it.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>Submit for approval</Button>
          <DrawerClose asChild>
            <Button variant="outline">Back to edit</Button>
          </DrawerClose>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
);
