import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@repo/design-system/components/ui/menubar";

export const Default = () => (
  <Menubar className="w-fit" defaultValue="account">
    <MenubarMenu value="calendar">
      <MenubarTrigger>Calendar</MenubarTrigger>
    </MenubarMenu>
    <MenubarMenu value="account">
      <MenubarTrigger>Hilton Brown</MenubarTrigger>
      <MenubarContent>
        <MenubarLabel>Acme Restaurants (AU)</MenubarLabel>
        <MenubarSeparator />
        <MenubarItem>My leave requests</MenubarItem>
        <MenubarItem>Sign out</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
);
