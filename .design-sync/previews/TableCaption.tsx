import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@repo/design-system/components/ui/table";

export const Default = () => (
  <Table>
    <TableCaption>Leave requests awaiting review this fortnight.</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Employee</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Priya Nair</TableCell>
        <TableCell>Pending approval</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
