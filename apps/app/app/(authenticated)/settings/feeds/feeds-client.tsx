"use client";

import type { OrganisationSettings } from "@repo/availability";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { toast } from "@repo/design-system/components/ui/sonner";
import { Switch } from "@repo/design-system/components/ui/switch";
import type { FeedListItem } from "@repo/feeds";
import Link from "next/link";
import { useState, useTransition } from "react";
import { SettingsSectionHeader } from "../components/settings-section-header";
import { updateFeedDefaultsAction } from "./_actions";

interface FeedsClientProps {
  feeds: FeedListItem[];
  organisationId: string;
  settings: OrganisationSettings;
}

export const FeedsClient = ({
  feeds,
  organisationId,
  settings,
}: FeedsClientProps) => {
  const [state, setState] = useState({
    defaultFeedPrivacyMode: settings.defaultFeedPrivacyMode,
    feedsIncludePublicHolidaysDefault:
      settings.feedsIncludePublicHolidaysDefault,
  });
  const [isPending, startTransition] = useTransition();

  const update = (
    patch: Partial<typeof state>,
    successMessage = "Feed defaults updated."
  ) => {
    const previous = state;
    const next = { ...state, ...patch };
    setState(next);
    startTransition(async () => {
      const result = await updateFeedDefaultsAction({
        organisationId,
        patch,
      });
      if (!result.ok) {
        setState(previous);
        toast.error(result.error.message);
        return;
      }
      toast.success(successMessage);
    });
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        description="Organisation defaults for new feeds. Detailed feed lifecycle actions stay in the main feed area."
        title="Feeds"
      />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Default privacy mode for new feeds</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            className="space-y-3"
            onValueChange={(value) =>
              update({
                defaultFeedPrivacyMode:
                  value === "named" || value === "masked" || value === "private"
                    ? value
                    : "named",
              })
            }
            value={state.defaultFeedPrivacyMode}
          >
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="feed-privacy-named" value="named" />
              <span>Named</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="feed-privacy-masked" value="masked" />
              <span>Masked</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-4 py-3">
              <RadioGroupItem id="feed-privacy-private" value="private" />
              <span>Private</span>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Include public holidays in new feeds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
            <span className="text-sm">Public holidays enabled by default</span>
            <Switch
              checked={state.feedsIncludePublicHolidaysDefault}
              disabled={isPending}
              onCheckedChange={(checked) =>
                update({ feedsIncludePublicHolidaysDefault: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>All feeds</CardTitle>
            <Button asChild>
              <Link href="/feeds/new">Create new feed</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {feeds.map((feed) => (
            <div
              className="flex items-center justify-between rounded-xl bg-muted/30 p-3 text-sm"
              key={feed.id}
            >
              <div>
                <p className="font-medium">{feed.name}</p>
                <p className="text-muted-foreground">
                  {feed.scopeSummary} · {feed.status}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/feeds/${feed.id}`}>Open</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
