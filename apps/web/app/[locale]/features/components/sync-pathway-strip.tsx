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
    copy: "Submitted in LeaveSync, synced to Xero instantly.",
    icon: <PencilIcon />,
    iconClass: "fmkt-pathway__icon--primary",
  },
  {
    label: "Xero syncs back",
    copy: "Approved leave flows back to keep records current.",
    icon: <XeroIcon />,
    iconClass: "fmkt-pathway__icon--xero",
  },
  {
    label: "Team calendar",
    copy: "All leave, from any source, publishes to your calendar.",
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
          viewBox="0 0 860 260"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="fmkt-sync-path fmkt-sync-path--team"
            d="M 174,136 C 330,176 510,176 652,136"
            id="sync-path-team"
          />
          <path
            className="fmkt-sync-path fmkt-sync-path--xero"
            d="M 172,116 C 270,50 414,44 520,82"
            id="sync-path-xero"
          />
          <path
            className="fmkt-sync-path fmkt-sync-path--xero-cal"
            d="M 552,92 C 614,92 632,112 652,126"
            id="sync-path-xero-cal"
          />
          <path
            className="fmkt-sync-path fmkt-sync-path--return"
            d="M 518,106 C 410,148 286,158 174,132"
            id="sync-path-return"
          />

          <g className="fmkt-sync-node fmkt-sync-node--source">
            <rect height="96" rx="24" width="128" x="48" y="82" />
            <circle className="fmkt-sync-node__icon" cx="112" cy="116" r="18" />
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.65}
              transform="translate(102, 106)"
            >
              <path d="M18 10a7.5 7.5 0 0 0-12.8-5.3L3 7" />
              <path d="M3 3v4h4" />
              <path d="M2 10a7.5 7.5 0 0 0 12.8 5.3L17 13" />
              <path d="M13 13h4v4" />
            </g>
            <text className="fmkt-sync-label" x="112" y="150">
              LeaveSync
            </text>
            <text className="fmkt-sync-meta" x="112" y="166">
              submits and publishes
            </text>
          </g>

          <g className="fmkt-sync-node fmkt-sync-node--xero">
            <rect height="72" rx="20" width="120" x="500" y="52" />
            <circle className="fmkt-sync-node__icon" cx="532" cy="88" r="17" />
            <text className="fmkt-sync-node-letter" x="532" y="94">
              X
            </text>
            <text className="fmkt-sync-label" x="562" y="83">
              Xero
            </text>
            <text className="fmkt-sync-meta" x="562" y="100">
              approved leave
            </text>
          </g>

          <g className="fmkt-sync-node fmkt-sync-node--team">
            <rect height="96" rx="24" width="148" x="652" y="82" />
            <circle className="fmkt-sync-node__icon" cx="690" cy="118" r="18" />
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.65}
              transform="translate(680, 108)"
            >
              <rect height="15" rx="2.5" width="18" x="1" y="3" />
              <path d="M1 8h18M6 1v4M14 1v4" />
              <path d="M6 12h3M12 12h3" />
            </g>
            <text className="fmkt-sync-label" x="722" y="113">
              Team calendar
            </text>
            <text className="fmkt-sync-meta" x="722" y="131">
              Outlook, Google, Apple
            </text>
          </g>

          <circle className="fmkt-sync-packet fmkt-sync-packet--team" r="4.5" />
          <circle className="fmkt-sync-packet fmkt-sync-packet--xero" r="4" />
          <circle
            className="fmkt-sync-packet fmkt-sync-packet--return"
            r="3.5"
          />
          <circle
            className="fmkt-sync-packet fmkt-sync-packet--xero-cal"
            r="3.5"
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
