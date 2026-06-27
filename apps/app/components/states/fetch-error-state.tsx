import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import type { ReactNode } from "react";

interface FetchErrorStateProps {
  readonly description?: string;
  readonly entityName: string;
  readonly retrySlot?: ReactNode;
}

export const FetchErrorState = ({
  description,
  entityName,
  retrySlot,
}: FetchErrorStateProps) => (
  <Empty>
    <EmptyHeader>
      <EmptyTitle>Unable to load {entityName}</EmptyTitle>
      <EmptyDescription>
        {description ??
          "Try again. If the issue continues, check the Xero connection and contact support with this page name."}
      </EmptyDescription>
    </EmptyHeader>
    {retrySlot && <EmptyContent>{retrySlot}</EmptyContent>}
  </Empty>
);
