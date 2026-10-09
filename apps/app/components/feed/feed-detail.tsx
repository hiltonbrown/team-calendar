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
  issueTokenAction,
  pauseFeedAction,
  restoreFeedAction,
  resumeFeedAction,
  rotateTokenAction,
} from "@/app/(authenticated)/feeds/_actions";
import { FeedProviderButtons } from "./feed-provider-buttons";
import { FeedSettingsForm } from "./feed-settings-form";
import { FeedStatusDot } from "./feed-status-dot";
import { feedPrivacyDescription, feedPrivacyLabel } from "./privacy-mode-copy";
import { SubscribeUrlField } from "./subscribe-url-field";

interface PreviewEvent {
  description: string | null;
  endsAt: string;
  sourceRecordId: string;
  startsAt: string;
  summary: string;
}

interface FeedDetailData {
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
}

interface TokenDisclosure {
  basis: string;
  url: string | null;
}

export function FeedDetail({
  canManage,
  detail,
  isAdmin,
  organisationId,
  previews,
  previewErrors = {},
}: {
  /** Admins, or the owner of a personal or team feed. */
  canManage: boolean;
  detail: FeedDetailData;
  /** Restore and new subscribe URLs stay with administrators. */
  isAdmin: boolean;
  organisationId: string;
  previews: Partial<Record<"masked" | "named" | "private", PreviewEvent[]>>;
  previewErrors?: Partial<Record<"masked" | "named" | "private", string>>;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<"archive" | "rotate" | null>(
    null
  );
  const receiptBasis = `${detail.id}:${detail.status}:${detail.subscribeUrl ?? ""}`;
  const [disclosure, setDisclosure] = useState<TokenDisclosure | null>(null);
  const subscribeUrl = resolveSubscribeUrl(detail, receiptBasis, disclosure);
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
      setDisclosure({ basis: receiptBasis, url: result.value.subscribeUrl });
      setMessage({
        text: "Feed token rotated. The subscribe URL has been updated.",
        tone: "status",
      });
      setConfirmation(null);
      router.refresh();
    });
  };

  const issue = () => {
    startTransition(async () => {
      const result = await issueTokenAction({
        feedId: detail.id,
        organisationId,
      });
      if (!result.ok) {
        setMessage({ text: result.error.message, tone: "error" });
        return;
      }
      setDisclosure({ basis: receiptBasis, url: result.value.subscribeUrl });
      setMessage({
        text: "A new subscribe URL has been created.",
        tone: "status",
      });
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
      if (action === "archive") {
        setDisclosure({ basis: receiptBasis, url: null });
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
          className="rounded-xl bg-muted p-3 text-body-sm"
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
          <p className="mt-1 text-body-sm text-muted-foreground">
            {detail.description}
          </p>
        ) : null}
      </header>

      <FeedConfirmationDialog
        confirmation={confirmation}
        errorMessage={message?.tone === "error" ? message.text : null}
        feedName={detail.name}
        isAdmin={isAdmin}
        isPending={isPending}
        onArchive={() => transition("archive")}
        onClose={() => setConfirmation(null)}
        onRotate={rotate}
      />

      <section
        aria-labelledby="feed-subscribe-heading"
        className="space-y-4 rounded-xl bg-muted p-5"
      >
        <h3 className="font-semibold text-title-md" id="feed-subscribe-heading">
          Add to your calendar
        </h3>
        {detail.status === "paused" ? (
          <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <PauseIcon aria-hidden="true" className="size-4" />
            This feed is paused and not updating subscribed calendars.
          </p>
        ) : null}
        {subscribeUrl ? (
          <>
            <FeedProviderButtons
              feedName={detail.name}
              subscribeUrl={subscribeUrl}
            />
            <SubscribeUrlField
              description="Anyone with this URL can subscribe. Share it only with people who should see this feed."
              feedName={detail.name}
              url={subscribeUrl}
            />
          </>
        ) : (
          <p className="text-body-sm text-muted-foreground">
            {detail.status === "archived"
              ? "Archived feeds do not publish a subscribe URL."
              : "This feed has no active subscribe URL."}
          </p>
        )}
      </section>

      {canManage && detail.status !== "archived" ? (
        <details className="rounded-xl bg-muted p-5 text-label-lg">
          <summary className="cursor-pointer font-semibold">
            Feed settings
          </summary>
          <div className="mt-4">
            <FeedSettingsForm
              feed={{
                id: detail.id,
                includesPublicHolidays: detail.includesPublicHolidays,
                name: detail.name,
                privacyMode: detail.privacyMode,
              }}
              key={`${detail.name}:${detail.privacyMode}:${detail.includesPublicHolidays}`}
              organisationId={organisationId}
            />
          </div>
        </details>
      ) : null}

      <section className="rounded-xl bg-muted p-5">
        <h3 className="font-semibold text-title-md">Preview and visibility</h3>
        <PreviewTabs errors={previewErrors} previews={previews} />
      </section>

      <details className="rounded-xl bg-muted p-5 text-label-lg">
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
        <TokenLifecycle
          detail={detail}
          isAdmin={isAdmin}
          isPending={isPending}
          onIssue={issue}
          onRotate={() => setConfirmation("rotate")}
          onTransition={transition}
        />
      ) : null}
    </div>
  );
}

function resolveSubscribeUrl(
  detail: Pick<FeedDetailData, "status" | "subscribeUrl">,
  receiptBasis: string,
  disclosure: TokenDisclosure | null
): string | null {
  if (detail.status === "archived") {
    return null;
  }
  if (disclosure?.basis === receiptBasis) {
    return disclosure.url;
  }
  return detail.subscribeUrl;
}

function TokenLifecycle({
  detail,
  isAdmin,
  isPending,
  onIssue,
  onRotate,
  onTransition,
}: {
  detail: FeedDetailData;
  isAdmin: boolean;
  isPending: boolean;
  onIssue: () => void;
  onRotate: () => void;
  onTransition: (action: "archive" | "pause" | "restore" | "resume") => void;
}) {
  return (
    <details className="rounded-xl bg-muted p-5 text-label-lg">
      <summary className="cursor-pointer font-semibold">
        Token history and lifecycle
      </summary>
      {detail.tokenHistory && detail.tokenHistory.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {detail.tokenHistory.map((token) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 text-label-md"
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
      <p className="mt-4 text-label-md text-muted-foreground">
        {detail.activeTokenHint
          ? `Active token created ${formatDate(detail.activeTokenHint.createdAt)}${detail.activeTokenHint.lastUsedAt ? `, last used ${formatDate(detail.activeTokenHint.lastUsedAt)}` : ", never used"}`
          : "This feed has no active token."}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {detail.activeTokenHint || isAdmin ? (
          <Button
            disabled={isPending || detail.status === "archived"}
            onClick={() => (detail.activeTokenHint ? onRotate() : onIssue())}
            type="button"
            variant="secondary"
          >
            <RotateCwIcon className="mr-2 size-4" />
            {detail.activeTokenHint ? "Rotate token" : "Create subscribe URL"}
          </Button>
        ) : null}
        <FeedLifecycleActions
          canRestore={isAdmin}
          isPending={isPending}
          onTransition={onTransition}
          status={detail.status}
        />
      </div>
    </details>
  );
}

function FeedLifecycleActions({
  canRestore,
  isPending,
  onTransition,
  status,
}: {
  canRestore: boolean;
  isPending: boolean;
  onTransition: (action: "archive" | "pause" | "restore" | "resume") => void;
  status: "active" | "archived" | "paused";
}) {
  const isArchived = status === "archived";
  return (
    <div className="flex flex-wrap gap-2">
      {isArchived && !canRestore ? null : (
        <FeedLifecycleToggle
          isPending={isPending}
          onTransition={onTransition}
          status={status}
        />
      )}
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
  isAdmin,
  isPending,
  onArchive,
  onClose,
  onRotate,
}: {
  confirmation: "archive" | "rotate" | null;
  errorMessage: string | null;
  feedName: string;
  isAdmin: boolean;
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
                : `Archiving this feed stops it from publishing and revokes its tokens. Existing subscribers will see a stopped calendar. ${isAdmin ? "You can restore it from the archived feeds in Settings, but its tokens must be recreated." : "Only an administrator can restore it."}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorMessage ? (
            <p className="text-body-sm text-destructive" role="alert">
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
  errors,
}: {
  errors: Partial<Record<"masked" | "named" | "private", string>>;
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
          <PreviewContents error={errors[mode]} events={previews[mode] ?? []} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PreviewContents({
  error,
  events,
}: {
  error: string | undefined;
  events: PreviewEvent[];
}) {
  const router = useRouter();
  if (error) {
    return (
      <div role="alert">
        <p className="text-body-sm text-error">{error}</p>
        <Button
          onClick={() => router.refresh()}
          type="button"
          variant="secondary"
        >
          Retry preview
        </Button>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        No upcoming events. Your feed will update automatically when leave or
        availability is added.
      </p>
    );
  }
  return (
    <>
      {events.map((event) => (
        <div
          className="rounded-2xl bg-background p-3 text-label-lg"
          key={event.sourceRecordId}
        >
          <div className="font-medium">{event.summary}</div>
          <div className="mt-1 text-label-md text-muted-foreground">
            {formatDate(new Date(event.startsAt))} to{" "}
            {formatDate(new Date(event.endsAt))}
          </div>
          {event.description ? (
            <p className="mt-2 text-muted-foreground">{event.description}</p>
          ) : null}
        </div>
      ))}
    </>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
