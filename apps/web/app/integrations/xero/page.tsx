import { createMetadata } from "@repo/seo/metadata";
import {
  ArrowLeftRight,
  Building2,
  CheckCircle,
  Globe,
  Lock,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "Xero Integration",
  description:
    "How LeaveSync connects to Xero Payroll AU, NZ, and UK. OAuth flow, data sync model, and what LeaveSync reads and writes.",
});

const regions = [
  {
    code: "AU",
    name: "Australia",
    detail:
      "Supports Xero Payroll Australia leave types including annual leave, sick leave, long service leave, personal carer's leave, and public holidays.",
  },
  {
    code: "NZ",
    name: "New Zealand",
    detail:
      "Supports Xero Payroll New Zealand leave types including annual leave, sick leave, alternative leave, bereavement leave, and statutory holidays.",
  },
  {
    code: "UK",
    name: "United Kingdom",
    detail:
      "Supports Xero Payroll United Kingdom leave types including annual leave, sick leave, maternity and paternity leave, and statutory leave entitlements.",
  },
];

const dataPoints = [
  {
    direction: "Reads from Xero",
    items: [
      "Employee records (name, employment status, start date)",
      "Leave entitlements and leave type configuration",
      "Approved leave applications and balances",
      "Payroll calendar and pay period information",
    ],
  },
  {
    direction: "Writes to Xero",
    items: [
      "Leave applications submitted via LeaveSync",
      "Manager approval and decline decisions",
      "Leave application status updates",
    ],
  },
];

const oauthSteps = [
  {
    step: "1",
    title: "Connect your organisation",
    description:
      "In LeaveSync, navigate to Settings and select Connect Xero. You will be redirected to Xero to authorise access.",
  },
  {
    step: "2",
    title: "Authorise in Xero",
    description:
      "Log in to Xero if prompted, select the payroll file you want to connect, and approve the permission request. LeaveSync requests read and write access to payroll data only.",
  },
  {
    step: "3",
    title: "Select your payroll file",
    description:
      "If your Xero account contains multiple payroll files, select the one to associate with this LeaveSync organisation. One payroll file per organisation.",
  },
  {
    step: "4",
    title: "First sync runs automatically",
    description:
      "LeaveSync immediately syncs employees and leave data. Depending on the size of your payroll file, the first sync takes between 30 seconds and a few minutes.",
  },
];

const XeroPage = () => (
  <div className="w-full">
    {/* Page header */}
    <div className="w-full bg-muted/50 py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-6 lg:max-w-2xl">
          <p className="font-medium text-primary text-sm uppercase tracking-widest">
            Integrations
          </p>
          <h1 className="font-semibold text-4xl tracking-tight md:text-6xl">
            Xero Payroll integration
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            LeaveSync is built exclusively for Xero Payroll. It connects via
            OAuth, syncs leave data continuously, and writes approved leave
            submissions back to Xero. Xero remains your payroll source of truth.
          </p>
        </div>
      </div>
    </div>

    {/* Supported regions */}
    <div className="w-full py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-3 lg:max-w-2xl">
            <Globe className="h-7 w-7 text-primary" strokeWidth={1.5} />
            <h2 className="font-semibold text-3xl tracking-tight">
              Supported payroll regions
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              LeaveSync supports Xero Payroll in three regions. Each region has
              its own leave type configuration, and LeaveSync handles each
              correctly.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {regions.map((region) => (
              <div
                className="flex flex-col gap-4 rounded-2xl bg-muted p-6"
                key={region.code}
              >
                <div className="flex items-center gap-3">
                  <Building2
                    className="h-5 w-5 text-primary"
                    strokeWidth={1.5}
                  />
                  <p className="font-semibold text-2xl">{region.code}</p>
                </div>
                <h3 className="font-medium text-lg">{region.name}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {region.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* What LeaveSync reads and writes */}
    <div className="w-full bg-muted/30 py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-3 lg:max-w-2xl">
            <ArrowLeftRight
              className="h-7 w-7 text-primary"
              strokeWidth={1.5}
            />
            <h2 className="font-semibold text-3xl tracking-tight">
              What LeaveSync reads and writes
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              LeaveSync accesses only payroll data relevant to leave and
              availability. It does not read salary, banking, tax, or
              superannuation data.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {dataPoints.map((section) => (
              <div
                className="flex flex-col gap-4 rounded-2xl bg-background p-6"
                key={section.direction}
              >
                <p className="font-medium text-primary text-sm uppercase tracking-widest">
                  {section.direction}
                </p>
                <ul className="flex flex-col gap-3">
                  {section.items.map((item) => (
                    <li className="flex items-start gap-3" key={item}>
                      <CheckCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        strokeWidth={1.5}
                      />
                      <span className="text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* OAuth flow */}
    <div className="w-full py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-3 lg:max-w-2xl">
            <RefreshCw className="h-7 w-7 text-primary" strokeWidth={1.5} />
            <h2 className="font-semibold text-3xl tracking-tight">
              How the connection works
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              The Xero OAuth flow is standard and takes a few minutes. You
              authorise LeaveSync directly from your Xero account, no
              third-party credentials required.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {oauthSteps.map((step) => (
              <div
                className="flex gap-5 rounded-2xl bg-muted p-6"
                key={step.step}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
                  {step.step}
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium text-base">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Sync model */}
    <div className="w-full bg-muted/30 py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-3 lg:max-w-2xl">
            <Users className="h-7 w-7 text-primary" strokeWidth={1.5} />
            <h2 className="font-semibold text-3xl tracking-tight">
              Sync model explained
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              LeaveSync runs scheduled syncs to keep availability data current.
              Here is how data flows between systems.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {[
              {
                title: "Employee sync",
                description:
                  "Xero employee records are synced into LeaveSync. When a new employee is added in Xero, they appear in LeaveSync after the next sync. Terminated employees are archived automatically.",
              },
              {
                title: "Leave sync",
                description:
                  "Approved leave from Xero is continuously synced. Leave data is normalised into a canonical availability model. The raw Xero payload is retained for audit purposes.",
              },
              {
                title: "Write-back",
                description:
                  "When a manager approves or declines a leave request in LeaveSync, the decision is written back to Xero synchronously. There is no batch process or delay.",
              },
            ].map((item) => (
              <div
                className="flex flex-col gap-4 rounded-2xl bg-background p-6"
                key={item.title}
              >
                <h3 className="font-medium text-lg">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Security callout */}
    <div className="w-full py-20 lg:py-28">
      <div className="container mx-auto">
        <div className="flex flex-col gap-6 rounded-2xl bg-muted p-8 lg:flex-row lg:items-center lg:gap-10 lg:p-12">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-primary" strokeWidth={1.5} />
              <Lock className="h-6 w-6 text-primary" strokeWidth={1.5} />
            </div>
            <h2 className="font-semibold text-2xl tracking-tight">
              Security and token handling
            </h2>
            <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
              Xero OAuth tokens are encrypted at rest using industry-standard
              encryption. Tokens are never exposed to client-side code or stored
              in plaintext. LeaveSync rotates tokens proactively before expiry.
              If you revoke access in Xero, the connection is deactivated
              immediately on the next sync attempt.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default XeroPage;
