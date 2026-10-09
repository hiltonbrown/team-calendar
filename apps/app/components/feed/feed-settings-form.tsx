"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { updateFeedAction } from "@/app/(authenticated)/feeds/_actions";
import { type FeedPrivacyMode, feedPrivacyOptions } from "./privacy-mode-copy";

interface FeedSettings {
  id: string;
  includesPublicHolidays: boolean;
  name: string;
  privacyMode: FeedPrivacyMode;
}

export function FeedSettingsForm({
  feed,
  organisationId,
}: {
  feed: FeedSettings;
  organisationId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(feed.name);
  const [privacyMode, setPrivacyMode] = useState(feed.privacyMode);
  const [includesPublicHolidays, setIncludesPublicHolidays] = useState(
    feed.includesPublicHolidays
  );
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    text: string;
    tone: "error" | "status";
  } | null>(null);

  const trimmedName = name.trim();
  const patch = {
    ...(trimmedName === feed.name ? {} : { name: trimmedName }),
    ...(privacyMode === feed.privacyMode ? {} : { privacyMode }),
    ...(includesPublicHolidays === feed.includesPublicHolidays
      ? {}
      : { includesPublicHolidays }),
  };
  const hasChanges = Object.keys(patch).length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!(hasChanges && trimmedName)) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await updateFeedAction({
        feedId: feed.id,
        organisationId,
        patch,
      });
      if (!result.ok) {
        setMessage({ text: result.error.message, tone: "error" });
        return;
      }
      setMessage({ text: "Feed settings saved.", tone: "status" });
      router.refresh();
    });
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="feed-settings-name">Feed name</Label>
        <Input
          aria-invalid={trimmedName ? undefined : true}
          id="feed-settings-name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="font-medium text-label-lg">Privacy</legend>
        <RadioGroup
          className="space-y-2"
          onValueChange={(value) => {
            const option = feedPrivacyOptions.find(
              (candidate) => candidate.value === value
            );
            if (option) {
              setPrivacyMode(option.value);
            }
          }}
          value={privacyMode}
        >
          {feedPrivacyOptions.map((option) => (
            <div
              className="flex items-start gap-3 rounded-sm bg-surface-container px-4 py-3"
              key={option.value}
            >
              <RadioGroupItem
                aria-describedby={`feed-privacy-${option.value}-help`}
                className="mt-0.5"
                id={`feed-privacy-${option.value}`}
                value={option.value}
              />
              <div>
                <Label htmlFor={`feed-privacy-${option.value}`}>
                  {option.label}
                </Label>
                <p
                  className="text-label-md text-muted-foreground"
                  id={`feed-privacy-${option.value}-help`}
                >
                  {option.description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex items-center justify-between gap-4 rounded-sm bg-surface-container px-4 py-3">
        <Label htmlFor="feed-settings-holidays">Include public holidays</Label>
        <Switch
          checked={includesPublicHolidays}
          id="feed-settings-holidays"
          onCheckedChange={setIncludesPublicHolidays}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          aria-busy={isPending}
          disabled={isPending || !hasChanges || !trimmedName}
          type="submit"
        >
          Save changes
        </Button>
        {message ? (
          <p
            aria-live={message.tone === "error" ? "assertive" : "polite"}
            className={
              message.tone === "error"
                ? "text-body-sm text-destructive"
                : "text-body-sm text-muted-foreground"
            }
            role={message.tone === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
