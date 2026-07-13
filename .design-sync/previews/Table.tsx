import { Avatar, AvatarFallback } from "@repo/design-system/components/ui/avatar";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";

interface LeaveRequestRow {
  id: string;
  employee: string;
  initials: string;
  leaveType: string;
  dates: string;
  status: "Pending approval" | "Approved" | "Declined" | "Xero sync failed";
}

const leaveRequests: LeaveRequestRow[] = [
  {
    id: "1",
    employee: "Priya Nair",
    initials: "PN",
    leaveType: "Annual leave",
    dates: "12 Jan – 16 Jan 2026",
    status: "Pending approval",
  },
  {
    id: "2",
    employee: "Marcus Webb",
    initials: "MW",
    leaveType: "Sick leave",
    dates: "3 Feb 2026",
    status: "Approved",
  },
  {
    id: "3",
    employee: "Aroha Ngata",
    initials: "AN",
    leaveType: "Parental leave",
    dates: "1 Mar – 30 Jun 2026",
    status: "Approved",
  },
  {
    id: "4",
    employee: "Declan O'Sullivan",
    initials: "DO",
    leaveType: "Annual leave",
    dates: "20 Feb – 21 Feb 2026",
    status: "Declined",
  },
  {
    id: "5",
    employee: "Sofia Ricci",
    initials: "SR",
    leaveType: "Annual leave",
    dates: "9 Mar – 13 Mar 2026",
    status: "Xero sync failed",
  },
];

function statusVariant(status: LeaveRequestRow["status"]) {
  if (status === "Approved") return "secondary" as const;
  if (status === "Declined" || status === "Xero sync failed") {
    return "destructive" as const;
  }
  return "outline" as const;
}

export const Default = () => (
  <Table>
    <TableCaption>Leave requests awaiting review this fortnight.</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Employee</TableHead>
        <TableHead>Leave type</TableHead>
        <TableHead>Dates</TableHead>
        <TableHead className="text-right">Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {leaveRequests.map((row) => (
        <TableRow key={row.id}>
          <TableCell>
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback>{row.initials}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{row.employee}</span>
            </div>
          </TableCell>
          <TableCell>{row.leaveType}</TableCell>
          <TableCell>{row.dates}</TableCell>
          <TableCell className="text-right">
            <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export const Compact = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Employee</TableHead>
        <TableHead>Balance</TableHead>
        <TableHead className="text-right">Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium">Priya Nair</TableCell>
        <TableCell>14.5 days remaining</TableCell>
        <TableCell className="text-right">
          <Badge variant="outline">Pending approval</Badge>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Marcus Webb</TableCell>
        <TableCell>6 days remaining</TableCell>
        <TableCell className="text-right">
          <Badge variant="secondary">Approved</Badge>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
