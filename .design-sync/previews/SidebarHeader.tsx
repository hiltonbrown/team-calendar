import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@repo/design-system/components/ui/sidebar";
import { LayoutDashboardIcon } from "lucide-react";

export const Default = () => (
  <div
    className="overflow-hidden rounded-lg border"
    style={{ height: 260, width: 288 }}
  >
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="none">
        <SidebarHeader className="pb-2">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-semibold text-sidebar-primary-foreground text-sm">
              TC
            </div>
            <span className="font-semibold text-sm tracking-tight">
              Team Calendar
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>My Work</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Dashboard">
                    <LayoutDashboardIcon />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  </div>
);
