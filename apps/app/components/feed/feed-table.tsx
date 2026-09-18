"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  archiveFeedAction,
  pauseFeedAction,
  restoreFeedAction,
  resumeFeedAction,
  rotateTokenAction,
} from "@/app/(authenticated)/feeds/_actions";
import { withOrg } from "@/lib/navigation/org-url";
import { FeedStatusDot } from "./feed-status-dot";
import { SubscribeUrlField } from "./subscribe-url-field";

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
  subscribeUrl: string | null;
}

export function FeedTable({
  canManage,
  feeds,
  orgQueryValue,
  organisationId,
}: {
  canManage: boolean;
  feeds: FeedTableItem[];
  orgQueryValue: string | null;
  organisationId: string;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<{
    action: "archive" | "rotate";
    feed: FeedTableItem;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);
  const actionTriggerRefs = useRef(new Map<string, HTMLButtonElement>());

  const closeConfirmation = () => {
    const feedId = confirmation?.feed.id;
    setConfirmation(null);
    if (feedId) {
      window.setTimeout(() => actionTriggerRefs.current.get(feedId)?.focus());
    }
  };

  const rotate = (feedId: string) => {
    startTransition(async () => {
      const result = await rotateTokenAction({ feedId, organisationId });
      if (!result.ok) {
        setMessage({ text: result.error.message, tone: "error" });
        return;
      }
      setMessage({
        text: "Feed token rotated. The subscribe URL has been updated.",
        tone: "status",
      });
      closeConfirmation();
      router.refresh();
    });
  };

  const transition = (
    action: "archive" | "pause" | "restore" | "resume",
    feed: FeedTableItem
  ) => {
    if (action === "archive" && confirmation?.feed.id !== feed.id) {
      setConfirmation({ action, feed });
      return;
    }
    startTransition(async () => {
      const input = { feedId: feed.id, organisationId };
      const result = await runFeedTransition(action, input);
      if (!result.ok) {
        setMessage({ text: result.error.message, tone: "error" });
        return;
      }
      setMessage({
        text: transitionSuccessMessage(action),
        tone: "status",
      });
      setConfirmation(null);
      router.refresh();
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-muted">
      {message && !confirmation ? (
        <p
          aria-live={message.tone === "error" ? "assertive" : "polite"}
          className="m-3 rounded-2xl bg-background p-3 text-sm"
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!(open || isPending)) {
            closeConfirmation();
          }
        }}
        open={confirmation !== null}
      >
        {confirmation ? (
          <AlertDialogContent aria-busy={isPending}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmation.action === "rotate"
                  ? "Rotate this feed token?"
                  : `Archive ${confirmation.feed.name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmation.action === "rotate"
                  ? "Rotating the token invalidates the current subscribe URL. Subscribers will need the new URL to continue syncing."
                  : "Archiving this feed stops it from publishing and revokes its tokens. Existing subscribers will see a stopped calendar. You can restore the feed from the Archived filter, but its tokens must be recreated."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {message?.tone === "error" ? (
              <p className="text-destructive text-sm" role="alert">
                {message.text}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <Button
                disabled={isPending}
                onClick={() =>
                  confirmation.action === "rotate"
                    ? rotate(confirmation.feed.id)
                    : transition("archive", confirmation.feed)
                }
                type="button"
                variant="destructive"
              >
                {confirmation.action === "rotate" ? "Rotate" : "Archive feed"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
      <div className="hidden gap-4 p-4 text-muted-foreground text-sm lg:grid lg:grid-cols-[1.4fr_0.7fr_0.7fr_1fr_1fr]">
        <span>Feed</span>
        <span>Status</span>
        <span>Privacy</span>
        <span>Scope</span>
        <span>Activity</span>
      </div>
      <div className="space-y-3 p-3 pt-0">
        {feeds.map((feed) => (
          <article className="rounded-2xl bg-background p-4" key={feed.id}>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_0.7fr_1fr_1fr]">
              <div>
                <span className="mb-1 block text-muted-foreground text-xs lg:hidden">
                  Feed
                </span>
                <Link
                  className="font-semibold text-foreground hover:text-primary"
                  href={withOrg(`/feeds/${feed.id}`, orgQueryValue)}
                >
                  {feed.name}
                </Link>
                {feed.description ? (
                  <p className="mt-1 text-muted-foreground text-sm">
                    {feed.description}
                  </p>
                ) : null}
              </div>
              <div>
                <span className="mb-1 block text-muted-foreground text-xs lg:hidden">
                  Status
                </span>
                <FeedStatusDot status={feed.status} />
              </div>
              <div>
                <span className="mb-1 block text-muted-foreground text-xs lg:hidden">
                  Privacy
                </span>
                <Badge variant="secondary">
                  {privacyLabel(feed.privacyMode)}
                </Badge>
              </div>
              <div>
                <span className="mb-1 block text-muted-foreground text-xs lg:hidden">
                  Scope
                </span>
                <span className="text-sm">{feed.scopeSummary}</span>
              </div>
              <div>
                <span className="mb-1 block text-muted-foreground text-xs lg:hidden">
                  Activity
                </span>
                <div className="text-muted-foreground text-xs">
                  {feed.activeTokenHint?.lastUsedAt
                    ? `Used ${formatRelative(feed.activeTokenHint.lastUsedAt)}`
                    : "Never used"}
                </div>
              </div>
            </div>
            <div className="mt-5">
              <SubscribeUrlField feedName={feed.name} url={feed.subscribeUrl} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`Manage ${feed.name}`}
                      disabled={isPending}
                      ref={(node) => {
                        if (node) {
                          actionTriggerRefs.current.set(feed.id, node);
                        } else {
                          actionTriggerRefs.current.delete(feed.id);
                        }
                      }}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Manage {feed.name}</DropdownMenuLabel>
                    <DropdownMenuItem
                      disabled={feed.status === "archived"}
                      onSelect={() =>
                        setConfirmation({ action: "rotate", feed })
                      }
                    >
                      <RotateCwIcon />
                      Rotate token
                    </DropdownMenuItem>
                    <FeedStatusMenuItem feed={feed} onTransition={transition} />
                    <DropdownMenuItem
                      disabled={feed.status === "archived"}
                      onSelect={() => transition("archive", feed)}
                      variant="destructive"
                    >
                      <ArchiveIcon />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function FeedStatusMenuItem({
  feed,
  onTransition,
}: {
  feed: FeedTableItem;
  onTransition: (
    action: "archive" | "pause" | "restore" | "resume",
    feed: FeedTableItem
  ) => void;
}) {
  if (feed.status === "active") {
    return (
      <DropdownMenuItem onSelect={() => onTransition("pause", feed)}>
        <PauseIcon />
        Pause
      </DropdownMenuItem>
    );
  }
  if (feed.status === "archived") {
    return (
      <DropdownMenuItem onSelect={() => onTransition("restore", feed)}>
        <RotateCcwIcon />
        Restore
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem onSelect={() => onTransition("resume", feed)}>
      <PlayIcon />
      Resume
    </DropdownMenuItem>
  );
}

function runFeedTransition(
  action: "archive" | "pause" | "restore" | "resume",
  input: { feedId: string; organisationId: string }
) {
  if (action === "archive") {
    return archiveFeedAction(input);
  }
  if (action === "pause") {
    return pauseFeedAction(input);
  }
  if (action === "restore") {
    return restoreFeedAction(input);
  }
  return resumeFeedAction(input);
}

function transitionSuccessMessage(
  action: "archive" | "pause" | "restore" | "resume"
): string {
  if (action === "archive") {
    return "Feed archived.";
  }
  if (action === "pause") {
    return "Feed paused.";
  }
  if (action === "restore") {
    return "Feed restored in a paused state. Create a new token before publishing.";
  }
  return "Feed resumed.";
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
