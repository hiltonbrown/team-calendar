import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";

export const Default = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Employee</TableHead>
        <TableHead>Leave type</TableHead>
        <TableHead className="text-right">Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Priya Nair</TableCell>
        <TableCell>Annual leave</TableCell>
        <TableCell className="text-right">Pending approval</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
