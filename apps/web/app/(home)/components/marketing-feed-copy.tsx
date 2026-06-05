"use client";

import { log } from "@repo/observability/log";
import { useState } from "react";

interface MarketingFeedCopyProps {
  children: React.ReactNode;
  url: string;
}

export const MarketingFeedCopy = ({
  url,
  children,
}: MarketingFeedCopyProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      log.error("Failed to copy feed URL to clipboard", { error: err });
    }
  };

  return (
    <button
      className="marketing-feed-copy"
      onClick={handleCopy}
      title="Copy to clipboard"
      type="button"
    >
      {copied ? (
        <span className="marketing-copied-text">Copied!</span>
      ) : (
        children
      )}
    </button>
  );
};
