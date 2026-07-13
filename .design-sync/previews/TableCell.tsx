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
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell className="font-medium">Priya Nair</TableCell>
        <TableCell>Annual leave, 12 Jan – 16 Jan 2026</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
