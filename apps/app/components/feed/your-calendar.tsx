"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import type { FeedListItem } from "@repo/feeds";
import {
  CalendarOffIcon,
  CircleAlertIcon,
  LockKeyholeIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { FeedProviderButtons } from "./feed-provider-buttons";
import { feedPrivacyDescription } from "./privacy-mode-copy";
import { manualSubscribeInstructions } from "./subscribe-instruction-copy";
import { SubscribeUrlField } from "./subscribe-url-field";

export type YourCalendarFeed = Pick<
  FeedListItem,
  "id" | "name" | "privacyMode" | "scopeSummary" | "subscribeUrl"
>;

export function YourCalendar({
  actions,
  feed,
  hasLoadError = false,
  notice,
}: {
  actions?: ReactNode;
  feed: YourCalendarFeed | null;
  hasLoadError?: boolean;
  notice?: ReactNode;
}) {
  return (
    <section aria-labelledby="your-calendar-heading">
      <Card className="gap-0 p-6 sm:p-8">
        <h2
          className="font-semibold text-foreground text-title-lg"
          id="your-calendar-heading"
          tabIndex={-1}
        >
          Your calendar
        </h2>
        <YourCalendarBody feed={feed} hasLoadError={hasLoadError} />
        {actions || notice ? (
          <div className="mt-6 space-y-3 rounded-lg bg-surface-container p-4">
            {notice}
            {actions}
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function YourCalendarBody({
  feed,
  hasLoadError,
}: {
  feed: YourCalendarFeed | null;
  hasLoadError: boolean;
}) {
  if (hasLoadError) {
    return (
      <div className="mt-3 flex items-start gap-3">
        <CircleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-error"
        />
        <div>
          <p className="text-body-sm text-muted-foreground">
            Calendar feeds could not be loaded. Refresh the page to try again;
            your existing calendar subscriptions are not affected.
          </p>
          <Button
            className="mt-3"
            onClick={() => window.location.reload()}
            type="button"
            variant="secondary"
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!feed?.subscribeUrl) {
    return (
      <div className="mt-3 flex items-start gap-3">
        <CalendarOffIcon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <p className="text-body-sm text-muted-foreground">
          No calendar feed is available yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-1">
        <p className="font-medium text-foreground text-title-md">{feed.name}</p>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {feed.scopeSummary}. {feedPrivacyDescription(feed.privacyMode)}.
        </p>
      </div>
      <div className="mt-5">
        <FeedProviderButtons
          feedName={feed.name}
          subscribeUrl={feed.subscribeUrl}
        />
      </div>
      <div className="mt-6">
        <SubscribeUrlField
          description="Anyone with this URL can subscribe. Share it only with people who should see this feed."
          feedName={feed.name}
          url={feed.subscribeUrl}
        />
        <p className="mt-2 flex items-start gap-2 text-label-md text-muted-foreground">
          <LockKeyholeIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          Your calendar app refreshes the feed on its own schedule.
        </p>
      </div>
      <Accordion className="mt-4" collapsible type="single">
        <AccordionItem className="border-b-0" value="manual">
          <AccordionTrigger className="rounded-md py-3">
            Other calendar apps
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-5 pb-2 sm:grid-cols-2">
              {manualSubscribeInstructions.map((instruction) => (
                <div key={instruction.title}>
                  <h3 className="font-medium text-foreground text-title-sm">
                    {instruction.title}
                  </h3>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    {instruction.body}
                  </p>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}
