"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { FetchErrorState } from "@/components/states/fetch-error-state";

export default function PlansError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col p-6">
      <h1 className="sr-only">Plans</h1>
      <FetchErrorState
        description="Plans could not be refreshed. Your selected organisation and URL filters are unchanged; try loading this view again."
        entityName="plans"
        retrySlot={
          <Button onClick={reset} type="button" variant="secondary">
            Try again
          </Button>
        }
      />
    </div>
  );
}
