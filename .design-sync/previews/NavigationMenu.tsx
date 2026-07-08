import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@repo/design-system/components/ui/navigation-menu";

export const PrimaryNav = () => (
  <NavigationMenu defaultValue="leave" viewport={false}>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Calendar
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem value="leave">
        <NavigationMenuTrigger>Leave</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid w-72 gap-1 p-1">
            <li>
              <NavigationMenuLink href="#">
                <div className="font-medium">Submit request</div>
                <div className="text-muted-foreground text-xs">
                  Request annual, sick, or parental leave
                </div>
              </NavigationMenuLink>
            </li>
            <li>
              <NavigationMenuLink href="#">
                <div className="font-medium">My requests</div>
                <div className="text-muted-foreground text-xs">
                  Track the status of your submitted leave
                </div>
              </NavigationMenuLink>
            </li>
            <li>
              <NavigationMenuLink href="#">
                <div className="font-medium">Approvals</div>
                <div className="text-muted-foreground text-xs">
                  Review requests waiting on your decision
                </div>
              </NavigationMenuLink>
            </li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Reports
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

export const CompactLinks = () => (
  <NavigationMenu viewport={false}>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Calendar
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Leave
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Reports
        </NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink
          active
          className={navigationMenuTriggerStyle()}
          href="#"
        >
          Settings
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
);
