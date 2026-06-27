import Link from "next/link";
import { signUpHref } from "@/src/lib/auth-links";
import { SyncPathwayStrip } from "./sync-pathway-strip";

export const HeroSection = () => (
  <section className="fmkt-hero">
    <div className="fmkt-hero__copy">
      <div className="fmkt-hero__copy-inner">
        <div className="fmkt-pill">Now in early access</div>
        <h1 className="fmkt-hero__title">
          Simple leave requests.
          <em>Clear calendars for everyone.</em>
        </h1>
        <p className="fmkt-hero__body">
          Your team requests leave in one place. Approved leave writes back to
          Xero Payroll and publishes to everyone&rsquo;s Outlook, Google and
          Apple calendars, automatically.
        </p>
        <div className="fmkt-hero__actions">
          <Link
            className="marketing-btn marketing-btn--primary"
            href={signUpHref}
          >
            Sign up
          </Link>
          <Link
            className="marketing-btn marketing-btn--outline"
            href="#how-it-works"
          >
            See how it works
          </Link>
        </div>
      </div>
    </div>
    <SyncPathwayStrip />
  </section>
);
