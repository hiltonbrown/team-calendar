import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@repo/design-system";

const calendarLinks = [
  {
    title: "Team calendar",
    description: "Who is away this week, by team and location.",
  },
  {
    title: "Leave requests",
    description: "Submit, approve and track leave synced with Xero.",
  },
  {
    title: "Availability",
    description: "Log WFH, travel, training and client site days.",
  },
  {
    title: "Calendar feeds",
    description: "Subscribe in Outlook, Google or Apple Calendar.",
  },
];

export const Default = () => (
  <NavigationMenu defaultValue="calendar">
    <NavigationMenuList>
      <NavigationMenuItem value="calendar">
        <NavigationMenuTrigger>Calendar</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid grid-cols-2 gap-2 p-2" style={{ width: 460 }}>
            {calendarLinks.map((link) => (
              <li key={link.title}>
                <NavigationMenuLink href="#">
                  <div className="font-medium text-sm">{link.title}</div>
                  <p className="text-muted-foreground text-sm leading-snug">
                    {link.description}
                  </p>
                </NavigationMenuLink>
              </li>
            ))}
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem value="reports">
        <NavigationMenuTrigger>Reports</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid gap-1 p-2" style={{ width: 260 }}>
            <li>
              <NavigationMenuLink href="#">Leave report</NavigationMenuLink>
            </li>
            <li>
              <NavigationMenuLink href="#">Out of office</NavigationMenuLink>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Settings
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
);

export const Closed = () => (
  <NavigationMenu>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuTrigger>Calendar</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid gap-1 p-2" style={{ width: 260 }}>
            <li>
              <NavigationMenuLink href="#">Team calendar</NavigationMenuLink>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          People
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Settings
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
);
