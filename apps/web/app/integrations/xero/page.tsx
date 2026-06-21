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
    "How Team Calendar connects to Xero Payroll AU, NZ, and UK. OAuth flow, data sync model, and what Team Calendar reads and writes.",
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
      "Leave applications submitted via Team Calendar",
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
      "In Team Calendar, navigate to Settings and select Connect Xero. You will be redirected to Xero to authorise access.",
  },
  {
    step: "2",
    title: "Authorise in Xero",
    description:
      "Log in to Xero if prompted, select the payroll file you want to connect, and approve the permission request. Team Calendar requests read and write access to payroll data only.",
  },
  {
    step: "3",
    title: "Select your payroll file",
    description:
      "If your Xero account contains multiple payroll files, select the one to associate with this Team Calendar organisation. One payroll file per organisation.",
  },
  {
    step: "4",
    title: "First sync runs automatically",
    description:
      "Team Calendar immediately syncs employees and leave data. Depending on the size of your payroll file, the first sync takes between 30 seconds and a few minutes.",
  },
];

const XeroPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Integrations</p>
          <h1 className="marketing-simple__title">Xero Payroll integration</h1>
          <p className="marketing-simple__lead">
            Team Calendar is built exclusively for Xero Payroll. It connects via
            OAuth, syncs leave data continuously, and writes approved leave
            submissions back to Xero. Xero remains your payroll source of truth.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__section-head">
          <div className="marketing-simple__icon">
            <Globe size={22} strokeWidth={1.5} />
          </div>
          <h2 className="marketing-simple__section-title">
            Supported payroll regions
          </h2>
          <p className="marketing-simple__section-copy">
            Team Calendar supports Xero Payroll in three regions. Each region
            has its own leave type configuration, and Team Calendar handles each
            correctly.
          </p>
        </div>
        <div className="marketing-simple__grid">
          {regions.map((region) => (
            <div className="marketing-simple__panel" key={region.code}>
              <div className="marketing-simple__panel-row">
                <div className="marketing-simple__icon">
                  <Building2 size={20} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="marketing-simple__tag">{region.code}</p>
                  <h3>{region.name}</h3>
                </div>
              </div>
              <p>{region.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="marketing-simple__section marketing-simple__section--tonal">
      <div className="fmkt-container">
        <div className="marketing-simple__section-head">
          <div className="marketing-simple__icon">
            <ArrowLeftRight size={22} strokeWidth={1.5} />
          </div>
          <h2 className="marketing-simple__section-title">
            What Team Calendar reads and writes
          </h2>
          <p className="marketing-simple__section-copy">
            Team Calendar accesses only payroll data relevant to leave and
            availability. It does not read salary, banking, tax, or
            superannuation data.
          </p>
        </div>
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {dataPoints.map((section) => (
            <div className="marketing-simple__panel" key={section.direction}>
              <h3>{section.direction}</h3>
              <ul className="marketing-simple__list">
                {section.items.map((item) => (
                  <li key={item}>
                    <CheckCircle size={16} strokeWidth={1.5} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__section-head">
          <div className="marketing-simple__icon">
            <RefreshCw size={22} strokeWidth={1.5} />
          </div>
          <h2 className="marketing-simple__section-title">
            How the connection works
          </h2>
          <p className="marketing-simple__section-copy">
            The Xero OAuth flow is standard and takes a few minutes. You
            authorise Team Calendar directly from your Xero account, no
            third-party credentials required.
          </p>
        </div>
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {oauthSteps.map((step) => (
            <div className="marketing-simple__panel-row" key={step.step}>
              <span className="marketing-simple__step">{step.step}</span>
              <div className="marketing-simple__panel">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="marketing-simple__section marketing-simple__section--tonal">
      <div className="fmkt-container">
        <div className="marketing-simple__section-head">
          <div className="marketing-simple__icon">
            <Users size={22} strokeWidth={1.5} />
          </div>
          <h2 className="marketing-simple__section-title">
            Sync model explained
          </h2>
          <p className="marketing-simple__section-copy">
            Team Calendar runs scheduled syncs to keep availability data
            current. Here is how data flows between systems.
          </p>
        </div>
        <div className="marketing-simple__grid">
          {[
            {
              title: "Employee sync",
              description:
                "Xero employee records are synced into Team Calendar. When a new employee is added in Xero, they appear in Team Calendar after the next sync. Terminated employees are archived automatically.",
            },
            {
              title: "Leave sync",
              description:
                "Approved leave from Xero is continuously synced. Leave data is normalised into a canonical availability model. The raw Xero payload is retained for audit purposes.",
            },
            {
              title: "Write-back",
              description:
                "When a manager approves or declines a leave request in Team Calendar, the decision is written back to Xero synchronously. There is no batch process or delay.",
            },
          ].map((item) => (
            <div className="marketing-simple__panel" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__callout">
          <div className="marketing-simple__icon">
            <ShieldCheck size={22} strokeWidth={1.5} />
          </div>
          <div className="marketing-simple__intro">
            <div className="marketing-simple__panel-row">
              <Lock size={20} strokeWidth={1.5} />
              <h2 className="marketing-simple__section-title">
                Security and token handling
              </h2>
            </div>
            <p className="marketing-simple__section-copy">
              Xero OAuth tokens are encrypted at rest using industry-standard
              encryption. Tokens are never exposed to client-side code or stored
              in plaintext. Team Calendar rotates tokens proactively before
              expiry. If you revoke access in Xero, the connection is
              deactivated immediately on the next sync attempt.
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default XeroPage;
