import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";

export const FinalCtaSection = () => (
  <section className="fmkt-cta">
    <div className="fmkt-container">
      <div className="fmkt-cta__panel">
        <div className="fmkt-cta__content">
          <div className="fmkt-pill fmkt-pill--inverse">
            For Xero Payroll teams
          </div>
          <h2 className="fmkt-cta__heading">
            Bring approved leave straight onto your team&apos;s calendars.
          </h2>
          <p className="fmkt-cta__copy">
            Approved leave writes back to Xero and publishes to your team&apos;s
            subscribed calendars. Calendar apps pick up changes on their own
            refresh schedules.
          </p>
          <div className="fmkt-cta__actions">
            <Link
              className="marketing-btn marketing-btn--primary"
              href={signUpHref}
            >
              Sign up
            </Link>
            <Link
              className="marketing-btn marketing-btn--outline"
              href="/contact"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);
