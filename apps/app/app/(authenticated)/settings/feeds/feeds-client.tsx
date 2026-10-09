"use client";

import type { OrganisationSettings } from "@repo/availability";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useState, useTransition } from "react";
import {
  type SettingSaveState,
  SettingSaveStatus,
} from "../components/setting-save-status";
import { SettingsSectionHeader } from "../components/settings-section-header";
import { updateFeedDefaultsAction } from "./_actions";

interface FeedsClientProps {
  organisationId: string;
  settings: OrganisationSettings;
}

export const FeedsClient = ({ organisationId, settings }: FeedsClientProps) => {
  const [state, setState] = useState({
    defaultFeedPrivacyMode: settings.defaultFeedPrivacyMode,
    feedsIncludePublicHolidaysDefault:
      settings.feedsIncludePublicHolidaysDefault,
  });
  const [isPending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<
    Record<"privacy" | "publicHolidays", SettingSaveState>
  >({ privacy: "idle", publicHolidays: "idle" });

  const update = (
    key: "privacy" | "publicHolidays",
    patch: Partial<typeof state>,
    successMessage = "Feed defaults updated."
  ) => {
    const previous = state;
    const next = { ...state, ...patch };
    setState(next);
    setSaveState((current) => ({ ...current, [key]: "saving" }));
    startTransition(async () => {
      const result = await updateFeedDefaultsAction({
        organisationId,
        patch,
      });
      if (!result.ok) {
        setState(previous);
        setSaveState((current) => ({ ...current, [key]: "error" }));
        toast.error(result.error.message);
        return;
      }
      setSaveState((current) => ({ ...current, [key]: "saved" }));
      toast.success(successMessage);
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Organisation defaults for new feeds, and an overview of every feed. Open a feed to pause, rotate or archive it."
        title="Feeds"
      />

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle id="feed-privacy-label">
            Default privacy mode for new feeds
          </CardTitle>
          <CardDescription id="feed-privacy-description">
            Choose how much event detail a newly created feed publishes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-describedby="feed-privacy-description feed-privacy-status"
            aria-labelledby="feed-privacy-label"
            className="space-y-3"
            disabled={isPending}
            onValueChange={(value) =>
              update(
                "privacy",
                {
                  defaultFeedPrivacyMode:
                    value === "named" ||
                    value === "masked" ||
                    value === "private"
                      ? value
                      : "named",
                },
                "Default feed privacy updated."
              )
            }
            value={state.defaultFeedPrivacyMode}
          >
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="feed-privacy-named" value="named" />
              <Label htmlFor="feed-privacy-named">Named</Label>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="feed-privacy-masked" value="masked" />
              <Label htmlFor="feed-privacy-masked">Masked</Label>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="feed-privacy-private" value="private" />
              <Label htmlFor="feed-privacy-private">Private</Label>
            </div>
          </RadioGroup>
          <SettingSaveStatus
            id="feed-privacy-status"
            state={saveState.privacy}
          />
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Include public holidays in new feeds</CardTitle>
          <CardDescription id="feed-holidays-description">
            Existing feeds keep their current public-holiday setting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
            <Label htmlFor="feed-holidays-default">
              Public holidays enabled by default
            </Label>
            <Switch
              aria-describedby="feed-holidays-description feed-holidays-status"
              checked={state.feedsIncludePublicHolidaysDefault}
              disabled={isPending}
              id="feed-holidays-default"
              onCheckedChange={(checked) =>
                update(
                  "publicHolidays",
                  { feedsIncludePublicHolidaysDefault: checked },
                  "Public holiday default updated."
                )
              }
            />
          </div>
          <SettingSaveStatus
            id="feed-holidays-status"
            state={saveState.publicHolidays}
          />
        </CardContent>
      </Card>
    </div>
  );
};
