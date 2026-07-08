import { Badge } from "@repo/design-system/components/ui/badge";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";

interface LeaveHistoryEntry {
  id: string;
  label: string;
  detail: string;
  status: "Approved" | "Declined" | "Withdrawn";
}

const leaveHistory: LeaveHistoryEntry[] = [
  { id: "1", label: "Annual leave", detail: "12 Jan – 16 Jan 2026", status: "Approved" },
  { id: "2", label: "Sick leave", detail: "3 Feb 2026", status: "Approved" },
  { id: "3", label: "Annual leave", detail: "20 Feb – 21 Feb 2026", status: "Declined" },
  { id: "4", label: "Parental leave", detail: "1 Mar – 30 Jun 2026", status: "Approved" },
  { id: "5", label: "Annual leave", detail: "9 Mar – 13 Mar 2026", status: "Withdrawn" },
  { id: "6", label: "Sick leave", detail: "22 Mar 2026", status: "Approved" },
  { id: "7", label: "Annual leave", detail: "5 Apr – 9 Apr 2026", status: "Approved" },
  { id: "8", label: "Annual leave", detail: "18 Apr 2026", status: "Approved" },
  { id: "9", label: "Sick leave", detail: "2 May 2026", status: "Approved" },
  { id: "10", label: "Annual leave", detail: "14 May – 15 May 2026", status: "Declined" },
  { id: "11", label: "Annual leave", detail: "1 Jun – 5 Jun 2026", status: "Approved" },
  { id: "12", label: "Sick leave", detail: "19 Jun 2026", status: "Approved" },
];

function statusVariant(status: LeaveHistoryEntry["status"]) {
  if (status === "Approved") return "secondary" as const;
  if (status === "Declined") return "destructive" as const;
  return "outline" as const;
}

export const Default = () => (
  <ScrollArea className="h-72 w-80 rounded-2xl border">
    <div className="flex flex-col gap-1 p-4">
      <h3 className="mb-2 font-medium text-sm">Leave history</h3>
      {leaveHistory.map((entry) => (
        <div
          className="flex items-center justify-between border-b py-2 last:border-b-0"
          key={entry.id}
        >
          <div>
            <div className="text-sm">{entry.label}</div>
            <div className="text-muted-foreground text-xs">{entry.detail}</div>
          </div>
          <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
        </div>
      ))}
    </div>
  </ScrollArea>
);
