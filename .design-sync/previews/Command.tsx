import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@repo/design-system/components/ui/command";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  FilePlus2Icon,
  UsersIcon,
} from "lucide-react";

export const QuickActions = () => (
  <Command className="w-80 rounded-lg border shadow-md">
    <CommandInput placeholder="Search for a command..." />
    <CommandList>
      <CommandGroup heading="Quick actions">
        <CommandItem>
          <FilePlus2Icon />
          New leave request
          <CommandShortcut>&#8984;N</CommandShortcut>
        </CommandItem>
        <CommandItem>
          <CalendarDaysIcon />
          View team calendar
        </CommandItem>
        <CommandItem>
          <CheckCircle2Icon />
          Approvals
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);

export const GroupedByCategory = () => (
  <Command className="w-80 rounded-lg border shadow-md">
    <CommandInput placeholder="Type a command or search..." />
    <CommandList>
      <CommandGroup heading="Leave">
        <CommandItem>
          <FilePlus2Icon />
          New leave request
        </CommandItem>
        <CommandItem>
          <CheckCircle2Icon />
          Approvals
          <CommandShortcut>3</CommandShortcut>
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Navigate">
        <CommandItem>
          <CalendarDaysIcon />
          Team calendar
        </CommandItem>
        <CommandItem>
          <UsersIcon />
          People
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);
