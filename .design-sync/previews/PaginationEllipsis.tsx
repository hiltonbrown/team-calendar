import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
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
        <PaginationEllipsis />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#" isActive>
          8
        </PaginationLink>
      </PaginationItem>
      <PaginationItem>
        <PaginationEllipsis />
      </PaginationItem>
      <PaginationItem>
        <PaginationLink href="#">24</PaginationLink>
      </PaginationItem>
    </PaginationContent>
  </Pagination>
);
