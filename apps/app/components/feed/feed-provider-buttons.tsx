"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { AppleIcon, CalendarDaysIcon, MailIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  buildProviderLinks,
  type FeedProvider,
  type ProviderAction,
} from "@/lib/feeds/provider-links";

interface ProviderOption {
  icon: ReactNode;
  label: string;
  name: string;
  provider: FeedProvider;
}

const PROVIDERS: ProviderOption[] = [
  {
    icon: <AppleIcon aria-hidden="true" />,
    label: "Add to Apple Calendar",
    name: "Apple Calendar",
    provider: "apple",
  },
  {
    icon: <CalendarDaysIcon aria-hidden="true" />,
    label: "Add to Google Calendar",
    name: "Google Calendar",
    provider: "google",
  },
  {
    icon: <MailIcon aria-hidden="true" />,
    label: "Add to Outlook",
    name: "Outlook",
    provider: "outlookWeb",
  },
];

interface StatusMessage {
  text: string;
  tone: "error" | "status";
}

export function FeedProviderButtons({
  feedName,
  layout = "row",
  subscribeUrl,
}: {
  feedName: string;
  layout?: "row" | "stack";
  subscribeUrl: string;
}) {
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const links = buildProviderLinks(subscribeUrl);

  const handleClick = async (
    option: { name: string },
    action: ProviderAction
  ) => {
    if (action.kind === "open") {
      setMessage({
        text: "If nothing opened, copy the URL and follow the steps under Other calendar apps.",
        tone: "status",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(action.copy);
      setMessage({
        text: `Subscribe URL copied. Paste it into ${option.name} when the page opens.`,
        tone: "status",
      });
    } catch {
      setMessage({
        text: `Could not copy the URL. Copy it from the subscribe URL field, then paste it into ${option.name}.`,
        tone: "error",
      });
    }
  };

  return (
    <div className="space-y-3">
      <div
        className={
          layout === "row"
            ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap"
            : "flex flex-col gap-2"
        }
      >
        {PROVIDERS.map((option) => {
          const action = links[option.provider];
          const external = action.kind === "copy_then_open";
          return (
            <Button
              asChild
              className="justify-start sm:justify-center"
              key={option.provider}
              variant="secondary"
            >
              <a
                aria-label={`${option.label}: ${feedName}`}
                href={action.href}
                onClick={() => {
                  handleClick(option, action);
                }}
                rel={external ? "noreferrer" : undefined}
                target={external ? "_blank" : undefined}
              >
                {option.icon}
                {option.label}
              </a>
            </Button>
          );
        })}
      </div>
      <p className="text-label-md text-muted-foreground">
        Using the Outlook desktop app?{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4 hover:decoration-2"
          href={links.outlookDesktop.href}
          onClick={() => {
            handleClick({ name: "Outlook" }, links.outlookDesktop);
          }}
        >
          Open in Outlook desktop
        </a>
      </p>
      {message ? (
        <p
          aria-live={message.tone === "error" ? "assertive" : "polite"}
          className={
            message.tone === "error"
              ? "rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container"
              : "rounded-sm bg-surface-container px-3 py-2 text-body-sm"
          }
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
