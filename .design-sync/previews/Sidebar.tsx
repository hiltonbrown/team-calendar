import {
  ActivityIcon,
  Badge,
  BarChart3Icon,
  BellIcon,
  Button,
  CalendarDaysIcon,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ClipboardListIcon,
  FlagIcon,
  LayoutDashboardIcon,
  LinkIcon,
  Separator,
  Settings2Icon,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  UsersIcon,
} from "@repo/design-system";

const navGroups = [
  {
    label: null,
    items: [{ title: "Dashboard", icon: LayoutDashboardIcon, active: true }],
  },
  {
    label: "My Work",
    items: [
      { title: "My Plans", icon: ClipboardListIcon },
      { title: "Calendar", icon: CalendarDaysIcon },
      { title: "Notifications", icon: BellIcon },
    ],
  },
  {
    label: "Team",
    items: [
      { title: "People", icon: UsersIcon },
      { title: "Calendar Feeds", icon: LinkIcon },
      { title: "Leave Reports", icon: BarChart3Icon },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Leave Approvals", icon: ClipboardListIcon },
      { title: "Public Holidays", icon: FlagIcon },
      { title: "Sync Health", icon: ActivityIcon },
    ],
  },
];

const BrandMark = () => (
  <svg aria-hidden="true" className="h-9 w-9" viewBox="0 0 48 48">
    <rect fill="var(--muted-foreground)" height="9" rx="4.5" width="28" x="8" y="8" />
    <rect fill="var(--secondary-container, #cae8bc)" height="9" rx="4.5" width="28" x="14" y="20" />
    <rect fill="var(--primary)" height="9" rx="4.5" width="25" x="6" y="32" />
  </svg>
);

const AppShell = ({ defaultOpen }: { defaultOpen: boolean }) => (
  <SidebarProvider className="h-svh" defaultOpen={defaultOpen}>
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="mb-1 flex items-center gap-2.5 px-1 py-1.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                <BrandMark />
              </div>
              {defaultOpen ? (
                <span className="font-semibold text-title-md">Team Calendar</span>
              ) : null}
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label ?? "home"}>
            {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      className="h-8 gap-3"
                      isActive={"active" in item && item.active}
                      tooltip={item.title}
                    >
                      <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span className="font-medium text-label-lg">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-0 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-8 gap-3" tooltip="Settings">
              <Settings2Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="font-medium text-label-lg">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
    <SidebarInset className="overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-border border-b bg-background px-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-0.5 size-7" style={{ color: "var(--muted-foreground)" }} />
          <Separator className="h-4 opacity-40" orientation="vertical" />
          <h1 className="font-semibold text-title-md">Dashboard</h1>
        </div>
        <Button size="sm">Request leave</Button>
      </header>
      <div className="grid gap-4 p-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Out today</CardTitle>
            <CardDescription>Tuesday 13 October 2026</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Priya Shah</span>
              <Badge variant="secondary">Annual leave</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Tom Nguyen</span>
              <Badge variant="outline">Working from home</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Awaiting your approval</CardTitle>
            <CardDescription>3 leave requests from your team</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Grace Walker</span>
              <span className="text-muted-foreground">Long service, 23 Oct to 3 Nov</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Liam O'Connor</span>
              <span className="text-muted-foreground">Personal leave, 16 Oct</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  </SidebarProvider>
);

export const Expanded = () => <AppShell defaultOpen />;

export const CollapsedToIcons = () => <AppShell defaultOpen={false} />;
