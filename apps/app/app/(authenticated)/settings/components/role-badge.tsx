import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";

type OrgRole = "owner" | "admin" | "manager" | "viewer";

const ROLE_CONFIG: Record<OrgRole, { label: string; className: string }> = {
  admin: {
    className:
      "bg-secondary/10 text-secondary border-secondary/20 hover:bg-secondary/10",
    label: "Admin",
  },
  manager: {
    className: "bg-muted text-foreground border-border hover:bg-muted",
    label: "Manager",
  },
  owner: {
    className:
      "bg-primary/10 text-primary border-primary/20 hover:bg-primary/10",
    label: "Owner",
  },
  viewer: {
    className: "bg-muted text-muted-foreground border-border hover:bg-muted",
    label: "Viewer",
  },
};

interface RoleBadgeProps {
  role: string;
}

export const RoleBadge = ({ role }: RoleBadgeProps) => {
  const config = ROLE_CONFIG[role as OrgRole] ?? {
    className: "bg-muted text-muted-foreground border-border",
    label: role,
  };

  return (
    <Badge className={cn("font-medium", config.className)} variant="outline">
      {config.label}
    </Badge>
  );
};
