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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import {
  ArchiveIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveFeedAction,
  pauseFeedAction,
  restoreFeedAction,
  resumeFeedAction,
  rotateTokenAction,
} from "@/app/(authenticated)/feeds/_actions";
import { FeedStatusDot } from "./feed-status-dot";
import { feedPrivacyDescription, feedPrivacyLabel } from "./privacy-mode-copy";
import { SubscribeInstructions } from "./subscribe-instructions";

interface PreviewEvent {
  description: string | null;
  endsAt: string;
  sourceRecordId: string;
  startsAt: string;
  summary: string;
}

export function FeedDetail({
  canManage,
  detail,
  organisationId,
  previews,
}: {
  canManage: boolean;
  detail: {
    activeTokenHint: {
      createdAt: Date;
      hint: string;
      lastUsedAt: Date | null;
    } | null;
    description: string | null;
    id: string;
    includesPublicHolidays: boolean;
    name: string;
    privacyMode: "masked" | "named" | "private";
    scopeSummary: string;
    scopes: Array<{ id: string; label: string; scopeType: string }>;
    status: "active" | "archived" | "paused";
    subscribeUrl: string | null;
    tokenHistory?: Array<{
      createdAt: Date;
      id: string;
      revokedAt: Date | null;
      status: string;
    }>;
  };
  organisationId: string;
  previews: Partial<Record<"masked" | "named" | "private", PreviewEvent[]>>;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<"archive" | "rotate" | null>(
    null
  );
  const [subscribeUrl, setSubscribeUrl] = useState(detail.subscribeUrl);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);

  const rotate = () => {
    startTransition(async () => {
      const result = await rotateTokenAction({
        feedId: detail.id,
        organisationId,
      });
      if (!result.ok) {
        setMessage({ text: result.error.message, tone: "error" });
        return;
      }
      setSubscribeUrl(result.value.subscribeUrl);
      setMessage({
        text: "Feed token rotated. The subscribe URL has been updated.",
        tone: "status",
      });
      setConfirmation(null);
      router.refresh();
    });
  };

  const transition = (action: "archive" | "pause" | "restore" | "resume") => {
    if (action === "archive" && confirmation !== "archive") {
      setConfirmation("archive");
      return;
    }
    startTransition(async () => {
      const input = { feedId: detail.id, organisationId };
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
    <div className="space-y-6">
      {message && !confirmation ? (
        <p
          aria-live={message.tone === "error" ? "assertive" : "polite"}
          className="rounded-[20px] bg-muted p-3 text-sm"
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
      <header>
        <div className="flex items-center gap-2">
          <FeedStatusDot status={detail.status} />
          <Badge variant="secondary">
            {feedPrivacyLabel(detail.privacyMode)}
          </Badge>
        </div>
        <h2 className="mt-3 font-semibold text-foreground text-title-lg">
          {detail.name}
        </h2>
        {detail.description ? (
          <p className="mt-1 text-muted-foreground text-sm">
            {detail.description}
          </p>
        ) : null}
      </header>

      <FeedConfirmationDialog
        confirmation={confirmation}
        errorMessage={message?.tone === "error" ? message.text : null}
        feedName={detail.name}
        isPending={isPending}
        onArchive={() => transition("archive")}
        onClose={() => setConfirmation(null)}
        onRotate={rotate}
      />

      <SubscribeInstructions
        feeds={
          subscribeUrl
            ? [{ id: detail.id, name: detail.name, subscribeUrl }]
            : []
        }
      />

      <section className="rounded-[20px] bg-muted p-5">
        <h3 className="font-semibold text-title-md">Preview and visibility</h3>
        <PreviewTabs previews={previews} />
      </section>

      <details className="rounded-[20px] bg-muted p-5 text-sm">
        <summary className="cursor-pointer font-semibold">
          Scope and privacy
        </summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <section>
            <h3 className="font-medium">Scope</h3>
            <p className="mt-1">{detail.scopeSummary}</p>
            <ul className="mt-3 space-y-2">
              {detail.scopes.map((scope) => (
                <li key={scope.id}>{scope.label}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-medium">Privacy</h3>
            <p className="mt-1 text-muted-foreground">
              {feedPrivacyDescription(detail.privacyMode)}
            </p>
            <p className="mt-1 text-muted-foreground">
              Public holidays are{" "}
              {detail.includesPublicHolidays ? "included" : "not included"}.
            </p>
          </section>
        </div>
      </details>

      {canManage ? (
        <details className="rounded-[20px] bg-muted p-5 text-sm">
          <summary className="cursor-pointer font-semibold">
            Token history and lifecycle
          </summary>
          {detail.tokenHistory && detail.tokenHistory.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {detail.tokenHistory.map((token) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  key={token.id}
                >
                  <span className="font-mono">••••{token.id.slice(-4)}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{token.status}</Badge>
                    <span className="text-muted-foreground">
                      {formatDate(token.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-muted-foreground">No prior tokens.</p>
          )}
          <p className="mt-4 text-muted-foreground text-xs">
            {detail.activeTokenHint
              ? `Active token created ${formatDate(detail.activeTokenHint.createdAt)}${detail.activeTokenHint.lastUsedAt ? `, last used ${formatDate(detail.activeTokenHint.lastUsedAt)}` : ", never used"}`
              : "This feed has no active token."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              disabled={isPending || detail.status === "archived"}
              onClick={() => setConfirmation("rotate")}
              type="button"
              variant="secondary"
            >
              <RotateCwIcon className="mr-2 size-4" />
              Rotate token
            </Button>
            <FeedLifecycleActions
              isPending={isPending}
              onTransition={transition}
              status={detail.status}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function FeedLifecycleActions({
  isPending,
  onTransition,
  status,
}: {
  isPending: boolean;
  onTransition: (action: "archive" | "pause" | "restore" | "resume") => void;
  status: "active" | "archived" | "paused";
}) {
  const isArchived = status === "archived";
  return (
    <div className="flex flex-wrap gap-2">
      <FeedLifecycleToggle
        isPending={isPending}
        onTransition={onTransition}
        status={status}
      />
      <Button
        disabled={isPending || isArchived}
        onClick={() => onTransition("archive")}
        type="button"
        variant="destructive"
      >
        <ArchiveIcon className="mr-2 size-4" />
        Archive
      </Button>
    </div>
  );
}

function FeedConfirmationDialog({
  confirmation,
  errorMessage,
  feedName,
  isPending,
  onArchive,
  onClose,
  onRotate,
}: {
  confirmation: "archive" | "rotate" | null;
  errorMessage: string | null;
  feedName: string;
  isPending: boolean;
  onArchive: () => void;
  onClose: () => void;
  onRotate: () => void;
}) {
  const isRotate = confirmation === "rotate";
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!(open || isPending)) {
          onClose();
        }
      }}
      open={confirmation !== null}
    >
      {confirmation ? (
        <AlertDialogContent aria-busy={isPending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRotate ? "Rotate this feed token?" : `Archive ${feedName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRotate
                ? "Rotating the token invalidates the current subscribe URL. Subscribers will need the new URL to continue syncing."
                : "Archiving this feed stops it from publishing and revokes its tokens. Existing subscribers will see a stopped calendar. You can restore the feed from the Archived filter, but its tokens must be recreated."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorMessage ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button
              disabled={isPending}
              onClick={isRotate ? onRotate : onArchive}
              type="button"
              variant="destructive"
            >
              {isRotate ? "Rotate" : "Archive feed"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}

function FeedLifecycleToggle({
  isPending,
  onTransition,
  status,
}: {
  isPending: boolean;
  onTransition: (action: "archive" | "pause" | "restore" | "resume") => void;
  status: "active" | "archived" | "paused";
}) {
  if (status === "active") {
    return (
      <Button
        disabled={isPending}
        onClick={() => onTransition("pause")}
        type="button"
        variant="secondary"
      >
        <PauseIcon className="mr-2 size-4" />
        Pause
      </Button>
    );
  }
  if (status === "archived") {
    return (
      <Button
        disabled={isPending}
        onClick={() => onTransition("restore")}
        type="button"
        variant="secondary"
      >
        <RotateCcwIcon className="mr-2 size-4" />
        Restore
      </Button>
    );
  }
  return (
    <Button
      disabled={isPending}
      onClick={() => onTransition("resume")}
      type="button"
      variant="secondary"
    >
      <PlayIcon className="mr-2 size-4" />
      Resume
    </Button>
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

function PreviewTabs({
  previews,
}: {
  previews: Partial<Record<"masked" | "named" | "private", PreviewEvent[]>>;
}) {
  const modes = Object.keys(previews) as Array<"masked" | "named" | "private">;
  return (
    <Tabs className="mt-4" defaultValue={modes[0]}>
      <TabsList>
        {modes.map((mode) => (
          <TabsTrigger key={mode} value={mode}>
            {feedPrivacyLabel(mode)}
          </TabsTrigger>
        ))}
      </TabsList>
      {modes.map((mode) => (
        <TabsContent className="mt-4 space-y-3" key={mode} value={mode}>
          {(previews[mode] ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No upcoming events. Your feed will update automatically when leave
              or availability is added.
            </p>
          ) : (
            previews[mode]?.map((event) => (
              <div
                className="rounded-2xl bg-background p-3 text-sm"
                key={event.sourceRecordId}
              >
                <div className="font-medium">{event.summary}</div>
                <div className="mt-1 text-muted-foreground text-xs">
                  {formatDate(new Date(event.startsAt))} to{" "}
                  {formatDate(new Date(event.endsAt))}
                </div>
                {event.description ? (
                  <p className="mt-2 text-muted-foreground">
                    {event.description}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
