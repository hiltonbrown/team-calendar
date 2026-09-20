"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { SubscribeUrlField } from "./subscribe-url-field";

export function SubscribeUrlPanel({
  feedName,
  onDone,
  url,
}: {
  feedName: string;
  onDone: () => void;
  url: string;
}) {
  return (
    <div className="rounded-2xl bg-primary-container p-4 text-on-primary-container">
      <div className="font-semibold text-label-lg">Feed created</div>
      <p className="mt-1 text-body-sm">
        Copy this URL into your calendar app. You can return to the feed at any
        time to copy it again.
      </p>
      <div className="mt-3">
        <SubscribeUrlField feedName={feedName} url={url} />
      </div>
      <div className="mt-3">
        <Button onClick={onDone} type="button" variant="secondary">
          Open feed
        </Button>
      </div>
    </div>
  );
}
