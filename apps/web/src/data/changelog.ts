export interface ChangelogEntry {
  changes: {
    type: "feat" | "fix" | "improvement" | "chore";
    text: string;
  }[];
  date: string;
  description: string;
  title: string;
  version: string;
}

export const changelog: ChangelogEntry[] = [
  {
    changes: [
      { text: "Privacy rule configuration per leave category", type: "feat" },
      {
        text: "Feed preview panel showing exactly what subscribers will see",
        type: "feat",
      },
      { text: "Token revocation and regeneration for ICS feeds", type: "feat" },
      {
        text: "ICS SEQUENCE field incremented correctly on leave updates",
        type: "improvement",
      },
      {
        text: "Feed cache invalidated reliably when leave status changes",
        type: "fix",
      },
    ],
    date: "2026-04-15",
    description:
      "Administrators can now configure privacy rules per leave category. Sensitive categories can be hidden entirely or published as unavailable without detail.",
    title: "ICS feed privacy controls",
    version: "0.4.0",
  },
  {
    changes: [
      {
        text: "WFH, travelling, training, and client-site availability entry types",
        type: "feat",
      },
      {
        text: "Manual entries appear in ICS feeds with correct event categorisation",
        type: "feat",
      },
      {
        text: "Employee availability dashboard showing leave and manual entries together",
        type: "feat",
      },
      {
        text: "Availability record model unified across leave and manual types",
        type: "improvement",
      },
    ],
    date: "2026-03-28",
    description:
      "Employees can now record WFH, travelling, training, and client-site entries alongside approved leave. Manual entries appear in ICS feeds alongside Xero-synced leave.",
    title: "Manual availability entries",
    version: "0.3.0",
  },
  {
    changes: [
      {
        text: "ICS feed generation using RFC 5545-compliant ical-generator",
        type: "feat",
      },
      {
        text: "Per-person feed URLs with revocable signed tokens",
        type: "feat",
      },
      {
        text: "Feed caching via Vercel KV with cache invalidation on leave change",
        type: "feat",
      },
      {
        text: "Deterministic UID generation ensuring stable event identity across feed refreshes",
        type: "feat",
      },
      {
        text: "Outlook, Google Calendar, and Apple Calendar compatibility verified",
        type: "improvement",
      },
    ],
    date: "2026-02-14",
    description:
      "Team Calendar now publishes per-person ICS feeds. Feeds are secured with a signed token and compatible with Outlook, Google Calendar, and Apple Calendar.",
    title: "ICS calendar feeds",
    version: "0.2.0",
  },
  {
    changes: [
      {
        text: "OAuth connection to Xero Payroll AU, NZ, and UK",
        type: "feat",
      },
      {
        text: "Employee sync from Xero with automatic updates on changes",
        type: "feat",
      },
      { text: "Approved leave inbound sync from Xero", type: "feat" },
      {
        text: "Leave submission, manager approval, and decline with Xero write-back",
        type: "feat",
      },
      { text: "Leave balance sync from Xero Payroll", type: "feat" },
      {
        text: "Multi-tenant architecture with Account isolation",
        type: "feat",
      },
    ],
    date: "2026-01-10",
    description:
      "Initial release. Team Calendar connects to Xero Payroll AU, NZ, and UK via OAuth. Employee records and approved leave sync automatically.",
    title: "Xero Payroll integration and leave sync",
    version: "0.1.0",
  },
];
