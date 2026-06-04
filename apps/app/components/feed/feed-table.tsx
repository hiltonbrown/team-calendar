"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  ArchiveIcon,
  CheckIcon,
  CopyIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  archiveFeedAction,
  pauseFeedAction,
  resumeFeedAction,
  rotateTokenAction,
} from "@/app/(authenticated)/feeds/_actions";
import {
  buildSubscribeUrl,
  useFeedTokenSession,
} from "@/app/(authenticated)/feeds/feed-token-session";

export interface FeedTableItem {
  activeTokenHint: { hint: string; lastUsedAt: Date | null } | null;
  createdAt: Date;
  description: string | null;
  id: string;
  includesPublicHolidays: boolean;
  lastRenderedAt: Date | null;
  name: string;
  privacyMode: "masked" | "named" | "private";
  scopeCount: number;
  scopeSummary: string;
  status: "active" | "archived" | "paused";
}

export function FeedTable({
  canManage,
  feeds,
  organisationId,
}: {
  canManage: boolean;
  feeds: FeedTableItem[];
  organisationId: string;
}) {
  const [copiedFeedId, setCopiedFeedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    action: "archive" | "rotate";
    feed: FeedTableItem;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const tokenSession = useFeedTokenSession();

  const copy = async (feedId: string) => {
    const plaintext = tokenSession.tokenForFeed(feedId);
    if (!plaintext) {
      window.location.href = `/feeds/${feedId}?panel=rotate`;
      return;
    }
    await navigator.clipboard.writeText(
      buildSubscribeUrl(tokenSession.origin, plaintext)
    );
    setCopiedFeedId(feedId);
    window.setTimeout(() => setCopiedFeedId(null), 2000);
  };

  const rotate = (feedId: string) => {
    startTransition(async () => {
      const result = await rotateTokenAction({ feedId, organisationId });
      if (result.ok) {
        tokenSession.setToken(feedId, result.value.plaintext);
      }
      setConfirmation(null);
    });
  };

  const transition = (
    action: "archive" | "pause" | "resume",
    feed: FeedTableItem
  ) => {
    if (action === "archive" && confirmation?.feed.id !== feed.id) {
      setConfirmation({ action, feed });
      return;
    }
    startTransition(async () => {
      const input = { feedId: feed.id, organisationId };
      if (action === "archive") {
        await archiveFeedAction(input);
      } else if (action === "pause") {
        await pauseFeedAction(input);
      } else {
        await resumeFeedAction(input);
      }
      setConfirmation(null);
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-muted">
      {confirmation && (
        <div className="m-3 rounded-2xl bg-error-container p-4 text-error text-sm">
          <p>
            {confirmation.action === "rotate"
              ? "Rotating the token invalidates the current subscribe URL. Subscribers will need the new URL to continue syncing."
              : `Archiving ${confirmation.feed.name} stops it from publishing and revokes its tokens. Existing subscribers will see a stopped calendar. This can be reversed from the Archived filter, but tokens must be recreated.`}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              disabled={isPending}
              onClick={() =>
                confirmation.action === "rotate"
                  ? rotate(confirmation.feed.id)
                  : transition("archive", confirmation.feed)
              }
              size="sm"
              type="button"
              variant="destructive"
            >
              {confirmation.action === "rotate" ? "Rotate" : "Archive feed"}
            </Button>
            <Button
              onClick={() => setConfirmation(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-4 p-4 text-muted-foreground text-sm lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_1fr]">
        <span>Feed</span>
        <span>Status</span>
        <span>Privacy</span>
        <span>Scope</span>
        <span>Token</span>
      </div>
      <div className="space-y-3 p-3 pt-0">
        {feeds.map((feed) => (
          <article className="rounded-2xl bg-background p-4" key={feed.id}>
            <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_1fr]">
              <div>
                <Link
                  className="font-semibold text-foreground hover:text-primary"
                  href={`/feeds/${feed.id}`}
                >
                  {feed.name}
                </Link>
                {feed.description && (
                  <p className="mt-1 text-muted-foreground text-sm">
                    {feed.description}
                  </p>
                )}
              </div>
              <StatusDot status={feed.status} />
              <Badge variant="secondary">
                {privacyLabel(feed.privacyMode)}
              </Badge>
              <span className="text-sm">{feed.scopeSummary}</span>
              <div className="text-sm">
                <div>
                  {feed.activeTokenHint
                    ? `xxxx${feed.activeTokenHint.hint}`
                    : "No active token"}
                </div>
                <div className="text-muted-foreground text-xs">
                  {feed.activeTokenHint?.lastUsedAt
                    ? `Used ${formatRelative(feed.activeTokenHint.lastUsedAt)}`
                    : "Never used"}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => copy(feed.id)}
                size="sm"
                title="Rotate the token to get a fresh subscribe URL. Subscribe URLs are only shown when a token is created or rotated."
                type="button"
                variant="secondary"
              >
                {copiedFeedId === feed.id ? (
                  <CheckIcon className="mr-2 size-4" />
                ) : (
                  <CopyIcon className="mr-2 size-4" />
                )}
                {copiedFeedId === feed.id ? "Copied" : "Copy URL"}
              </Button>
              {canManage && (
                <>
                  <Button
                    disabled={isPending}
                    onClick={() => setConfirmation({ action: "rotate", feed })}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <RotateCwIcon className="mr-2 size-4" />
                    Rotate token
                  </Button>
                  {feed.status === "active" ? (
                    <Button
                      disabled={isPending}
                      onClick={() => transition("pause", feed)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <PauseIcon className="mr-2 size-4" />
                      Pause
                    </Button>
                  ) : (
                    <Button
                      disabled={isPending || feed.status === "archived"}
                      onClick={() => transition("resume", feed)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <PlayIcon className="mr-2 size-4" />
                      Resume
                    </Button>
                  )}
                  <Button
                    disabled={isPending || feed.status === "archived"}
                    onClick={() => transition("archive", feed)}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    <ArchiveIcon className="mr-2 size-4" />
                    Archive
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: FeedTableItem["status"] }) {
  let colour = "bg-muted-foreground";
  if (status === "active") {
    colour = "bg-primary";
  } else if (status === "paused") {
    colour = "bg-amber-500";
  }
  return (
    <span className="flex items-center gap-2 text-sm capitalize">
      <span className={`size-2 rounded-full ${colour}`} />
      {status}
    </span>
  );
}

function privacyLabel(value: FeedTableItem["privacyMode"]): string {
  if (value === "named") {
    return "Named";
  }
  if (value === "masked") {
    return "Masked";
  }
  return "Private";
}

function formatRelative(date: Date): string {
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds} seconds ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hours ago`;
  }
  return `${Math.round(hours / 24)} days ago`;
}
