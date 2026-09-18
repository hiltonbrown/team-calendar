import {
  supportEmail,
  supportHoursLong,
  supportMailtoHref,
} from "@/src/data/support";

export const helpLastReviewed = "30 August 2026";
export const helpLaunchScope = "AU Early Access, Australian Xero Payroll";
export const helpSupport = {
  email: supportEmail,
  hours: supportHoursLong,
  mailtoHref: supportMailtoHref,
} as const;

export type HelpRole = "Admin" | "Manager" | "Owner" | "Viewer";
export type HelpPhaseId = "connect" | "prepare" | "publish" | "verify";

export interface HelpTask {
  readonly description: string;
  readonly href: `/help-centre/onboarding#${HelpPhaseId}`;
  readonly label: string;
  readonly title: string;
}

export interface HelpStep {
  readonly action: string;
  readonly anchor: string;
  readonly caution?: string;
  readonly expectedResult: string;
  readonly productPath?: string;
  readonly roles: readonly HelpRole[];
  readonly title: string;
  readonly troubleshooting?: string;
}

export interface HelpPhase {
  readonly description: string;
  readonly id: HelpPhaseId;
  readonly label: string;
  readonly steps: readonly HelpStep[];
  readonly title: string;
}

export const helpTasks = [
  {
    description:
      "Accept the right invitation, confirm your organisation and assign shipped roles.",
    href: "/help-centre/onboarding#prepare",
    label: "Start here",
    title: "Prepare your team",
  },
  {
    description:
      "Authorise the Australian payroll file and resolve person matches safely.",
    href: "/help-centre/onboarding#connect",
    label: "Connect Xero",
    title: "Connect payroll",
  },
  {
    description:
      "Review sync receipts, then submit and approve a controlled leave request.",
    href: "/help-centre/onboarding#verify",
    label: "Run checks",
    title: "Verify the workflow",
  },
  {
    description:
      "Choose an accurate feed scope and privacy mode, then subscribe your calendar.",
    href: "/help-centre/onboarding#publish",
    label: "Publish safely",
    title: "Set up calendar feeds",
  },
] as const satisfies readonly HelpTask[];

export const helpPhases: readonly HelpPhase[] = [
  {
    description:
      "Confirm the account boundary and give each person the minimum access they need.",
    id: "prepare",
    label: "Phase 1",
    steps: [
      {
        action:
          "Accept the invitation sent by your administrator. Open your user menu and choose Organisation profile to confirm the organisation name.",
        anchor: "accept-invitation",
        caution:
          "Team Calendar supports one organisation per active session. Ask your administrator before accepting an invitation you do not recognise.",
        expectedResult:
          "The Organisation profile shows the Australian business you expected to join.",
        roles: ["Owner", "Admin", "Manager", "Viewer"],
        title: "Join the correct organisation",
        troubleshooting:
          "If the invitation has expired or names the wrong business, ask the sender for a replacement before entering payroll information.",
      },
      {
        action:
          "Open Settings, then Members. Assign one of the shipped roles: Owner, Admin, Manager or Viewer.",
        anchor: "assign-roles",
        caution:
          "Owner and Admin can manage sensitive organisation settings. Viewer is read-only.",
        expectedResult:
          "Every invited person appears with the intended role, and managers can see the teams they are responsible for.",
        productPath: "/settings/members",
        roles: ["Owner", "Admin"],
        title: "Review member access",
        troubleshooting:
          "If a person is missing, confirm they accepted the invitation before changing their role.",
      },
    ],
    title: "Prepare access",
  },
  {
    description:
      "Authorise Xero Payroll and confirm that each Team Calendar person maps to the intended payroll employee.",
    id: "connect",
    label: "Phase 2",
    steps: [
      {
        action:
          "Open Settings, Integrations, then Manage Xero. Choose Connect Xero and authorise the Australian Xero Payroll organisation.",
        anchor: "connect-xero",
        caution:
          "Check the Xero organisation name before granting access. Early Access currently supports Australian Xero Payroll.",
        expectedResult:
          "The Xero settings page shows an active connection for the intended payroll organisation.",
        productPath: "/settings/integrations/xero",
        roles: ["Owner", "Admin"],
        title: "Connect Xero Payroll",
        troubleshooting:
          "If authorisation returns an error, reconnect from the same Xero settings page. Contact support if repeated attempts fail.",
      },
      {
        action:
          "Open Settings, Integrations, Xero, then Xero Person Matches. Review unmatched people and link only records that refer to the same person.",
        anchor: "match-people",
        caution:
          "A wrong match can associate leave or balances with the wrong person. Leave uncertain records unmatched and verify them first.",
        expectedResult:
          "Each linked Team Calendar person shows the correct Xero employee, with uncertain records left for review.",
        productPath: "/settings/integrations/xero/matches",
        roles: ["Owner", "Admin"],
        title: "Resolve Xero Person Matches",
        troubleshooting:
          "If the expected employee is absent, check Sync Health before creating or forcing a match.",
      },
    ],
    title: "Connect payroll",
  },
  {
    description:
      "Use product receipts to confirm the first sync and one complete leave decision before wider rollout.",
    id: "verify",
    label: "Phase 3",
    steps: [
      {
        action:
          "Open Sync Health and review Run history. Check the latest people, leave and balance runs for completed status and record-level warnings.",
        anchor: "review-sync",
        expectedResult:
          "Recent runs complete for the connected organisation, and the imported people and balances agree with Xero Payroll.",
        productPath: "/sync",
        roles: ["Owner", "Admin"],
        title: "Check the first sync",
        troubleshooting:
          "For a discrepancy, note the run, affected person and expected Xero value, then email support. Do not repair payroll data by guessing.",
      },
      {
        action:
          "From Calendar choose Add leave or availability, select Leave, then Save and submit. You can also use the command menu action New leave request. A Manager reviews it in Leave Approvals and chooses Approve or Decline. A decline reason must contain between 3 and 1000 characters.",
        anchor: "test-leave",
        caution:
          "Use a controlled test that your payroll administrator recognises. Approval writes to Xero synchronously and any failure appears inline.",
        expectedResult:
          "The request reaches Leave Approvals, the decision appears in Team Calendar, and an approval is confirmed by Xero without a hidden background write.",
        productPath: "/calendar",
        roles: ["Owner", "Admin", "Manager"],
        title: "Test submit and approval",
        troubleshooting:
          "If the Xero write fails, keep the inline error and request details available when contacting support. Do not submit duplicates.",
      },
    ],
    title: "Verify the workflow",
  },
  {
    description:
      "Create the smallest useful read-only feed, then confirm the calendar subscription and token recovery path.",
    id: "publish",
    label: "Phase 4",
    steps: [
      {
        action:
          "Open Feeds and choose New feed. Select Just me, My team, Specific teams or Specific people. Owner and Admin can also select All of organisation. Choose Named, Masked or Private privacy.",
        anchor: "create-feed",
        caution:
          "Named includes the person's name and allowed availability detail. Masked publishes Out of office. Private publishes Busy. Choose the least detail your audience needs.",
        expectedResult:
          "The feed detail page shows an active, complete subscribe URL for the selected scope and privacy mode.",
        productPath: "/feeds/new",
        roles: ["Owner", "Admin"],
        title: "Create a scoped feed",
        troubleshooting:
          "If the intended people are absent, return to the earlier sync and matching checks before widening the feed scope.",
      },
      {
        action:
          "Copy the complete subscribe URL into Outlook, Google Calendar or Apple Calendar. Calendar apps refresh subscribed feeds on their own schedules.",
        anchor: "subscribe-calendar",
        caution:
          "Treat the subscribe URL as a credential. If it is exposed, use Rotate token. The old URL stops working and Team Calendar presents its replacement.",
        expectedResult:
          "The calendar app accepts the subscription and displays the expected privacy-safe events. The feed remains read-only.",
        productPath: "/feeds",
        roles: ["Owner", "Admin"],
        title: "Subscribe and protect the URL",
        troubleshooting:
          "For an unresolved feed-token incident or unexpected event detail, rotate the token first, then email support with the feed name and privacy mode. Never email the subscribe URL.",
      },
    ],
    title: "Publish calendars",
  },
] as const;

export const helpCompletionChecks = [
  "The intended Australian Xero Payroll organisation is connected.",
  "Sync Health shows successful runs and expected people and balances.",
  "Members have the intended Owner, Admin, Manager or Viewer role.",
  "A controlled leave request completed its expected approval path.",
  "A calendar app accepted an active feed with the intended privacy mode.",
] as const;
