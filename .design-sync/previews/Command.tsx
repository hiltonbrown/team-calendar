import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@repo/design-system";
import { CalendarPlus, RefreshCw, Rss, Settings, Users } from "lucide-react";

export const CommandMenu = () => (
  <Command className="w-[420px] rounded-lg border shadow-md">
    <CommandInput placeholder="Search people, pages and actions" />
    <CommandList>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandGroup heading="Create">
        <CommandItem>
          <CalendarPlus />
          Request leave
          <CommandShortcut>N</CommandShortcut>
        </CommandItem>
        <CommandItem>
          <Rss />
          New calendar feed
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Navigate">
        <CommandItem>
          <Users />
          People
          <CommandShortcut>P</CommandShortcut>
        </CommandItem>
        <CommandItem>
          <RefreshCw />
          Xero sync
        </CommandItem>
        <CommandItem>
          <Settings />
          Settings
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);

export const PersonSearch = () => (
  <Command className="w-80 rounded-lg border">
    <CommandInput placeholder="Find a person" />
    <CommandList>
      <CommandGroup heading="Kitchen">
        <CommandItem>Priya Natarajan</CommandItem>
        <CommandItem>Liam O'Connor</CommandItem>
      </CommandGroup>
      <CommandGroup heading="Front of house">
        <CommandItem>Mei Chen</CommandItem>
        <CommandItem disabled>Tom Walsh (archived)</CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);
