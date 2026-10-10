// Apple Calendar and Outlook desktop subscribe through the standard webcal://
// scheme. Google Calendar and Outlook on the web publish no documented
// prefilled subscribe link (checked October 2026), so those providers copy the
// exact subscribe URL and open their own add-by-URL page for pasting.
const GOOGLE_ADD_BY_URL =
  "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";
const OUTLOOK_WEB_ADD_CALENDAR =
  "https://outlook.office.com/calendar/addcalendar";
const HTTP_SCHEME = /^https?:\/\//;

export type FeedProvider = "apple" | "google" | "outlookDesktop" | "outlookWeb";

export type ProviderAction =
  | { href: string; kind: "open" }
  | { copy: string; href: string; kind: "copy_then_open" };

export function buildProviderLinks(
  subscribeUrl: string
): Record<FeedProvider, ProviderAction> {
  const webcal: ProviderAction = {
    href: subscribeUrl.replace(HTTP_SCHEME, "webcal://"),
    kind: "open",
  };
  return {
    apple: webcal,
    google: {
      copy: subscribeUrl,
      href: GOOGLE_ADD_BY_URL,
      kind: "copy_then_open",
    },
    outlookDesktop: webcal,
    outlookWeb: {
      copy: subscribeUrl,
      href: OUTLOOK_WEB_ADD_CALENDAR,
      kind: "copy_then_open",
    },
  };
}
