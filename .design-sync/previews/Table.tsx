import {
  Badge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system";

const requests = [
  { name: "Priya Shah", type: "Annual leave", dates: "14 to 18 Oct", hours: "38.0", status: "Approved" },
  { name: "Tom Nguyen", type: "Personal leave", dates: "21 Oct", hours: "7.6", status: "Submitted" },
  { name: "Grace Walker", type: "Long service leave", dates: "23 Oct to 3 Nov", hours: "60.8", status: "Approved" },
  { name: "Liam O'Connor", type: "Annual leave", dates: "28 Oct", hours: "7.6", status: "Declined" },
];

const statusVariant = (status: string) =>
  status === "Approved" ? "secondary" : status === "Declined" ? "destructive" : "outline";

export const LeaveRequests = () => (
  <Table>
    <TableCaption>Leave requests for the Sydney office, October 2026</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Person</TableHead>
        <TableHead>Leave type</TableHead>
        <TableHead>Dates</TableHead>
        <TableHead className="text-right">Hours</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {requests.map((r) => (
        <TableRow key={r.name}>
          <TableCell className="font-medium">{r.name}</TableCell>
          <TableCell>{r.type}</TableCell>
          <TableCell className="text-muted-foreground">{r.dates}</TableCell>
          <TableCell className="text-right">{r.hours}</TableCell>
          <TableCell>
            <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export const BalancesWithFooter = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Leave type</TableHead>
        <TableHead className="text-right">Accrued</TableHead>
        <TableHead className="text-right">Taken</TableHead>
        <TableHead className="text-right">Balance</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium">Annual leave</TableCell>
        <TableCell className="text-right">152.0</TableCell>
        <TableCell className="text-right">39.6</TableCell>
        <TableCell className="text-right">112.4</TableCell>
      </TableRow>
      <TableRow>
        <TableCell className="font-medium">Personal/carer's leave</TableCell>
        <TableCell className="text-right">76.0</TableCell>
        <TableCell className="text-right">15.2</TableCell>
        <TableCell className="text-right">60.8</TableCell>
      </TableRow>
      <TableRow data-state="selected">
        <TableCell className="font-medium">Long service leave</TableCell>
        <TableCell className="text-right">48.5</TableCell>
        <TableCell className="text-right">0.0</TableCell>
        <TableCell className="text-right">48.5</TableCell>
      </TableRow>
    </TableBody>
    <TableFooter>
      <TableRow>
        <TableCell colSpan={3}>Total hours available</TableCell>
        <TableCell className="text-right">221.7</TableCell>
      </TableRow>
    </TableFooter>
  </Table>
);
