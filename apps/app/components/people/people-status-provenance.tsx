import { Badge } from "@repo/design-system/components/ui/badge";
import { LeafIcon, PencilIcon } from "lucide-react";
import {
  statusToneClasses,
  toneForStatusKey,
} from "@/components/availability/availability-status";

export function PeopleStatusChip({
  label,
  statusKey,
}: {
  label: string;
  statusKey: string;
}) {
  const tone = statusToneClasses[toneForStatusKey({ statusKey })];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 font-medium text-xs ring-1 ${tone}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function PeopleProvenanceBadge({ xeroLinked }: { xeroLinked: boolean }) {
  return (
    <Badge
      className={
        xeroLinked
          ? "gap-1 border-transparent bg-secondary text-secondary-foreground ring-1 ring-secondary/60"
          : "gap-1 border-transparent bg-accent-container text-on-accent-container ring-1 ring-accent-container/60"
      }
      variant="secondary"
    >
      {xeroLinked ? (
        <LeafIcon aria-hidden="true" className="size-3" />
      ) : (
        <PencilIcon aria-hidden="true" className="size-3" />
      )}
      {xeroLinked ? "Linked" : "Manual"}
      <span className="sr-only">
        Source: {xeroLinked ? "Synced from Xero" : "Manual entry"}.
      </span>
    </Badge>
  );
}
