import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@repo/design-system/components/ui/menubar";

export const AppMenubar = () => (
  <Menubar className="w-fit" defaultValue="leave">
    <MenubarMenu value="calendar">
      <MenubarTrigger>Calendar</MenubarTrigger>
    </MenubarMenu>
    <MenubarMenu value="leave">
      <MenubarTrigger>Leave</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>
          Submit request
          <MenubarShortcut>&#8984;N</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>My requests</MenubarItem>
        <MenubarItem>Approvals</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Team calendar</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu value="reports">
      <MenubarTrigger>Reports</MenubarTrigger>
    </MenubarMenu>
    <MenubarMenu value="settings">
      <MenubarTrigger>Settings</MenubarTrigger>
    </MenubarMenu>
  </Menubar>
);

export const ViewOptionsMenu = () => (
  <Menubar className="w-fit" defaultValue="view">
    <MenubarMenu value="calendar">
      <MenubarTrigger>Calendar</MenubarTrigger>
    </MenubarMenu>
    <MenubarMenu value="view">
      <MenubarTrigger>View</MenubarTrigger>
      <MenubarContent>
        <MenubarCheckboxItem checked>Show public holidays</MenubarCheckboxItem>
        <MenubarCheckboxItem>Show weekends</MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarRadioGroup value="month">
          <MenubarRadioItem value="week">Week</MenubarRadioItem>
          <MenubarRadioItem value="month">Month</MenubarRadioItem>
          <MenubarRadioItem value="year">Year</MenubarRadioItem>
        </MenubarRadioGroup>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu value="settings">
      <MenubarTrigger>Settings</MenubarTrigger>
    </MenubarMenu>
  </Menubar>
);
