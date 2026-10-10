"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import type { FeedListItem } from "@repo/feeds";
import { ChevronRightIcon, PauseIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { withOrg } from "@/lib/navigation/org-url";
import { FeedProviderButtons } from "./feed-provider-buttons";
import { feedPrivacyLabel } from "./privacy-mode-copy";

export type OtherFeed = Pick<
  FeedListItem,
  "id" | "name" | "privacyMode" | "scopeSummary" | "status" | "subscribeUrl"
>;

export function OtherFeedsList({
  feeds,
  orgQueryValue,
}: {
  feeds: OtherFeed[];
  orgQueryValue: string | null;
}) {
  if (feeds.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="other-feeds-heading">
      <h2
        className="font-semibold text-foreground text-title-md"
        id="other-feeds-heading"
      >
        Other feeds you can use
      </h2>
      <ul className="mt-3 space-y-2">
        {feeds.map((feed) => (
          <li
            className="flex min-h-14 flex-col gap-3 rounded-lg bg-surface-container-low px-4 py-3 sm:flex-row sm:items-center"
            key={feed.id}
          >
            <div className="min-w-0 flex-1">
              <Link
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                href={withOrg(`/feeds/${feed.id}`, orgQueryValue)}
              >
                {feed.name}
                <ChevronRightIcon aria-hidden="true" className="size-4" />
              </Link>
              <p className="text-label-md text-muted-foreground">
                {feed.scopeSummary} · {feedPrivacyLabel(feed.privacyMode)}
                {feed.status === "paused" ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-foreground">
                    <PauseIcon aria-hidden="true" className="size-3.5" />
                    Paused, not updating
                  </span>
                ) : null}
              </p>
            </div>
            {feed.status === "active" && feed.subscribeUrl ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label={`Add ${feed.name} to a calendar`}
                    className="self-start sm:self-auto"
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon aria-hidden="true" />
                    Add
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 rounded-lg">
                  <p className="mb-3 font-medium text-label-lg">
                    Add {feed.name}
                  </p>
                  <FeedProviderButtons
                    feedName={feed.name}
                    layout="stack"
                    subscribeUrl={feed.subscribeUrl}
                  />
                </PopoverContent>
              </Popover>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
