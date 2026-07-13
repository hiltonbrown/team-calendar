import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@repo/design-system/components/ui/navigation-menu";

export const Default = () => (
  <NavigationMenu viewport={false}>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuLink className={navigationMenuTriggerStyle()} href="#">
          Team calendar
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
);
