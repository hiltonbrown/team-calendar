"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOwnFeedAction } from "@/app/(authenticated)/feeds/_actions";
import { FeedProviderButtons } from "@/components/feed/feed-provider-buttons";
import { SubscribeUrlField } from "@/components/feed/subscribe-url-field";
import { StepHeading } from "../../onboarding/steps/step-heading";
import { useCompleteWelcome } from "./welcome-controls";

interface SubscribableFeed {
  name: string;
  subscribeUrl: string;
}

export function CalendarStep({
  fallbackFeed,
  homeHref,
  organisationId,
  personalFeed,
}: {
  fallbackFeed: SubscribableFeed | null;
  homeHref: string;
  organisationId: string;
  personalFeed: SubscribableFeed | null;
}) {
  const router = useRouter();
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, startCreate] = useTransition();
  const { complete, error, isPending } = useCompleteWelcome(
    organisationId,
    homeHref
  );
  // When a personal feed cannot be created (for example, the plan's feed
  // limit), the organisation feed is offered instead.
  const shownFeed = personalFeed ?? (createError ? fallbackFeed : null);

  const create = () => {
    setCreateError(null);
    startCreate(async () => {
      const result = await createOwnFeedAction({
        kind: "personal",
        organisationId,
      });
      if (!result.ok) {
        setCreateError(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <StepHeading
        description="Optional. See your leave and availability in Outlook, Google or Apple Calendar. It updates automatically."
        stepId="calendar"
      >
        Add your calendar
      </StepHeading>

      {shownFeed ? (
        <div className="space-y-5">
          {personalFeed ? null : (
            <p className="text-body-sm text-muted-foreground">
              Your own calendar feed is not available, so here is your
              organisation's calendar instead.
            </p>
          )}
          <p className="font-medium text-title-md">{shownFeed.name}</p>
          <FeedProviderButtons
            feedName={shownFeed.name}
            layout="stack"
            subscribeUrl={shownFeed.subscribeUrl}
          />
          <SubscribeUrlField
            description="Anyone with this URL can subscribe. Keep it to yourself."
            feedName={shownFeed.name}
            url={shownFeed.subscribeUrl}
          />
        </div>
      ) : (
        <Button
          aria-busy={isCreating}
          className="w-full"
          disabled={isCreating}
          onClick={create}
          type="button"
          variant="secondary"
        >
          Create my calendar feed
        </Button>
      )}
      {createError ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          {createError}
        </p>
      ) : null}
      {error ? (
        <p className="text-body-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={isPending}
          onClick={() => complete(true)}
          type="button"
          variant="secondary"
        >
          Skip
        </Button>
        <Button
          aria-busy={isPending}
          disabled={isPending}
          onClick={() => complete(false)}
          type="button"
          variant="secondary"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
