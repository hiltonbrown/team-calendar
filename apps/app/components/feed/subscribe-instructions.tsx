"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  AppleIcon,
  ArrowUpRightIcon,
  CalendarDaysIcon,
  CalendarOffIcon,
  CircleAlertIcon,
  LaptopIcon,
  LockKeyholeIcon,
  PanelsTopLeftIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { SubscribeUrlField } from "./subscribe-url-field";

export interface SubscribableFeed {
  id: string;
  name: string;
  subscribeUrl: string;
}

interface LaunchMessage {
  text: string;
  tone: "error" | "status";
}

const GOOGLE_CALENDAR_URL =
  "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";
const OUTLOOK_CALENDAR_URL = "https://outlook.office.com/calendar/addcalendar";
const HTTP_PROTOCOL_PATTERN = /^https?:\/\//;

const manualInstructions = [
  {
    body: "Open the link above. Calendar will show the feed details so you can confirm the subscription and refresh frequency.",
    title: "Apple Calendar",
  },
  {
    body: "On a computer, open Google Calendar settings, choose Add calendar, then From URL. Paste the copied URL and choose Add calendar.",
    title: "Google Calendar",
  },
  {
    body: "In Outlook on the web, choose Add calendar, then Subscribe from web. Paste the copied URL, name the calendar and choose Import.",
    title: "Outlook",
  },
  {
    body: "Look for Subscribe from URL, Add internet calendar or a similar option. Importing an ICS file creates a snapshot, so choose subscription when available.",
    title: "Another calendar app",
  },
];

export function SubscribeInstructions({
  feeds,
  hasLoadError = false,
}: {
  feeds: SubscribableFeed[];
  hasLoadError?: boolean;
}) {
  const [selectedFeedId, setSelectedFeedId] = useState(feeds[0]?.id ?? "");
  const [launchMessage, setLaunchMessage] = useState<LaunchMessage | null>(
    null
  );
  const selectedFeed =
    feeds.find((feed) => feed.id === selectedFeedId) ?? feeds[0] ?? null;

  if (hasLoadError) {
    return (
      <section
        aria-labelledby="subscribe-heading"
        className="rounded-xl bg-surface-container-low p-6"
      >
        <div className="flex max-w-2xl items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-error-container text-on-error-container">
            <CircleAlertIcon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2
              className="font-semibold text-foreground text-title-lg"
              id="subscribe-heading"
            >
              Subscription options are unavailable
            </h2>
            <p className="mt-2 text-body-sm text-muted-foreground">
              Active feeds could not be loaded. Refresh the page to try again;
              your existing calendar subscriptions are not affected.
            </p>
            <Button
              className="mt-4"
              onClick={() => window.location.reload()}
              type="button"
              variant="secondary"
            >
              Try again
            </Button>
          </div>
        </div>
      </section>
    );
  }

  if (!selectedFeed) {
    return (
      <section
        aria-labelledby="subscribe-heading"
        className="rounded-xl bg-surface-container-low p-6"
      >
        <div className="flex max-w-2xl items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-muted-foreground">
            <CalendarOffIcon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2
              className="font-semibold text-foreground text-title-lg"
              id="subscribe-heading"
            >
              How to subscribe
            </h2>
            <p className="mt-2 text-body-sm text-muted-foreground">
              An active feed is needed before you can add Team Calendar to a
              calendar app. Ask an administrator to activate a feed, or create
              one if you have access.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const copyForProvider = async (provider: "Google Calendar" | "Outlook") => {
    try {
      await navigator.clipboard.writeText(selectedFeed.subscribeUrl);
      setLaunchMessage({
        text: `Subscribe URL copied. Paste it into ${provider} when the setup page opens.`,
        tone: "status",
      });
    } catch {
      setLaunchMessage({
        text: `The ${provider} setup page opened, but the URL could not be copied. Use the Copy URL button, then paste it into the setup page.`,
        tone: "error",
      });
    }
  };

  const webcalUrl = toWebcalUrl(selectedFeed.subscribeUrl);

  return (
    <section
      aria-labelledby="subscribe-heading"
      className="overflow-hidden rounded-xl bg-surface-container-low"
    >
      <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:p-8">
        <div className="min-w-0">
          <h2
            className="max-w-xl text-balance font-semibold text-foreground text-headline-md tracking-display"
            id="subscribe-heading"
          >
            Put team availability on your calendar
          </h2>
          <p className="mt-3 max-w-xl text-body-sm text-muted-foreground">
            Choose a feed once. Your calendar keeps it up to date on its own
            refresh schedule.
          </p>

          <div className="mt-7 rounded-2xl bg-surface-container-lowest p-5">
            <div
              className="font-medium text-foreground text-label-lg"
              id="subscribe-feed-label"
            >
              Feed to subscribe
            </div>
            {feeds.length > 1 ? (
              <Select
                onValueChange={(value) => {
                  setSelectedFeedId(value);
                  setLaunchMessage(null);
                }}
                value={selectedFeed.id}
              >
                <SelectTrigger
                  aria-labelledby="subscribe-feed-label"
                  className="mt-2 w-full rounded-md bg-surface-container-lowest"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {feeds.map((feed) => (
                    <SelectItem key={feed.id} value={feed.id}>
                      {feed.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div
                className="mt-2 rounded-md bg-surface-container-high px-4 py-3 font-medium text-label-lg"
                id="subscribe-feed"
              >
                {selectedFeed.name}
              </div>
            )}

            <div className="mt-5">
              <SubscribeUrlField
                feedName={selectedFeed.name}
                key={selectedFeed.id}
                url={selectedFeed.subscribeUrl}
              />
            </div>

            <p className="mt-4 flex items-start gap-2 text-label-md text-muted-foreground">
              <LockKeyholeIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              Anyone with this URL can subscribe. Share it only with people who
              should see this feed.
            </p>
          </div>
        </div>

        <div className="min-w-0 lg:pt-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-foreground text-title-md">
              Open in your calendar
            </h3>
            <Badge variant="secondary">Live subscription</Badge>
          </div>
          <p className="mt-2 text-body-sm text-muted-foreground">
            Subscriptions stay connected as approved availability changes.
          </p>

          <div className="mt-5 space-y-3">
            <ProviderAction
              action={
                <Button asChild className="w-full sm:w-auto">
                  <a
                    href={webcalUrl}
                    onClick={() =>
                      setLaunchMessage({
                        text: "Opening the subscription in your calendar app.",
                        tone: "status",
                      })
                    }
                  >
                    Open Apple Calendar
                    <ArrowUpRightIcon aria-hidden="true" />
                  </a>
                </Button>
              }
              description="On an Apple device, opens Calendar with the feed ready to add."
              icon={<AppleIcon aria-hidden="true" />}
              meta="Apple devices"
              title="Apple Calendar"
            />
            <ProviderAction
              action={
                <Button
                  asChild
                  className="w-full sm:w-auto"
                  variant="secondary"
                >
                  <a
                    href={GOOGLE_CALENDAR_URL}
                    onClick={() => {
                      copyForProvider("Google Calendar");
                    }}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Google Calendar
                    <ArrowUpRightIcon aria-hidden="true" />
                  </a>
                </Button>
              }
              description="Copies the URL and opens Add calendar. Use a desktop browser."
              icon={<CalendarDaysIcon aria-hidden="true" />}
              meta="Desktop"
              title="Google Calendar"
            />
            <ProviderAction
              action={
                <Button
                  asChild
                  className="w-full sm:w-auto"
                  variant="secondary"
                >
                  <a
                    href={OUTLOOK_CALENDAR_URL}
                    onClick={() => {
                      copyForProvider("Outlook");
                    }}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Outlook
                    <ArrowUpRightIcon aria-hidden="true" />
                  </a>
                </Button>
              }
              description="Copies the URL and opens Subscribe from web."
              icon={<PanelsTopLeftIcon aria-hidden="true" />}
              meta="Web setup"
              title="Outlook"
            />
            <ProviderAction
              action={
                <Button asChild className="w-full sm:w-auto" variant="ghost">
                  <a
                    href={webcalUrl}
                    onClick={() =>
                      setLaunchMessage({
                        text: "Opening the feed in your default calendar app.",
                        tone: "status",
                      })
                    }
                  >
                    Open calendar app
                    <ArrowUpRightIcon aria-hidden="true" />
                  </a>
                </Button>
              }
              description="Uses the calendar subscription app registered on this device."
              icon={<LaptopIcon aria-hidden="true" />}
              meta="Other apps"
              title="Calendar app"
            />
          </div>

          {launchMessage ? (
            <p
              aria-live={
                launchMessage.tone === "error" ? "assertive" : "polite"
              }
              className={`mt-4 rounded-xl px-4 py-3 text-body-sm ${
                launchMessage.tone === "error"
                  ? "bg-error-container text-on-error-container"
                  : "bg-secondary text-secondary-foreground"
              }`}
              role={launchMessage.tone === "error" ? "alert" : "status"}
            >
              {launchMessage.text}
            </p>
          ) : null}
        </div>
      </div>

      <div className="bg-surface-container px-6 py-2 lg:px-8">
        <Accordion collapsible type="single">
          <AccordionItem className="border-b-0" value="manual-setup">
            <AccordionTrigger className="rounded-xl py-4">
              Need a hand? View manual setup steps
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-5 pb-2 sm:grid-cols-2">
                {manualInstructions.map((instruction) => (
                  <div key={instruction.title}>
                    <h4 className="font-medium text-foreground text-title-sm">
                      {instruction.title}
                    </h4>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      {instruction.body}
                    </p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}

function ProviderAction({
  action,
  description,
  icon,
  meta,
  title,
}: {
  action: ReactNode;
  description: string;
  icon: ReactNode;
  meta: string;
  title: string;
}) {
  return (
    <div className="group grid gap-4 rounded-2xl bg-surface-container-lowest p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-foreground transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none [&>svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium text-foreground text-title-sm">
              {title}
            </h4>
            <span className="text-label-md text-muted-foreground">{meta}</span>
          </div>
          <p className="mt-1 text-label-md text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {action}
    </div>
  );
}

export function toWebcalUrl(url: string): string {
  return url.replace(HTTP_PROTOCOL_PATTERN, "webcal://");
}
