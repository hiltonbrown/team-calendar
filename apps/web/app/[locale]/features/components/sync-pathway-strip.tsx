import type { ReactNode } from "react";

interface PathwayStep {
  readonly copy: string;
  readonly icon: ReactNode;
  readonly iconClass: string;
  readonly label: string;
}

const ArrowRight = () => (
  <svg
    aria-hidden="true"
    className="fmkt-pathway__arrow"
    fill="none"
    height={20}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
    width={20}
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const PencilIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height={22}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
    width={22}
  >
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

const TeamCalendarIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height={22}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
    width={22}
  >
    <rect height="16" rx="3" width="18" x="3" y="4" />
    <path d="M3 9h18M8 4v2M16 4v2" />
    <path d="M8 13h3v3H8zM13 13h3v3h-3z" />
  </svg>
);

const XeroIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height={22}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
    width={22}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="m8 8 8 8M16 8l-8 8" />
  </svg>
);

const steps: PathwayStep[] = [
  {
    label: "Enter leave",
    copy: "Submitted once in LeaveSync.",
    icon: <PencilIcon />,
    iconClass: "fmkt-pathway__icon--primary",
  },
  {
    label: "Xero syncs back",
    copy: "Approved leave keeps payroll records current.",
    icon: <XeroIcon />,
    iconClass: "fmkt-pathway__icon--xero",
  },
  {
    label: "Team calendar",
    copy: "Availability publishes to the calendars people check.",
    icon: <TeamCalendarIcon />,
    iconClass: "fmkt-pathway__icon--team",
  },
];

export const SyncPathwayStrip = () => (
  <div className="fmkt-pathway">
    <div className="fmkt-container">
      {/* Desktop: animated SVG data-flow diagram, text list below is the accessible label. */}
      <div aria-hidden="true" className="fmkt-sync-diagram">
        <svg
          aria-hidden="true"
          className="fmkt-sync-svg"
          fill="none"
          viewBox="0 0 420 540"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="fmkt-sync-path fmkt-sync-path--primary"
            d="M 168,138 C 188,176 280,190 282,228"
            id="sync-path-xero"
          />
          <path
            className="fmkt-sync-path fmkt-sync-path--team"
            d="M 270,318 C 266,356 194,372 188,402"
            id="sync-path-team"
          />
          <path
            className="fmkt-sync-path fmkt-sync-path--return"
            d="M 120,138 C 50,218 54,330 142,402"
            id="sync-path-return"
          />

          <g className="fmkt-sync-node fmkt-sync-node--source">
            <rect height="104" rx="26" width="332" x="22" y="34" />
            <circle className="fmkt-sync-node__icon" cx="76" cy="86" r="22" />
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.85}
              transform="translate(64, 74)"
            >
              <path d="M22 12a9 9 0 0 0-15.3-6.4L4 8.4" />
              <path d="M4 4v4.4h4.4" />
              <path d="M2 12a9 9 0 0 0 15.3 6.4L20 15.6" />
              <path d="M15.6 15.6H20V20" />
            </g>
            <text className="fmkt-sync-label" x="120" y="79">
              LeaveSync
            </text>
            <text className="fmkt-sync-meta" x="120" y="105">
              submit once
            </text>
          </g>

          <g className="fmkt-sync-node fmkt-sync-node--xero">
            <rect height="92" rx="24" width="300" x="122" y="228" />
            <circle className="fmkt-sync-node__icon" cx="154" cy="274" r="21" />
            <text className="fmkt-sync-node-letter" x="154" y="282">
              X
            </text>
            <text className="fmkt-sync-label" x="196" y="268">
              Xero
            </text>
            <text className="fmkt-sync-meta" x="196" y="294">
              approved leave
            </text>
          </g>

          <g className="fmkt-sync-node fmkt-sync-node--team">
            <rect height="104" rx="26" width="340" x="18" y="402" />
            <circle className="fmkt-sync-node__icon" cx="72" cy="454" r="22" />
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.85}
              transform="translate(60, 442)"
            >
              <rect height="18" rx="3" width="22" x="1" y="4" />
              <path d="M1 10h22M7 1.5v5M17 1.5v5" />
              <path d="M7 15h4M15 15h4" />
            </g>
            <text className="fmkt-sync-label" x="116" y="448">
              Team calendar
            </text>
            <text className="fmkt-sync-meta" x="116" y="474">
              Outlook, Google, Apple
            </text>
          </g>

          <circle className="fmkt-sync-packet fmkt-sync-packet--xero" r="5.5" />
          <circle className="fmkt-sync-packet fmkt-sync-packet--team" r="5.5" />
          <circle
            className="fmkt-sync-packet fmkt-sync-packet--return"
            r="4.5"
          />
        </svg>
      </div>

      {/* Accessible text strip, visible on mobile and screen-reader accessible on all sizes. */}
      <div className="fmkt-pathway__card fmkt-pathway__card--list">
        {steps.map((step, index) => (
          <div className="fmkt-pathway__item" key={step.label}>
            <div className="fmkt-pathway__step">
              <span
                aria-hidden="true"
                className={`fmkt-pathway__icon ${step.iconClass}`}
              >
                {step.icon}
              </span>
              <div className="fmkt-pathway__text">
                <strong className="fmkt-pathway__label">{step.label}</strong>
                <span className="fmkt-pathway__copy">{step.copy}</span>
              </div>
            </div>
            {index < steps.length - 1 && <ArrowRight />}
          </div>
        ))}
      </div>
    </div>
  </div>
);
