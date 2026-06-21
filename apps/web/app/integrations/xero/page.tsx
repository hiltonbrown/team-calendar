import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { MarketingIcon } from "../../(home)/components/marketing-icons";

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

const syncModel = [
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
];

const XeroPage = () => (
  <main className="fmkt-page fmkt-xero">
    <section className="fmkt-xero__hero">
      <div className="fmkt-container">
        <p className="fmkt-overline">Integrations</p>
        <h1 className="fmkt-xero__title">Xero Payroll integration</h1>
        <p className="fmkt-xero__lead">
          Team Calendar is built exclusively for Xero Payroll. It connects via
          OAuth, syncs leave data continuously, and writes approved leave
          submissions back to Xero. Xero remains your payroll source of truth.
        </p>
      </div>
    </section>

    <section className="fmkt-xero__section">
      <div className="fmkt-container">
        <div className="fmkt-section-header">
          <h2 className="fmkt-section-title">Supported payroll regions</h2>
          <p className="fmkt-xero__copy">
            Team Calendar supports Xero Payroll in three regions. Each region
            has its own leave type configuration, and Team Calendar handles each
            correctly.
          </p>
        </div>
        <div className="fmkt-xero__grid">
          {regions.map((region) => (
            <article className="fmkt-xero__panel" key={region.code}>
              <span className="fmkt-xero__tag">{region.code}</span>
              <h3>{region.name}</h3>
              <p>{region.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="fmkt-xero__section fmkt-xero__section--tonal">
      <div className="fmkt-container">
        <div className="fmkt-section-header">
          <h2 className="fmkt-section-title">
            What Team Calendar reads and writes
          </h2>
          <p className="fmkt-xero__copy">
            Team Calendar accesses only payroll data relevant to leave and
            availability. It does not read salary, banking, tax, or
            superannuation data.
          </p>
        </div>
        <div className="fmkt-xero__grid fmkt-xero__grid--two">
          {dataPoints.map((section) => (
            <article className="fmkt-xero__panel" key={section.direction}>
              <h3>{section.direction}</h3>
              <ul className="fmkt-xero__list">
                {section.items.map((item) => (
                  <li key={item}>
                    <MarketingIcon id="check" size={16} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="fmkt-xero__section">
      <div className="fmkt-container">
        <div className="fmkt-section-header">
          <h2 className="fmkt-section-title">How the connection works</h2>
          <p className="fmkt-xero__copy">
            The Xero OAuth flow is standard and takes a few minutes. You
            authorise Team Calendar directly from your Xero account, with no
            third-party credentials required.
          </p>
        </div>
        <div className="fmkt-xero__grid fmkt-xero__grid--two">
          {oauthSteps.map((step) => (
            <div className="fmkt-xero__step-row" key={step.step}>
              <span className="fmkt-xero__step">{step.step}</span>
              <article className="fmkt-xero__panel">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="fmkt-xero__section fmkt-xero__section--tonal">
      <div className="fmkt-container">
        <div className="fmkt-section-header">
          <h2 className="fmkt-section-title">Sync model explained</h2>
          <p className="fmkt-xero__copy">
            Team Calendar runs scheduled syncs to keep availability data
            current. Here is how data flows between systems.
          </p>
        </div>
        <div className="fmkt-xero__grid">
          {syncModel.map((item) => (
            <article className="fmkt-xero__panel" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>

    <section className="fmkt-xero__section">
      <div className="fmkt-container">
        <div className="fmkt-xero__callout">
          <span className="fmkt-xero__callout-icon">
            <MarketingIcon id="shieldCheck" size={24} />
          </span>
          <div>
            <h2>Security and token handling</h2>
            <p>
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
  </main>
);

export default XeroPage;
