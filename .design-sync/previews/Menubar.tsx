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
} from "@repo/design-system";

export const Default = () => (
  <Menubar value="view">
    <MenubarMenu value="leave">
      <MenubarTrigger>Leave</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>
          New request <MenubarShortcut>⌘N</MenubarShortcut>
        </MenubarItem>
        <MenubarItem>My requests</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Export to CSV</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu value="view">
      <MenubarTrigger>View</MenubarTrigger>
      <MenubarContent>
        <MenubarRadioGroup value="week">
          <MenubarRadioItem value="day">Day</MenubarRadioItem>
          <MenubarRadioItem value="week">Week</MenubarRadioItem>
          <MenubarRadioItem value="month">Month</MenubarRadioItem>
        </MenubarRadioGroup>
        <MenubarSeparator />
        <MenubarCheckboxItem checked>Public holidays</MenubarCheckboxItem>
        <MenubarCheckboxItem checked>Working from home</MenubarCheckboxItem>
        <MenubarCheckboxItem>Weekends</MenubarCheckboxItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu value="team">
      <MenubarTrigger>Team</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Sydney</MenubarItem>
        <MenubarItem>Melbourne</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
);

export const Closed = () => (
  <Menubar>
    <MenubarMenu>
      <MenubarTrigger>Leave</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>New request</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu>
      <MenubarTrigger>View</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Week</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu>
      <MenubarTrigger>Team</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>Sydney</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
);
