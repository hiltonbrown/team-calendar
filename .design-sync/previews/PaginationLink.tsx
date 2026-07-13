import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@repo/design-system/components/ui/pagination";

export const Default = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem>
        <PaginationLink href="#">1</PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          2
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">3</PaginationLink>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
);
