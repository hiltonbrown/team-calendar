"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { ArchiveIcon, PauseIcon, PlayIcon, RotateCwIcon } from "lucide-react";
import { useState, useTransition } from "react";
import {
  archiveFeedAction,
  pauseFeedAction,
  resumeFeedAction,
  rotateTokenAction,
} from "@/app/(authenticated)/feeds/_actions";
import { useFeedTokenSession } from "@/app/(authenticated)/feeds/feed-token-session";
import { statusToneClasses } from "@/components/availability/availability-status";
import { OneTimeTokenPanel } from "./one-time-token-panel";

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
    maskedSubscribeUrl: string;
    name: string;
    privacyMode: "masked" | "named" | "private";
    scopeSummary: string;
    scopes: Array<{ id: string; label: string; scopeType: string }>;
    status: "active" | "archived" | "paused";
  };
  organisationId: string;
  previews: Partial<Record<"masked" | "named" | "private", PreviewEvent[]>>;
}) {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<"archive" | "rotate" | null>(
    null
  );
  const [showScope, setShowScope] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [isPending, startTransition] = useTransition();
  const tokenSession = useFeedTokenSession();

  const rotate = () => {
    startTransition(async () => {
      const result = await rotateTokenAction({
        feedId: detail.id,
        organisationId,
      });
      if (result.ok) {
        tokenSession.setToken(detail.id, result.value.plaintext);
        setPlaintext(result.value.plaintext);
      }
      setConfirmation(null);
    });
  };

  const transition = (action: "archive" | "pause" | "resume") => {
    if (action === "archive" && confirmation !== "archive") {
      setConfirmation("archive");
      return;
    }
    startTransition(async () => {
      const input = { feedId: detail.id, organisationId };
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
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot status={detail.status} />
            <Badge variant="secondary">
              {privacyLabel(detail.privacyMode)}
            </Badge>
          </div>
          <h2 className="mt-3 font-semibold text-foreground text-title-lg">
            {detail.name}
          </h2>
          {detail.description && (
            <p className="mt-1 text-muted-foreground text-sm">
              {detail.description}
            </p>
          )}
        </div>

        {confirmation && (
          <div className="rounded-2xl bg-error-container p-4 text-error text-sm">
            <p>
              {confirmation === "rotate"
                ? "Rotating the token invalidates the current subscribe URL. Subscribers will need the new URL to continue syncing."
                : `Archiving ${detail.name} stops it from publishing and revokes its tokens. Existing subscribers will see a stopped calendar. This can be reversed from the Archived filter, but tokens must be recreated.`}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                disabled={isPending}
                onClick={() =>
                  confirmation === "rotate" ? rotate() : transition("archive")
                }
                type="button"
                variant="destructive"
              >
                {confirmation === "rotate" ? "Rotate" : "Archive feed"}
              </Button>
              <Button
                onClick={() => setConfirmation(null)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-muted p-4">
          <div className="font-medium text-sm">Scope</div>
          <p className="mt-1 text-sm">{detail.scopeSummary}</p>
          <Button
            className="mt-2"
            onClick={() => setShowScope((value) => !value)}
            size="sm"
            type="button"
            variant="ghost"
          >
            View full scope
          </Button>
          {showScope && (
            <ul className="mt-3 space-y-2 text-sm">
              {detail.scopes.map((scope) => (
                <li key={scope.id}>{scope.label}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-muted p-4 text-sm">
          <div className="font-medium">Privacy</div>
          <p className="mt-1 text-muted-foreground">
            {privacyExplanation(detail.privacyMode)}
          </p>
        </div>

        <div className="rounded-2xl bg-muted p-4 text-sm">
          <div className="font-medium">Active token</div>
          <p className="mt-1">
            {detail.activeTokenHint
              ? `Active token: xxxx${detail.activeTokenHint.hint}, created ${formatDate(detail.activeTokenHint.createdAt)}`
              : "No active token"}
          </p>
          {canManage && (
            <Button
              className="mt-3"
              disabled={isPending}
              onClick={() => setConfirmation("rotate")}
              size="sm"
              type="button"
              variant="secondary"
            >
              <RotateCwIcon className="mr-2 size-4" />
              Rotate token
            </Button>
          )}
        </div>

        <div className="rounded-2xl bg-muted p-4 text-sm">
          <div className="font-medium">Subscribe URL</div>
          <div className="mt-2 rounded-xl bg-background p-3 font-mono text-xs">
            {showUrl
              ? detail.maskedSubscribeUrl
              : "https://••••••••••/ical/•••••••••••••.ics"}
          </div>
          <Button
            className="mt-2"
            onClick={() => setShowUrl((value) => !value)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {showUrl ? "Hide URL" : "Show URL"}
          </Button>
        </div>

        {plaintext && (
          <OneTimeTokenPanel
            feedId={detail.id}
            onDone={() => {
              tokenSession.clearToken(detail.id);
              setPlaintext(null);
            }}
            origin={tokenSession.origin}
            plaintext={plaintext}
          />
        )}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {detail.status === "active" ? (
              <Button
                disabled={isPending}
                onClick={() => transition("pause")}
                type="button"
                variant="secondary"
              >
                <PauseIcon className="mr-2 size-4" />
                Pause
              </Button>
            ) : (
              <Button
                disabled={isPending || detail.status === "archived"}
                onClick={() => transition("resume")}
                type="button"
                variant="secondary"
              >
                <PlayIcon className="mr-2 size-4" />
                Resume
              </Button>
            )}
            <Button
              disabled={isPending || detail.status === "archived"}
              onClick={() => transition("archive")}
              type="button"
              variant="destructive"
            >
              <ArchiveIcon className="mr-2 size-4" />
              Archive
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-muted p-4">
        <h3 className="font-semibold text-title-md">Preview</h3>
        <PreviewTabs previews={previews} />
      </section>
    </div>
  );
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
            {privacyLabel(mode)}
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
                {event.description && (
                  <p className="mt-2 text-muted-foreground">
                    {event.description}
                  </p>
                )}
              </div>
            ))
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function StatusDot({ status }: { status: string }) {
  let colour = statusToneClasses.private;
  if (status === "active") {
    colour = statusToneClasses.leave;
  } else if (status === "paused") {
    colour = statusToneClasses.holiday;
  }
  return (
    <span className="flex items-center gap-2 text-sm capitalize">
      <span className={`size-2 rounded-full ring-2 ${colour}`} />
      {status}
    </span>
  );
}

function privacyLabel(value: "masked" | "named" | "private"): string {
  if (value === "named") {
    return "Named";
  }
  if (value === "masked") {
    return "Masked";
  }
  return "Private";
}

function privacyExplanation(value: "masked" | "named" | "private"): string {
  if (value === "named") {
    return "Subscribers see names and leave types";
  }
  if (value === "masked") {
    return "Subscribers see Team member with leave types";
  }
  return "Subscribers see Unavailable only";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
