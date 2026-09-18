"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { FetchErrorState } from "@/components/states/fetch-error-state";

export default function CalendarError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col p-6">
      <h1 className="sr-only">Calendar</h1>
      <FetchErrorState
        description="The calendar could not be refreshed. Your filters are still in place; try loading the same view again."
        entityName="calendar"
        retrySlot={
          <Button onClick={reset} type="button" variant="secondary">
            Try again
          </Button>
        }
      />
    </div>
  );
}
