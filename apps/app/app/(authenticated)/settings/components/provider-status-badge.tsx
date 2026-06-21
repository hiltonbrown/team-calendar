import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import {
  CircleCheckIcon,
  CircleIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import { statusToneClasses } from "@/components/availability/availability-status";

type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "expired"
  | "revoked";

interface ProviderStatusBadgeProps {
  status: ConnectionStatus;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  {
    label: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    className: string;
  }
> = {
  connected: {
    label: "Connected",
    icon: CircleCheckIcon,
    className: statusToneClasses.leave,
  },
  disconnected: {
    label: "Not connected",
    icon: CircleIcon,
    className: statusToneClasses.private,
  },
  error: {
    label: "Error",
    icon: TriangleAlertIcon,
    className: statusToneClasses.failed,
  },
  expired: {
    label: "Connection expired",
    icon: TriangleAlertIcon,
    className: statusToneClasses.holiday,
  },
  revoked: {
    label: "Connection revoked",
    icon: XCircleIcon,
    className: statusToneClasses.failed,
  },
};

export const ProviderStatusBadge = ({ status }: ProviderStatusBadgeProps) => {
  const { label, icon: Icon, className } = STATUS_CONFIG[status];

  return (
    <Badge
      className={cn("gap-1.5 border-0 font-medium ring-1", className)}
      variant="outline"
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
      {label}
    </Badge>
  );
};
