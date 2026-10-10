export const manualSubscribeInstructions = [
  {
    body: "Choose Add to Apple Calendar, or in Calendar choose File, then New Calendar Subscription, and paste the URL.",
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
] as const;
