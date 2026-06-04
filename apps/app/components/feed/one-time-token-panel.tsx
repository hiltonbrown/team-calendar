"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { buildSubscribeUrl } from "@/app/(authenticated)/feeds/feed-token-session";

export function OneTimeTokenPanel({
  feedId,
  onDone,
  origin,
  plaintext,
}: {
  feedId: string;
  onDone: () => void;
  origin: string;
  plaintext: string;
}) {
  const [copied, setCopied] = useState(false);
  const url = buildSubscribeUrl(origin, plaintext);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl bg-primary-container p-4 text-on-primary-container">
      <div className="font-semibold text-sm">Subscribe URL ready</div>
      <p className="mt-1 text-sm">
        This URL is shown exactly once. Copy it now; it cannot be retrieved
        again after you close this panel.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={`Subscribe URL for feed ${feedId}`}
          className="font-mono text-xs"
          readOnly
          value={url}
        />
        <Button onClick={copy} type="button" variant="secondary">
          {copied ? (
            <CheckIcon className="mr-2 size-4" />
          ) : (
            <CopyIcon className="mr-2 size-4" />
          )}
          {copied ? "Copied" : "Copy URL"}
        </Button>
      </div>
      <div className="mt-3">
        <Button onClick={onDone} type="button" variant="ghost">
          Done
        </Button>
      </div>
    </div>
  );
}
