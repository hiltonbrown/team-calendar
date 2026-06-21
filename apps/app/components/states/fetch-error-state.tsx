import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import type { ReactNode } from "react";

interface FetchErrorStateProps {
  readonly entityName: string;
  readonly retrySlot?: ReactNode;
}

export const FetchErrorState = ({
  entityName,
  retrySlot,
}: FetchErrorStateProps) => (
  <Empty>
    <EmptyHeader>
      <EmptyTitle>Unable to load {entityName}</EmptyTitle>
      <EmptyDescription>
        Try again. If the issue continues, check the Xero connection and contact
        support with this page name.
      </EmptyDescription>
    </EmptyHeader>
    {retrySlot && <EmptyContent>{retrySlot}</EmptyContent>}
  </Empty>
);
