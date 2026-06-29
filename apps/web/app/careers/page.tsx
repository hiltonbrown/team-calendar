import { primaryDomain } from "@repo/seo/branding";
import { createMetadata } from "@repo/seo/metadata";
import { BriefcaseBusiness, Mail, MapPin } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = createMetadata({
  title: "Careers",
  description:
    "Careers at Team Calendar. We are building calm, precise availability software for Xero Payroll teams.",
});

const values = [
  {
    icon: BriefcaseBusiness,
    title: "Product judgement over noise",
    copy: "We prefer narrow, reliable product work over broad feature sprawl. Every shipped detail should lower cognitive load.",
  },
  {
    icon: MapPin,
    title: "Grounded in Australian business",
    copy: "The product starts with Xero Payroll teams across Australia, New Zealand, and the United Kingdom, with a practical bias toward real operations.",
  },
  {
    icon: Mail,
    title: "Careful with customer data",
    copy: "Leave, payroll, and availability data deserve clear boundaries, direct language, and conservative engineering choices.",
  },
];

const CareersPage = () => (
  <div className="fmkt-page marketing-simple">
    <header className="marketing-simple__hero">
      <div className="fmkt-container">
        <div className="marketing-simple__intro">
          <p className="marketing-simple__kicker">Careers</p>
          <h1 className="marketing-simple__title">
            Build calm software for teams handling real leave and payroll data.
          </h1>
          <p className="marketing-simple__lead">
            We do not have open roles right now. This page will list hiring
            plans when that changes.
          </p>
        </div>
      </div>
    </header>

    <section className="marketing-simple__section">
      <div className="fmkt-container">
        <div className="marketing-simple__grid marketing-simple__grid--two">
          {values.map((value) => {
            const Icon = value.icon;
            return (
              <article className="marketing-simple__panel" key={value.title}>
                <div className="marketing-simple__icon">
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <h2>{value.title}</h2>
                <p>{value.copy}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>

    <section className="marketing-simple__section marketing-simple__section--tonal">
      <div className="fmkt-container">
        <div className="marketing-simple__callout">
          <div className="marketing-simple__icon">
            <Mail size={22} strokeWidth={1.5} />
          </div>
          <div className="marketing-simple__intro">
            <h2 className="marketing-simple__section-title">
              Future opportunities
            </h2>
            <p className="marketing-simple__section-copy">
              If your work sits close to product engineering, design systems, or
              payroll operations, you can introduce yourself.
            </p>
            <p className="marketing-simple__section-copy">
              Contact:{" "}
              <a
                className="marketing-simple__link"
                href={`mailto:careers@${primaryDomain}`}
              >
                careers@{primaryDomain}
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
);

export default CareersPage;
