interface Benefit {
  readonly copy: string;
  readonly icon: React.ReactNode;
  readonly title: string;
}

const ClockIcon = () => (
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
    <path d="M12 7v5l3 3" />
  </svg>
);

const UsersIcon = () => (
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
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.5-3.5 3.3-6 6.5-6s6 2.5 6.5 6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 15c2.5 0 4.5 1.7 5 4" />
  </svg>
);

const ShieldIcon = () => (
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
    <path d="M12 3 4 6v6c0 4.5 3.5 8 8 9 4.5-1 8-4.5 8-9V6z" />
  </svg>
);

const HeartIcon = () => (
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
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);

const benefits: Benefit[] = [
  {
    title: "Easy for employees",
    copy: "Request leave and working patterns without chasing forms or side messages.",
    icon: <ClockIcon />,
  },
  {
    title: "Clear for managers",
    copy: "See who is away, who is working differently, and where cover is needed.",
    icon: <UsersIcon />,
  },
  {
    title: "Accurate for payroll",
    copy: "Approved leave writes back to Xero Payroll, reducing duplicate entry.",
    icon: <ShieldIcon />,
  },
  {
    title: "Respectful by default",
    copy: "Privacy controls keep sensitive leave details visible only where needed.",
    icon: <HeartIcon />,
  },
];

export const BenefitsStrip = () => (
  <section className="fmkt-benefits">
    <div className="fmkt-container">
      <p className="fmkt-overline fmkt-benefits__overline">
        Less admin. More visibility.
      </p>
      <div className="fmkt-benefits__grid">
        {benefits.map((benefit) => (
          <div className="fmkt-benefit" key={benefit.title}>
            <span aria-hidden="true" className="fmkt-benefit__icon">
              {benefit.icon}
            </span>
            <h3 className="fmkt-benefit__title">{benefit.title}</h3>
            <p className="fmkt-benefit__copy">{benefit.copy}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
