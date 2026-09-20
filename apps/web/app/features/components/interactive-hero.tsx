import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";

export const InteractiveHeroSection = () => (
  <section className="ft-hero">
    <h1 className="ft-hero__title">
      See everyone’s <em>availability.</em>
    </h1>
    <p className="ft-hero__body">
      Employees, directors, subcontractors and offshore staff can all share
      their status, whether they’re on payroll or not. View their updates
      alongside Xero Payroll leave in Outlook, Google Calendar and Apple
      Calendar.
    </p>
    <Link className="marketing-btn marketing-btn--primary" href={signUpHref}>
      Sign up
    </Link>
    <figure className="ft-hero__coverage">
      <figcaption>Examples of what your team can share</figcaption>
      <dl className="ft-hero__people">
        <div className="ft-hero__person ft-hero__person--payroll">
          <dt>Employees</dt>
          <dd>
            Annual leave<span>From Xero Payroll</span>
          </dd>
        </div>
        <div className="ft-hero__person">
          <dt>Directors</dt>
          <dd>
            Travelling<span>Shared in Team Calendar</span>
          </dd>
        </div>
        <div className="ft-hero__person">
          <dt>Subcontractors</dt>
          <dd>
            On site<span>Shared in Team Calendar</span>
          </dd>
        </div>
        <div className="ft-hero__person">
          <dt>Offshore staff</dt>
          <dd>
            Working from home<span>Shared in Team Calendar</span>
          </dd>
        </div>
      </dl>
    </figure>
  </section>
);
